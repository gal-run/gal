import { beforeEach, describe, expect, it, vi } from "vitest";

const captureExceptionWithTags = vi.fn();
const initSentry = vi.fn();
const storeUserSession = vi.fn();

vi.mock("../src/lib/sentry", () => ({
  captureExceptionWithTags,
  initSentry,
}));

vi.mock("../src/lib/storage", () => ({
  storeUserSession,
}));

describe("handleGitHubAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());

    const chromeMock = {
      identity: {
        getRedirectURL: vi
          .fn()
          .mockReturnValue("https://ext.chromiumapp.org/github-callback"),
        launchWebAuthFlow: vi.fn(),
      },
      runtime: {
        id: "ext-test-123",
        lastError: undefined,
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
        onSuspend: { addListener: vi.fn() },
        onStartup: { addListener: vi.fn() },
      },
      storage: {
        local: {
          set: vi.fn(),
        },
        session: {
          set: vi.fn(),
          get: vi.fn().mockResolvedValue({}),
          setAccessLevel: vi.fn(),
        },
      },
      tabs: {
        create: vi.fn(),
        query: vi.fn().mockResolvedValue([]),
        sendMessage: vi.fn(),
        get: vi.fn().mockResolvedValue({}),
        onActivated: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
      },
      action: {
        openPopup: vi.fn().mockResolvedValue(undefined),
      },
      alarms: {
        create: vi.fn(),
        clear: vi.fn().mockResolvedValue(true),
        onAlarm: { addListener: vi.fn() },
      },
      commands: {
        onCommand: { addListener: vi.fn() },
      },
    };

    vi.stubGlobal("chrome", chromeMock);
    // Service workers use `self` for event listeners (online/offline)
    vi.stubGlobal("self", { addEventListener: vi.fn() });
  });

  it("captures tagged auth-init failures in the service worker", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      headers: {
        get: (name: string) =>
          name.toLowerCase() === "x-request-id" ? "req-123" : null,
      },
      json: async () => ({
        error: "The requested redirect URI is not allowed.",
      }),
    } as Response);

    const { handleGitHubAuth } = await import("../src/background/service-worker");

    await handleGitHubAuth();

    expect(initSentry).toHaveBeenCalledTimes(1);
    expect(captureExceptionWithTags).toHaveBeenCalledTimes(1);
    const [error, tags] = captureExceptionWithTags.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "The requested redirect URI is not allowed.",
    );
    expect(tags).toEqual({
      extension_id: "ext-test-123",
      error_message: "The requested redirect URI is not allowed.",
      request_id: "req-123",
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      galAuthError: "The requested redirect URI is not allowed.",
    });
  });

  it("reports chrome.runtime.lastError from launchWebAuthFlow", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        authUrl: "https://github.com/login/oauth/authorize?client_id=test",
      }),
    } as Response);

    vi.mocked(chrome.identity.launchWebAuthFlow).mockImplementation(
      (_options, callback) => {
        setTimeout(() => {
          // Simulate chrome.runtime.lastError being set inside the callback
          Object.defineProperty(chrome.runtime, "lastError", {
            value: { message: "The user did not approve access." },
            writable: true,
            configurable: true,
          });
          callback(undefined);
          // Reset lastError after callback (mimics Chrome behavior)
          Object.defineProperty(chrome.runtime, "lastError", {
            value: undefined,
            writable: true,
            configurable: true,
          });
        }, 0);
      },
    );

    const { handleGitHubAuth } = await import("../src/background/service-worker");

    await handleGitHubAuth();

    expect(captureExceptionWithTags).toHaveBeenCalled();
    const [error] = captureExceptionWithTags.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("The user did not approve access.");
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      galAuthError: "The user did not approve access.",
    });
  });

  it("waits for the OAuth callback before resolving", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        authUrl: "https://github.com/login/oauth/authorize?client_id=test",
      }),
    } as Response);

    vi.mocked(chrome.identity.launchWebAuthFlow).mockImplementation(
      (_options, callback) => {
        setTimeout(() => {
          callback(
            "https://ext.chromiumapp.org/github-callback?token=tok-123&userId=user-123&login=testuser",
          );
        }, 0);
      },
    );

    const { handleGitHubAuth } = await import("../src/background/service-worker");

    await handleGitHubAuth();

    expect(storeUserSession).toHaveBeenCalledWith({
      authToken: "tok-123",
      userId: "user-123",
      userLogin: "testuser",
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      galAuthComplete: true,
    });
  });
});
