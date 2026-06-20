"""FastAPI microservice wrapping browser-use with a Chrome extension bridge."""

from __future__ import annotations

import hashlib
import json
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import aiosqlite
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from chrome_bridge import ChromeBridge

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DB_PATH = os.getenv("BROWSER_USE_DB", "/tmp/browser_use_cache.db")
EXTENSION_URL = os.getenv("EXTENSION_BRIDGE_URL", "http://localhost:9222")
CHROME_EXTENSION_PATH = os.getenv("CHROME_EXTENSION_PATH", "/app/gal-extension")

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
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")

@app.post("/agent/run", response_model=AgentRunResponse)
async def agent_run(req: AgentRunRequest) -> AgentRunResponse:
    """Run a browser-use Agent to execute *task*.

    The Agent is launched with Playwright and the GAL Chrome extension
    pre-loaded via `--load-extension` / `--disable-extensions-except`.
    """
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

    # Provider routing: Gemini Flash by default (cost), OpenAI still available on request.
    llm = ChatGoogle(model=req.model) if req.model.startswith("gemini") else ChatOpenAI(model=req.model)
    agent = Agent(
        task=req.task,
        llm=llm,
        browser_session=browser,
        use_vision=True,
        generate_gif=str(gif_path),
    )

    try:
        result = await agent.run(max_steps=req.max_steps)
    except Exception as exc:
        await browser.close()
        await bridge.close()
        raise HTTPException(status_code=500, detail=str(exc))

    await browser.close()
    await bridge.close()

    videos = sorted(str(p) for p in replay_dir.glob("*.webm"))
    return AgentRunResponse(
        success=True,
        result=str(result),
        steps_taken=getattr(agent, "steps_taken", 0),
        gif_path=str(gif_path) if gif_path.exists() else None,
        video_path=videos[0] if videos else None,
    )

@app.post("/dom/enhanced-parse", response_model=DOMEnhancedParseResponse)
async def dom_enhanced_parse(req: DOMEnhancedParseRequest) -> DOMEnhancedParseResponse:
    """Navigate to *url*, retrieve the enhanced DOM + AX tree, and return
    a structured element list using browser-use's DOM parser.
    """
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
