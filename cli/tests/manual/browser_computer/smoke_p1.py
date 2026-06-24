#!/usr/bin/env python3
"""Runtime check of gal-browser P1 parity tools: navigate back/forward, browser_resize,
browser_batch. Asserts observable state through the real gal binary."""
import json, os, subprocess, sys, time

GAL = os.environ["GAL_BIN"]
HERE = os.path.dirname(os.path.abspath(__file__))
URL1 = "file://" + os.path.join(HERE, "page.html")
URL2 = "file://" + os.path.join(HERE, "page2.html")


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
        txt = r.get("content", [{}])[0].get("text", "") if isinstance(r, dict) else ""
        try:
            inner = json.loads(txt).get("result")
        except Exception:
            return txt
        try:
            return json.loads(inner)
        except Exception:
            return inner


def main():
    c = Cli()
    tools = {t["name"] for t in c.rpc("tools/list", {}).get("tools", [])}
    results = []
    def check(name, ok, got): results.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] {name}: {got}")

    check("browser_resize + browser_batch registered",
          {"browser_resize", "browser_batch"} <= tools,
          sorted(tools & {"browser_resize", "browser_batch"}))

    # navigate back/forward: URL1 -> URL2 -> back == URL1 -> forward == URL2
    c.call("browser_launch", {"start_url": URL1, "width": 1920, "height": 1080}); time.sleep(0.8)
    c.call("browser_navigate", {"url": URL2}); time.sleep(0.6)
    c.call("browser_navigate", {"url": "back"}); time.sleep(0.6)
    href_back = str(c.evald("location.href"))
    check("navigate back returns to page 1", href_back.endswith("page.html"), href_back)
    c.call("browser_navigate", {"url": "forward"}); time.sleep(0.6)
    href_fwd = str(c.evald("location.href"))
    check("navigate forward returns to page 2", href_fwd.endswith("page2.html"), href_fwd)

    # resize: viewport width should follow the override
    c.call("browser_navigate", {"url": URL1}); time.sleep(0.6)
    c.call("browser_resize", {"width": 1024, "height": 768}); time.sleep(0.3)
    iw = c.evald("String(window.innerWidth)")
    check("browser_resize sets viewport width", str(iw) == "1024", f"innerWidth={iw}")

    # batch: two clicks on the button in one call -> __clicks == 2
    c.evald("window.__clicks=0")
    br = c.call("browser_batch", {"actions": [
        {"name": "browser_computer", "arguments": {"action": "left_click", "x": 200, "y": 130}},
        {"name": "browser_computer", "arguments": {"action": "left_click", "x": 200, "y": 130}},
    ]})
    time.sleep(0.3)
    clicks = c.evald("String(window.__clicks)")
    btxt = br.get("content", [{}])[0].get("text", "") if isinstance(br, dict) else ""
    check("browser_batch runs the sequence", str(clicks) == "2" and '"success":true' in btxt.replace(" ", ""),
          f"__clicks={clicks} batch={btxt[:60]}")

    c.call("browser_close", {}); c.p.terminate()
    passed = sum(1 for r in results if r)
    print(f"\n=== {passed}/{len(results)} P1 checks passed ===")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
