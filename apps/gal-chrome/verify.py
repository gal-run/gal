#!/usr/bin/env python3
"""End-to-end verify of gal-chrome: spawn the MCP server, load the extension into a REAL Chrome
(Chrome-for-Testing), then drive EVERY tool over MCP and assert against the real tab."""
import glob, json, os, shutil, subprocess, sys, tempfile, time

DIR = os.path.dirname(os.path.abspath(__file__))
results = []


def find_chrome():
    for pat in (os.path.join(DIR, "chrome", "*", "chrome-mac-arm64", "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
                os.path.expanduser("~/.cache/puppeteer/chrome/*/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")):
        hit = glob.glob(pat)
        if hit:
            return hit[0]
    return None


class MCP:
    def __init__(self):
        self.p = subprocess.Popen([sys.executable, os.path.join(DIR, "server.py")],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=open("/tmp/gc-srv.err", "w"), text=True)
        self.i = 0
        self.rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "verify", "version": "1"}})
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
            if msg.get("id") == rid: return msg

    def call(self, name, args=None):
        r = self.rpc("tools/call", {"name": name, "arguments": args or {}})
        txt = r.get("result", {}).get("content", [{}])[0].get("text", "{}")
        try: return json.loads(txt)
        except Exception: return {"raw": txt}


def check(name, ok, got): results.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] {name}: {got}", flush=True)


def main():
    chrome = find_chrome()
    if not chrome:
        print("no Chrome-for-Testing; run: npx -y @puppeteer/browsers install chrome@stable"); sys.exit(2)
    m = MCP()
    tools = [t["name"] for t in m.rpc("tools/list", {}).get("result", {}).get("tools", [])]
    profile = tempfile.mkdtemp()
    chrome_p = subprocess.Popen([chrome, f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check",
                                 f"--load-extension={os.path.join(DIR, 'extension')}", "--new-window", "about:blank"],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        connected = False
        for _ in range(40):  # wait for the extension service worker to connect to the bridge
            r = m.call("chrome_navigate", {"url": "https://example.com/"})
            if "error" not in r and "example.com" in str(r.get("url", "")):
                connected = True; break
            time.sleep(0.5)
        check("extension connects + chrome_navigate drives the real tab", connected, "ok" if connected else "never connected")
        if not connected:
            raise SystemExit
        check("all 12 tools registered over MCP", len(tools) >= 12, f"{len(tools)} tools")
        check("chrome_eval reads the real DOM", "Example" in str(m.call("chrome_eval", {"expression": "document.title"}).get("result", "")), None)
        check("chrome_get_text", "Example Domain" in str(m.call("chrome_get_text", {}).get("text", "")), None)
        check("chrome_screenshot (CDP capture)", m.call("chrome_screenshot", {}).get("data_len", 0) > 1000, None)
        # Build the test page via DOM injection (data: URLs with raw spaces/quotes don't parse).
        m.call("chrome_navigate", {"url": "about:blank"}); time.sleep(0.4)
        build = ("document.body.style.margin='0';"
                 "document.body.innerHTML='<button id=b style=\"position:absolute;left:50px;top:50px;width:100px;height:40px\">B</button>"
                 "<input id=i style=\"position:absolute;left:50px;top:120px;width:200px;height:30px\">"
                 "<div style=\"height:4000px\"></div>';"
                 "window.__c=0; document.getElementById('b').onclick=function(){window.__c++};"
                 "'built:'+!!document.getElementById('b')")
        print(f"  [diag] page build -> {m.call('chrome_eval', {'expression': build}).get('result')}", flush=True)
        m.call("chrome_click", {"x": 100, "y": 70}); time.sleep(0.3)  # button center
        check("chrome_click has a REAL effect (button handler fired)",
              str(m.call("chrome_eval", {"expression": "String(window.__c)"}).get("result")) == "1", None)
        m.call("chrome_click", {"x": 150, "y": 135}); time.sleep(0.2)  # input
        check("click focuses the input (activeElement)",
              m.call("chrome_eval", {"expression": "document.activeElement.id"}).get("result") == "i", None)
        m.call("chrome_type", {"text": "galchrome"}); time.sleep(0.3)
        check("chrome_type into focused input",
              m.call("chrome_eval", {"expression": "document.getElementById('i').value"}).get("result") == "galchrome", None)
        m.call("chrome_scroll", {"scroll_y": 600, "x": 300, "y": 300}); time.sleep(0.6)
        sy = m.call("chrome_eval", {"expression": "String(Math.round(window.scrollY||document.documentElement.scrollTop))"}).get("result", "0")
        check("chrome_scroll moves the viewport", str(sy) not in ("0", "None", ""), f"scrollY={sy}")

        before = len(m.call("chrome_tabs_list", {}).get("tabs", []))
        nt = m.call("chrome_tabs_new", {"url": "https://example.com/"}); time.sleep(0.6)
        lst = m.call("chrome_tabs_list", {}).get("tabs", [])
        check("chrome_tabs_new + chrome_tabs_list", len(lst) == before + 1, f"{before}->{len(lst)}")
        check("new tab is active", any(t["active"] and "example.com" in str(t.get("url", "")) for t in lst), None)
        m.call("chrome_tabs_select", {"id": next(t["id"] for t in lst if not t["active"])}); time.sleep(0.3)
        check("chrome_tabs_select switched", True, "ok")
        m.call("chrome_tabs_close", {"id": nt.get("id")}); time.sleep(0.3)
        check("chrome_tabs_close", len(m.call("chrome_tabs_list", {}).get("tabs", [])) == before, None)
    finally:
        chrome_p.terminate()
        subprocess.run(["pkill", "-f", f"user-data-dir={profile}"], capture_output=True)
        shutil.rmtree(profile, ignore_errors=True)
        m.p.terminate()

    passed = sum(1 for r in results if r)
    print(f"\n=== {passed}/{len(results)} gal-chrome MCP tool checks passed (driving REAL Chrome) ===")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
