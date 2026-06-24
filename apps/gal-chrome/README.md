# gal-chrome

Drives the user's **real Chrome** for an agent, via a `chrome.debugger` (CDP) extension
controlled by a local **MCP server** over WebSocket. The "real browser" counterpart to
`gal-browser` (which drives its own headless Chromium) — a *separate* component, not a rename
(see `docs/adr/0001-browser-harness-cdp-not-chrome-extension.md`). Same CDP tool surface as
gal-browser, on the real session instead of a spawned headless one. This is the working
successor to `mcp/gal-browser-use-service`'s stubbed `ChromeBridge` (its HTTP-to-extension idea
can't work with MV3; the extension connects OUT over WebSocket instead).

```
agent / Claude ──MCP(stdio)──▶ server.py ──ws://127.0.0.1:8777──▶ extension SW
                                                                     └─ chrome.debugger / chrome.tabs ─▶ REAL Chrome
```

## Pieces
- **`extension/`** — MV3 extension (`debugger`, `tabs`). Connects to the server and executes
  commands: page driving via CDP (`Page.navigate`, `captureScreenshot`, `Runtime.evaluate`,
  `Input.dispatch*`) and tab management via `chrome.tabs`.
- **`server.py`** — MCP stdio server (`gal-chrome`) exposing 12 tools, forwarding to the
  extension over a local WebSocket. Run it like `gal browser server`: an agent speaks MCP.
- **`bridge.py`** — minimal WS-only driver (M1 architecture proof).
- **`verify.py`** — end-to-end test: spawns the server, loads the extension into a real Chrome,
  drives every tool and asserts real effects.

## Tools (12)
`chrome_navigate` (url/back/forward) · `chrome_screenshot` · `chrome_get_text` · `chrome_eval` ·
`chrome_click` (x,y) · `chrome_type` · `chrome_key` · `chrome_scroll` · `chrome_tabs_list` ·
`chrome_tabs_new` · `chrome_tabs_select` · `chrome_tabs_close`.

## Verify (drives a real Chrome)
```bash
npx -y @puppeteer/browsers install chrome@stable   # a Chromium that allows --load-extension
python3 verify.py
```
Expected: `13/13 gal-chrome MCP tool checks passed (driving REAL Chrome)` — incl. **real-effect**
assertions: click fires a handler, click focuses an input, type lands text, scroll moves the
viewport, full tab lifecycle.

## Production loading
Chrome stable (149+) ignores `--load-extension` for security (verification uses Chrome-for-Testing
— same engine, same code). In production you **install the extension normally** — Chrome Web
Store, or `chrome://extensions` → Developer mode → *Load unpacked* → `extension/`. It then
connects to a running `server.py` and drives your real session. Gate page-driving behind a
consent prompt before shipping.

## Remaining
- Fold the tab/group/bookmark surface from `mcp/gal-browser-use-service` (the `chrome_bridge.py`
  stubs) into this server's WS forwarding.
- Optionally merge `extension/` into the production `apps/chrome-extension` behind a permission gate.
