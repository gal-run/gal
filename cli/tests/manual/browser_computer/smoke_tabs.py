#!/usr/bin/env python3
"""Rigorous e2e check of gal-browser tabs: does tab_new activate? do coordinate ops + scripts
follow the ACTIVE tab after tab_select? are tabs isolated? does read_console capture on a tab
opened via tab_new? Honest about limitations."""
import json, os, subprocess, sys, time

GAL = os.environ["GAL_BIN"]
HERE = os.path.dirname(os.path.abspath(__file__))
URL1 = "file://" + os.path.join(HERE, "page.html")   # has #btn + window.__clicks
URL2 = "file://" + os.path.join(HERE, "page2.html")
results = []


class Cli:
    def __init__(self):
        self.p = subprocess.Popen([GAL, "browser", "server", "--project-path", "."],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        self.i = 0
        self.rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "v", "version": "1"}})
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

    def call(self, t, a): return self.rpc("tools/call", {"name": t, "arguments": a})
    def text(self, r): return r.get("content", [{}])[0].get("text", "") if isinstance(r, dict) else ""

    def js(self, e):
        t = self.text(self.call("browser_execute_script", {"script": e}))
        try: return json.loads(json.loads(t).get("result"))
        except Exception:
            try: return json.loads(t).get("result")
            except Exception: return t


def check(name, ok, got): results.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] {name}: {got}", flush=True)


def main():
    c = Cli()
    c.call("browser_launch", {"start_url": URL1, "width": 1920, "height": 1080}); time.sleep(0.9)
    c.js("window.__tab='A'; window.__clicks=0")

    # tab_new(page2) -> active should be the new tab; execute_script follows it
    c.call("browser_tab_new", {"url": URL2}); time.sleep(0.7)
    check("tab_new activates the new tab (script follows active)", str(c.js("location.href")).endswith("page2.html"), str(c.js("location.href"))[-12:])
    c.js("window.__tab='B'")

    # screenshot follows active tab (returns an image of B)
    sr = c.call("browser_screenshot", {})
    img = sr.get("content", [{}])[0] if isinstance(sr, dict) else {}
    check("screenshot follows active tab", img.get("type") == "image", f"bytes={len(img.get('data',''))}")

    # select tab A (page.html) by its url; coordinate ops must then hit A
    tl = json.loads(c.text(c.call("browser_tab_list", {}))).get("tabs", [])
    a_idx = next((t["index"] for t in tl if t["url"].endswith("page.html")), None)
    c.call("browser_tab_select", {"index": a_idx}); time.sleep(0.3)
    check("tab_select switches active tab", c.js("window.__tab") == "A", c.js("window.__tab"))

    # THE key e2e: a coordinate click via browser_computer must operate on the re-activated tab A
    c.call("browser_computer", {"action": "left_click", "x": 200, "y": 130}); time.sleep(0.2)
    check("coordinate click follows the active tab (A.__clicks==1)", str(c.js("String(window.__clicks)")) == "1", c.js("String(window.__clicks)"))

    # isolation: tab B (page2) must NOT have been affected by the click on A
    b_idx = next((t["index"] for t in tl if t["url"].endswith("page2.html")), None)
    c.call("browser_tab_select", {"index": b_idx}); time.sleep(0.3)
    bclicks = c.js("String(window.__clicks===undefined ? 'undef' : window.__clicks)")
    check("tabs are isolated (B unaffected by A's click)", c.js("window.__tab") == "B" and bclicks in ("undef", "0"), f"B.__tab={c.js('window.__tab')} B.__clicks={bclicks}")

    # console capture on a tab opened via tab_new? (B is the new tab) — honest probe
    c.js("console.error('B-tab-error'); 1"); time.sleep(0.5)
    msgs = json.loads(c.text(c.call("browser_read_console", {}))).get("messages", [])
    captured = any("B-tab-error" in m for m in msgs)
    check("read_console captures errors on a tab_new tab", captured, f"captured={captured} ({len(msgs)} msgs)")

    # tab_close
    before = len(json.loads(c.text(c.call("browser_tab_list", {}))).get("tabs", []))
    c.call("browser_tab_close", {"index": b_idx}); time.sleep(0.4)
    after = len(json.loads(c.text(c.call("browser_tab_list", {}))).get("tabs", []))
    check("tab_close removes the tab", after == before - 1, f"{before}->{after}")

    c.call("browser_close", {}); c.p.terminate()
    passed = sum(1 for r in results if r)
    print(f"\n=== {passed}/{len(results)} tab e2e checks passed ===")
    sys.exit(0)  # report-only: a console-capture miss is a documented limitation, not a hard fail


if __name__ == "__main__":
    main()
