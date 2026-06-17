import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __testHooks } from "../src/content/asset-clipboard";

type MockImageOptions = {
  src?: string;
  currentSrc?: string;
  alt?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  rectWidth?: number;
  rectHeight?: number;
  closest?: (selector: string) => Element | null;
};

function makeImage(options: MockImageOptions = {}): HTMLImageElement {
  const {
    src = "https://lh3.googleusercontent.com/generated-image.png",
    currentSrc = "",
    alt = "",
    naturalWidth = 1024,
    naturalHeight = 768,
    rectWidth = 1024,
    rectHeight = 768,
    closest = () => null,
  } = options;

  return {
    src,
    currentSrc,
    naturalWidth,
    naturalHeight,
    closest,
    getAttribute: (name: string) => {
      if (name === "alt") return alt;
      if (name === "src") return src;
      return null;
    },
    getBoundingClientRect: () =>
      ({ width: rectWidth, height: rectHeight }) as DOMRect,
  } as unknown as HTMLImageElement;
}

describe("regression — save overlay hide toggle wiring", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("subscribes to sync preference changes and hides/re-shows existing overlays", async () => {
    const buttons = [
      { style: { display: "" } },
      { style: { display: "" } },
    ] as unknown as HTMLElement[];

    const documentMock = {
      head: { appendChild: vi.fn() },
      body: {},
      getElementById: vi.fn().mockReturnValue(null),
      createElement: vi.fn(() => ({ id: "", style: {}, textContent: "" })),
      querySelectorAll: vi.fn((selector: string) => {
        if (selector === ".gal-clipboard-save-btn") return buttons;
        return [];
      }),
    } as unknown as Document;

    const syncListeners: Array<(changes: Record<string, { newValue: unknown }>) => void> = [];
    const syncGet = vi.fn().mockResolvedValue({ inFieldButtonDisabled: false });

    vi.stubGlobal("document", documentMock);
    vi.stubGlobal("MutationObserver", class {
      observe = vi.fn();
    });
    vi.stubGlobal("chrome", {
      storage: {
        sync: {
          get: syncGet,
          onChanged: {
            addListener: (listener: (changes: Record<string, { newValue: unknown }>) => void) => {
              syncListeners.push(listener);
            },
          },
        },
      },
    });

    const { initAssetClipboard } = await import("../src/content/asset-clipboard");
    await initAssetClipboard("gemini");

    expect(syncGet).toHaveBeenCalledWith("inFieldButtonDisabled");
    expect(syncListeners).toHaveLength(1);
    expect(buttons.every((btn) => btn.style.display === "inline-flex")).toBe(true);

    syncListeners[0]({ inFieldButtonDisabled: { newValue: true } });
    expect(buttons.every((btn) => btn.style.display === "none")).toBe(true);

    syncListeners[0]({ inFieldButtonDisabled: { newValue: false } });
    expect(buttons.every((btn) => btn.style.display === "inline-flex")).toBe(true);
  });
});

describe("regression — gemini image relevance targeting", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      getComputedStyle: () =>
        ({
          display: "block",
          visibility: "visible",
          pointerEvents: "auto",
        }) as CSSStyleDeclaration,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("accepts large generated Gemini images and keeps them injection-eligible", () => {
    const image = makeImage({
      src: "https://lh3.googleusercontent.com/generated-apple.png",
    });

    expect(__testHooks.isRelevantGeneratedImage(image, "gemini")).toBe(true);
    expect(__testHooks.isImageInjectionCandidate(image)).toBe(true);
  });

  it("rejects nav/header chrome images even if source URL looks valid", () => {
    const image = makeImage({
      src: "https://lh3.googleusercontent.com/generated-apple.png",
      closest: (selector) => (selector.includes("header") ? ({} as Element) : null),
    });

    expect(__testHooks.isRelevantGeneratedImage(image, "gemini")).toBe(false);
    expect(__testHooks.isImageInjectionCandidate(image)).toBe(false);
  });

  it("rejects non-generated sources and avatar/icon-like alt text", () => {
    const nonGenerated = makeImage({ src: "https://example.com/image.png" });
    const avatarLike = makeImage({
      src: "https://lh3.googleusercontent.com/user-avatar.png",
      alt: "User Avatar",
    });

    expect(__testHooks.isRelevantGeneratedImage(nonGenerated, "gemini")).toBe(false);
    expect(__testHooks.isRelevantGeneratedImage(avatarLike, "gemini")).toBe(false);
  });
});
