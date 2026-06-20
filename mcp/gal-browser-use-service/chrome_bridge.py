"""HTTP client for the GAL Chrome extension service worker."""

import httpx
from typing import Any, Optional

DEFAULT_EXTENSION_URL = "http://localhost:9222"


class ChromeBridge:
    """Bridge to the GAL Chrome extension via HTTP.

    The extension exposes a lightweight HTTP endpoint (e.g. a service worker
    fetch handler or a tiny background page server) so that external agents
    can call Chrome APIs without running inside the browser.
    """

    def __init__(self, base_url: str = DEFAULT_EXTENSION_URL):
        self.base_url = base_url.rstrip("/")
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self.base_url, timeout=30.0)
        return self._client

    # ------------------------------------------------------------------
    # Tabs
    # ------------------------------------------------------------------

    async def tabs_query(self, query_info: dict[str, Any]) -> list[dict[str, Any]]:
        """Query Chrome tabs."""
        # TODO: implement once extension HTTP endpoint is ready
        raise NotImplementedError("tabs_query is stubbed — wire to extension endpoint")

    async def tabs_create(self, create_properties: dict[str, Any]) -> dict[str, Any]:
        """Create a new tab."""
        # TODO: implement once extension HTTP endpoint is ready
        raise NotImplementedError("tabs_create is stubbed — wire to extension endpoint")

    async def tabs_update(self, tab_id: int, update_properties: dict[str, Any]) -> dict[str, Any]:
        """Update a tab."""
        # TODO: implement once extension HTTP endpoint is ready
        raise NotImplementedError("tabs_update is stubbed — wire to extension endpoint")

    async def tabs_remove(self, tab_ids: list[int]) -> None:
        """Close one or more tabs."""
        # TODO: implement once extension HTTP endpoint is ready
        raise NotImplementedError("tabs_remove is stubbed — wire to extension endpoint")

    # ------------------------------------------------------------------
    # Tab Groups
    # ------------------------------------------------------------------

    async def tabGroups_query(self, query_info: dict[str, Any]) -> list[dict[str, Any]]:
        """Query tab groups."""
        # TODO: implement once extension HTTP endpoint is ready
        raise NotImplementedError("tabGroups_query is stubbed — wire to extension endpoint")

    async def tabGroups_update(self, group_id: int, update_properties: dict[str, Any]) -> dict[str, Any]:
        """Update a tab group."""
        # TODO: implement once extension HTTP endpoint is ready
        raise NotImplementedError("tabGroups_update is stubbed — wire to extension endpoint")

    # ------------------------------------------------------------------
    # Bookmarks
    # ------------------------------------------------------------------

    async def bookmarks_getTree(self) -> list[dict[str, Any]]:
        """Get the full bookmarks tree."""
        # TODO: implement once extension HTTP endpoint is ready
        raise NotImplementedError("bookmarks_getTree is stubbed — wire to extension endpoint")

    async def bookmarks_create(self, bookmark: dict[str, Any]) -> dict[str, Any]:
        """Create a bookmark or folder."""
        # TODO: implement once extension HTTP endpoint is ready
        raise NotImplementedError("bookmarks_create is stubbed — wire to extension endpoint")

    async def bookmarks_remove(self, id: str) -> None:
        """Remove a bookmark."""
        # TODO: implement once extension HTTP endpoint is ready
        raise NotImplementedError("bookmarks_remove is stubbed — wire to extension endpoint")

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None
