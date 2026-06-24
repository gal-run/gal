#!/usr/bin/env python3
"""gal-chrome MCP server. Speaks MCP (JSON-RPC over stdio) so an agent/Claude can drive the
user's REAL Chrome — like `gal browser server` does for gal-browser — and runs a local
WebSocket server the gal-chrome extension connects to. Each tool forwards to the extension,
which executes it via chrome.debugger (CDP) or chrome.tabs. This is the working successor to
mcp/gal-browser-use-service's stubbed ChromeBridge (its HTTP-to-extension idea can't work with
MV3; the extension connects OUT over WebSocket instead)."""
import asyncio, json, sys, threading
import websockets

WS_PORT = 8777
_ext = None
_pending = {}
_cmd_id = 0
_loop = None


async def ws_handler(ws):
    global _ext
    _ext = ws
    sys.stderr.write("[gal-chrome] extension connected\n"); sys.stderr.flush()
    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            mid = msg.get("id")
            if mid in _pending:
                _pending.pop(mid).set_result(msg)
    except websockets.ConnectionClosed:
        pass
    finally:
        _ext = None


async def ext_call(action, params=None, timeout=20):
    global _cmd_id
    if _ext is None:
        raise RuntimeError("gal-chrome extension not connected — install it in Chrome and open a tab")
    _cmd_id += 1
    cid = _cmd_id
    fut = _loop.create_future()
    _pending[cid] = fut
    await _ext.send(json.dumps({"id": cid, "action": action, "params": params or {}}))
    msg = await asyncio.wait_for(fut, timeout)
    if "error" in msg:
        raise RuntimeError(msg["error"])
    return msg.get("result", {})


# (name, description, inputSchema, args -> (extension_action, params))
TOOLS = [
    ("chrome_navigate", "Navigate the active tab to a URL, or 'back'/'forward'.",
     {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]},
     lambda a: ("navigate", {"url": a["url"]})),
    ("chrome_screenshot", "PNG screenshot of the active tab (base64 in 'data').",
     {"type": "object", "properties": {}}, lambda a: ("screenshot", {})),
    ("chrome_get_text", "Visible text of the active tab.",
     {"type": "object", "properties": {}}, lambda a: ("get_text", {})),
    ("chrome_eval", "Run JS in the active tab; returns the value.",
     {"type": "object", "properties": {"expression": {"type": "string"}}, "required": ["expression"]},
     lambda a: ("eval", {"expression": a["expression"]})),
    ("chrome_click", "Click at pixel (x,y) in the active tab.",
     {"type": "object", "properties": {"x": {"type": "number"}, "y": {"type": "number"}}, "required": ["x", "y"]},
     lambda a: ("click", {"x": a["x"], "y": a["y"], "clickCount": a.get("clickCount", 1)})),
    ("chrome_type", "Type text into the focused element.",
     {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]},
     lambda a: ("type", {"text": a["text"]})),
    ("chrome_key", "Press a key (Enter/Tab/Arrow*/Escape/Backspace).",
     {"type": "object", "properties": {"key": {"type": "string"}}, "required": ["key"]},
     lambda a: ("key", {"key": a["key"]})),
    ("chrome_scroll", "Scroll the active tab by scroll_y px (at optional x,y).",
     {"type": "object", "properties": {"scroll_y": {"type": "number"}, "x": {"type": "number"}, "y": {"type": "number"}}, "required": ["scroll_y"]},
     lambda a: ("scroll", {"scroll_y": a["scroll_y"], "x": a.get("x", 100), "y": a.get("y", 100)})),
    ("chrome_tabs_list", "List open tabs as {id,index,url,title,active}.",
     {"type": "object", "properties": {}}, lambda a: ("tabs_list", {})),
    ("chrome_tabs_new", "Open a new tab (optional url) and activate it.",
     {"type": "object", "properties": {"url": {"type": "string"}}}, lambda a: ("tabs_new", {"url": a.get("url")})),
    ("chrome_tabs_select", "Activate a tab by id.",
     {"type": "object", "properties": {"id": {"type": "number"}}, "required": ["id"]},
     lambda a: ("tabs_select", {"id": a["id"]})),
    ("chrome_tabs_close", "Close a tab by id.",
     {"type": "object", "properties": {"id": {"type": "number"}}, "required": ["id"]},
     lambda a: ("tabs_close", {"id": a["id"]})),
]
_TMAP = {name: mapper for (name, _d, _s, mapper) in TOOLS}


def _write(obj):
    sys.stdout.write(json.dumps(obj) + "\n"); sys.stdout.flush()


async def handle_request(req):
    rid = req.get("id")
    method = req.get("method")
    if method == "initialize":
        return {"jsonrpc": "2.0", "id": rid, "result": {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": "gal-chrome", "version": "0.1.0"}}}
    if method == "tools/list":
        tools = [{"name": n, "description": d, "inputSchema": s} for (n, d, s, _m) in TOOLS]
        return {"jsonrpc": "2.0", "id": rid, "result": {"tools": tools}}
    if method == "tools/call":
        name = req["params"]["name"]
        args = req["params"].get("arguments", {})
        mapper = _TMAP.get(name)
        if not mapper:
            return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": f"unknown tool {name}"}}
        action, params = mapper(args)
        try:
            result = await ext_call(action, params)
            return {"jsonrpc": "2.0", "id": rid, "result": {"content": [{"type": "text", "text": json.dumps(result)}]}}
        except Exception as e:
            return {"jsonrpc": "2.0", "id": rid, "result": {"content": [{"type": "text", "text": json.dumps({"error": str(e)})}], "isError": True}}
    if method and method.startswith("notifications/"):
        return None
    return {"jsonrpc": "2.0", "id": rid, "error": {"code": -32601, "message": f"unknown method {method}"}}


def _stdin_thread(queue, loop):
    for line in sys.stdin:
        line = line.strip()
        if line:
            asyncio.run_coroutine_threadsafe(queue.put(line), loop)
    asyncio.run_coroutine_threadsafe(queue.put(None), loop)


async def mcp_loop():
    queue = asyncio.Queue()
    threading.Thread(target=_stdin_thread, args=(queue, _loop), daemon=True).start()
    while True:
        line = await queue.get()
        if line is None:
            break
        try:
            req = json.loads(line)
        except Exception:
            continue
        resp = await handle_request(req)
        if resp is not None and req.get("id") is not None:
            _write(resp)


async def main():
    global _loop
    _loop = asyncio.get_event_loop()
    async with websockets.serve(ws_handler, "127.0.0.1", WS_PORT):
        await mcp_loop()


if __name__ == "__main__":
    asyncio.run(main())
