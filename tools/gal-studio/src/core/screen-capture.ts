import { spawn } from 'child_process';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

interface ScreenshotOptions {
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  format: 'png' | 'jpg' | 'webp';
  quality?: number;
  windowId?: string;
}

interface RecordingSession {
  id: string;
  outputPath: string;
  startTime: number;
  frames: string[];
}

export class ScreenCapture {
  private session: RecordingSession | null = null;
  private screenshots: Map<string, Buffer> = new Map();

  async captureScreenshot(options: ScreenshotOptions): Promise<Buffer> {
    const outputPath = join(tmpdir(), `screenshot-${Date.now()}.${options.format}`);
    
    const args = this.buildScreencaptureArgs(outputPath, options);
    
    await this.executeScreencapture(args);
    
    const buffer = await readFile(outputPath);
    await unlink(outputPath);
    
    return buffer;
  }

  async captureWindow(windowId: string, format: 'png' | 'jpg' = 'png'): Promise<Buffer> {
    return this.captureScreenshot({
      windowId,
      format
    });
  }

  async captureRegion(
    x: number,
    y: number,
    width: number,
    height: number,
    format: 'png' | 'jpg' = 'png'
  ): Promise<Buffer> {
    return this.captureScreenshot({
      region: { x, y, width, height },
      format
    });
  }

  async startRecording(outputDir?: string): Promise<string> {
    if (this.session) {
      throw new Error('Recording session already active');
    }

    const id = randomUUID();
    const dir = outputDir || join(tmpdir(), `gal-studio-${id}`);
    await mkdir(dir, { recursive: true });

    this.session = {
      id,
      outputPath: join(dir, 'recording.mp4'),
      startTime: Date.now(),
      frames: []
    };

    return this.session.outputPath;
  }

  async stopRecording(): Promise<RecordingSession | null> {
    if (!this.session) {
      return null;
    }

    const session = this.session;
    this.session = null;
    
    return session;
  }

  async captureFrame(options?: Partial<ScreenshotOptions>): Promise<string> {
    if (!this.session) {
      throw new Error('No active recording session');
    }

    const frameId = `frame-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const buffer = await this.captureScreenshot({
      format: options?.format || 'png',
      quality: options?.quality,
      region: options?.region
    });

    this.screenshots.set(frameId, buffer);
    this.session.frames.push(frameId);

    return frameId;
  }

  getFrame(frameId: string): Buffer | undefined {
    return this.screenshots.get(frameId);
  }

  getSession(): RecordingSession | null {
    return this.session;
  }

  isRecording(): boolean {
    return this.session !== null;
  }

  private buildScreencaptureArgs(outputPath: string, options: ScreenshotOptions): string[] {
    const args: string[] = [];

    if (options.region) {
      args.push('-R');
      args.push(`${options.region.x},${options.region.y},${options.region.width},${options.region.height}`);
    }

    if (options.windowId) {
      args.push('-l', options.windowId);
    }

    if (options.format === 'jpg' && options.quality !== undefined) {
      args.push('-Q', String(Math.round(options.quality)));
    }

    args.push(outputPath);

    return args;
  }

  private async executeScreencapture(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn('screencapture', args);
      
      let stderr = '';
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`screencapture failed: ${stderr}`));
        }
      });
    });
  }
}

async function unlink(path: string): Promise<void> {
  try {
    const { unlink: unlinkFn } = await import('fs/promises');
    await unlinkFn(path);
  } catch {
    // Ignore errors
  }
}

export type { ScreenshotOptions, RecordingSession };
