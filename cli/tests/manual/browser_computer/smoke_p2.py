#!/usr/bin/env python3
"""Runtime check of gal-browser P2 parity tools: zoom, form_input, file_upload, find,
and tabs (new/list/select/close). Asserts observable state through the real gal binary."""
import json, os, subprocess, sys, time

GAL = os.environ["GAL_BIN"]
HERE = os.path.dirname(os.path.abspath(__file__))
URL1 = "file://" + os.path.join(HERE, "page.html")
URL2 = "file://" + os.path.join(HERE, "page2.html")
UPLOAD = os.path.join(HERE, "upload-me.txt")


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

    def text(self, r):
        return r.get("content", [{}])[0].get("text", "") if isinstance(r, dict) else ""

    def evald(self, js):
        t = self.text(self.call("browser_execute_script", {"script": js}))
        try:
            return json.loads(json.loads(t).get("result"))
        except Exception:
            try: return json.loads(t).get("result")
            except Exception: return t


def main():
    c = Cli()
    tools = {t["name"] for t in c.rpc("tools/list", {}).get("tools", [])}
    results = []
    def check(name, ok, got): results.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] {name}: {got}")

    need = {"browser_zoom", "browser_form_input", "browser_file_upload", "browser_find",
            "browser_tab_new", "browser_tab_list", "browser_tab_select", "browser_tab_close"}
    check("all 8 P2 tools registered", need <= tools, sorted(need - tools) or "all present")

    c.call("browser_launch", {"start_url": URL1, "width": 1920, "height": 1080}); time.sleep(0.8)

    # find: locate the "Click me" button
    fr = json.loads(c.text(c.call("browser_find", {"query": "click me"})))
    m = fr.get("matches", [])
    hit = next((e for e in m if "click" in (e.get("name", "").lower())), None)
    check("find locates the button by text", hit is not None and abs(hit["x"] - 200) < 60,
          hit)

    # form_input: set the text input by selector
    c.call("browser_form_input", {"selector": "#inp", "value": "via-form"})
    check("form_input sets value", c.evald("document.getElementById('inp').value") == "via-form",
          c.evald("document.getElementById('inp').value"))

    # zoom: region capture returns an image
    zr = c.call("browser_zoom", {"x": 100, "y": 100, "width": 200, "height": 60})
    img = zr.get("content", [{}])[0] if isinstance(zr, dict) else {}
    check("zoom returns a region image", img.get("type") == "image" and len(img.get("data", "")) > 200,
          f"type={img.get('type')} bytes={len(img.get('data',''))}")

    # file_upload: set the file input
    c.call("browser_file_upload", {"selector": "#f", "paths": [UPLOAD]})
    fcount = c.evald("String(document.getElementById('f').files.length)")
    fname = c.evald("document.getElementById('f').files[0] ? document.getElementById('f').files[0].name : ''")
    check("file_upload sets the file input", str(fcount) == "1" and fname == "upload-me.txt",
          f"count={fcount} name={fname}")

    # tabs: new -> list(active=page2) -> select(0)=page1 -> close(1) -> one fewer
    c.call("browser_tab_new", {"url": URL2}); time.sleep(0.6)
    tl = json.loads(c.text(c.call("browser_tab_list", {})))["tabs"]
    active = next((t for t in tl if t["active"]), {})
    check("tab_new opens & activates page 2", len(tl) >= 2 and active.get("url", "").endswith("page2.html"),
          f"tabs={len(tl)} active={active.get('url','')[-12:]}")
    c.call("browser_tab_select", {"index": 0}); time.sleep(0.3)
    href = str(c.evald("location.href"))
    check("tab_select(0) makes page 1 active", href.endswith("page.html"), href[-14:])
    before = len(json.loads(c.text(c.call("browser_tab_list", {})))["tabs"])
    c.call("browser_tab_close", {"index": 1}); time.sleep(0.4)
    after = len(json.loads(c.text(c.call("browser_tab_list", {})))["tabs"])
    check("tab_close removes a tab", after == before - 1, f"{before}->{after}")

    c.call("browser_close", {}); c.p.terminate()
    passed = sum(1 for r in results if r)
    print(f"\n=== {passed}/{len(results)} P2 checks passed ===")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
