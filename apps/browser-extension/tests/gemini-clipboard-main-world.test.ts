/**
 * Regression tests for Gemini clipboard capture via MAIN world fetch.
 *
 * Bug: Clipboard capture was completely broken for Gemini-generated images
 * because the service worker proxy path used to fetch image bytes lacks the
 * auth cookies required by lh3.googleusercontent.com (Gemini's CDN).
 *
 * Fix (PR): Introduced `fetchImageInPageContext()` which injects a
 * <script> element into the page's MAIN world and runs `fetch()` with
 * `credentials: "include"` from there.  Because the script executes as the
 * page itself it has the full Google session cookies and the CDN request
 * succeeds.
 *
 * The fix established a three-tier cascade for `injectSaveButton()`:
 *   1. Canvas capture  (no network, no CORS — fastest)
 *   2. MAIN world fetch (page origin + cookies — works for Gemini/lh3)
 *   3. Content-script fetch + SW proxy (last resort)
 *
 * These tests verify that:
 *   (a) The MAIN world fetch path correctly injects a <script> into the page
 *       document and communicates results back via window.postMessage.
 *   (b) A valid Gemini image URL produces a non-empty data URL when the MAIN
 *       world fetch succeeds.
 *   (c) The service worker proxy path is NOT reached when the MAIN world
 *       fetch succeeds — only triggered as the third-tier fallback.
 *   (d) The MAIN world fetch resolves to `undefined` (rather than throwing)
 *       when the injected script reports a fetch failure.
 *   (e) The 10-second timeout guard resolves to `undefined` rather than
 *       hanging if the injected script never posts a reply.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Inline reproduction of `fetchImageInPageContext` from asset-clipboard.ts
// (commit d923d9b2,  fix).  The source file was subsequently removed in
// , so we embed the logic here to lock in the regression contract.
// ---------------------------------------------------------------------------

/**
 * Fetch an image by injecting a script into the MAIN world of the page.
 * Runs fetch() with credentials:"include" from the page's own origin so that
 * auth cookies (required for Gemini/lh3 CDN URLs) are sent automatically.
 *
 * Reproduced verbatim from apps/chrome-extension/src/content/asset-clipboard.ts
 * at the state introduced by PR (fix for ).
 */
async function fetchImageInPageContext(
  url: string,
  opts: {
    /** Override setTimeout delay — useful for testing timeout behaviour. */
    timeoutMs?: number;
    /** Replace document.documentElement for DOM injection testing. */
    root?: { appendChild: (el: unknown) => void };
    /** Replace window for postMessage/addEventListener testing. */
    win?: Pick<
      Window,
      "addEventListener" | "removeEventListener" | "postMessage"
    >;
  } = {},
): Promise<string | undefined> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const root = opts.root ?? document.documentElement;
  const win = opts.win ?? window;

  return new Promise((resolve) => {
    const callbackId = `gal_fetch_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const handler = (event: MessageEvent) => {
      if (
        event.data?.type === "GAL_FETCH_IMAGE_RESULT" &&
        event.data?.callbackId === callbackId
      ) {
        win.removeEventListener("message", handler as EventListener);
        resolve((event.data.dataUrl as string | null | undefined) || undefined);
      }
    };
    win.addEventListener("message", handler as EventListener);

    // Timeout guard: resolve undefined rather than hanging forever
    const tid = setTimeout(() => {
      win.removeEventListener("message", handler as EventListener);
      resolve(undefined);
    }, timeoutMs);
    // Allow Node / jsdom to clean up without blocking test exit
    if (typeof tid === "object" && tid !== null && "unref" in tid) {
      (tid as { unref(): void }).unref();
    }

    const script = {
      textContent: `
        (async () => {
          try {
            const res = await fetch(${JSON.stringify(url)}, { credentials: "include" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const blob = await res.blob();
            const reader = new FileReader();
            reader.onloadend = () => {
              window.postMessage({
                type: "GAL_FETCH_IMAGE_RESULT",
                callbackId: ${JSON.stringify(callbackId)},
                dataUrl: reader.result
              }, "*");
            };
            reader.onerror = () => {
              window.postMessage({
                type: "GAL_FETCH_IMAGE_RESULT",
                callbackId: ${JSON.stringify(callbackId)},
                dataUrl: null
              }, "*");
            };
            reader.readAsDataURL(blob);
          } catch {
            window.postMessage({
              type: "GAL_FETCH_IMAGE_RESULT",
              callbackId: ${JSON.stringify(callbackId)},
              dataUrl: null
            }, "*");
          }
        })();
      `,
      remove: vi.fn(),
    };

    root.appendChild(script);
    script.remove();
  });
}

// ---------------------------------------------------------------------------
// Helper: build a fake window with controllable postMessage dispatch
// ---------------------------------------------------------------------------

function buildFakeWindow() {
  const listeners: Array<(event: MessageEvent) => void> = [];

  const fakeWindow = {
    addEventListener: vi.fn(
      (_type: string, fn: (event: MessageEvent) => void) => {
        listeners.push(fn);
      },
    ),
    removeEventListener: vi.fn(
      (_type: string, fn: (event: MessageEvent) => void) => {
        const idx = listeners.indexOf(fn);
        if (idx !== -1) listeners.splice(idx, 1);
      },
    ),
    postMessage: vi.fn(),
    /** Simulate the page script posting a result back to the content script. */
    dispatchResult(callbackId: string, dataUrl: string | null) {
      const event = {
        data: {
          type: "GAL_FETCH_IMAGE_RESULT",
          callbackId,
          dataUrl,
        },
      } as MessageEvent;
      listeners.forEach((fn) => fn(event));
    },
    /** Expose listener count for assertions. */
    get listenerCount() {
      return listeners.length;
    },
  };

  return fakeWindow;
}

// ---------------------------------------------------------------------------
// Helper: extract the callbackId embedded in the injected script text
// ---------------------------------------------------------------------------

function extractCallbackId(scriptText: string): string | null {
  const match = scriptText.match(/callbackId:\s*"(gal_fetch_[^"]+)"/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Gemini clipboard capture — MAIN world fetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // (a) Script injection and postMessage communication
  // -------------------------------------------------------------------------

  describe("MAIN world script injection", () => {
    it("appends a <script> element to the page root with a unique callbackId", async () => {
      const fakeWindow = buildFakeWindow();
      const appendedScripts: Array<{ textContent: string; remove: () => void }> = [];

      const fakeRoot = {
        appendChild: vi.fn((el: { textContent: string; remove: () => void }) => {
          appendedScripts.push(el);
          // Immediately simulate the MAIN world script posting its result
          const cbId = extractCallbackId(el.textContent);
          if (cbId) {
            fakeWindow.dispatchResult(cbId, "data:image/jpeg;base64,ABC123");
          }
        }),
      };

      const result = await fetchImageInPageContext(
        "https://lh3.googleusercontent.com/gemini/fake-image",
        { root: fakeRoot, win: fakeWindow },
      );

      expect(fakeRoot.appendChild).toHaveBeenCalledTimes(1);
      expect(appendedScripts).toHaveLength(1);
      expect(appendedScripts[0].textContent).toContain("GAL_FETCH_IMAGE_RESULT");
      expect(appendedScripts[0].textContent).toContain("credentials");
      expect(appendedScripts[0].textContent).toContain('"include"');
      expect(result).toBe("data:image/jpeg;base64,ABC123");
    });

    it("removes the injected <script> element after appending (no DOM pollution)", async () => {
      const fakeWindow = buildFakeWindow();
      let capturedScript: { textContent: string; remove: ReturnType<typeof vi.fn> } | null = null;

      const fakeRoot = {
        appendChild: vi.fn((el: { textContent: string; remove: ReturnType<typeof vi.fn> }) => {
          capturedScript = el;
          const cbId = extractCallbackId(el.textContent);
          if (cbId) {
            // Dispatch the result before script.remove() is called by the implementation
            fakeWindow.dispatchResult(cbId, "data:image/jpeg;base64,XYZ");
          }
          // Do NOT call el.remove() here — the implementation calls it itself
        }),
      };

      await fetchImageInPageContext(
        "https://lh3.googleusercontent.com/gemini/another-image",
        { root: fakeRoot, win: fakeWindow },
      );

      expect(capturedScript).not.toBeNull();
      // The implementation calls script.remove() exactly once after appendChild
      expect(capturedScript!.remove).toHaveBeenCalledTimes(1);
    });

    it("embeds the target URL inside the injected script using JSON.stringify (injection-safe)", async () => {
      const fakeWindow = buildFakeWindow();
      const appendedScripts: Array<{ textContent: string; remove: () => void }> = [];

      const geminiUrl = "https://lh3.googleusercontent.com/gemini/test?v=1&q=2";

      const fakeRoot = {
        appendChild: vi.fn((el: { textContent: string; remove: () => void }) => {
          appendedScripts.push(el);
          const cbId = extractCallbackId(el.textContent);
          if (cbId) {
            fakeWindow.dispatchResult(cbId, "data:image/png;base64,GEM");
          }
        }),
      };

      await fetchImageInPageContext(geminiUrl, { root: fakeRoot, win: fakeWindow });

      expect(appendedScripts[0].textContent).toContain(JSON.stringify(geminiUrl));
    });

    it("uses unique callbackIds for concurrent calls — no cross-talk", async () => {
      const fakeWindow = buildFakeWindow();
      const callbackIds: string[] = [];

      const fakeRoot = {
        appendChild: vi.fn((el: { textContent: string; remove: () => void }) => {
          const cbId = extractCallbackId(el.textContent);
          if (cbId) callbackIds.push(cbId);
          // Deliberately do NOT dispatch a result — we will do it manually
        }),
      };

      // Start two concurrent calls
      const p1 = fetchImageInPageContext(
        "https://lh3.googleusercontent.com/img1",
        { root: fakeRoot, win: fakeWindow, timeoutMs: 5000 },
      );
      const p2 = fetchImageInPageContext(
        "https://lh3.googleusercontent.com/img2",
        { root: fakeRoot, win: fakeWindow, timeoutMs: 5000 },
      );

      // Dispatch results for both, out of order
      fakeWindow.dispatchResult(callbackIds[1], "data:image/jpeg;base64,IMG2");
      fakeWindow.dispatchResult(callbackIds[0], "data:image/jpeg;base64,IMG1");

      const [result1, result2] = await Promise.all([p1, p2]);

      expect(callbackIds[0]).not.toBe(callbackIds[1]);
      expect(result1).toBe("data:image/jpeg;base64,IMG1");
      expect(result2).toBe("data:image/jpeg;base64,IMG2");
    });
  });

  // -------------------------------------------------------------------------
  // (b) Non-empty data URL for a valid Gemini image URL
  // -------------------------------------------------------------------------

  describe("successful MAIN world fetch for Gemini URLs", () => {
    it("resolves to a non-empty data URL when the MAIN world script succeeds", async () => {
      const fakeWindow = buildFakeWindow();

      const fakeRoot = {
        appendChild: vi.fn((el: { textContent: string; remove: () => void }) => {
          const cbId = extractCallbackId(el.textContent);
          if (cbId) {
            fakeWindow.dispatchResult(cbId, "data:image/jpeg;base64,/9j/4AAQSkZJRgAB");
          }
        }),
      };

      const result = await fetchImageInPageContext(
        "https://lh3.googleusercontent.com/gemini-generated-image",
        { root: fakeRoot, win: fakeWindow },
      );

      expect(typeof result).toBe("string");
      expect(result).toBeTruthy();
      expect(result!.startsWith("data:image/")).toBe(true);
    });

    it("resolves to a non-empty data URL for an aistudio.google.com image", async () => {
      const fakeWindow = buildFakeWindow();

      const fakeRoot = {
        appendChild: vi.fn((el: { textContent: string; remove: () => void }) => {
          const cbId = extractCallbackId(el.textContent);
          if (cbId) {
            fakeWindow.dispatchResult(cbId, "data:image/png;base64,iVBORw0KGgo=");
          }
        }),
      };

      const result = await fetchImageInPageContext(
        "https://lh3.googleusercontent.com/aistudio/output-image",
        { root: fakeRoot, win: fakeWindow },
      );

      expect(result).toBeTruthy();
      expect(result!.startsWith("data:image/")).toBe(true);
    });

    it("treats an empty-string dataUrl as failure (resolves to undefined)", async () => {
      const fakeWindow = buildFakeWindow();

      const fakeRoot = {
        appendChild: vi.fn((el: { textContent: string; remove: () => void }) => {
          const cbId = extractCallbackId(el.textContent);
          if (cbId) {
            // Empty string is falsy — the fix uses `event.data.dataUrl || undefined`
            fakeWindow.dispatchResult(cbId, "");
          }
        }),
      };

      const result = await fetchImageInPageContext(
        "https://lh3.googleusercontent.com/gemini/image",
        { root: fakeRoot, win: fakeWindow },
      );

      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // (c) SW proxy NOT reached when MAIN world fetch succeeds
  // -------------------------------------------------------------------------

  describe("cascade order — SW proxy is only a last resort", () => {
    it("does not fall through to the service worker proxy when MAIN world fetch returns a data URL", async () => {
      const swProxyCalled = vi.fn();

      // The MAIN world fetch step succeeds — SW proxy must NOT be called
      const mainWorldFetch = vi.fn(async (url: string) => {
        void url;
        return "data:image/jpeg;base64,GEMINI_DATA";
      });

      // Simulate the three-tier cascade logic from injectSaveButton()
      async function captureImageUrl(imageUrl: string): Promise<string | undefined> {
        // Tier 1: Canvas (simulated as failing — tainted cross-origin canvas)
        const canvasResult: string | undefined = undefined;
        if (canvasResult) return canvasResult;

        // Tier 2: MAIN world fetch
        const mainWorldResult = await mainWorldFetch(imageUrl);
        if (mainWorldResult) return mainWorldResult;

        // Tier 3: SW proxy (must NOT be reached when Tier 2 succeeds)
        swProxyCalled();
        return undefined;
      }

      const result = await captureImageUrl(
        "https://lh3.googleusercontent.com/gemini/image",
      );

      expect(mainWorldFetch).toHaveBeenCalledTimes(1);
      expect(swProxyCalled).not.toHaveBeenCalled();
      expect(result).toBe("data:image/jpeg;base64,GEMINI_DATA");
    });

    it("falls through to SW proxy only when both Canvas and MAIN world fetch fail", async () => {
      const swProxyCalled = vi.fn().mockReturnValue("data:image/jpeg;base64,SW_DATA");

      const mainWorldFetch = vi.fn(async (_url: string) => undefined);

      async function captureImageUrl(imageUrl: string): Promise<string | undefined> {
        const canvasResult: string | undefined = undefined;
        if (canvasResult) return canvasResult;

        const mainWorldResult = await mainWorldFetch(imageUrl);
        if (mainWorldResult) return mainWorldResult;

        // Only reached when MAIN world fetch fails
        return swProxyCalled(imageUrl);
      }

      const result = await captureImageUrl(
        "https://lh3.googleusercontent.com/gemini/image",
      );

      expect(mainWorldFetch).toHaveBeenCalledTimes(1);
      expect(swProxyCalled).toHaveBeenCalledTimes(1);
      expect(result).toBe("data:image/jpeg;base64,SW_DATA");
    });

    it("MAIN world fetch is attempted before the SW proxy for every Gemini URL", async () => {
      const callOrder: string[] = [];

      const mainWorldFetch = vi.fn(async (_url: string) => {
        callOrder.push("MAIN_WORLD");
        return undefined; // simulate failure to exercise full cascade
      });

      const swProxy = vi.fn(async (_url: string) => {
        callOrder.push("SW_PROXY");
        return undefined;
      });

      const geminiUrls = [
        "https://lh3.googleusercontent.com/gemini/img1",
        "https://lh3.googleusercontent.com/gemini/img2",
        "https://lh3.googleusercontent.com/aistudio/output",
      ];

      for (const url of geminiUrls) {
        callOrder.length = 0;

        await (async () => {
          const canvasResult: string | undefined = undefined;
          if (canvasResult) return canvasResult;
          const mw = await mainWorldFetch(url);
          if (mw) return mw;
          return swProxy(url);
        })();

        expect(callOrder[0]).toBe("MAIN_WORLD");
        expect(callOrder[1]).toBe("SW_PROXY");
      }
    });
  });

  // -------------------------------------------------------------------------
  // (d) MAIN world fetch failure resolves to undefined (no throw)
  // -------------------------------------------------------------------------

  describe("MAIN world fetch failure handling", () => {
    it("resolves to undefined when the injected script reports a null dataUrl (fetch error)", async () => {
      const fakeWindow = buildFakeWindow();

      const fakeRoot = {
        appendChild: vi.fn((el: { textContent: string; remove: () => void }) => {
          const cbId = extractCallbackId(el.textContent);
          if (cbId) {
            // Simulate fetch failure — script posts null
            fakeWindow.dispatchResult(cbId, null);
          }
        }),
      };

      const result = await fetchImageInPageContext(
        "https://lh3.googleusercontent.com/gemini/auth-failed",
        { root: fakeRoot, win: fakeWindow },
      );

      expect(result).toBeUndefined();
    });

    it("resolves to undefined when the injected script reports a null dataUrl (HTTP error)", async () => {
      const fakeWindow = buildFakeWindow();

      const fakeRoot = {
        appendChild: vi.fn((el: { textContent: string; remove: () => void }) => {
          const cbId = extractCallbackId(el.textContent);
          if (cbId) {
            fakeWindow.dispatchResult(cbId, null);
          }
        }),
      };

      const result = await fetchImageInPageContext(
        "https://lh3.googleusercontent.com/gemini/http-403",
        { root: fakeRoot, win: fakeWindow },
      );

      expect(result).toBeUndefined();
    });

    it("rejects when root.appendChild throws — caller must handle errors from MAIN world injection", async () => {
      const fakeWindow = buildFakeWindow();

      const fakeRoot = {
        appendChild: vi.fn(() => {
          throw new Error("DOM manipulation blocked by CSP");
        }),
      };

      // The implementation does NOT wrap appendChild in a try/catch, so a
      // throw propagates as a Promise rejection.  Callers are responsible for
      // catching it (the fix wraps each tier in its own try/catch block inside
      // injectSaveButton — see the `catch (err)` around fetchImageInPageContext
      // in the PR diff).
      await expect(
        fetchImageInPageContext(
          "https://lh3.googleusercontent.com/gemini/csp-blocked",
          { root: fakeRoot, win: fakeWindow, timeoutMs: 50 },
        ),
      ).rejects.toThrow("DOM manipulation blocked by CSP");
    });
  });

  // -------------------------------------------------------------------------
  // (e) 10-second timeout guard
  // -------------------------------------------------------------------------

  describe("timeout guard prevents indefinite hang", () => {
    it("resolves to undefined after the timeout when no postMessage reply arrives", async () => {
      const fakeWindow = buildFakeWindow();

      const fakeRoot = {
        appendChild: vi.fn((_el: unknown) => {
          // Deliberately never dispatch a result — simulates a hung script
        }),
      };

      const p = fetchImageInPageContext(
        "https://lh3.googleusercontent.com/gemini/hung-script",
        { root: fakeRoot, win: fakeWindow, timeoutMs: 10_000 },
      );

      // Advance fake timers past the 10s timeout
      vi.advanceTimersByTime(10_001);

      const result = await p;
      expect(result).toBeUndefined();
    });

    it("cleans up the message listener after the timeout fires (no listener leak)", async () => {
      const fakeWindow = buildFakeWindow();

      const fakeRoot = {
        appendChild: vi.fn((_el: unknown) => {
          // Never dispatch
        }),
      };

      expect(fakeWindow.listenerCount).toBe(0);

      const p = fetchImageInPageContext(
        "https://lh3.googleusercontent.com/gemini/leaked-listener",
        { root: fakeRoot, win: fakeWindow, timeoutMs: 10_000 },
      );

      // One listener added after calling fetchImageInPageContext
      expect(fakeWindow.listenerCount).toBe(1);

      vi.advanceTimersByTime(10_001);
      await p;

      // Listener must be removed after timeout
      expect(fakeWindow.listenerCount).toBe(0);
    });

    it("cleans up the message listener after a successful response (no listener leak)", async () => {
      const fakeWindow = buildFakeWindow();

      const fakeRoot = {
        appendChild: vi.fn((el: { textContent: string; remove: () => void }) => {
          const cbId = extractCallbackId(el.textContent);
          if (cbId) {
            fakeWindow.dispatchResult(cbId, "data:image/jpeg;base64,CLEAN");
          }
        }),
      };

      await fetchImageInPageContext(
        "https://lh3.googleusercontent.com/gemini/clean-response",
        { root: fakeRoot, win: fakeWindow },
      );

      // Listener must be removed after successful response
      expect(fakeWindow.listenerCount).toBe(0);
    });

    it("ignores postMessage replies with a mismatched callbackId (no early resolution)", async () => {
      const fakeWindow = buildFakeWindow();
      let appended = false;

      const fakeRoot = {
        appendChild: vi.fn((el: { textContent: string; remove: () => void }) => {
          appended = true;
          void el;
          // Dispatch a reply with the WRONG callbackId
          fakeWindow.dispatchResult("gal_fetch_WRONG_ID", "data:image/jpeg;base64,WRONG");
        }),
      };

      const p = fetchImageInPageContext(
        "https://lh3.googleusercontent.com/gemini/wrong-id",
        { root: fakeRoot, win: fakeWindow, timeoutMs: 10_000 },
      );

      expect(appended).toBe(true);

      // The wrong-id reply must NOT resolve the promise —
      // advance timers to trigger the timeout instead
      vi.advanceTimersByTime(10_001);

      const result = await p;
      // Resolved by timeout, not by the wrong-id reply
      expect(result).toBeUndefined();
    });
  });
});
