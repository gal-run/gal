#!/usr/bin/env python3
"""Demo gal-chrome on the user's STABLE Chrome. Spawns the MCP server, waits for the
manually-loaded extension to connect, then drives a NEW tab (safe — never touches existing
tabs) with real-effect actions and captures screenshots so it's visibly working."""
import base64, json, os, subprocess, sys, time

DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(DIR, "demo-out")
os.makedirs(OUT, exist_ok=True)


class MCP:
    def __init__(self):
        self.p = subprocess.Popen([sys.executable, os.path.join(DIR, "server.py")],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=open("/tmp/gc-stable.err", "w"), text=True)
        self.i = 0
        self.rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "demo", "version": "1"}})
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


def main():
    m = MCP()
    print("gal-chrome server running on ws://127.0.0.1:8777", flush=True)
    print("Waiting for you to 'Load unpacked' the extension into your stable Chrome (up to 4 min)...", flush=True)
    connected = False
    for _ in range(480):
        r = m.call("chrome_tabs_list")  # read-only probe; safe
        if "error" not in r and isinstance(r.get("tabs"), list):
            connected = True; break
        time.sleep(0.5)
    if not connected:
        print("FAIL: extension never connected (loaded into a running Chrome? Developer mode on?)")
        m.p.terminate(); sys.exit(1)

    print("Extension connected — driving a NEW tab in your REAL stable Chrome.", flush=True)
    nt = m.call("chrome_tabs_new", {"url": "https://example.com/"}); time.sleep(1.4)
    grp = m.call("chrome_tab_group", {"tab_id": nt.get("id"), "title": "gal", "color": "cyan"})
    href = m.call("chrome_eval", {"expression": "location.href"}).get("result")
    title = m.call("chrome_eval", {"expression": "document.title"}).get("result")
    s1 = m.call("chrome_screenshot")
    shot1 = os.path.join(OUT, "stable-1-example.png")
    if s1.get("data"): open(shot1, "wb").write(base64.b64decode(s1["data"]))

    # real-effect actions on the new tab
    m.call("chrome_eval", {"expression": "document.body.innerHTML='<h1 style=font-family:system-ui>gal-chrome is driving your real Chrome</h1><button id=b style=\"font-size:22px;padding:10px 16px\">click me</button> <input id=i style=\"font-size:22px;padding:6px;width:320px\" placeholder=type-here>'; window.__c=0; document.getElementById('b').onclick=function(){window.__c++; this.textContent='clicked '+window.__c}; 1"})
    time.sleep(0.3)
    br = json.loads(m.call("chrome_eval", {"expression": "var r=document.getElementById('b').getBoundingClientRect(); JSON.stringify([Math.round(r.left+r.width/2),Math.round(r.top+r.height/2)])"}).get("result"))
    m.call("chrome_click", {"x": br[0], "y": br[1]}); time.sleep(0.3)
    clicks = m.call("chrome_eval", {"expression": "String(window.__c)"}).get("result")
    ir = json.loads(m.call("chrome_eval", {"expression": "var r=document.getElementById('i').getBoundingClientRect(); JSON.stringify([Math.round(r.left+r.width/2),Math.round(r.top+r.height/2)])"}).get("result"))
    m.call("chrome_click", {"x": ir[0], "y": ir[1]}); time.sleep(0.2)
    m.call("chrome_type", {"text": "hello from gal-chrome"}); time.sleep(0.3)
    val = m.call("chrome_eval", {"expression": "document.getElementById('i').value"}).get("result")
    s2 = m.call("chrome_screenshot")
    shot2 = os.path.join(OUT, "stable-2-driven.png")
    if s2.get("data"): open(shot2, "wb").write(base64.b64decode(s2["data"]))

    print("\n=== gal-chrome drove your STABLE Chrome ===", flush=True)
    print(f"  new tab navigated -> {href}  (title: {title})", flush=True)
    print(f"  put the tab in a labeled, colored group -> {grp}", flush=True)
    print(f"  button click had a REAL effect -> __c={clicks}", flush=True)
    print(f"  typed into the input -> {val!r}", flush=True)
    print(f"  screenshots: {shot1} | {shot2}", flush=True)
    print("  (left the demo tab open so you can see it; close it whenever.)", flush=True)
    m.p.terminate()


if __name__ == "__main__":
    main()
