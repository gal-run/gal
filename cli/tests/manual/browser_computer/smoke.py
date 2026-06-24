#!/usr/bin/env python3
"""Deterministic runtime check of gal-browser's native browser_computer tool.
Drives a fixture page by COORDINATES and asserts the resulting DOM state."""
import json, os, subprocess, sys

GAL = os.environ["GAL_BIN"]
URL = "file://" + os.path.join(os.path.dirname(os.path.abspath(__file__)), "page.html")


class Cli:
    def __init__(self):
        self.p = subprocess.Popen([GAL, "browser", "server", "--project-path", "."],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, text=True)
        self.i = 0
        self.rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                                "clientInfo": {"name": "v", "version": "1"}})
        self.send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def send(self, m): self.p.stdin.write(json.dumps(m) + "\n"); self.p.stdin.flush()

    def rpc(self, method, params):
        self.i += 1; rid = self.i
        self.send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
        for line in self.p.stdout:
            line = line.strip()
            if not line: continue
            try: msg = json.loads(line)
            except Exception: continue
            if msg.get("id") == rid: return msg.get("result", {})

    def call(self, tool, args): return self.rpc("tools/call", {"name": tool, "arguments": args})

    def evald(self, js):
        r = self.call("browser_execute_script", {"script": js})
        txt = (r.get("content", [{}])[0].get("text", "") if isinstance(r, dict) else "")
        try:
            inner = json.loads(txt).get("result")
        except Exception:
            return txt
        try:                       # execute_script JSON-encodes the value; decode once more
            return json.loads(inner)
        except Exception:
            return inner


def main():
    c = Cli()
    tools = {t["name"] for t in c.rpc("tools/list", {}).get("tools", [])}
    assert "browser_computer" in tools, "browser_computer NOT registered"
    print("[ok] browser_computer registered")
    c.call("browser_launch", {"start_url": URL, "width": 1920, "height": 1080})
    import time; time.sleep(1.0)

    results = []
    def check(name, ok, got):
        results.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] {name}: {got}")

    # 1. left_click on the button (center 200,130) -> __clicks == 1
    c.call("browser_computer", {"action": "left_click", "x": 200, "y": 130})
    clicks = c.evald("String(window.__clicks)")
    check("left_click increments handler", str(clicks) == "1", f"__clicks={clicks}")

    # 2. double_click -> two more clicks (total 3)
    c.call("browser_computer", {"action": "double_click", "x": 200, "y": 130})
    clicks = c.evald("String(window.__clicks)")
    check("double_click fires 2 clicks", str(clicks) == "3", f"__clicks={clicks}")

    # 3. focus input (250,237) then type -> value == "hello"
    c.call("browser_computer", {"action": "left_click", "x": 250, "y": 237})
    c.call("browser_computer", {"action": "type", "text": "hello"})
    val = c.evald("document.getElementById('inp').value")
    check("type inserts text into focused input", val == "hello", f"value={val!r}")

    # 4. key Enter on focused input -> __enter true
    c.call("browser_computer", {"action": "key", "text": "Enter"})
    en = c.evald("String(window.__enter)")
    check("key Enter delivers a real keydown", en == "true", f"__enter={en}")

    # 5. scroll down -> window.scrollY > 0
    c.call("browser_computer", {"action": "scroll", "x": 960, "y": 540, "scroll_y": 600})
    time.sleep(0.4)  # CDP wheel scroll settles asynchronously via the compositor
    sy = c.evald("String(Math.round(window.scrollY||document.documentElement.scrollTop))")
    check("scroll moves the viewport", str(sy) not in ("0","None",""), f"scrollY={sy}")

    c.call("browser_close", {})
    c.p.terminate()
    passed = sum(1 for r in results if r)
    print(f"\n=== {passed}/{len(results)} browser_computer checks passed ===")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
