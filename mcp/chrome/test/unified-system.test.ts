/**
 * Unified GAL Browser System Integration Tests
 *
 * Tests the full pipeline:
 *   1. Chrome extension enhanced DOM scanner
 *   2. Python browser-use service (mcp/gal-browser-use-service)
 *   3. MCP Chrome API tools (mcp/chrome)
 *
 * Ported from gal-run/gal-browser-use-mcp PR #2
 * (branch feat/server-impl-and-tests).
 */

import { describe, it, expect, beforeAll } from "vitest";

const SERVICE_URL =
  process.env.GAL_BROWSER_USE_SERVICE_URL ?? "http://127.0.0.1:8123";
const TEST_URL = "https://example.com";

async function serviceHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVICE_URL}/health`, { method: "POST" });
    return res.ok;
  } catch {
    return false;
  }
}

// The integration suite needs the companion Python service running on
// port 8123. When it is not available we skip rather than fail so the
// package's unit checks (the static tool-definition check below) still run
// in CI without the service.
const serviceUp = await serviceHealth();
const describeService = serviceUp ? describe : describe.skip;

describe("Unified GAL Browser System", () => {
  describeService("Python Service", () => {
    beforeAll(async () => {
      const ok = await serviceHealth();
      if (!ok) {
        throw new Error(
          "Python browser-use service is not running on port 8123. " +
            "Start it first: cd mcp/gal-browser-use-service && ./start.sh",
        );
      }
    });

    it("health endpoint returns ok", async () => {
      const res = await fetch(`${SERVICE_URL}/health`, { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
    });

    it("dom/enhanced-parse returns elements for example.com", async () => {
      const res = await fetch(`${SERVICE_URL}/dom/enhanced-parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: TEST_URL }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.url).toBe(TEST_URL);
      expect(Array.isArray(body.elements)).toBe(true);
      expect(body.elements.length).toBeGreaterThan(0);
      // Verify browser-use AX metadata is present
      const first = body.elements[0];
      expect(first).toHaveProperty("tag");
      expect(first).toHaveProperty("role");
      expect(first).toHaveProperty("xpath");
    });

    it("cache round-trip works", async () => {
      const siteHash = "test-site-123";
      const actions = [{ type: "click", index: 1 }];

      // Store
      const storeRes = await fetch(`${SERVICE_URL}/cache/${siteHash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions }),
      });
      expect(storeRes.status).toBe(200);

      // Retrieve
      const getRes = await fetch(`${SERVICE_URL}/cache/${siteHash}`);
      expect(getRes.status).toBe(200);
      const body = await getRes.json();
      expect(body.actions).toEqual(actions);

      // Delete
      const delRes = await fetch(`${SERVICE_URL}/cache/${siteHash}`, {
        method: "DELETE",
      });
      expect(delRes.status).toBe(200);

      // Verify deleted
      const verifyRes = await fetch(`${SERVICE_URL}/cache/${siteHash}`);
      expect(verifyRes.status).toBe(404);
    });
  });

  describe("MCP Server Tools (unit check)", () => {
    it("has all 10 new tool definitions", async () => {
      // This is a static check — the server.ts file should contain all tools.
      const { readFileSync } = await import("fs");
      const { fileURLToPath } = await import("url");
      const { dirname, resolve } = await import("path");
      const here = dirname(fileURLToPath(import.meta.url));
      const serverSrc = readFileSync(
        resolve(here, "..", "src", "server.ts"),
        "utf-8",
      );
      const expectedTools = [
        "chrome_extension_tabGroups_create",
        "chrome_extension_tabGroups_list",
        "chrome_extension_tabs_query",
        "chrome_extension_tabs_create",
        "chrome_extension_tabs_remove",
        "chrome_extension_bookmarks_search",
        "chrome_extension_history_search",
        "chrome_extension_windows_create",
        "chrome_extension_agent_run",
        "chrome_extension_enhanced_parse",
      ];
      for (const name of expectedTools) {
        expect(serverSrc).toContain(name);
      }
    });
  });
});
