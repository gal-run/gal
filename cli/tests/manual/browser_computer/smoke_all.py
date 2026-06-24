#!/usr/bin/env python3
"""Authoritative per-tool runtime evaluation of EVERY gal-browser tool (23) against the real
binary. One assertion per tool where observable; 'executes' where a file:// page gives no
observable signal (read_network). Prints a per-tool PASS/FAIL table."""
import json, os, subprocess, sys, time

GAL = os.environ["GAL_BIN"]
HERE = os.path.dirname(os.path.abspath(__file__))
URL1 = "file://" + os.path.join(HERE, "page.html")
URL2 = "file://" + os.path.join(HERE, "page2.html")
UPLOAD = os.path.join(HERE, "upload-me.txt")
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

    def call(self, tool, args): return self.rpc("tools/call", {"name": tool, "arguments": args})

    def text(self, r): return r.get("content", [{}])[0].get("text", "") if isinstance(r, dict) else ""

    def js(self, expr):
        t = self.text(self.call("browser_execute_script", {"script": expr}))
        try: return json.loads(json.loads(t).get("result"))
        except Exception:
            try: return json.loads(t).get("result")
            except Exception: return t


def check(tool, ok, got): results.append((tool, ok)); print(f"[{'PASS' if ok else 'FAIL'}] {tool}: {got}", flush=True)


def main():
    c = Cli()
    tools = {t["name"] for t in c.rpc("tools/list", {}).get("tools", [])}

    # browser_launch
    lr = c.call("browser_launch", {"start_url": URL1, "width": 1920, "height": 1080}); time.sleep(0.9)
    check("browser_launch", "error" not in lr and "success" in c.text(lr), c.text(lr)[:50])

    # browser_screenshot
    sr = c.call("browser_screenshot", {})
    img = sr.get("content", [{}])[0] if isinstance(sr, dict) else {}
    check("browser_screenshot", img.get("type") == "image" and len(img.get("data", "")) > 500, f"bytes={len(img.get('data',''))}")

    # browser_read_a11y
    a = json.loads(c.text(c.call("browser_read_a11y", {})))
    els = a if isinstance(a, list) else a.get("elements", a.get("matches", []))
    check("browser_read_a11y", isinstance(els, list) and any("Click" in str(e) for e in els), f"{len(els)} elements")

    # browser_find
    fr = json.loads(c.text(c.call("browser_find", {"query": "click me"}))).get("matches", [])
    check("browser_find", any("click" in (e.get("name", "").lower()) for e in fr), fr[:1])

    # browser_get_text (selector)
    gt = c.text(c.call("browser_get_text", {"selector": "#btn"}))
    check("browser_get_text", "Click me" in gt, gt[:40])

    # browser_get_page_text
    gp = c.text(c.call("browser_get_page_text", {}))
    check("browser_get_page_text", "Click me" in gp, gp[:40].replace("\n", " "))

    # browser_click (selector)
    c.js("window.__clicks=0")
    c.call("browser_click", {"selector": "#btn"}); time.sleep(0.2)
    check("browser_click (selector)", str(c.js("String(window.__clicks)")) == "1", c.js("String(window.__clicks)"))

    # browser_type_text (selector)
    c.call("browser_type_text", {"selector": "#inp", "text": "sel-typed"}); time.sleep(0.2)
    check("browser_type_text (selector)", c.js("document.getElementById('inp').value") == "sel-typed", c.js("document.getElementById('inp').value"))

    # browser_form_input
    c.call("browser_form_input", {"selector": "#inp", "value": "form-val"})
    check("browser_form_input", c.js("document.getElementById('inp').value") == "form-val", c.js("document.getElementById('inp').value"))

    # browser_computer (coordinate)
    c.js("window.__clicks=0")
    c.call("browser_computer", {"action": "left_click", "x": 200, "y": 130}); time.sleep(0.2)
    check("browser_computer (coord click)", str(c.js("String(window.__clicks)")) == "1", c.js("String(window.__clicks)"))

    # browser_execute_script
    check("browser_execute_script", str(c.js("21+21")) == "42", c.js("21+21"))

    # browser_zoom
    zr = c.call("browser_zoom", {"x": 100, "y": 100, "width": 200, "height": 60})
    zi = zr.get("content", [{}])[0] if isinstance(zr, dict) else {}
    check("browser_zoom", zi.get("type") == "image" and len(zi.get("data", "")) > 200, f"bytes={len(zi.get('data',''))}")

    # browser_file_upload
    c.call("browser_file_upload", {"selector": "#f", "paths": [UPLOAD]})
    check("browser_file_upload", str(c.js("String(document.getElementById('f').files.length)")) == "1", c.js("String(document.getElementById('f').files.length)"))

    # browser_resize
    c.call("browser_resize", {"width": 1024, "height": 768}); time.sleep(0.2)
    check("browser_resize", str(c.js("String(window.innerWidth)")) == "1024", c.js("String(window.innerWidth)"))

    # browser_read_console (+onlyErrors)
    c.js("console.log('plain'); console.error('boom'); 1"); time.sleep(0.5)
    errs = json.loads(c.text(c.call("browser_read_console", {"onlyErrors": True}))).get("messages", [])
    check("browser_read_console (onlyErrors)", any("boom" in m for m in errs) and not any("plain" in m for m in errs), errs)

    # browser_read_network (file:// has no requests -> executes cleanly with a list)
    nr = json.loads(c.text(c.call("browser_read_network", {})))
    check("browser_read_network (executes; no net on file://)", "messages" in nr or "success" in nr, {k: nr.get(k) for k in ("success", "count")})

    # browser_navigate (url + back/forward)
    c.call("browser_navigate", {"url": URL2}); time.sleep(0.5)
    check("browser_navigate (url)", str(c.js("location.href")).endswith("page2.html"), str(c.js("location.href"))[-12:])
    c.call("browser_navigate", {"url": "back"}); time.sleep(0.5)
    check("browser_navigate (back)", str(c.js("location.href")).endswith("page.html"), str(c.js("location.href"))[-12:])
    c.call("browser_navigate", {"url": "forward"}); time.sleep(0.5)
    check("browser_navigate (forward)", str(c.js("location.href")).endswith("page2.html"), str(c.js("location.href"))[-12:])

    # browser_batch
    c.call("browser_navigate", {"url": URL1}); time.sleep(0.4); c.js("window.__clicks=0")
    br = c.call("browser_batch", {"actions": [
        {"name": "browser_computer", "arguments": {"action": "left_click", "x": 200, "y": 130}},
        {"name": "browser_computer", "arguments": {"action": "left_click", "x": 200, "y": 130}}]})
    time.sleep(0.3)
    check("browser_batch", str(c.js("String(window.__clicks)")) == "2" and '"success":true' in c.text(br).replace(" ", ""), c.js("String(window.__clicks)"))

    # tabs: new / list / select / close
    c.call("browser_tab_new", {"url": URL2}); time.sleep(0.6)
    tl = json.loads(c.text(c.call("browser_tab_list", {}))).get("tabs", [])
    check("browser_tab_new + browser_tab_list", len(tl) >= 2 and any(t["active"] and t["url"].endswith("page2.html") for t in tl), f"{len(tl)} tabs")
    p1 = next((t["index"] for t in tl if t["url"].endswith("page.html")), 0)
    c.call("browser_tab_select", {"index": p1}); time.sleep(0.3)
    check("browser_tab_select", str(c.js("location.href")).endswith("page.html"), str(c.js("location.href"))[-12:])
    before = len(json.loads(c.text(c.call("browser_tab_list", {}))).get("tabs", []))
    c.call("browser_tab_close", {"index": 1}); time.sleep(0.4)
    after = len(json.loads(c.text(c.call("browser_tab_list", {}))).get("tabs", []))
    check("browser_tab_close", after == before - 1, f"{before}->{after}")

    # browser_close
    cl = c.call("browser_close", {})
    check("browser_close", "error" not in cl, c.text(cl)[:40] or "ok")
    c.p.terminate()

    passed = sum(1 for _, ok in results if ok)
    print(f"\n=== {passed}/{len(results)} gal-browser tool checks passed ===")
    failed = [t for t, ok in results if not ok]
    if failed: print("FAILED:", failed)
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
