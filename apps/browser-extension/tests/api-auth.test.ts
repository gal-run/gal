import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureExceptionWithTags = vi.fn();
const clearUserSession = vi.fn();
const getSessionData = vi.fn();

vi.mock("../src/lib/sentry", () => ({
  captureExceptionWithTags,
}));

vi.mock("../src/lib/storage", () => ({
  clearUserSession,
  getSessionData,
}));

describe("startGitHubAuth", () => {
  const addStorageListener = vi.fn();
  const removeStorageListener = vi.fn();
  const sendMessage = vi.fn();
  const localGet = vi.fn();
  const localRemove = vi.fn();
  let storageListener:
    | ((changes: { [key: string]: chrome.storage.StorageChange }, area: string) => void)
    | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
    vi.stubGlobal("fetch", vi.fn());

    storageListener = undefined;
    addStorageListener.mockImplementation((listener) => {
      storageListener = listener;
    });

    const chromeMock = {
      runtime: {
        id: "ext-test-123",
        sendMessage,
      },
      storage: {
        local: {
          get: localGet,
          remove: localRemove,
        },
        onChanged: {
          addListener: addStorageListener,
          removeListener: removeStorageListener,
        },
      },
    };

    vi.stubGlobal("chrome", chromeMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("derives authenticated=true from a non-null /auth/status user", async () => {
    getSessionData.mockImplementation(async (key: string) =>
      key === "authToken" ? "tok-123" : null,
    );
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        configured: true,
        user: {
          id: "user-123",
          login: "testuser",
          githubId: 48866801,
          isAdmin: true,
        },
      }),
    } as Response);

    const { checkAuthStatus } = await import("../src/lib/api");

    await expect(checkAuthStatus()).resolves.toEqual({
      authenticated: true,
      configured: true,
      user: {
        id: "user-123",
        login: "testuser",
        githubId: 48866801,
        isAdmin: true,
      },
    });
  });

  it("returns service-worker auth errors from storage changes", async () => {
    localGet.mockResolvedValue({});
    localRemove.mockResolvedValue(undefined);
    sendMessage.mockResolvedValue(undefined);

    const { startGitHubAuth } = await import("../src/lib/api");
    const authPromise = startGitHubAuth();

    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: "START_GITHUB_AUTH" });
    });

    expect(localRemove).toHaveBeenCalledWith(["galAuthComplete", "galAuthError"]);
    expect(storageListener).toBeTypeOf("function");

    storageListener?.(
      {
        galAuthError: {
          oldValue: undefined,
          newValue: "The requested redirect URI is not allowed.",
        },
      },
      "local",
    );

    await expect(authPromise).resolves.toEqual({
      success: false,
      error: "The requested redirect URI is not allowed.",
    });
    // The waitForAuthResult function reports auth errors to Sentry
    expect(captureExceptionWithTags).toHaveBeenCalledTimes(1);
    const [error, tags] = captureExceptionWithTags.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "The requested redirect URI is not allowed.",
    );
    expect(tags).toEqual({
      extension_id: "ext-test-123",
      error_message: "The requested redirect URI is not allowed.",
      request_id: undefined,
    });
  });

  it("captures popup-side failures when auth never completes", async () => {
    vi.useFakeTimers();
    localGet.mockResolvedValue({});
    localRemove.mockResolvedValue(undefined);
    sendMessage.mockResolvedValue(undefined);

    const { startGitHubAuth } = await import("../src/lib/api");
    const authPromise = startGitHubAuth();

    await vi.advanceTimersByTimeAsync(60000);

    await expect(authPromise).resolves.toEqual({
      success: false,
      error: "Timed out waiting for GitHub auth to complete",
    });
    expect(removeStorageListener).toHaveBeenCalledTimes(1);
    expect(captureExceptionWithTags).toHaveBeenCalledTimes(1);
    const [error, tags] = captureExceptionWithTags.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Timed out waiting for GitHub auth to complete",
    );
    expect(tags).toEqual({
      extension_id: "ext-test-123",
      error_message: "Timed out waiting for GitHub auth to complete",
      request_id: undefined,
    });
  });
});
