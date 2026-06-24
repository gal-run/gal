#!/usr/bin/env python3
"""Runtime check of the macOS GALComputerUse harness — drives the real helper socket and
asserts platform-specific effects (CGEvent cursor move, NSPasteboard clipboard, screencapture
-R region dims, screencapture -D, AX tree). Non-destructive: the clipboard is saved+restored;
risky input actions (click/type/key/drag) are run to prove the CGEvent path executes but their
effect on whatever app is focused is NOT asserted (mouse posting is concretely proven by
move+cursor_position). Calculator is opened then quit for the app-launch test."""
import base64, json, os, socket, struct, subprocess, sys, time

SOCK = os.path.expanduser("~/Library/Application Support/GALComputerUse/helper.sock")
results = []


def cu(req):
    s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM); s.connect(SOCK)
    s.sendall(json.dumps(req).encode())
    s.shutdown(socket.SHUT_WR)  # macOS helper reads until EOF
    buf = b""
    while True:
        b = s.recv(65536)
        if not b: break
        buf += b
    s.close()
    return json.loads(buf.decode().strip() or "{}")


def check(name, ok, got): results.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] {name}: {got}", flush=True)


def runs(name, req):
    r = cu(req); check(f"{name} (executes)", isinstance(r, dict) and "error" not in r, r.get("message", r))


def png_dims(b64):
    d = base64.b64decode(b64); return struct.unpack(">II", d[16:24])


def main():
    check("ping", cu({"action": "ping"}).get("status") == "ok", cu({"action": "ping"}))

    # CGEvent mouse move proven concretely by reading position back
    cu({"action": "move", "x": 500, "y": 400})
    cp = cu({"action": "cursor_position"})
    check("move + cursor_position (CGEvent)", abs(cp.get("x", 0) - 500) < 6 and abs(cp.get("y", 0) - 400) < 6, cp)

    # NSPasteboard clipboard — save, test, restore
    orig = cu({"action": "read_clipboard"}).get("text", "")
    cu({"action": "write_clipboard", "text": "gal-mac-clip"})
    rc = cu({"action": "read_clipboard"})
    check("clipboard read/write (NSPasteboard)", rc.get("text", "") == "gal-mac-clip", rc.get("text"))
    cu({"action": "write_clipboard", "text": orig})  # restore

    # screencapture -x full + -R region (decode the PNG to prove a real capture)
    sr = cu({"action": "screenshot"})
    sd = png_dims(sr["image"]) if sr.get("image") else (0, 0)
    check("screenshot (screencapture -x)", sd[0] > 200 and sd[1] > 200, f"{sd[0]}x{sd[1]} png")
    zr = cu({"action": "zoom", "x": 100, "y": 100, "width": 300, "height": 200})
    zd = png_dims(zr["image"]) if zr.get("image") else (0, 0)
    # retina captures at 2x; accept 300x200 or 600x400
    check("zoom region (screencapture -R)", zd in ((300, 200), (600, 400)), f"{zd[0]}x{zd[1]} png")

    # screencapture -D (multi-monitor) then a capture still works
    runs("switch_display", {"action": "switch_display", "display": 1})
    sr2 = cu({"action": "screenshot"})
    check("screenshot after switch_display(-D1)", bool(sr2.get("image")) and len(sr2["image"]) > 500, f"bytes={len(sr2.get('image',''))}")
    cu({"action": "switch_display"})  # reset to auto

    # AX tree
    gs = cu({"action": "get_app_state"})
    check("get_app_state (AX tree)", isinstance(gs.get("root"), dict) and "role" in gs.get("root", {}), {"app": gs.get("app"), "rootRole": gs.get("root", {}).get("role")})

    # Input actions: CGEvent path executes (effect on focused app not asserted, to be safe)
    runs("click", {"action": "click", "x": 500, "y": 400})
    runs("double_click", {"action": "click", "x": 500, "y": 400, "click_count": 2})
    runs("right_click", {"action": "click", "x": 500, "y": 400, "button": "right"})
    runs("click + modifiers", {"action": "click", "x": 500, "y": 400, "modifiers": ["shift"]})
    runs("type", {"action": "type", "text": ""})  # empty: no keystrokes leak to apps
    runs("key", {"action": "key", "key": "shift"})  # modifier-only: no visible effect
    runs("key repeat", {"action": "key", "key": "shift", "repeat": 2})
    runs("hold_key", {"action": "hold_key", "key": "shift", "duration": 0.2})
    runs("scroll", {"action": "scroll", "scroll_y": 1})
    runs("left_click_drag", {"action": "left_click_drag", "start_x": 400, "start_y": 300, "x": 600, "y": 450})
    cp2 = cu({"action": "cursor_position"})
    check("drag moved the cursor to end", abs(cp2.get("x", 0) - 600) < 8, cp2)

    # batch (cursor proves the sequence ran)
    cu({"action": "batch", "actions": [{"action": "move", "x": 300, "y": 300}, {"action": "move", "x": 700, "y": 500}]})
    cp3 = cu({"action": "cursor_position"})
    check("batch runs the sequence", abs(cp3.get("x", 0) - 700) < 8, cp3)

    # open_application: launch Calculator, confirm, quit it
    before = subprocess.run(["pgrep", "-x", "Calculator"], capture_output=True, text=True).stdout.strip()
    cu({"action": "open_application", "app": "Calculator"})
    time.sleep(1.5)
    after = subprocess.run(["pgrep", "-x", "Calculator"], capture_output=True, text=True).stdout.strip()
    check("open_application launches Calculator", bool(after), f"pid={after or 'none'}")
    if after and not before:
        subprocess.run(["osascript", "-e", 'quit app "Calculator"'], capture_output=True)

    passed = sum(1 for r in results if r)
    print(f"\n=== {passed}/{len(results)} macOS CU runtime checks passed ===")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
