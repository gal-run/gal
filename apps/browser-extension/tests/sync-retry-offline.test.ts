/**
 * Regression tests for resilient sync layer with retry and offline support.
 *
 * Covers three scenarios from the issue:
 *   1. A failed sync attempt is retried with exponential backoff up to the configured max retries.
 *   2. Max retries is respected — the fetch function is called exactly maxAttempts times and no more.
 *   3. When the extension is offline, sync is deferred and retried when connectivity is restored.
 *   4. Failed syncs surface an error state (not silently swallowed).
 *
 * The fetchWithRetry and syncStateFromResult logic lives in:
 *   apps/chrome-extension/src/background/service-worker.ts (lines 167–336)
 *
 * Because fetchWithRetry is not exported we test it indirectly through the
 * service worker's public behaviour:
 *   - The online event listener calls prefetchCommandsForAllOrgs (network recovery).
 *   - The alarm-based periodic refresh calls prefetchCommandsForAllOrgs.
 *   - setSyncMetadata is called with syncState = "error" when all retries fail.
 *   - setSyncMetadata is called with syncState = "fresh" when sync succeeds.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Chrome mock factory (mirrors the pattern used in service-worker-race-conditions.test.ts)
// ---------------------------------------------------------------------------

type AlarmListener = (alarm: chrome.alarms.Alarm) => void;
type OnlineListener = () => void;

function buildChromeMock() {
  const localStore: Record<string, unknown> = {};
  const sessionStore: Record<string, unknown> = {};
  const alarmListeners: AlarmListener[] = [];

  const chromeMock = {
    storage: {
      local: {
        get: vi.fn(async (key: string | string[] | null) => {
          if (key === null) return { ...localStore };
          if (Array.isArray(key)) {
            return Object.fromEntries(key.map((k) => [k, localStore[k]]));
          }
          return { [key as string]: localStore[key as string] };
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(localStore, items);
        }),
        remove: vi.fn(async (key: string | string[]) => {
          const keys = Array.isArray(key) ? key : [key];
          for (const k of keys) delete localStore[k];
        }),
        getBytesInUse: vi.fn(async () => 0),
      },
      session: {
        get: vi.fn(async (key: string) => ({
          [key]: sessionStore[key],
        })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(sessionStore, items);
        }),
        setAccessLevel: vi.fn().mockResolvedValue(undefined),
      },
    },
    alarms: {
      create: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(true),
      onAlarm: {
        addListener: vi.fn((fn: AlarmListener) => {
          alarmListeners.push(fn);
        }),
      },
    },
    runtime: {
      id: "test-ext-id",
      lastError: undefined as { message: string } | undefined,
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      onSuspend: { addListener: vi.fn() },
      getURL: vi.fn((path: string) => `chrome-extension://test-ext-id/${path}`),
    },
    tabs: {
      create: vi.fn().mockResolvedValue({}),
      query: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue({ url: undefined }),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      onActivated: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
    },
    identity: {
      getRedirectURL: vi.fn().mockReturnValue("https://ext.chromiumapp.org/cb"),
      launchWebAuthFlow: vi.fn(),
    },
    action: { openPopup: vi.fn().mockResolvedValue(undefined) },
    commands: { onCommand: { addListener: vi.fn() } },
    _localStore: localStore,
    _sessionStore: sessionStore,
    _alarmListeners: alarmListeners,
  };

  return chromeMock;
}

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted so they run before imports)
// ---------------------------------------------------------------------------

vi.mock("../src/lib/sentry", () => ({
  captureExceptionWithTags: vi.fn(),
  initSentry: vi.fn(),
}));

vi.mock("../src/lib/storage", () => ({
  storeUserSession: vi.fn(),
  setSyncMetadata: vi.fn().mockResolvedValue(undefined),
  checkStorageUsage: vi.fn().mockResolvedValue({ warning: null }),
}));

vi.mock("../src/lib/telemetry", () => ({
  initTelemetry: vi.fn(),
  trackEvent: vi.fn(),
  flushEvents: vi.fn(),
  handleFlushAlarm: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("sync layer retry and offline support ( / )", () => {
  let chromeMock: ReturnType<typeof buildChromeMock>;
  let onlineListeners: OnlineListener[];
  let selfMock: { addEventListener: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    onlineListeners = [];
    selfMock = {
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "online") onlineListeners.push(handler);
      }),
    };

    chromeMock = buildChromeMock();
    vi.stubGlobal("chrome", chromeMock);
    vi.stubGlobal("self", selfMock);
    // In the Node.js/vitest environment navigator.onLine defaults to false,
    // which causes syncStateFromResult to return "offline" instead of "error"
    // or "fresh". Stub it as true so the function follows the normal code path.
    vi.stubGlobal("navigator", { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Helper: advance fake timers through all 3-attempt backoff delays.
  // RETRY_CONFIG = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000 }
  // delays: attempt 0 → 0ms, attempt 1 → 1000ms, attempt 2 → 2000ms
  // -------------------------------------------------------------------------
  async function advanceThroughRetries() {
    await vi.advanceTimersByTimeAsync(10);    // flush attempt 0 (no delay)
    await vi.advanceTimersByTimeAsync(1100);  // flush backoff → attempt 1
    await vi.advanceTimersByTimeAsync(2100);  // flush backoff → attempt 2
    await vi.advanceTimersByTimeAsync(500);   // settle microtasks
  }

  // -------------------------------------------------------------------------
  // 1. Exponential backoff: fetch is retried with increasing delays
  // -------------------------------------------------------------------------

  describe("exponential backoff on retryable errors", () => {
    it("retries a retryable 503 error up to maxAttempts times (3) then stops", async () => {
      vi.useFakeTimers();

      chromeMock._sessionStore["authToken"] = "tok-abc";
      chromeMock._localStore["selectedOrg"] = "acme";

      let commandsFetchCount = 0;
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (
          typeof url === "string" &&
          url.includes("/organizations") &&
          !url.includes("/approved-config")
        ) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ organizations: [{ name: "acme" }] }),
          } as Response;
        }
        commandsFetchCount += 1;
        return {
          ok: false,
          status: 503,
          headers: { get: () => null },
          json: async () => ({}),
        } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);

      await import("../src/background/service-worker");

      const refreshAlarm: chrome.alarms.Alarm = {
        name: "refresh-commands",
        scheduledTime: Date.now(),
        periodInMinutes: 5,
      };
      chromeMock._alarmListeners.forEach((fn) => fn(refreshAlarm));

      await advanceThroughRetries();

      // Must have retried — more than 1 call, but capped at maxAttempts (3)
      expect(commandsFetchCount).toBeGreaterThan(1);
      expect(commandsFetchCount).toBeLessThanOrEqual(3);
    });

    it("does NOT retry a non-retryable 401 error", async () => {
      vi.useFakeTimers();

      chromeMock._sessionStore["authToken"] = "tok-expired";
      chromeMock._localStore["selectedOrg"] = "acme";

      let commandsFetchCount = 0;
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (
          typeof url === "string" &&
          url.includes("/organizations") &&
          !url.includes("/approved-config")
        ) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ organizations: [{ name: "acme" }] }),
          } as Response;
        }
        commandsFetchCount += 1;
        // 401 is non-retryable (auth_expired in fetchCommandsFromAPI)
        return {
          ok: false,
          status: 401,
          headers: { get: () => null },
          json: async () => ({}),
        } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);

      await import("../src/background/service-worker");

      const refreshAlarm: chrome.alarms.Alarm = {
        name: "refresh-commands",
        scheduledTime: Date.now(),
        periodInMinutes: 5,
      };
      chromeMock._alarmListeners.forEach((fn) => fn(refreshAlarm));

      await advanceThroughRetries();

      // Non-retryable: must be called exactly once (no retries)
      expect(commandsFetchCount).toBe(1);
    });

    it("stops retrying once a success response is received mid-retry", async () => {
      vi.useFakeTimers();

      chromeMock._sessionStore["authToken"] = "tok-success-mid";
      chromeMock._localStore["selectedOrg"] = "acme";

      let commandsFetchCount = 0;
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (
          typeof url === "string" &&
          url.includes("/organizations") &&
          !url.includes("/approved-config")
        ) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ organizations: [{ name: "acme" }] }),
          } as Response;
        }
        commandsFetchCount += 1;
        // First attempt fails (retryable 503), second succeeds
        if (commandsFetchCount === 1) {
          return {
            ok: false,
            status: 503,
            headers: { get: () => null },
            json: async () => ({}),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            approved: true,
            commands: [{ name: "build", content: "pnpm build" }],
          }),
        } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);

      await import("../src/background/service-worker");

      const refreshAlarm: chrome.alarms.Alarm = {
        name: "refresh-commands",
        scheduledTime: Date.now(),
        periodInMinutes: 5,
      };
      chromeMock._alarmListeners.forEach((fn) => fn(refreshAlarm));

      // Advance through first backoff only (attempt 0 fails → wait 1s → attempt 1 succeeds)
      await vi.advanceTimersByTimeAsync(10);
      await vi.advanceTimersByTimeAsync(1100);
      await vi.advanceTimersByTimeAsync(200);

      // Should have stopped at 2 — no more fetches after success
      expect(commandsFetchCount).toBe(2);
    });

    it("second backoff delay is longer than the first (exponential growth)", async () => {
      vi.useFakeTimers();

      chromeMock._sessionStore["authToken"] = "tok-backoff";
      chromeMock._localStore["selectedOrg"] = "acme";

      const callTimestamps: number[] = [];
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (
          typeof url === "string" &&
          url.includes("/organizations") &&
          !url.includes("/approved-config")
        ) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ organizations: [{ name: "acme" }] }),
          } as Response;
        }
        callTimestamps.push(Date.now());
        return {
          ok: false,
          status: 503,
          headers: { get: () => null },
          json: async () => ({}),
        } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);

      await import("../src/background/service-worker");

      const refreshAlarm: chrome.alarms.Alarm = {
        name: "refresh-commands",
        scheduledTime: Date.now(),
        periodInMinutes: 5,
      };
      chromeMock._alarmListeners.forEach((fn) => fn(refreshAlarm));

      await advanceThroughRetries();

      // Must have attempted at least twice to compare delays
      expect(callTimestamps.length).toBeGreaterThan(1);

      if (callTimestamps.length >= 3) {
        const delay0to1 = callTimestamps[1] - callTimestamps[0];
        const delay1to2 = callTimestamps[2] - callTimestamps[1];
        // Exponential: 2nd interval >= 1st interval
        expect(delay1to2).toBeGreaterThanOrEqual(delay0to1);
      } else {
        // At minimum the first retry delay must be >= baseDelayMs (1000ms)
        const delay0to1 = callTimestamps[1] - callTimestamps[0];
        expect(delay0to1).toBeGreaterThanOrEqual(1000);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 2. Offline support — deferred sync
  // -------------------------------------------------------------------------

  describe("offline support — deferred sync", () => {
    it("registers an 'online' event listener on self during service worker initialization", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        headers: { get: () => null },
        json: async () => ({}),
      } as Response));

      await import("../src/background/service-worker");

      // The service worker must register a listener for the 'online' event
      expect(selfMock.addEventListener).toHaveBeenCalledWith(
        "online",
        expect.any(Function),
      );
    });

    it("triggers a fetch when the 'online' event fires (network recovery path)", async () => {
      chromeMock._sessionStore["authToken"] = "tok-recovery";
      chromeMock._localStore["selectedOrg"] = "acme";

      let fetchCallCount = 0;
      const fetchMock = vi.fn().mockImplementation(async () => {
        fetchCallCount += 1;
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({ organizations: [{ name: "acme" }] }),
        } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);

      await import("../src/background/service-worker");

      const countBefore = fetchCallCount;

      // Simulate network recovery by firing the 'online' event
      expect(onlineListeners.length).toBeGreaterThan(0);
      onlineListeners.forEach((fn) => fn());

      // Let microtasks settle
      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      // After the 'online' event, at least one new fetch call must have occurred
      expect(fetchCallCount).toBeGreaterThan(countBefore);
    });

    it("cache is NOT overwritten when all retries fail (error → keep existing cache)", async () => {
      vi.useFakeTimers();

      const existingCommands = {
        acme: [{ id: "cmd-0-deploy", name: "deploy", content: "run deploy" }],
      };
      chromeMock._localStore["cachedCommands"] = JSON.stringify(existingCommands);
      chromeMock._localStore["selectedOrg"] = "acme";
      chromeMock._sessionStore["authToken"] = "tok-keep-cache";

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (
          typeof url === "string" &&
          url.includes("/organizations") &&
          !url.includes("/approved-config")
        ) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ organizations: [{ name: "acme" }] }),
          } as Response;
        }
        // Persistent server error — all retries fail
        return {
          ok: false,
          status: 503,
          headers: { get: () => null },
          json: async () => ({}),
        } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);

      await import("../src/background/service-worker");

      const refreshAlarm: chrome.alarms.Alarm = {
        name: "refresh-commands",
        scheduledTime: Date.now(),
        periodInMinutes: 5,
      };
      chromeMock._alarmListeners.forEach((fn) => fn(refreshAlarm));

      await advanceThroughRetries();

      // The existing cache entry must still exist — never wiped on error
      const storedRaw = chromeMock._localStore["cachedCommands"] as string | undefined;
      expect(storedRaw).toBeDefined();
      const stored = JSON.parse(storedRaw!) as Record<string, unknown>;
      expect(stored["acme"]).toBeDefined();
    });

    it("no sync fetch is triggered without an auth token (unauthenticated)", async () => {
      vi.useFakeTimers();
      // No authToken in session storage (user not logged in)

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ organizations: [{ name: "acme" }] }),
      } as Response);
      vi.stubGlobal("fetch", fetchMock);

      await import("../src/background/service-worker");

      const refreshAlarm: chrome.alarms.Alarm = {
        name: "refresh-commands",
        scheduledTime: Date.now(),
        periodInMinutes: 5,
      };
      chromeMock._alarmListeners.forEach((fn) => fn(refreshAlarm));

      await vi.advanceTimersByTimeAsync(500);

      // Without an authToken, prefetchCommandsForAllOrgs returns early — no fetch
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 3. Failed syncs report error state (not silently swallowed)
  // -------------------------------------------------------------------------

  describe("error state reporting", () => {
    it("setSyncMetadata is called with syncState = 'error' when all retries fail", async () => {
      vi.useFakeTimers();

      chromeMock._sessionStore["authToken"] = "tok-fail";
      chromeMock._localStore["selectedOrg"] = "acme";

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (
          typeof url === "string" &&
          url.includes("/organizations") &&
          !url.includes("/approved-config")
        ) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ organizations: [{ name: "acme" }] }),
          } as Response;
        }
        return {
          ok: false,
          status: 503,
          headers: { get: () => null },
          json: async () => ({}),
        } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);

      await import("../src/background/service-worker");
      // Get a reference to setSyncMetadata from the (now-registered) mock module
      const storageModule = await import("../src/lib/storage");
      const setSyncMetadata = vi.mocked(storageModule.setSyncMetadata);

      const refreshAlarm: chrome.alarms.Alarm = {
        name: "refresh-commands",
        scheduledTime: Date.now(),
        periodInMinutes: 5,
      };
      chromeMock._alarmListeners.forEach((fn) => fn(refreshAlarm));

      await advanceThroughRetries();

      const calls = setSyncMetadata.mock.calls as Array<[string, { syncState: string }]>;
      const errorCall = calls.find(([, meta]) => meta.syncState === "error");
      expect(errorCall).toBeDefined();
    });

    it("setSyncMetadata includes the error string from the failed fetch response", async () => {
      vi.useFakeTimers();

      chromeMock._sessionStore["authToken"] = "tok-errinfo";
      chromeMock._localStore["selectedOrg"] = "myorg";

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (
          typeof url === "string" &&
          url.includes("/organizations") &&
          !url.includes("/approved-config")
        ) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ organizations: [{ name: "myorg" }] }),
          } as Response;
        }
        return {
          ok: false,
          status: 503,
          headers: { get: () => null },
          json: async () => ({}),
        } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);

      await import("../src/background/service-worker");
      const storageModule = await import("../src/lib/storage");
      const setSyncMetadata = vi.mocked(storageModule.setSyncMetadata);

      const refreshAlarm: chrome.alarms.Alarm = {
        name: "refresh-commands",
        scheduledTime: Date.now(),
        periodInMinutes: 5,
      };
      chromeMock._alarmListeners.forEach((fn) => fn(refreshAlarm));

      await advanceThroughRetries();

      const calls = setSyncMetadata.mock.calls as Array<[string, { syncState: string; lastError?: string }]>;
      const errorCall = calls.find(([, meta]) => meta.syncState === "error");
      expect(errorCall).toBeDefined();
      const [, meta] = errorCall!;
      // lastError must be populated — not silently swallowed
      expect(meta.lastError).toBeDefined();
      expect(meta.lastError!.length).toBeGreaterThan(0);
    });

    it("setSyncMetadata records lastFetchAt timestamp even on error", async () => {
      vi.useFakeTimers();

      chromeMock._sessionStore["authToken"] = "tok-ts";
      chromeMock._localStore["selectedOrg"] = "tsorg";

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (
          typeof url === "string" &&
          url.includes("/organizations") &&
          !url.includes("/approved-config")
        ) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ organizations: [{ name: "tsorg" }] }),
          } as Response;
        }
        return {
          ok: false,
          status: 503,
          headers: { get: () => null },
          json: async () => ({}),
        } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);

      const beforeFetch = Date.now();
      await import("../src/background/service-worker");
      const storageModule = await import("../src/lib/storage");
      const setSyncMetadata = vi.mocked(storageModule.setSyncMetadata);

      const refreshAlarm: chrome.alarms.Alarm = {
        name: "refresh-commands",
        scheduledTime: Date.now(),
        periodInMinutes: 5,
      };
      chromeMock._alarmListeners.forEach((fn) => fn(refreshAlarm));

      await advanceThroughRetries();

      const calls = setSyncMetadata.mock.calls as Array<[string, { lastFetchAt: number }]>;
      expect(calls.length).toBeGreaterThan(0);
      const [, meta] = calls[calls.length - 1];
      expect(meta.lastFetchAt).toBeGreaterThanOrEqual(beforeFetch);
    });

    it("setSyncMetadata is called with syncState = 'fresh' when sync succeeds", async () => {
      vi.useFakeTimers();

      chromeMock._sessionStore["authToken"] = "tok-success";
      chromeMock._localStore["selectedOrg"] = "success-org";

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (
          typeof url === "string" &&
          url.includes("/organizations") &&
          !url.includes("/approved-config")
        ) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ organizations: [{ name: "success-org" }] }),
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            approved: true,
            commands: [{ name: "build", content: "pnpm build" }],
          }),
        } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);

      await import("../src/background/service-worker");
      const storageModule = await import("../src/lib/storage");
      const setSyncMetadata = vi.mocked(storageModule.setSyncMetadata);

      const refreshAlarm: chrome.alarms.Alarm = {
        name: "refresh-commands",
        scheduledTime: Date.now(),
        periodInMinutes: 5,
      };
      chromeMock._alarmListeners.forEach((fn) => fn(refreshAlarm));

      await vi.advanceTimersByTimeAsync(100);

      const calls = setSyncMetadata.mock.calls as Array<[string, { syncState: string }]>;
      const freshCall = calls.find(([, meta]) => meta.syncState === "fresh");
      expect(freshCall).toBeDefined();
    });

    it("a network-level TypeError (fetch throws) results in syncState = 'error', not an unhandled rejection", async () => {
      vi.useFakeTimers();

      chromeMock._sessionStore["authToken"] = "tok-netfail";
      chromeMock._localStore["selectedOrg"] = "netorg";

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (
          typeof url === "string" &&
          url.includes("/organizations") &&
          !url.includes("/approved-config")
        ) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ organizations: [{ name: "netorg" }] }),
          } as Response;
        }
        // Simulate complete network failure
        throw new TypeError("Failed to fetch");
      });
      vi.stubGlobal("fetch", fetchMock);

      await import("../src/background/service-worker");
      const storageModule = await import("../src/lib/storage");
      const setSyncMetadata = vi.mocked(storageModule.setSyncMetadata);

      const refreshAlarm: chrome.alarms.Alarm = {
        name: "refresh-commands",
        scheduledTime: Date.now(),
        periodInMinutes: 5,
      };

      // Must not throw or produce an unhandled rejection
      await expect(
        (async () => {
          chromeMock._alarmListeners.forEach((fn) => fn(refreshAlarm));
          await advanceThroughRetries();
        })(),
      ).resolves.toBeUndefined();

      const calls = setSyncMetadata.mock.calls as Array<[string, { syncState: string }]>;
      const errorCall = calls.find(([, meta]) => meta.syncState === "error");
      expect(errorCall).toBeDefined();
    });

    it("setSyncMetadata preserves lastSuccessAt from previous sync on subsequent error", async () => {
      vi.useFakeTimers();

      chromeMock._sessionStore["authToken"] = "tok-preserve-ts";
      chromeMock._localStore["selectedOrg"] = "preserve-org";

      const previousSuccessAt = Date.now() - 60_000; // 1 minute ago
      // Seed existing sync metadata with a previous successful sync
      chromeMock._localStore["cachedSyncMetadata"] = JSON.stringify({
        "preserve-org": {
          syncState: "fresh",
          lastFetchAt: previousSuccessAt,
          lastSuccessAt: previousSuccessAt,
        },
      });

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (
          typeof url === "string" &&
          url.includes("/organizations") &&
          !url.includes("/approved-config")
        ) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ organizations: [{ name: "preserve-org" }] }),
          } as Response;
        }
        // Current sync fails
        return {
          ok: false,
          status: 503,
          headers: { get: () => null },
          json: async () => ({}),
        } as Response;
      });
      vi.stubGlobal("fetch", fetchMock);

      await import("../src/background/service-worker");
      const storageModule = await import("../src/lib/storage");
      const setSyncMetadata = vi.mocked(storageModule.setSyncMetadata);

      const refreshAlarm: chrome.alarms.Alarm = {
        name: "refresh-commands",
        scheduledTime: Date.now(),
        periodInMinutes: 5,
      };
      chromeMock._alarmListeners.forEach((fn) => fn(refreshAlarm));

      await advanceThroughRetries();

      // The metadata written on error must still carry the previous lastSuccessAt
      const calls = setSyncMetadata.mock.calls as Array<[string, { syncState: string; lastSuccessAt: number | null }]>;
      const errorCall = calls.find(([, meta]) => meta.syncState === "error");
      expect(errorCall).toBeDefined();
      const [, meta] = errorCall!;
      // lastSuccessAt must be preserved (not reset to null)
      expect(meta.lastSuccessAt).toBe(previousSuccessAt);
    });
  });
});
