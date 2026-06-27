// Windows (win32) backend for the GAL computer-use harness.
//
// Mirrors the macOS/Linux behaviour in tools.ts but for Windows. The same
// "shell out to OS-native facilities, no native node deps" philosophy is kept:
// instead of osascript/cliclick (macOS) or xdotool/scrot (Linux) we drive a
// small self-contained C# console helper that P/Invokes user32 (SendInput,
// SetCursorPos, mouse/keyboard) and uses System.Windows.Automation (UI
// Automation) for the accessibility set-value path and System.Drawing for
// screenshots.
//
// The helper source is embedded below and compiled ONCE per process (via
// PowerShell's in-box C# compiler) into a fresh, process-created temp dir
// (mkdtemp) — an unpredictable path holding a file we just wrote, rather than a
// predictable %TEMP%\<hash>.exe that another same-user process could pre-plant.
// The compiled path is memoised for the process lifetime, so every subsequent
// action invokes the exe directly (~tens of ms), matching the osascript-per-call
// latency profile rather than paying a PowerShell+compile cost each time. (The
// per-process temp dir is left behind; the OS reclaims %TEMP%.) .NET Framework
// 4.x + Windows PowerShell ship with every Windows 10/11 — nothing to install.

import { execFileSync } from "child_process";
import { writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const log = (msg: string) =>
  process.stderr.write(`[gal-computer-use:win32] ${msg}\n`);

// --- embedded C# helper -----------------------------------------------------

const C_SHARP = String.raw`
using System;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using System.Windows.Automation;

public static class GalCuWin
{
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct HARDWAREINPUT { public uint uMsg; public ushort wParamL, wParamH; }
    [StructLayout(LayoutKind.Explicit)] struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion U; }

    const uint INPUT_KEYBOARD = 1;
    const uint KEYEVENTF_UNICODE = 0x0004, KEYEVENTF_KEYUP = 0x0002;
    const uint MOUSEEVENTF_LEFTDOWN = 0x0002, MOUSEEVENTF_LEFTUP = 0x0004;
    const uint MOUSEEVENTF_RIGHTDOWN = 0x0008, MOUSEEVENTF_RIGHTUP = 0x0010;
    const uint MOUSEEVENTF_WHEEL = 0x0800;

    [DllImport("user32.dll")] static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, IntPtr dwExtraInfo);
    [DllImport("user32.dll")] static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, IntPtr dwExtraInfo);
    [DllImport("user32.dll")] static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int nCmdShow);

    static int Fail(string msg) { Console.Error.Write(msg); return 1; }

    public static int Main(string[] args)
    {
        try
        {
            // Emit stdout as UTF-8 so non-ASCII window titles / process names
            // round-trip to Node (which decodes stdout as utf8). A .NET Framework
            // console app otherwise defaults to the OEM code page. Best-effort —
            // never let an encoding edge case fail the whole command.
            try { Console.OutputEncoding = new UTF8Encoding(false); } catch { }
            if (args.Length == 0) { Console.Write("usage: <command> [args]"); return 1; }
            string cmd = args[0];
            switch (cmd)
            {
                case "ping": Console.Write("pong"); return 0;
                case "screensize": { var b = Screen.PrimaryScreen.Bounds; Console.Write(b.Width + " " + b.Height); return 0; }
                case "cursorpos": { POINT p; GetCursorPos(out p); Console.Write(p.X + " " + p.Y); return 0; }
                case "setcursor": SetCursorPos(I(args, 1), I(args, 2)); return 0;
                case "click": return Click(I(args, 1), I(args, 2), Arg(args, 3, "left"), I(args, 4, 1));
                case "scroll": { SetCursorPosCurrent(); mouse_event(MOUSEEVENTF_WHEEL, 0, 0, unchecked((uint)I(args, 1)), IntPtr.Zero); return 0; }
                case "drag": return Drag(I(args, 1), I(args, 2), I(args, 3), I(args, 4));
                case "type": TypeUnicode(B64(Arg(args, 1, ""))); return 0;
                case "key": return Key(Arg(args, 1, ""));
                case "screenshot": return Screenshot(Arg(args, 1, ""));
                case "appstate": Console.Write(AppState(args.Length > 1 ? args[1] : null)); return 0;
                case "setvalue": return SetValue(B64(Arg(args, 1, "")), args.Length > 2 ? args[2] : null);
                case "apps": Apps(); return 0;
                case "activate": Activate(Arg(args, 1, "")); return 0;
                default: return Fail("unknown command: " + cmd);
            }
        }
        catch (Exception e) { return Fail(e.GetType().Name + ": " + e.Message); }
    }

    static string Arg(string[] a, int i, string d) { return i < a.Length ? a[i] : d; }
    static int I(string[] a, int i) { return int.Parse(a[i]); }
    static int I(string[] a, int i, int d) { return i < a.Length ? int.Parse(a[i]) : d; }
    static string B64(string s) { return s.Length == 0 ? "" : Encoding.UTF8.GetString(Convert.FromBase64String(s)); }

    static void SetCursorPosCurrent() { POINT p; GetCursorPos(out p); SetCursorPos(p.X, p.Y); }

    static int Click(int x, int y, string button, int count)
    {
        SetCursorPos(x, y);
        uint down = button == "right" ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_LEFTDOWN;
        uint up = button == "right" ? MOUSEEVENTF_RIGHTUP : MOUSEEVENTF_LEFTUP;
        for (int i = 0; i < count; i++)
        {
            mouse_event(down, 0, 0, 0, IntPtr.Zero);
            mouse_event(up, 0, 0, 0, IntPtr.Zero);
            if (i + 1 < count) Thread.Sleep(40);
        }
        return 0;
    }

    static int Drag(int x1, int y1, int x2, int y2)
    {
        SetCursorPos(x1, y1);
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, IntPtr.Zero);
        int steps = 20;
        for (int i = 1; i <= steps; i++)
        {
            double t = (double)i / steps;
            int cx = (int)Math.Round(x1 + (x2 - x1) * t);
            int cy = (int)Math.Round(y1 + (y2 - y1) * t);
            SetCursorPos(cx, cy);
            Thread.Sleep(8);
        }
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, IntPtr.Zero);
        return 0;
    }

    static void TypeUnicode(string s)
    {
        // Build the WHOLE sequence (printable chars AND newlines) into one list
        // emitted by a single SendInput, so injection order matches source order.
        // (Dispatching '\n' via a mid-loop keybd_event would front-load every
        // Enter ahead of the batched text and corrupt multi-line input.)
        var list = new List<INPUT>();
        foreach (char c in s)
        {
            if (c == '\r') continue; // CRLF: drop the CR; the LF drives Enter
            INPUT down = new INPUT { type = INPUT_KEYBOARD };
            INPUT up;
            if (c == '\n')
            {
                down.U.ki = new KEYBDINPUT { wVk = 0x0D, wScan = 0, dwFlags = 0, time = 0, dwExtraInfo = IntPtr.Zero };
                up = down;
                up.U.ki.dwFlags = KEYEVENTF_KEYUP;
            }
            else
            {
                down.U.ki = new KEYBDINPUT { wVk = 0, wScan = c, dwFlags = KEYEVENTF_UNICODE, time = 0, dwExtraInfo = IntPtr.Zero };
                up = down;
                up.U.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
            }
            list.Add(down);
            list.Add(up);
        }
        if (list.Count > 0) SendInput((uint)list.Count, list.ToArray(), Marshal.SizeOf(typeof(INPUT)));
    }

    static int Key(string key)
    {
        // Support modifier chords like "ctrl+a", "alt+F4", "ctrl+shift+t"
        // (parity with Linux xdotool key). A lone "+" stays a literal key.
        string[] parts = key.Length > 1 ? key.Split('+') : new[] { key };
        var mods = new List<byte>();
        for (int i = 0; i < parts.Length - 1; i++)
        {
            byte mv = ModToVk(parts[i]);
            if (mv == 0) return Fail("unknown modifier: " + parts[i]);
            mods.Add(mv);
        }
        string main = parts[parts.Length - 1];
        byte vk = KeyToVk(main);
        if (vk == 0) return Fail("unknown key: " + main);
        foreach (byte m in mods) keybd_event(m, 0, 0, IntPtr.Zero);
        keybd_event(vk, 0, 0, IntPtr.Zero);
        keybd_event(vk, 0, KEYEVENTF_KEYUP, IntPtr.Zero);
        for (int i = mods.Count - 1; i >= 0; i--) keybd_event(mods[i], 0, KEYEVENTF_KEYUP, IntPtr.Zero);
        return 0;
    }

    static byte ModToVk(string m)
    {
        switch (m.ToLowerInvariant())
        {
            case "ctrl": case "control": return 0x11;
            case "alt": case "option": return 0x12;
            case "shift": return 0x10;
            case "win": case "meta": case "cmd": case "super": return 0x5B;
        }
        return 0;
    }

    static byte KeyToVk(string key)
    {
        switch (key.ToLowerInvariant().Replace("_", ""))
        {
            case "return": case "enter": return 0x0D;
            case "escape": case "esc": return 0x1B;
            case "tab": return 0x09;
            case "space": return 0x20;
            case "backspace": return 0x08;
            case "delete": return 0x2E;
            case "up": return 0x26;
            case "down": return 0x28;
            case "left": return 0x25;
            case "right": return 0x27;
            case "home": return 0x24;
            case "end": return 0x23;
            case "pageup": return 0x21;
            case "pagedown": return 0x22;
            case "f1": return 0x70; case "f2": return 0x71; case "f3": return 0x72; case "f4": return 0x73;
            case "f5": return 0x74; case "f6": return 0x75; case "f7": return 0x76; case "f8": return 0x77;
            case "f9": return 0x78; case "f10": return 0x79; case "f11": return 0x7A; case "f12": return 0x7B;
        }
        if (key.Length == 1)
        {
            char c = char.ToUpperInvariant(key[0]);
            if ((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) return (byte)c;
        }
        return 0;
    }

    static int Screenshot(string path)
    {
        if (path.Length == 0) return Fail("screenshot needs a path");
        var dir = System.IO.Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir) && !System.IO.Directory.Exists(dir))
            System.IO.Directory.CreateDirectory(dir);
        // Capture the PRIMARY screen (origin 0,0) so the screenshot, getScreenSize,
        // and SetCursorPos click coordinates all share one frame — matching the
        // macOS/Linux backends. (VirtualScreen has a negative origin on some
        // multi-monitor layouts, which would offset every click.)
        var b = Screen.PrimaryScreen.Bounds;
        using (var bmp = new Bitmap(b.Width, b.Height, PixelFormat.Format32bppArgb))
        using (var g = Graphics.FromImage(bmp))
        {
            g.CopyFromScreen(b.Left, b.Top, 0, 0, b.Size, CopyPixelOperation.SourceCopy);
            bmp.Save(path, ImageFormat.Png);
        }
        Console.Write(path);
        return 0;
    }

    static Process ProcById(uint pid)
    {
        try { return Process.GetProcessById((int)pid); } catch { return null; }
    }

    static string AppState(string name)
    {
        IntPtr h;
        Process proc = null;
        if (!string.IsNullOrEmpty(name))
        {
            foreach (var p in Process.GetProcesses())
            {
                try
                {
                    if (p.MainWindowHandle != IntPtr.Zero &&
                        p.ProcessName.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0)
                    { proc = p; break; }
                }
                catch { }
            }
            if (proc == null) throw new Exception("app not found: " + name);
            h = proc.MainWindowHandle;
        }
        else
        {
            h = GetForegroundWindow();
            uint pid; GetWindowThreadProcessId(h, out pid);
            proc = ProcById(pid);
        }

        var sb = new StringBuilder(512);
        if (h != IntPtr.Zero) GetWindowText(h, sb, sb.Capacity);
        RECT r = new RECT();
        if (h != IntPtr.Zero) GetWindowRect(h, out r);
        bool vis = h != IntPtr.Zero && IsWindowVisible(h);
        string app = proc != null ? proc.ProcessName : "";
        int pidOut = proc != null ? proc.Id : 0;

        var j = new StringBuilder();
        j.Append("{\"app\":").Append(JStr(app));
        j.Append(",\"title\":").Append(JStr(sb.ToString()));
        j.Append(",\"visible\":").Append(vis ? "true" : "false");
        j.Append(",\"position\":{\"x\":").Append(r.Left).Append(",\"y\":").Append(r.Top)
            .Append(",\"w\":").Append(r.Right - r.Left).Append(",\"h\":").Append(r.Bottom - r.Top).Append("}");
        j.Append(",\"pid\":").Append(pidOut).Append("}");
        return j.ToString();
    }

    static int SetValue(string value, string app)
    {
        if (!string.IsNullOrEmpty(app)) Activate(app);
        AutomationElement fe = null;
        try { fe = AutomationElement.FocusedElement; } catch { }
        bool ok = false;
        if (fe != null)
        {
            object pat;
            if (fe.TryGetCurrentPattern(ValuePattern.Pattern, out pat))
            {
                try { ((ValuePattern)pat).SetValue(value); ok = true; } catch { }
            }
        }
        if (!ok) { TypeUnicode(value); Console.Write("typed"); }
        else Console.Write("ok");
        return 0;
    }

    static void Apps()
    {
        var seen = new HashSet<string>();
        foreach (var p in Process.GetProcesses())
        {
            try
            {
                if (p.MainWindowHandle != IntPtr.Zero && !string.IsNullOrEmpty(p.MainWindowTitle))
                    if (seen.Add(p.ProcessName)) Console.WriteLine(p.ProcessName);
            }
            catch { }
        }
    }

    static void Activate(string name)
    {
        foreach (var p in Process.GetProcesses())
        {
            try
            {
                if (p.MainWindowHandle != IntPtr.Zero &&
                    p.ProcessName.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    ShowWindow(p.MainWindowHandle, 9); // SW_RESTORE
                    SetForegroundWindow(p.MainWindowHandle);
                    return;
                }
            }
            catch { }
        }
    }

    static string JStr(string s)
    {
        if (s == null) s = "";
        var sb = new StringBuilder("\"");
        foreach (char c in s)
        {
            switch (c)
            {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                    else sb.Append(c);
                    break;
            }
        }
        return sb.Append("\"").ToString();
    }
}
`;

// --- compile-once cache + invocation ----------------------------------------

let helperExe: string | null = null;

/** Absolute path to Windows PowerShell — never invoke it by bare name, or
 *  libuv's CWD-first search order would let a planted powershell.exe run. */
function powershellPath(): string {
  const root = process.env.SystemRoot || "C:\\Windows";
  return join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

/** Double single quotes for safe interpolation into a PowerShell '...' literal. */
const psQuote = (s: string) => s.replace(/'/g, "''");

function ensureHelper(): string {
  if (helperExe) return helperExe;
  // Compile into a FRESH, process-created temp dir (mkdtemp) so the exe path is
  // unpredictable and the file is one we just wrote — never reuse a pre-existing
  // file at a predictable path (avoids %TEMP% cache-poisoning of the helper).
  const dir = mkdtempSync(join(tmpdir(), "gal-cu-win-"));
  const cs = join(dir, "gal-cu-win.cs");
  const exe = join(dir, "gal-cu-win.exe");
  log(`compiling Windows helper -> ${exe}`);
  writeFileSync(cs, C_SHARP, "utf8");
  const refs =
    "'System.Drawing','System.Windows.Forms','UIAutomationClient','UIAutomationTypes'";
  // PowerShell re-parses the -Command body, so single-quote-escape the paths
  // even though execFileSync avoids cmd.exe (the temp dir embeds the username,
  // which may legally contain an apostrophe).
  const ps =
    `Add-Type -Path '${psQuote(cs)}' -OutputAssembly '${psQuote(exe)}' ` +
    `-OutputType ConsoleApplication -ReferencedAssemblies ${refs}`;
  execFileSync(
    powershellPath(),
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
    { stdio: "pipe" },
  );
  helperExe = exe;
  return exe;
}

function run(args: string[]): string {
  const exe = ensureHelper();
  return execFileSync(exe, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

// --- exported backend (mirrors tools.ts signatures) -------------------------

export function screenshot(path: string): string {
  run(["screenshot", path]);
  return path;
}

export function click(x: number, y: number): string {
  run(["click", `${x}`, `${y}`, "left", "1"]);
  return `Clicked at (${x}, ${y})`;
}

export function rightClick(x: number, y: number): string {
  run(["click", `${x}`, `${y}`, "right", "1"]);
  return `Right-clicked at (${x}, ${y})`;
}

export function doubleClick(x: number, y: number): string {
  run(["click", `${x}`, `${y}`, "left", "2"]);
  return `Double-clicked at (${x}, ${y})`;
}

/** Instant move (no animation). The smooth glide is composed in tools.ts. */
export function setCursor(x: number, y: number): void {
  run(["setcursor", `${x}`, `${y}`]);
}

export function mouseMove(x: number, y: number): string {
  setCursor(x, y);
  return `Mouse moved to (${x}, ${y})`;
}

export function scroll(amount: number, direction: "up" | "down"): string {
  // Windows wheel: +120 per notch scrolls up (away from user), -120 down.
  const delta = (direction === "down" ? -120 : 120) * Math.abs(amount);
  run(["scroll", `${delta}`]);
  return `Scrolled ${direction} ${Math.abs(amount)}`;
}

export function drag(x1: number, y1: number, x2: number, y2: number): string {
  run(["drag", `${x1}`, `${y1}`, `${x2}`, `${y2}`]);
  return `Dragged from (${x1},${y1}) to (${x2},${y2})`;
}

export function typeText(text: string): string {
  run(["type", b64(text)]);
  return `Typed: ${text}`;
}

export function keyPress(key: string): string {
  run(["key", key]);
  return `Pressed: ${key}`;
}

export interface AppState {
  app: string;
  title: string;
  visible: boolean;
  position: { x: number; y: number; w: number; h: number };
  pid: number;
}

export function getAppState(name?: string): AppState {
  const out = run(name ? ["appstate", name] : ["appstate"]);
  return JSON.parse(out) as AppState;
}

export function setValue(value: string, app?: string): string {
  const r = run(app ? ["setvalue", b64(value), app] : ["setvalue", b64(value)]);
  return r === "typed" ? `Set value (typed): ${value}` : `Set value: ${value}`;
}

export function listApps(): string {
  return run(["apps"]);
}

export function activateApp(name: string): string {
  run(["activate", name]);
  return `Activated: ${name}`;
}

export function getScreenSize(): { width: number; height: number } {
  const [width, height] = run(["screensize"]).split(/\s+/).map(Number);
  return { width, height };
}

export function getMousePosition(): { x: number; y: number } {
  const [x, y] = run(["cursorpos"]).split(/\s+/).map(Number);
  return { x, y };
}
