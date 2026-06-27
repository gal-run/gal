import { execSync, execFileSync } from "child_process";
import { existsSync } from "fs";
import { resolve, join } from "path";
import os from "os";
import * as win32 from "./win32.js";

const log = (msg: string) =>
  process.stderr.write(`[gal-computer-use] ${msg}\n`);

/** Synchronous, cross-platform millisecond sleep (no `sleep` binary needed). */
function sleepMs(ms: number): void {
  if (ms <= 0) return;
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, Math.ceil(ms));
}

export function screenshot(path?: string): string {
  // Default into the per-user OS temp dir (ACL'd) — `/tmp` does not exist on
  // Windows (it would resolve to C:\tmp and the capture would fail).
  const out = resolve(path || join(os.tmpdir(), `gal-screenshot-${Date.now()}.png`));
  const platform = os.platform();

  if (platform === "darwin") {
    execSync(`screencapture -x ${out}`);
    log(`Screenshot saved: ${out}`);
    return out;
  }

  if (platform === "linux") {
    try {
      execSync(`import -window root ${out}`);
    } catch {
      execSync(`scrot ${out}`);
    }
    return out;
  }

  if (platform === "win32") {
    log(`Screenshot saved: ${out}`);
    return win32.screenshot(out);
  }

  throw new Error(`Screenshot not supported on ${platform}`);
}

export function click(x: number, y: number): string {
  const platform = os.platform();

  if (platform === "darwin") {
    // Use cliclick if available, otherwise applescript
    try {
      execSync(`cliclick c:${x},${y}`);
    } catch {
      // Fallback to AppleScript
      const script = `
        tell application "System Events"
          set mousePos to {${x}, ${y}}
        end tell
      `;
      try {
        execSync(`osascript -e '${script}'`);
      } catch {
        execSync(
          `osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`,
        );
      }
    }
    return `Clicked at (${x}, ${y})`;
  }

  if (platform === "linux") {
    try {
      execSync(`xdotool mousemove ${x} ${y} click 1`);
    } catch {
      throw new Error("Install xdotool: sudo apt install xdotool");
    }
    return `Clicked at (${x}, ${y})`;
  }

  if (platform === "win32") {
    return win32.click(x, y);
  }

  throw new Error(`Click not supported on ${platform}`);
}

export function typeText(text: string): string {
  const platform = os.platform();

  if (platform === "darwin") {
    execSync(
      `osascript -e 'tell application "System Events" to keystroke "${text.replace(/"/g, '\\"')}"'`,
    );
    return `Typed: ${text}`;
  }

  if (platform === "linux") {
    execSync(`xdotool type "${text}"`);
    return `Typed: ${text}`;
  }

  if (platform === "win32") {
    return win32.typeText(text);
  }

  throw new Error(`Type not supported on ${platform}`);
}

export function keyPress(key: string): string {
  const platform = os.platform();

  if (platform === "darwin") {
    execSync(
      `osascript -e 'tell application "System Events" to key code ${keyToCode(key)}'`,
    );
    return `Pressed: ${key}`;
  }

  if (platform === "linux") {
    execSync(`xdotool key ${key}`);
    return `Pressed: ${key}`;
  }

  if (platform === "win32") {
    return win32.keyPress(key);
  }

  throw new Error(`Key press not supported on ${platform}`);
}

export function rightClick(x: number, y: number): string {
  const platform = os.platform();

  if (platform === "darwin") {
    try {
      execSync(`cliclick rc:${x},${y}`);
    } catch {
      execSync(
        `osascript -e 'tell application "System Events" to click at {${x}, ${y}} right button down and right button up'`,
      );
    }
    return `Right-clicked at (${x}, ${y})`;
  }

  if (platform === "linux") {
    execSync(`xdotool mousemove ${x} ${y} click 3`);
    return `Right-clicked at (${x}, ${y})`;
  }

  if (platform === "win32") {
    return win32.rightClick(x, y);
  }

  throw new Error(`Right click not supported on ${platform}`);
}

export function doubleClick(x: number, y: number): string {
  const platform = os.platform();

  if (platform === "darwin") {
    try {
      execSync(`cliclick dc:${x},${y}`);
    } catch {
      execSync(
        `osascript -e 'tell application "System Events" to click at {${x}, ${y}}' -e 'tell application "System Events" to click at {${x}, ${y}}'`,
      );
    }
    return `Double-clicked at (${x}, ${y})`;
  }

  if (platform === "linux") {
    execSync(`xdotool mousemove ${x} ${y} click --repeat 2 1`);
    return `Double-clicked at (${x}, ${y})`;
  }

  if (platform === "win32") {
    return win32.doubleClick(x, y);
  }

  throw new Error(`Double click not supported on ${platform}`);
}

export function getAppState(name?: string): {
  app: string;
  title: string;
  visible: boolean;
  position: { x: number; y: number; w: number; h: number };
  pid: number;
} {
  const platform = os.platform();

  if (platform === "darwin") {
    const target = name
      ? `first process whose name is "${name}"`
      : "first process whose frontmost is true";
    const raw = execSync(
      `osascript -e '
        tell application "System Events"
          set p to ${target}
          set appName to name of p
          try
            set winTitle to title of first window of p
          on error
            set winTitle to ""
          end try
          set isVis to visible of p
          try
            set winPos to position of first window of p
            set winSize to size of first window of p
          on error
            set winPos to {0, 0}
            set winSize to {0, 0}
          end try
          set pidStr to unix id of p
          return appName & "|" & winTitle & "|" & isVis & "|" & item 1 of winPos & "," & item 2 of winPos & "|" & item 1 of winSize & "," & item 2 of winSize & "|" & pidStr
        end tell'`,
    )
      .toString()
      .trim();
    const [app, title, vis, pos, size, pid] = raw.split("|");
    const [px, py] = pos.split(",").map(Number);
    const [sx, sy] = size.split(",").map(Number);
    return {
      app,
      title: title || "",
      visible: vis === "true",
      position: { x: px, y: py, w: sx, h: sy },
      pid: Number(pid),
    };
  }

  if (platform === "linux") {
    // Resolve a window id first: a named app's first window, else the active
    // one. Use execFileSync (no shell) + input validation so the caller-supplied
    // app name can never be interpreted as a shell command.
    let wid = "";
    if (name) {
      if (!/^[\w .:+/@-]{1,128}$/.test(name)) {
        throw new Error(`Invalid app name: ${name}`);
      }
      const found = execFileSync("xdotool", ["search", "--name", name], {
        encoding: "utf8",
      }).trim();
      wid = found.split("\n")[0]?.trim() || "";
      // Don't silently fall back to the active window for an explicit-but-
      // unmatched name — throw, matching the macOS branch's "not found".
      if (!wid) {
        throw new Error(`App not found: ${name}`);
      }
    } else {
      wid = execFileSync("xdotool", ["getactivewindow"], {
        encoding: "utf8",
      }).trim();
    }
    if (!/^\d+$/.test(wid)) {
      throw new Error("Could not resolve a window id");
    }
    let title = "";
    try {
      title = execFileSync("xdotool", ["getwindowname", wid], {
        encoding: "utf8",
      }).trim();
    } catch {
      // window has no name — leave title empty
    }
    const geo = execFileSync("xdotool", ["getwindowgeometry", wid], {
      encoding: "utf8",
    }).replace(/\s+/g, " ");
    // Window x/y can be negative on multi-monitor layouts (monitor left/above
    // the primary), so allow a sign; width/height stay non-negative.
    const match = geo.match(/Position: (-?\d+),(-?\d+).*Geometry: (\d+)x(\d+)/);
    let pid = 0;
    let app = "";
    try {
      const pidStr = execFileSync("xdotool", ["getwindowpid", wid], {
        encoding: "utf8",
      }).trim();
      if (/^\d+$/.test(pidStr)) {
        pid = Number(pidStr);
        app = execFileSync("ps", ["-p", String(pid), "-o", "comm="], {
          encoding: "utf8",
        }).trim();
      }
    } catch {
      // window has no owning pid (override-redirect / remote) — leave app/pid empty
    }
    return {
      app,
      title,
      visible: true,
      position: match
        ? {
            x: Number(match[1]),
            y: Number(match[2]),
            w: Number(match[3]),
            h: Number(match[4]),
          }
        : { x: 0, y: 0, w: 0, h: 0 },
      pid,
    };
  }

  if (platform === "win32") {
    return win32.getAppState(name);
  }

  throw new Error(`App state not supported on ${platform}`);
}

export function setValue(value: string, app?: string): string {
  const platform = os.platform();

  if (platform === "darwin") {
    const appTarget = app || "System Events";
    execSync(
      `osascript -e '
        tell application "${appTarget}"
          activate
          delay 0.1
        end tell
        tell application "System Events"
          tell process "${app || ""}"
            set frontmost to true
            set focusedElement to value of attribute "AXFocusedUIElement"
            if focusedElement is not missing value then
              set value of attribute "AXValue" of focusedElement to "${value.replace(/"/g, '\\"')}"
            end if
          end tell
        end tell'`,
    );
    return `Set value: ${value}`;
  }

  if (platform === "linux") {
    // Prefer the real accessibility path (AT-SPI EditableText on the focused
    // element) — the Linux analog of macOS AXValue. Fall back to typing if
    // AT-SPI is unavailable or the focused element is not editable text.
    if (linuxSetValueViaAtspi(value)) {
      return `Set value: ${value}`;
    }
    keyboardType(value);
    return `Set value (typed): ${value}`;
  }

  if (platform === "win32") {
    return win32.setValue(value, app);
  }

  throw new Error(`Set value not supported on ${platform}`);
}

function keyboardType(text: string): void {
  execSync(`xdotool type "${text}"`);
}

const ATSPI_SETVALUE_PY = `
import os, gi
gi.require_version("Atspi", "2.0")
from gi.repository import Atspi
val = os.environ.get("GAL_AX_VALUE", "")
Atspi.init()
desk = Atspi.get_desktop(0)
def find_focused(n):
    try:
        if n.get_state_set().contains(Atspi.StateType.FOCUSED):
            return n
    except Exception:
        pass
    try:
        cnt = n.get_child_count()
    except Exception:
        return None
    for i in range(cnt):
        try:
            ch = n.get_child_at_index(i)
        except Exception:
            continue
        if ch is None:
            continue
        r = find_focused(ch)
        if r is not None:
            return r
    return None
focused = None
for i in range(desk.get_child_count()):
    try:
        app = desk.get_child_at_index(i)
    except Exception:
        continue
    if app is None:
        continue
    focused = find_focused(app)
    if focused is not None:
        break
ok = False
if focused is not None:
    try:
        et = focused.get_editable_text()
        if et is not None:
            et.set_text_contents(val)
            ok = True
    except Exception:
        ok = False
print("ok" if ok else "no")
`;

/** Set the focused element's value via AT-SPI EditableText. Returns true on success. */
function linuxSetValueViaAtspi(value: string): boolean {
  try {
    const out = execSync(`python3 -c "$GAL_ATSPI_PY"`, {
      env: { ...process.env, GAL_ATSPI_PY: ATSPI_SETVALUE_PY, GAL_AX_VALUE: value },
    })
      .toString()
      .trim();
    return out.endsWith("ok");
  } catch {
    return false;
  }
}

export function animateMouseMove(
  x: number,
  y: number,
  duration: number = 300,
): string {
  const platform = os.platform();
  const from = getMousePosition();
  const steps = Math.max(10, Math.ceil(duration / 16));
  const delay = duration / steps;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t * t * (3 - 2 * t); // smoothstep
    const cx = Math.round(from.x + (x - from.x) * ease);
    const cy = Math.round(from.y + (y - from.y) * ease);

    if (platform === "darwin") {
      try {
        execSync(`cliclick m:${cx},${cy}`);
      } catch {
        execSync(
          `osascript -e 'tell application "System Events" to set mouse position to {${cx}, ${cy}}'`,
        );
      }
    } else if (platform === "linux") {
      execSync(`xdotool mousemove ${cx} ${cy}`);
    } else if (platform === "win32") {
      win32.setCursor(cx, cy);
    }
    sleepMs(delay);
  }

  return `Mouse moved smoothly to (${x}, ${y}) in ${duration}ms`;
}

export function mouseMove(x: number, y: number): string {
  const platform = os.platform();

  if (platform === "darwin") {
    try {
      execSync(`cliclick m:${x},${y}`);
    } catch {
      execSync(
        `osascript -e 'tell application "System Events" to set mouse position to {${x}, ${y}}'`,
      );
    }
    return `Mouse moved to (${x}, ${y})`;
  }

  if (platform === "linux") {
    execSync(`xdotool mousemove ${x} ${y}`);
    return `Mouse moved to (${x}, ${y})`;
  }

  if (platform === "win32") {
    return win32.mouseMove(x, y);
  }

  throw new Error(`Mouse move not supported on ${platform}`);
}

export function scroll(
  amount: number,
  direction: "up" | "down" = "down",
): string {
  const clicks = direction === "down" ? amount : -amount;
  const platform = os.platform();

  if (platform === "darwin") {
    try {
      execSync(`cliclick w:${clicks}`);
    } catch {
      const key = direction === "down" ? "125" : "126"; // down arrow / up arrow keycodes
      for (let i = 0; i < Math.abs(clicks); i++) {
        execSync(
          `osascript -e 'tell application "System Events" to key code ${key}'`,
        );
      }
    }
    return `Scrolled ${direction} ${Math.abs(amount)}`;
  }

  if (platform === "linux") {
    const btn = direction === "down" ? "5" : "4";
    for (let i = 0; i < Math.abs(amount); i++) {
      execSync(`xdotool click ${btn}`);
    }
    return `Scrolled ${direction} ${amount}`;
  }

  if (platform === "win32") {
    return win32.scroll(amount, direction);
  }

  throw new Error(`Scroll not supported on ${platform}`);
}

export function drag(x1: number, y1: number, x2: number, y2: number): string {
  const platform = os.platform();

  if (platform === "darwin") {
    try {
      execSync(`cliclick dd:${x1},${y1} du:${x2},${y2}`);
    } catch {
      execSync(`osascript -e '
        tell application "System Events"
          set mouse position to {${x1}, ${y1}}
          tell process "Finder" to click at {${x1}, ${y1}}
          delay 0.1
          set mouse position to {${x2}, ${y2}}
        end tell'`);
    }
    return `Dragged from (${x1},${y1}) to (${x2},${y2})`;
  }

  if (platform === "linux") {
    execSync(
      `xdotool mousemove ${x1} ${y1} mousedown 1 mousemove ${x2} ${y2} mouseup 1`,
    );
    return `Dragged from (${x1},${y1}) to (${x2},${y2})`;
  }

  if (platform === "win32") {
    return win32.drag(x1, y1, x2, y2);
  }

  throw new Error(`Drag not supported on ${platform}`);
}

export function listApps(): string {
  const platform = os.platform();

  if (platform === "darwin") {
    const result = execSync(
      `osascript -e 'tell application "System Events" to get name of every process whose background only is false'`,
    )
      .toString()
      .trim();
    return result.split(", ").join("\n");
  }

  if (platform === "linux") {
    // wmctrl is the nicest source but is often not installed (e.g. headless
    // Xvfb boxes) — fall back to enumerating visible windows via xdotool.
    try {
      return execSync(`wmctrl -l`).toString().trim();
    } catch {
      // `|| true` so a windowless display degrades to "" (like the wmctrl path)
      // instead of xdotool's non-zero exit propagating as a throw.
      return execSync(
        `xdotool search --onlyvisible --name '.+' getwindowname %@ 2>/dev/null || true`,
      )
        .toString()
        .trim();
    }
  }

  if (platform === "win32") {
    return win32.listApps();
  }

  throw new Error(`List apps not supported on ${platform}`);
}

export function activateApp(name: string): string {
  const platform = os.platform();

  if (platform === "darwin") {
    execSync(`osascript -e 'tell application "${name}" to activate'`);
    return `Activated: ${name}`;
  }

  if (platform === "linux") {
    execSync(`xdotool search --name "${name}" windowactivate`);
    return `Activated: ${name}`;
  }

  if (platform === "win32") {
    return win32.activateApp(name);
  }

  throw new Error(`Activate app not supported on ${platform}`);
}

export function getScreenSize(): { width: number; height: number } {
  const platform = os.platform();

  if (platform === "darwin") {
    const result = execSync(
      `osascript -e 'tell application "Finder" to get bounds of window of desktop'`,
    )
      .toString()
      .trim();
    // Returns "0, 0, 1512, 982" → width=1512, height=982
    const parts = result.split(", ").map(Number);
    return { width: parts[2], height: parts[3] };
  }

  if (platform === "linux") {
    const result = execSync(`xdotool getdisplaygeometry`).toString().trim();
    const [width, height] = result.split(" ").map(Number);
    return { width, height };
  }

  if (platform === "win32") {
    return win32.getScreenSize();
  }

  return { width: 1920, height: 1080 };
}

export function getMousePosition(): { x: number; y: number } {
  const platform = os.platform();

  if (platform === "darwin") {
    try {
      const result = execSync(
        `osascript -e 'tell application "System Events" to get mouse position'`,
      )
        .toString()
        .trim();
      const [x, y] = result.split(", ").map(Number);
      return { x, y };
    } catch {
      // Fallback: use Python with Quartz/CoreGraphics
      const result = execSync(
        `python3 -c 'import Quartz; p=Quartz.NSEvent.mouseLocation(); print(f"{int(p.x)},{int(p.y)}")'`,
      )
        .toString()
        .trim();
      const [x, y] = result.split(",").map(Number);
      return { x, y };
    }
  }

  if (platform === "linux") {
    const result = execSync(`xdotool getmouselocation`).toString().trim();
    // Returns "x:100 y:250 screen:0 window:123"
    const x = parseInt(result.match(/x:(\d+)/)?.[1] || "0");
    const y = parseInt(result.match(/y:(\d+)/)?.[1] || "0");
    return { x, y };
  }

  if (platform === "win32") {
    return win32.getMousePosition();
  }

  return { x: 0, y: 0 };
}

export interface ChromeTab {
  title: string;
  url: string;
  index: number;
  active: boolean;
}

export function chromeTabs(): ChromeTab[] {
  const platform = os.platform();

  if (platform === "darwin") {
    const raw = execSync(
      `osascript -e '
        tell application "Google Chrome"
          set tabList to {}
          repeat with w in windows
            repeat with t in tabs of w
              set tabInfo to URL of t & "|" & title of t & "|" & (index of w)
              set end of tabList to tabInfo
            end repeat
          end repeat
          set AppleScript'"'"'s text item delimiters to "\\n"
          return tabList as string
        end tell' 2>/dev/null`,
    )
      .toString()
      .trim();
    if (raw) {
      return raw.split("\n").map((line, i) => {
        const parts = line.split("|");
        return {
          url: parts[0] || "",
          title: parts[1] || "",
          index: i,
          active: false,
        };
      });
    }
    // Fallback: query via window title only
    const windows = execSync(
      `osascript -e 'tell application "System Events" to tell process "Google Chrome" to get name of every window' 2>/dev/null`,
    )
      .toString()
      .trim();
    if (!windows) return [];
    return windows.split(", ").map((title, i) => ({
      title: title.replace(" - Google Chrome", "").trim(),
      url: "",
      index: i,
      active: i === 0,
    }));
  }

  return [];
}

export function chromeActiveTab(): ChromeTab | null {
  const platform = os.platform();

  if (platform === "darwin") {
    try {
      const raw = execSync(
        `osascript -e '
          tell application "Google Chrome"
            set a to active tab of front window
            return URL of a & "|" & title of a
          end tell' 2>/dev/null`,
      )
        .toString()
        .trim();
      if (raw && raw.includes("|")) {
        const [url, title] = raw.split("|");
        return { url, title, index: 0, active: true };
      }
    } catch {}
    const title = execSync(
      `osascript -e 'tell application "System Events" to tell process "Google Chrome" to get name of window 1' 2>/dev/null`,
    )
      .toString()
      .trim();
    if (title) {
      const clean = title.replace(" - Google Chrome", "").trim();
      return { url: "", title: clean, index: 0, active: true };
    }
  }

  return null;
}

export function chromeExecuteJS(js: string): string {
  // The computer_chrome_* tools are a macOS AppleScript convenience. Cross-
  // platform browser automation is the separate gal-chrome MCP (Playwright).
  if (os.platform() !== "darwin") {
    return "Chrome control via computer-use is macOS-only; use the gal-chrome MCP (Playwright) for cross-platform browser automation.";
  }
  try {
    const result = execSync(
      `osascript -e 'tell application "Google Chrome" to execute active tab of front window javascript "${js.replace(/"/g, '\\"')}"' 2>&1`,
    )
      .toString()
      .trim();
    return result || "Done";
  } catch (e: any) {
    if (e.message?.includes("JavaScript through AppleScript")) {
      return "Error: Enable View > Developer > Allow JavaScript from Apple Events in Chrome menu";
    }
    return `Error: ${e.message?.slice(0, 200)}`;
  }
}

export function chromeHighlightTab(
  color = "orange",
  label = "Automated",
): string {
  const js = `
(function(){
  var existing = document.getElementById('gal-chrome-overlay');
  if(existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.id = 'gal-chrome-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;border:3px solid ${color};pointer-events:none;z-index:2147483647;box-sizing:border-box;';
  var pill = document.createElement('div');
  pill.textContent = '${label}';
  pill.style.cssText = 'position:fixed;top:8px;right:8px;background:${color};color:#fff;padding:4px 12px;border-radius:12px;font:12px system-ui;pointer-events:none;z-index:2147483647;';
  overlay.appendChild(pill);
  document.body.appendChild(overlay);
})();`;
  return chromeExecuteJS(js);
}

export function chromeClearHighlight(): string {
  const js = `(function(){var e=document.getElementById('gal-chrome-overlay');if(e)e.remove();})();`;
  return chromeExecuteJS(js);
}

function keyToCode(key: string): string {
  const codes: Record<string, string> = {
    return: "36",
    enter: "36",
    space: "49",
    tab: "48",
    escape: "53",
    esc: "53",
    delete: "51",
    backspace: "51",
    up: "126",
    down: "125",
    left: "123",
    right: "124",
    home: "115",
    end: "119",
    pageup: "116",
    pagedown: "121",
    f1: "122",
    f2: "120",
    f3: "99",
    f4: "118",
    f5: "96",
    f6: "97",
    f7: "98",
    f8: "100",
    f9: "101",
    f10: "109",
    f11: "103",
    f12: "111",
  };
  return codes[key.toLowerCase()] || key;
}
