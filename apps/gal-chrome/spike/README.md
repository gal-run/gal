# gal-chrome — architecture spike

Proves the path the `mcp/gal-browser-use-service` ChromeBridge was stubbed for
(`raise NotImplementedError("... wire to extension endpoint")`): **drive the user's REAL
Chrome via a `chrome.debugger` (CDP) extension, controlled by an external agent over a local
WebSocket bridge.** Same CDP tool surface as `gal-browser`, but on the real browser instead of
a spawned headless one. (Per ADR 0001, gal-chrome is a *separate* component from gal-browser,
not a rename.)

```
agent / MCP service  ──ws://127.0.0.1:8777──▶  bridge.py  ──▶  extension (service worker)
                                                                  └─ chrome.debugger / CDP ─▶ REAL Chrome tab
```

## Run the spike (verifies it actually drives a real Chrome)

```bash
npx -y @puppeteer/browsers install chrome@stable   # one-time: a Chromium that allows --load-extension
bash run.sh
```

Expected: `5/5 gal-chrome spike checks passed (driving REAL Chrome)` — ping, navigate
(example.com), CDP screenshot, eval the real DOM, and a CDP coordinate click.

## Why Chrome-for-Testing, not your stable Chrome?

Chrome stable (149+) ignores `--load-extension` from the CLI for security — that's a
*verification* constraint only. It's the same Chromium engine and the same extension code.
**In production, you install gal-chrome normally** (Chrome Web Store, or `chrome://extensions`
→ Developer mode → *Load unpacked* → this `extension/` folder) into your real Chrome; the
extension then connects to the bridge and drives your real session. No CLI flag involved.

## Next (port out of the spike)

1. Move the `chrome.debugger`-over-WebSocket module into `apps/chrome-extension` (the real
   `@gal-run/chrome-extension`), behind a permission/consent gate.
2. Replace `mcp/gal-browser-use-service/chrome_bridge.py`'s stubs with WebSocket forwarding to
   this bridge, exposing the full 10-tool surface (navigate/click/type/screenshot/find/tabs/…).
3. Reuse gal-browser's verified tool semantics (coordinate input, read_a11y, etc.).
