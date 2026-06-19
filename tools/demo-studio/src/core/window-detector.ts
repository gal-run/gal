import { spawn } from 'child_process';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir } from 'fs/promises';

interface WindowInfo {
  id: string;
  name: string;
  owner: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface WindowDetectionOptions {
  filter?: {
    name?: string | RegExp;
    owner?: string | RegExp;
  };
}

export class WindowDetector {
  private cachedWindows: WindowInfo[] = [];

  async listWindows(options?: WindowDetectionOptions): Promise<WindowInfo[]> {
    const script = this.buildAppleScript();
    const result = await this.executeAppleScript(script);
    this.cachedWindows = this.parseWindowList(result);
    
    if (options?.filter) {
      return this.cachedWindows.filter(w => {
        if (options.filter!.name) {
          const nameMatch = typeof options.filter!.name === 'string'
            ? w.name.includes(options.filter!.name as string)
            : (options.filter!.name as RegExp).test(w.name);
          if (!nameMatch) return false;
        }
        if (options.filter!.owner) {
          const ownerMatch = typeof options.filter!.owner === 'string'
            ? w.owner.includes(options.filter!.owner as string)
            : (options.filter!.owner as RegExp).test(w.owner);
          if (!ownerMatch) return false;
        }
        return true;
      });
    }
    
    return this.cachedWindows;
  }

  async findWindow(name: string | RegExp): Promise<WindowInfo | null> {
    const windows = await this.listWindows();
    const found = windows.find(w => {
      if (typeof name === 'string') {
        return w.name.toLowerCase().includes(name.toLowerCase());
      }
      return name.test(w.name);
    });
    return found || null;
  }

  async focusWindow(windowId: string): Promise<boolean> {
    // windowId has the form "<pid>-<index>" (see buildAppleScript). Resolve it
    // to a numeric pid and reject anything non-numeric so untrusted input can
    // never be interpolated into the AppleScript body (AppleScript injection).
    const pid = Number.parseInt(String(windowId).split('-')[0], 10);
    if (!Number.isFinite(pid) || pid <= 0) {
      return false;
    }

    const script = `
      tell application "System Events"
        set frontmost of (first process whose unix id is ${pid}) to true
      end tell
    `;

    try {
      await this.executeAppleScript(script);
      return true;
    } catch {
      return false;
    }
  }

  async getWindowTitle(windowId: string): Promise<string | null> {
    const window = this.cachedWindows.find(w => w.id === windowId);
    return window?.name || null;
  }

  getWindowBounds(windowId: string): WindowInfo['bounds'] | null {
    const window = this.cachedWindows.find(w => w.id === windowId);
    return window?.bounds || null;
  }

  private buildAppleScript(): string {
    return `
      tell application "System Events"
        set windowList to {}
        set allProcesses to (every process whose background only is false)
        
        repeat with theProcess in allProcesses
          set processName to name of theProcess
          set processID to unix id of theProcess
          
          try
            set allWindows to every window of theProcess
            repeat with theWindow in allWindows
              set windowName to name of theWindow
              set windowID to processID & "-" & index of theWindow
              set windowBounds to bounds of theWindow
              
              set end of windowList to windowID & "|" & windowName & "|" & processName & "|" & (item 1 of windowBounds) & "," & (item 2 of windowBounds) & "," & (item 3 of windowBounds) & "," & (item 4 of windowBounds)
            end repeat
          end try
        end repeat
        
        return windowList as string
      end tell
    `;
  }

  private async executeAppleScript(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn('osascript', ['-e', script]);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`AppleScript error: ${stderr}`));
        }
      });
    });
  }

  private parseWindowList(output: string): WindowInfo[] {
    if (!output) return [];
    
    const windows: WindowInfo[] = [];
    const lines = output.split(', ');
    
    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 4) {
        const [id, name, owner, boundsStr] = parts;
        const [x, y, width, height] = boundsStr.split(',').map(Number);
        
        windows.push({
          id,
          name,
          owner,
          bounds: { x, y, width, height }
        });
      }
    }
    
    return windows;
  }
}

export type { WindowInfo, WindowDetectionOptions };
