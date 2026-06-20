"""FastAPI microservice wrapping browser-use with a Chrome extension bridge."""

from __future__ import annotations

import hashlib
import ipaddress
import json
import logging
import os
import socket
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import aiosqlite
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from chrome_bridge import ChromeBridge

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DB_PATH = os.getenv("BROWSER_USE_DB", "/tmp/browser_use_cache.db")
EXTENSION_URL = os.getenv("EXTENSION_BRIDGE_URL", "http://localhost:9222")
CHROME_EXTENSION_PATH = os.getenv("CHROME_EXTENSION_PATH", "/app/gal-extension")

# Bearer-token guard for mutating/navigation endpoints. When unset, the service
# runs in dev mode (no auth) and logs a warning.
SERVICE_AUTH_TOKEN = os.getenv("SERVICE_AUTH_TOKEN")

# SSRF guard: by default, block navigation to private/loopback/link-local hosts.
# Opt out (e.g. for trusted internal targets) with GAL_BROWSER_ALLOW_PRIVATE=1.
ALLOW_PRIVATE_HOSTS = os.getenv("GAL_BROWSER_ALLOW_PRIVATE") == "1"

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str = "ok"

class AgentRunRequest(BaseModel):
    task: str
    model: str = "gemini-2.5-flash"  # cost default; override per-request
    max_steps: int = Field(default=10, ge=1, le=100)
    start_url: str | None = None
    extension_bridge_url: str | None = None

class AgentRunResponse(BaseModel):
    success: bool
    result: str
    steps_taken: int
    gif_path: str | None = None
    video_path: str | None = None
    # M4a metrics: populated none-guarded from the AgentHistoryList. usage may be
    # None (no LLM calls / cost calc off); is_successful() returns bool | None.
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_cost: float | None = None
    duration_s: float | None = None
    is_successful: bool | None = None

class DOMEnhancedParseRequest(BaseModel):
    url: str

class DOMElement(BaseModel):
    tag: str
    text: str | None = None
    attributes: dict[str, str] = {}
    xpath: str | None = None
    role: str | None = None
    aria_label: str | None = None

class DOMEnhancedParseResponse(BaseModel):
    url: str
    title: str | None = None
    elements: list[DOMElement]
    element_count: int

class CacheStoreRequest(BaseModel):
    actions: list[dict[str, Any]]

class CacheResponse(BaseModel):
    site_hash: str
    actions: list[dict[str, Any]] | None = None

# ---------------------------------------------------------------------------
# SQLite cache helpers
# ---------------------------------------------------------------------------

async def _init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS action_cache (
                site_hash TEXT PRIMARY KEY,
                actions   TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        await db.commit()

async def _get_cache(site_hash: str) -> list[dict[str, Any]] | None:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT actions FROM action_cache WHERE site_hash = ?", (site_hash,)
        ) as cursor:
            row = await cursor.fetchone()
            if row is None:
                return None
            return json.loads(row[0])

async def _set_cache(site_hash: str, actions: list[dict[str, Any]]) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO action_cache(site_hash, actions)
            VALUES (?, ?)
            ON CONFLICT(site_hash) DO UPDATE SET
                actions = excluded.actions,
                updated_at = CURRENT_TIMESTAMP
            """,
            (site_hash, json.dumps(actions)),
        )
        await db.commit()

async def _delete_cache(site_hash: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM action_cache WHERE site_hash = ?", (site_hash,)
        )
        await db.commit()
        return cursor.rowcount > 0

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    await _init_db()
    yield

app = FastAPI(title="GAL Browser Use Service", lifespan=lifespan)

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

async def require_auth(authorization: str | None = Header(default=None)) -> None:
    """Bearer-token guard for navigation endpoints.

    If SERVICE_AUTH_TOKEN is set, require `Authorization: Bearer <token>` and
    401 on mismatch. If unset, allow (dev) but log a warning.
    """
    if not SERVICE_AUTH_TOKEN:
        logger.warning(
            "SERVICE_AUTH_TOKEN is unset; serving request without authentication (dev mode)."
        )
        return
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or token != SERVICE_AUTH_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing bearer token")

# ---------------------------------------------------------------------------
# SSRF guard
# ---------------------------------------------------------------------------

def assert_navigable_url(url: str) -> None:
    """Validate a caller-supplied navigation URL against SSRF.

    Require an http/https scheme; resolve the host and block private,
    loopback, link-local, and metadata ranges unless GAL_BROWSER_ALLOW_PRIVATE=1.
    Raises HTTPException(400) on violation.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="URL scheme must be http or https")
    host = parsed.hostname
    if not host:
        raise HTTPException(status_code=400, detail="URL must include a host")

    if ALLOW_PRIVATE_HOSTS:
        return

    try:
        infos = socket.getaddrinfo(host, parsed.port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail=f"Could not resolve host: {exc}")

    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue
        # Block private/loopback/link-local (incl. 169.254.169.254 metadata),
        # plus IPv6 loopback (::1) and unique-local fc00::/7. is_private covers
        # 10/8, 172.16/12, 192.168/16 and fc00::/7; is_link_local covers
        # 169.254/16 and fe80::/10.
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise HTTPException(
                status_code=400,
                detail=f"Navigation to private/loopback/link-local host is blocked: {host} -> {addr}",
            )

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")

@app.post("/agent/run", response_model=AgentRunResponse, dependencies=[Depends(require_auth)])
async def agent_run(req: AgentRunRequest) -> AgentRunResponse:
    """Run a browser-use Agent to execute *task*.

    The Agent is launched with Playwright and the GAL Chrome extension
    pre-loaded via `--load-extension` / `--disable-extensions-except`.
    """
    if req.start_url is not None:
        assert_navigable_url(req.start_url)

    try:
        from browser_use.agent.service import Agent
        from browser_use.browser.session import BrowserSession
        from browser_use.llm.models import ChatOpenAI, ChatGoogle
    except ImportError as exc:
        raise HTTPException(status_code=500, detail=f"browser-use not installed: {exc}")

    bridge = ChromeBridge(
        base_url=req.extension_bridge_url or EXTENSION_URL
    )

    # Build Playwright launch args so the GAL extension is loaded.
    # These flags mirror the TypeScript MCP approach.
    extension_path = CHROME_EXTENSION_PATH
    extra_chromium_args = [
        f"--disable-extensions-except={extension_path}",
        f"--load-extension={extension_path}",
        "--no-sandbox",
        "--disable-setuid-sandbox",
    ]

    # Replay capture (video evidence): annotated GIF + Playwright session video.
    replay_dir = Path(os.getenv("REPLAY_OUTPUT_DIR", "/tmp/gal-replays")) / uuid.uuid4().hex
    replay_dir.mkdir(parents=True, exist_ok=True)
    gif_path = replay_dir / "run.gif"

    browser = BrowserSession(
        headless=False,
        args=extra_chromium_args,
        record_video_dir=str(replay_dir),
    )
    await browser.start()

    # Code-controlled entry URL: deterministic navigation (the harness owns where the run
    # starts); grounding stays with the LLM. start_url is already SSRF-validated above.
    if req.start_url:
        await browser.navigate_to(req.start_url)

    # Provider routing: Gemini Flash by default (cost). Non-gemini models use the
    # OpenAI-compatible client; when LLM_BASE_URL is set it targets a local/self-hosted
    # endpoint (e.g. MLX UI-TARS), otherwise the default OpenAI API.
    if req.model.startswith("gemini"):
        llm = ChatGoogle(model=req.model)
    else:
        _openai_kwargs: dict[str, Any] = {"model": req.model}
        _base_url = os.getenv("LLM_BASE_URL")
        if _base_url:
            _openai_kwargs["base_url"] = _base_url
            _openai_kwargs["api_key"] = os.getenv("LLM_API_KEY", "mlx")
        llm = ChatOpenAI(**_openai_kwargs)
    agent = Agent(
        task=req.task,
        llm=llm,
        browser_session=browser,
        use_vision=True,
        generate_gif=str(gif_path),
        calculate_cost=True,
    )

    try:
        history = await agent.run(max_steps=req.max_steps)
    except Exception as exc:
        await browser.close()
        await bridge.close()
        raise HTTPException(status_code=500, detail=str(exc))

    await browser.close()
    await bridge.close()

    videos = sorted(str(p) for p in replay_dir.glob("*.webm"))
    usage = history.usage  # UsageSummary | None (None if cost calc off / no LLM calls)
    return AgentRunResponse(
        success=True,
        result=history.final_result() or "",
        steps_taken=history.number_of_steps(),
        gif_path=str(gif_path) if gif_path.exists() else None,
        video_path=videos[0] if videos else None,
        input_tokens=usage.total_prompt_tokens if usage else None,
        output_tokens=usage.total_completion_tokens if usage else None,
        total_cost=usage.total_cost if usage else None,
        duration_s=history.total_duration_seconds(),
        is_successful=history.is_successful(),
    )

@app.post(
    "/dom/enhanced-parse",
    response_model=DOMEnhancedParseResponse,
    dependencies=[Depends(require_auth)],
)
async def dom_enhanced_parse(req: DOMEnhancedParseRequest) -> DOMEnhancedParseResponse:
    """Navigate to *url*, retrieve the enhanced DOM + AX tree, and return
    a structured element list using browser-use's DOM parser.
    """
    assert_navigable_url(req.url)

    try:
        from browser_use.browser.session import BrowserSession
        from browser_use.dom.service import DomService
    except ImportError as exc:
        raise HTTPException(status_code=500, detail=f"browser-use not installed: {exc}")

    browser = BrowserSession(
        headless=True,
        args=["--no-sandbox", "--disable-setuid-sandbox"],
    )
    await browser.start()

    try:
        await browser.navigate_to(req.url)
        page = await browser.must_get_current_page()
        title = await page.get_title()

        dom_service = DomService(browser_session=browser)
        state, _tree, _metrics = await dom_service.get_serialized_dom_tree()

        elements: list[DOMElement] = []
        for idx, node in state.selector_map.items():
            elements.append(
                DOMElement(
                    tag=getattr(node, "tag_name", ""),
                    text=getattr(node, "text", ""),
                    attributes=getattr(node, "attributes", {}),
                    xpath=getattr(node, "xpath", ""),
                    role=getattr(node, "role", ""),
                    aria_label=getattr(node, "attributes", {}).get("aria-label"),
                )
            )
    except Exception as exc:
        await browser.close()
        raise HTTPException(status_code=500, detail=str(exc))

    await browser.close()

    return DOMEnhancedParseResponse(
        url=req.url,
        title=title,
        elements=elements,
        element_count=len(elements),
    )

@app.get("/cache/{site_hash}", response_model=CacheResponse)
async def cache_get(site_hash: str) -> CacheResponse:
    actions = await _get_cache(site_hash)
    if actions is None:
        raise HTTPException(status_code=404, detail="Cache miss")
    return CacheResponse(site_hash=site_hash, actions=actions)

@app.post("/cache/{site_hash}", response_model=CacheResponse)
async def cache_store(site_hash: str, req: CacheStoreRequest) -> CacheResponse:
    await _set_cache(site_hash, req.actions)
    return CacheResponse(site_hash=site_hash, actions=req.actions)

@app.delete("/cache/{site_hash}", response_model=CacheResponse)
async def cache_delete(site_hash: str) -> CacheResponse:
    deleted = await _delete_cache(site_hash)
    if not deleted:
        raise HTTPException(status_code=404, detail="Cache miss")
    return CacheResponse(site_hash=site_hash, actions=None)
