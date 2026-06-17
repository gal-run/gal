import { afterEach, describe, expect, it, vi } from "vitest";

describe("context guard", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("marks the content-script context invalid and runs cleanup callbacks on port disconnect", async () => {
    let disconnectListener: (() => void) | undefined;

    vi.stubGlobal("chrome", {
      runtime: {
        id: "ext-id",
        connect: vi.fn(() => ({
          onDisconnect: {
            addListener(cb: () => void) {
              disconnectListener = cb;
            },
          },
        })),
      },
    });

    const contextGuard = await import("../src/content/context-guard");
    const cleanup = vi.fn();

    contextGuard.onContextInvalidated(cleanup);

    expect(contextGuard.isContextValid()).toBe(true);
    expect(disconnectListener).toBeTypeOf("function");

    disconnectListener?.();

    expect(contextGuard.isContextValid()).toBe(false);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("invalidates immediately when chrome.runtime.connect throws on startup", async () => {
    vi.stubGlobal("chrome", {
      runtime: {
        id: "ext-id",
        connect: vi.fn(() => {
          throw new Error("Extension context invalidated.");
        }),
      },
    });

    const contextGuard = await import("../src/content/context-guard");
    const cleanup = vi.fn();

    contextGuard.onContextInvalidated(cleanup);

    expect(contextGuard.isContextValid()).toBe(false);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
