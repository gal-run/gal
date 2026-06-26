# GAL Browser Use Service

A FastAPI microservice that wraps [browser-use](https://github.com/browser-use/browser-use) with a bridge to the GAL Chrome extension.

## Features

- **Agent execution** — run high-level tasks via `POST /agent/run` using browser-use's Agent + Playwright
- **Enhanced DOM parsing** — retrieve structured element lists with AX tree metadata via `POST /dom/enhanced-parse`
- **Action caching** — SQLite-backed cache for per-site action sequences (`/cache/{site_hash}`)
- **Chrome extension bridge** — `chrome_bridge.py` stubs for tabs, tabGroups, and bookmarks (wire to the extension's HTTP endpoint when ready)

## Quick Start (local)

```bash
cd mcp/gal-browser-use-service
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium

# Optional: set env vars
export EXTENSION_BRIDGE_URL=http://localhost:9222
export CHROME_EXTENSION_PATH=/path/to/gal-extension

uvicorn main:app --reload --host 127.0.0.1 --port 8123
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/health` | Health check |
| POST | `/agent/run` | Run a browser-use Agent |
| POST | `/dom/enhanced-parse` | Parse enhanced DOM + AX tree |
| GET | `/cache/{site_hash}` | Get cached actions |
| POST | `/cache/{site_hash}` | Store cached actions |
| DELETE | `/cache/{site_hash}` | Clear cached actions |

### Example: run an agent

```bash
curl -X POST http://localhost:8123/agent/run \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SERVICE_AUTH_TOKEN" \
  -d '{
    "task": "Find the pricing page and extract the starter plan price",
    "model": "gpt-4o",
    "max_steps": 15,
    "start_url": "https://example.com"
  }'
```

### Example: enhanced DOM parse

```bash
curl -X POST http://localhost:8123/dom/enhanced-parse \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SERVICE_AUTH_TOKEN" \
  -d '{"url": "https://example.com"}'
```

## Docker

```bash
docker build -t gal-browser-use-service .
# The container binds 127.0.0.1 by default; set HOST=0.0.0.0 to expose the port.
docker run -e HOST=0.0.0.0 -p 8123:8123 -v /path/to/gal-extension:/app/gal-extension gal-browser-use-service
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BROWSER_USE_DB` | `/tmp/browser_use_cache.db` | SQLite cache path |
| `EXTENSION_BRIDGE_URL` | `http://localhost:9222` | GAL extension HTTP bridge |
| `CHROME_EXTENSION_PATH` | `/app/gal-extension` | Path to the unpacked extension |
| `SERVICE_AUTH_TOKEN` | _(unset)_ | If set, `/agent/run` and `/dom/enhanced-parse` require `Authorization: Bearer <token>`. Unset = dev mode (no auth, logs a warning). |
| `GAL_BROWSER_ALLOW_PRIVATE` | _(unset)_ | Set to `1` to bypass the SSRF guard and allow navigation to private/loopback/link-local hosts. |
| `HOST` | `127.0.0.1` | Bind address (Docker `CMD`). Set to `0.0.0.0` to expose. |
| `PORT` | `8123` | Bind port (Docker `CMD`). |
