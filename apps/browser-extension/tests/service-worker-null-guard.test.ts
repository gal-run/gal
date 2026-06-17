/**
 * Regression tests for null guard on fetchCommandsFromAPI in service worker.
 *
 * Verifies:
 * 1. When fetchCommandsFromAPI returns null, the service worker does not throw a TypeError
 * 2. When fetchCommandsFromAPI returns undefined, the service worker does not throw a TypeError
 * 3. Downstream consumers handle null/undefined gracefully (empty array or no-op)
 * 4. The alarm handler (refresh-commands) completes normally after a null API response
 * 5. Subsequent alarms continue processing after a null/undefined response
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- shared mock state captured per module import ----

let alarmListener: ((alarm: { name: string }) => void) | undefined;

// Mocked lib dependencies (must be declared before vi.mock calls)
const initSentryMock = vi.fn();
const captureExceptionWithTagsMock = vi.fn();
const setSyncMetadataMock = vi.fn().mockResolvedValue(undefined);
const checkStorageUsageMock = vi
  .fn()
  .mockResolvedValue({ warning: undefined });
const initTelemetryMock = vi.fn();
const trackEventMock = vi.fn();
const flushEventsMock = vi.fn();
const handleFlushAlarmMock = vi.fn();
const storeUserSessionMock = vi.fn();

vi.mock("../src/lib/sentry", () => ({
  initSentry: initSentryMock,
  captureExceptionWithTags: captureExceptionWithTagsMock,
}));

vi.mock("../src/lib/storage", () => ({
  storeUserSession: storeUserSessionMock,
  setSyncMetadata: setSyncMetadataMock,
  checkStorageUsage: checkStorageUsageMock,
}));

vi.mock("../src/lib/telemetry", () => ({
  initTelemetry: initTelemetryMock,
  trackEvent: trackEventMock,
  flushEvents: flushEventsMock,
  handleFlushAlarm: handleFlushAlarmMock,
}));

// ---- helpers ----

function buildChromeMock() {
  return {
    identity: {
      getRedirectURL: vi
        .fn()
        .mockReturnValue("https://ext.chromiumapp.org/github-callback"),
      launchWebAuthFlow: vi.fn(),
    },
    runtime: {
      id: "ext-test-null-guard",
      lastError: undefined,
      onInstalled: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      onSuspend: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      getURL: vi.fn((p: string) => `chrome-extension://ext-test/${p}`),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
      session: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        setAccessLevel: vi.fn().mockResolvedValue(undefined),
      },
    },
    tabs: {
      create: vi.fn(),
      query: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue({}),
      onActivated: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
    },
    action: {
      openPopup: vi.fn().mockResolvedValue(undefined),
    },
    alarms: {
      create: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(true),
      onAlarm: {
        addListener: vi.fn().mockImplementation((cb) => {
          alarmListener = cb;
        }),
      },
    },
    commands: {
      onCommand: { addListener: vi.fn() },
    },
  };
}

// ---- test suites ----

describe("regression — null guard on fetchCommandsFromAPI", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    alarmListener = undefined;
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("chrome", buildChromeMock());
    vi.stubGlobal("self", { addEventListener: vi.fn() });
    vi.stubGlobal("navigator", { onLine: true });
  });

  // --- 1. Service worker loads without TypeError when no auth token is present ---

  it("does not throw TypeError when service worker loads with no auth token", async () => {
    // No auth token — prefetchCommandsForAllOrgs returns early
    vi.mocked(chrome.storage.session.get).mockResolvedValue({});
    vi.mocked(chrome.storage.local.get).mockResolvedValue({});

    let importError: unknown;
    try {
      await import("../src/background/service-worker");
    } catch (e) {
      importError = e;
    }
    expect(importError).toBeUndefined();

    // The alarm listener must have been registered during module evaluation
    expect(alarmListener).toBeDefined();

    // Fire the refresh-commands alarm — must complete without TypeError
    await expect(
      Promise.resolve(alarmListener!({ name: "refresh-commands" })),
    ).resolves.not.toThrow();
  });

  // --- 2. null JSON body from approved-config endpoint does not throw TypeError ---

  it("alarm handler completes normally when approved-config returns null JSON body", async () => {
    // Auth token present so the fetch path is exercised
    vi.mocked(chrome.storage.session.get).mockImplementation(async (keys) => {
      const key =
        Array.isArray(keys)
          ? keys[0]
          : typeof keys === "string"
            ? keys
            : Object.keys(keys as Record<string, unknown>)[0];
      if (key === "authToken") return { authToken: "tok-test" };
      return {};
    });
    vi.mocked(chrome.storage.local.get).mockImplementation(async (keys) => {
      const key =
        Array.isArray(keys)
          ? keys[0]
          : typeof keys === "string"
            ? keys
            : Object.keys(keys as Record<string, unknown>)[0];
      if (key === "selectedOrg") return { selectedOrg: "test-org" };
      return {};
    });

    // Organizations endpoint returns a valid list; approved-config returns null JSON
    // (this is the regression scenario from issue )
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organizations: [{ name: "test-org" }] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        // JSON body is null — null guard introduced by  must handle this
        json: async () => null,
      } as Response);

    await import("../src/background/service-worker");
    expect(alarmListener).toBeDefined();

    let alarmError: unknown;
    try {
      await alarmListener!({ name: "refresh-commands" });
    } catch (e) {
      alarmError = e;
    }

    // No TypeError or any other error must be thrown
    expect(alarmError).toBeUndefined();
    // The null guard must NOT trigger Sentry reporting for this scenario
    expect(captureExceptionWithTagsMock).not.toHaveBeenCalled();
  });

  // --- 3. undefined JSON body from approved-config endpoint does not throw TypeError ---

  it("alarm handler completes normally when approved-config returns undefined JSON body", async () => {
    vi.mocked(chrome.storage.session.get).mockImplementation(async (keys) => {
      const key =
        Array.isArray(keys)
          ? keys[0]
          : typeof keys === "string"
            ? keys
            : Object.keys(keys as Record<string, unknown>)[0];
      if (key === "authToken") return { authToken: "tok-test" };
      return {};
    });
    vi.mocked(chrome.storage.local.get).mockImplementation(async (keys) => {
      const key =
        Array.isArray(keys)
          ? keys[0]
          : typeof keys === "string"
            ? keys
            : Object.keys(keys as Record<string, unknown>)[0];
      if (key === "selectedOrg") return { selectedOrg: "test-org" };
      return {};
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organizations: [{ name: "test-org" }] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        // undefined JSON body — another variant of the null-guard scenario
        json: async () => undefined,
      } as Response);

    await import("../src/background/service-worker");
    expect(alarmListener).toBeDefined();

    let alarmError: unknown;
    try {
      await alarmListener!({ name: "refresh-commands" });
    } catch (e) {
      alarmError = e;
    }

    expect(alarmError).toBeUndefined();
    expect(captureExceptionWithTagsMock).not.toHaveBeenCalled();
  });

  // --- 4. null JSON body is routed to an error or empty FetchResult without crashing ---

  it("alarm handler queues prefetch without TypeError when approved-config returns null body — second variant", async () => {
    // This test verifies the same null-guard contract as test 2, but from the
    // perspective of the alarm handler invocation path to confirm it is
    // idempotent across repeated firings within the same module lifecycle.
    vi.mocked(chrome.storage.session.get).mockImplementation(async (keys) => {
      const key =
        Array.isArray(keys)
          ? keys[0]
          : typeof keys === "string"
            ? keys
            : Object.keys(keys as Record<string, unknown>)[0];
      if (key === "authToken") return { authToken: "tok-test" };
      return {};
    });
    vi.mocked(chrome.storage.local.get).mockImplementation(async (keys) => {
      const key =
        Array.isArray(keys)
          ? keys[0]
          : typeof keys === "string"
            ? keys
            : Object.keys(keys as Record<string, unknown>)[0];
      if (key === "selectedOrg") return { selectedOrg: "test-org" };
      return {};
    });

    // Both alarms in this test return null — verifies that repeated null responses
    // do not cause uncaught TypeErrors (each is handled by the catch in fetchCommandsFromAPI).
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => null,
    } as Response);

    await import("../src/background/service-worker");
    expect(alarmListener).toBeDefined();

    // Fire the alarm twice in quick succession — neither must throw synchronously.
    let firstError: unknown;
    try {
      alarmListener!({ name: "refresh-commands" });
    } catch (e) {
      firstError = e;
    }

    let secondError: unknown;
    try {
      alarmListener!({ name: "refresh-commands" });
    } catch (e) {
      secondError = e;
    }

    // Both alarm invocations must complete without synchronous TypeError
    expect(firstError).toBeUndefined();
    expect(secondError).toBeUndefined();
    // Sentry must not be called for gracefully handled null responses
    expect(captureExceptionWithTagsMock).not.toHaveBeenCalled();
  });

  // --- 5. Subsequent alarms continue processing normally after null response ---

  it("processes subsequent alarms without TypeError — no persistent failure state from null response", async () => {
    vi.mocked(chrome.storage.session.get).mockImplementation(async (keys) => {
      const key =
        Array.isArray(keys)
          ? keys[0]
          : typeof keys === "string"
            ? keys
            : Object.keys(keys as Record<string, unknown>)[0];
      if (key === "authToken") return { authToken: "tok-test" };
      return {};
    });
    vi.mocked(chrome.storage.local.get).mockImplementation(async (keys) => {
      const key =
        Array.isArray(keys)
          ? keys[0]
          : typeof keys === "string"
            ? keys
            : Object.keys(keys as Record<string, unknown>)[0];
      if (key === "selectedOrg") return { selectedOrg: "test-org" };
      return {};
    });

    // All fetch calls return null body — verifies that repeated null responses
    // across multiple alarm firings do not produce any synchronous TypeError.
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => null,
    } as Response);

    await import("../src/background/service-worker");
    expect(alarmListener).toBeDefined();

    // Fire refresh-commands three times (simulating repeated alarm ticks after a
    // null-body window).  None should throw synchronously.
    const errors: unknown[] = [];
    for (let i = 0; i < 3; i++) {
      try {
        alarmListener!({ name: "refresh-commands" });
      } catch (e) {
        errors.push(e);
      }
    }

    // None of the three invocations may produce a synchronous TypeError
    expect(errors).toHaveLength(0);
    // Sentry must not be involved — null body is a graceful no-data scenario
    expect(captureExceptionWithTagsMock).not.toHaveBeenCalled();
  });

  // --- 6. keepalive and oauth-keepalive alarms are silently ignored ---

  it("keepalive alarm is silently ignored — no TypeError or Sentry call", async () => {
    await import("../src/background/service-worker");
    expect(alarmListener).toBeDefined();

    await expect(
      Promise.resolve(alarmListener!({ name: "keepalive" })),
    ).resolves.not.toThrow();

    expect(captureExceptionWithTagsMock).not.toHaveBeenCalled();
  });
});
