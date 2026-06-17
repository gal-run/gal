/**
 * Regression tests for clipboard fetch via chrome.scripting.executeScript
 * bypasses Gemini CSP.
 *
 * Context: Gemini's strict Content-Security-Policy blocks inline <script> injection
 * (createElement("script") + appendChild approach used previously). The fix replaced
 * inline script injection with chrome.scripting.executeScript({ world: "MAIN" }),
 * which operates at the browser/C++ level and is never subject to page CSP.
 *
 * This file verifies three contracts:
 *   1. The fetch is executed in the MAIN world via chrome.scripting.executeScript
 *      (not via inline <script> injection or content-script fetch).
 *   2. The captured data URL is returned correctly from the injected script.
 *   3. Fetch failure in the MAIN world does not crash the content script —
 *      the handler returns { dataUrl: null } and swallows the error.
 */

import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Contract implementation under test
//
// This mirrors the GAL_FETCH_IMAGE_MAIN_WORLD handler from service-worker.ts
// at the time of fix , extracted as a standalone function so the CSP
// bypass contract can be tested independently of the service worker lifecycle.
// ---------------------------------------------------------------------------

interface ScriptingResult {
  result: string | null;
}

interface ChromeScripting {
  executeScript(params: {
    target: { tabId: number };
    world: string;
    func: (url: string) => Promise<string | null>;
    args: string[];
  }): Promise<ScriptingResult[] | undefined>;
}

/**
 * Fetch an image in the page's MAIN world using chrome.scripting.executeScript.
 *
 * Using world: "MAIN" means Chrome injects and runs the function at the
 * browser/C++ layer — the page's Content-Security-Policy is never consulted,
 * so Gemini's strict script-src CSP does not block the fetch.
 *
 * Contrast with the previous approach (createElement("script") + appendChild),
 * which was blocked by CSP because inline scripts are forbidden by Gemini's
 * `script-src 'nonce-...'` directive.
 */
async function fetchViaExecuteScriptMainWorld(
  tabId: number | undefined,
  imageUrl: string,
  scripting: ChromeScripting,
): Promise<{ dataUrl: string | null }> {
  // No tab → can't inject into a page (called from popup or missing context)
  if (!tabId) {
    return { dataUrl: null };
  }

  try {
    const results = await scripting.executeScript({
      target: { tabId },
      // world: "MAIN" is the CSP bypass — injection runs at browser level,
      // not as a page-context script element that CSP would evaluate.
      world: "MAIN",
      func: async (url: string): Promise<string | null> => {
        try {
          const res = await fetch(url, { credentials: "include" });
          if (!res.ok) throw new Error("HTTP " + res.status);
          const blob = await res.blob();
          return await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      },
      args: [imageUrl],
    });

    const dataUrl = results?.[0]?.result ?? null;
    return { dataUrl };
  } catch {
    // executeScript itself may throw (e.g. tab navigated away, permission denied).
    // Must not propagate — content script must remain functional.
    return { dataUrl: null };
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("clipboard fetch via executeScript bypasses Gemini CSP", () => {

  // -------------------------------------------------------------------------
  // 1. Image fetch is executed in the MAIN world via chrome.scripting.executeScript
  // -------------------------------------------------------------------------

  describe("fetch is executed via chrome.scripting.executeScript in MAIN world", () => {
    it("uses world: 'MAIN' — the CSP bypass that allows fetch on Gemini pages", async () => {
      const executeScriptMock = vi.fn().mockResolvedValue([
        { result: "data:image/png;base64,abc123" } as ScriptingResult,
      ]);

      await fetchViaExecuteScriptMainWorld(
        42,
        "https://lh3.googleusercontent.com/gemini-output.png",
        { executeScript: executeScriptMock },
      );

      expect(executeScriptMock).toHaveBeenCalledOnce();

      const callArgs = executeScriptMock.mock.calls[0][0] as {
        world: string;
        target: { tabId: number };
        func: unknown;
        args: string[];
      };

      // The CSP bypass: world must be "MAIN", not "ISOLATED" (the content-script world)
      expect(callArgs.world).toBe("MAIN");
    });

    it("targets the correct tab — executeScript is scoped to the sender's tabId", async () => {
      const executeScriptMock = vi.fn().mockResolvedValue([
        { result: "data:image/jpeg;base64,/9j" },
      ]);

      await fetchViaExecuteScriptMainWorld(
        99,
        "https://lh3.googleusercontent.com/img.jpg",
        { executeScript: executeScriptMock },
      );

      const callArgs = executeScriptMock.mock.calls[0][0] as {
        target: { tabId: number };
      };
      expect(callArgs.target.tabId).toBe(99);
    });

    it("passes the image URL via args[] — not embedded in the function string (safe for CSP nonce pages)", async () => {
      // Embedding the URL in the function body as a string literal would require
      // 'unsafe-eval' or 'unsafe-inline'. Using args[] keeps the injected code static.
      const IMAGE_URL = "https://lh3.googleusercontent.com/specific-image.jpg";
      const executeScriptMock = vi.fn().mockResolvedValue([
        { result: "data:image/jpeg;base64,/9j/test" },
      ]);

      await fetchViaExecuteScriptMainWorld(
        10,
        IMAGE_URL,
        { executeScript: executeScriptMock },
      );

      const callArgs = executeScriptMock.mock.calls[0][0] as {
        args: string[];
        func: unknown;
      };

      // URL is in args[], not interpolated into the function
      expect(callArgs.args).toEqual([IMAGE_URL]);
      // The func must be a function reference, not a string (no eval)
      expect(typeof callArgs.func).toBe("function");
    });

    it("does NOT fall back to inline <script> injection — only executeScript is called", async () => {
      // If the code were to fall back to DOM-based injection, it would call
      // document.createElement. Verify this does not happen by ensuring
      // executeScript is the only call path.
      const executeScriptMock = vi.fn().mockResolvedValue([
        { result: "data:image/png;base64,iVBOR" },
      ]);
      const createElementSpy = vi.fn();
      vi.stubGlobal("document", { createElement: createElementSpy });

      await fetchViaExecuteScriptMainWorld(
        5,
        "https://lh3.googleusercontent.com/gemini.png",
        { executeScript: executeScriptMock },
      );

      // executeScript is called — the scripting API path is taken
      expect(executeScriptMock).toHaveBeenCalledOnce();
      // document.createElement is NOT called — no inline script injection
      expect(createElementSpy).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it("does NOT use content-script fetch (credentials: include from ISOLATED world fails on cross-origin Gemini CDN)", async () => {
      // The MAIN world (page context) has access to page cookies and is same-origin
      // with the Gemini CDN. The ISOLATED world (content script) does not.
      // Verify that executeScript is the mechanism — not a direct fetch() call
      // in the extension context.
      const directFetchSpy = vi.fn();
      vi.stubGlobal("fetch", directFetchSpy);

      const executeScriptMock = vi.fn().mockResolvedValue([
        { result: "data:image/png;base64,iVBOR" },
      ]);

      await fetchViaExecuteScriptMainWorld(
        3,
        "https://lh3.googleusercontent.com/img.png",
        { executeScript: executeScriptMock },
      );

      // The extension-level fetch is NOT called — the fetch happens inside
      // the page context via the injected function, not in the service worker
      expect(directFetchSpy).not.toHaveBeenCalled();
      expect(executeScriptMock).toHaveBeenCalledOnce();

      vi.unstubAllGlobals();
    });
  });

  // -------------------------------------------------------------------------
  // 2. The captured data URL is returned correctly from the injected script
  // -------------------------------------------------------------------------

  describe("captured data URL is returned correctly from the injected script", () => {
    it("returns the data URL from the executeScript result when the injected fetch succeeds", async () => {
      const EXPECTED_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const scripting: ChromeScripting = {
        executeScript: vi.fn().mockResolvedValue([
          { result: EXPECTED_DATA_URL },
        ]),
      };

      const result = await fetchViaExecuteScriptMainWorld(
        42,
        "https://lh3.googleusercontent.com/img.png",
        scripting,
      );

      expect(result.dataUrl).toBe(EXPECTED_DATA_URL);
    });

    it("returned data URL is in canonical data:<mime>;base64,<data> format — usable by blob/download APIs", async () => {
      const JPEG_DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD";

      const scripting: ChromeScripting = {
        executeScript: vi.fn().mockResolvedValue([{ result: JPEG_DATA_URL }]),
      };

      const result = await fetchViaExecuteScriptMainWorld(
        7,
        "https://lh3.googleusercontent.com/photo.jpg",
        scripting,
      );

      expect(result.dataUrl).not.toBeNull();
      // Must be parseable as a data URL (data:<mime>;base64,<data>)
      expect(result.dataUrl).toMatch(/^data:[^;]+;base64,/);
    });

    it("correctly extracts the result from results[0].result — not from results[0] directly", async () => {
      // Regression: accessing results[0] (the wrapper object) instead of
      // results[0].result (the actual return value) would yield an object, not a string.
      const DATA_URL = "data:image/png;base64,test123";

      const scripting: ChromeScripting = {
        executeScript: vi.fn().mockResolvedValue([{ result: DATA_URL }]),
      };

      const { dataUrl } = await fetchViaExecuteScriptMainWorld(
        1,
        "https://lh3.googleusercontent.com/test.png",
        scripting,
      );

      // Must be the string, not the wrapper object { result: ... }
      expect(typeof dataUrl).toBe("string");
      expect(dataUrl).toBe(DATA_URL);
    });

    it("returns { dataUrl: null } when results[0].result is null — injected script caught a fetch error", async () => {
      const scripting: ChromeScripting = {
        executeScript: vi.fn().mockResolvedValue([{ result: null }]),
      };

      const result = await fetchViaExecuteScriptMainWorld(
        20,
        "https://lh3.googleusercontent.com/img.png",
        scripting,
      );

      expect(result).toEqual({ dataUrl: null });
    });

    it("returns { dataUrl: null } when executeScript returns an empty array", async () => {
      const scripting: ChromeScripting = {
        executeScript: vi.fn().mockResolvedValue([]),
      };

      const result = await fetchViaExecuteScriptMainWorld(
        30,
        "https://lh3.googleusercontent.com/img.png",
        scripting,
      );

      expect(result).toEqual({ dataUrl: null });
    });

    it("returns { dataUrl: null } when executeScript returns undefined (Chrome MV3 edge case)", async () => {
      const scripting: ChromeScripting = {
        executeScript: vi.fn().mockResolvedValue(undefined),
      };

      const result = await fetchViaExecuteScriptMainWorld(
        40,
        "https://lh3.googleusercontent.com/img.png",
        scripting,
      );

      expect(result).toEqual({ dataUrl: null });
    });
  });

  // -------------------------------------------------------------------------
  // 3. Fetch failure in MAIN world does not crash the content script
  // -------------------------------------------------------------------------

  describe("fetch failure in MAIN world does not crash the content script", () => {
    it("executeScript rejection is caught — handler returns { dataUrl: null } without rethrowing", async () => {
      const scripting: ChromeScripting = {
        executeScript: vi.fn().mockRejectedValue(
          new Error("Cannot access contents of url"),
        ),
      };

      // Must resolve, not reject
      const result = await fetchViaExecuteScriptMainWorld(
        7,
        "https://lh3.googleusercontent.com/img.png",
        scripting,
      );

      expect(result).toEqual({ dataUrl: null });
    });

    it("permission denied from executeScript is caught — handler does not propagate", async () => {
      const scripting: ChromeScripting = {
        executeScript: vi.fn().mockRejectedValue(
          new DOMException(
            "Cannot access a chrome:// URL",
            "SecurityError",
          ),
        ),
      };

      await expect(
        fetchViaExecuteScriptMainWorld(
          8,
          "https://lh3.googleusercontent.com/img.png",
          scripting,
        ),
      ).resolves.toEqual({ dataUrl: null });
    });

    it("tab-navigated-away error from executeScript is caught — returns { dataUrl: null }", async () => {
      const scripting: ChromeScripting = {
        executeScript: vi.fn().mockRejectedValue(
          new Error("The tab was closed"),
        ),
      };

      const result = await fetchViaExecuteScriptMainWorld(
        9,
        "https://lh3.googleusercontent.com/img.png",
        scripting,
      );

      expect(result).toEqual({ dataUrl: null });
    });

    it("missing tab id returns { dataUrl: null } without calling executeScript — avoids uncaught error from invalid tabId 0", async () => {
      const executeScriptMock = vi.fn();

      const result = await fetchViaExecuteScriptMainWorld(
        undefined,
        "https://lh3.googleusercontent.com/img.png",
        { executeScript: executeScriptMock },
      );

      expect(result).toEqual({ dataUrl: null });
      // executeScript is never called when there is no tab
      expect(executeScriptMock).not.toHaveBeenCalled();
    });

    it("multiple consecutive failures do not cause any unhandled rejections", async () => {
      const scripting: ChromeScripting = {
        executeScript: vi.fn().mockRejectedValue(new Error("network error")),
      };

      // Fire 5 consecutive failures — none should cause an unhandled rejection
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          fetchViaExecuteScriptMainWorld(
            i + 1,
            "https://lh3.googleusercontent.com/img.png",
            scripting,
          ),
        ),
      );

      // All 5 must resolve with { dataUrl: null }, not reject
      for (const result of results) {
        expect(result).toEqual({ dataUrl: null });
      }
    });

    it("is safe to call without tabId from the popup context — the popup cannot provide a tabId", async () => {
      // The popup sends GAL_FETCH_IMAGE_MAIN_WORLD but does not have a sender.tab.
      // The handler must guard this case and return null rather than passing
      // an invalid tabId to executeScript.
      const executeScriptMock = vi.fn();

      const result = await fetchViaExecuteScriptMainWorld(
        undefined, // popup sender: no tab
        "https://lh3.googleusercontent.com/img.png",
        { executeScript: executeScriptMock },
      );

      expect(result.dataUrl).toBeNull();
      expect(executeScriptMock).not.toHaveBeenCalled();
    });
  });
});
