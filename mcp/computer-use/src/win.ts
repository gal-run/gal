// Windows (win32) desktop actuation for the gal-computer-use MCP.
//
// macOS uses screencapture/cliclick/osascript and Linux uses scrot/xdotool; Windows has no equivalent
// CLI, so these shell out to PowerShell + .NET (System.Drawing / System.Windows.Forms / user32 P/Invoke),
// which are present on Windows 10/11 including Windows-on-ARM. Each helper writes a short .ps1 to a temp
// file and runs it (avoids the quoting hell of inline -Command), returning stdout.
import { execFileSync } from "child_process";
import { writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Run a PowerShell script. The script is written to a temp .ps1 and executed via execFileSync with an
// ARGUMENT ARRAY (no shell) — so nothing is interpolated into a shell command line. Any caller-supplied
// text/key that reaches the script body is placed inside PowerShell single-quoted strings with '' escaping
// (see winType/winKey), so it cannot break out of the string literal either.
function runPs(script: string): string {
  const file = join(tmpdir(), `gal-cu-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
  writeFileSync(file, script, "utf8");
  try {
    return execFileSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file],
      { encoding: "utf8", windowsHide: true },
    ).trim();
  } finally {
    try {
      rmSync(file, { force: true });
    } catch {
      /* best-effort temp cleanup */
    }
  }
}

const MOUSE_PINVOKE = `
Add-Type -Name M -Namespace GalCU -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
[DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, int extra);
[DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
public struct POINT { public int X; public int Y; }
'@
`;
// mouse_event flags
const LEFTDOWN = "0x0002", LEFTUP = "0x0004", RIGHTDOWN = "0x0008", RIGHTUP = "0x0010", WHEEL = "0x0800";

export function winScreenshot(out: string): void {
  runPs(`
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
$bmp.Save('${out.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
`);
}

export function winMouseMove(x: number, y: number): void {
  runPs(`${MOUSE_PINVOKE}[GalCU.M]::SetCursorPos(${x | 0}, ${y | 0})`);
}

export function winClick(x: number, y: number, button: "left" | "right" = "left", double = false): void {
  const [down, up] = button === "right" ? [RIGHTDOWN, RIGHTUP] : [LEFTDOWN, LEFTUP];
  const once = `[GalCU.M]::mouse_event(${down},0,0,0,0); [GalCU.M]::mouse_event(${up},0,0,0,0)`;
  runPs(`${MOUSE_PINVOKE}[GalCU.M]::SetCursorPos(${x | 0}, ${y | 0})\n${once}${double ? "\nStart-Sleep -Milliseconds 50\n" + once : ""}`);
}

export function winScroll(amount: number, direction: "up" | "down"): void {
  const delta = direction === "down" ? -120 * Math.abs(amount) : 120 * Math.abs(amount);
  runPs(`${MOUSE_PINVOKE}[GalCU.M]::mouse_event(${WHEEL},0,0,${delta},0)`);
}

export function winDrag(x1: number, y1: number, x2: number, y2: number): void {
  runPs(`${MOUSE_PINVOKE}
[GalCU.M]::SetCursorPos(${x1 | 0}, ${y1 | 0})
[GalCU.M]::mouse_event(${LEFTDOWN},0,0,0,0)
Start-Sleep -Milliseconds 80
[GalCU.M]::SetCursorPos(${x2 | 0}, ${y2 | 0})
[GalCU.M]::mouse_event(${LEFTUP},0,0,0,0)
`);
}

// SendKeys metacharacters must be brace-escaped so literal text types verbatim. Exported for tests.
export function escapeSendKeys(text: string): string {
  return text.replace(/[+^%~(){}\[\]]/g, (c) => `{${c}}`);
}

export function winType(text: string): void {
  runPs(`Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${escapeSendKeys(text).replace(/'/g, "''")}')`);
}

// Map common key names to SendKeys tokens; pass single chars through.
const KEY_MAP: Record<string, string> = {
  Return: "{ENTER}", Enter: "{ENTER}", Tab: "{TAB}", Escape: "{ESC}", Esc: "{ESC}",
  BackSpace: "{BACKSPACE}", Delete: "{DELETE}", Up: "{UP}", Down: "{DOWN}", Left: "{LEFT}", Right: "{RIGHT}",
  Home: "{HOME}", End: "{END}", space: " ",
};

// Resolve a key name to its SendKeys token. Exported for tests. An unknown multi-char key is wrapped as
// {NAME}; strip braces from it first so a stray "}" can't malform the SendKeys token.
export function sendKeysToken(key: string): string {
  if (KEY_MAP[key]) return KEY_MAP[key];
  if (key.length === 1) return escapeSendKeys(key);
  return `{${key.toUpperCase().replace(/[{}]/g, "")}}`;
}

export function winKey(key: string): void {
  const token = sendKeysToken(key);
  runPs(`Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait('${token.replace(/'/g, "''")}')`);
}

export function winScreenSize(): { width: number; height: number } {
  const out = runPs(`Add-Type -AssemblyName System.Windows.Forms
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
"$($b.Width) $($b.Height)"`);
  const [width, height] = out.split(/\s+/).map(Number);
  return { width: width || 1920, height: height || 1080 };
}

export function winMousePosition(): { x: number; y: number } {
  const out = runPs(`Add-Type -AssemblyName System.Windows.Forms
$p = [System.Windows.Forms.Cursor]::Position
"$($p.X) $($p.Y)"`);
  const [x, y] = out.split(/\s+/).map(Number);
  return { x: x || 0, y: y || 0 };
}
