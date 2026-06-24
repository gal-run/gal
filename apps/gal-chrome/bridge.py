#!/usr/bin/env python3
"""gal-chrome bridge (spike). A local WebSocket server the extension connects OUT to; it
forwards {id, action, params} commands to the extension (which executes them via chrome.debugger
on the real Chrome) and awaits {id, result}. This is what the browser-use-service ChromeBridge
was stubbed for ("wire to extension endpoint"). Running standalone here it also acts as the
driver: it sends ping/navigate/screenshot/eval and asserts the real tab responded."""
import asyncio, json, sys
import websockets

PORT = 8777
_ext = None
_pending = {}
_id = 0


async def handler(ws):
    global _ext
    _ext = ws
    print("[bridge] extension connected", flush=True)
    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            mid = msg.get("id")
            if mid in _pending:
                _pending.pop(mid).set_result(msg)
    finally:
        _ext = None


async def call(action, params=None, timeout=20):
    global _id
    if _ext is None:
        raise RuntimeError("extension not connected")
    _id += 1
    mid = _id
    fut = asyncio.get_event_loop().create_future()
    _pending[mid] = fut
    await _ext.send(json.dumps({"id": mid, "action": action, "params": params or {}}))
    msg = await asyncio.wait_for(fut, timeout)
    if "error" in msg:
        raise RuntimeError(msg["error"])
    return msg.get("result", {})


async def driver():
    for _ in range(60):  # wait up to 30s for the extension to connect
        if _ext is not None:
            break
        await asyncio.sleep(0.5)
    if _ext is None:
        print("FAIL: extension never connected to the bridge")
        return 1

    results = []
    def check(name, ok, got): results.append(ok); print(f"[{'PASS' if ok else 'FAIL'}] {name}: {got}", flush=True)

    try:
        p = await call("ping")
        check("ping (extension reachable)", p.get("ok") is True, p)
        n = await call("navigate", {"url": "https://example.com/"})
        check("navigate drives the REAL tab", "example.com" in str(n.get("url", "")), n)
        s = await call("screenshot")
        check("screenshot of the REAL tab (CDP capture)", s.get("data_len", 0) > 1000, f"png base64 len={s.get('data_len')}")
        e = await call("eval", {"expression": "document.title"})
        check("eval reads the REAL DOM (title)", "Example" in str(e.get("result", "")), e)
        c = await call("click", {"x": 100, "y": 100})
        check("CDP coordinate click executes on the REAL tab", c.get("clicked") == [100, 100], c)
    except Exception as ex:
        print(f"FAIL: {ex}")
        return 1

    passed = sum(1 for r in results if r)
    print(f"\n=== {passed}/{len(results)} gal-chrome spike checks passed (driving REAL Chrome) ===")
    return 0 if passed == len(results) else 1


async def main():
    async with websockets.serve(handler, "127.0.0.1", PORT):
        rc = await driver()
    sys.exit(rc)


if __name__ == "__main__":
    asyncio.run(main())
