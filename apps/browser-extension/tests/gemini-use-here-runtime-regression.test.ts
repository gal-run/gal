// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __testHooks } from "../src/content/asset-clipboard";

const { findClipboardPasteTarget, transferViaClipboardPaste } = __testHooks;

class MockDataTransfer {
  files: File[] = [];
  items = {
    add: (file: File) => {
      this.files.push(file);
      return file;
    },
  };
}

class MockClipboardEvent extends Event {
  clipboardData: MockDataTransfer | null;

  constructor(type: string, init?: EventInit & { clipboardData?: MockDataTransfer }) {
    super(type, init);
    this.clipboardData = init?.clipboardData ?? null;
  }
}

class MockClipboardItem {
  constructor(public readonly items: Record<string, Blob>) {}
}

function markVisible(el: HTMLElement, width = 320, height = 48): void {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ width, height }) as DOMRect,
  });
}

describe("Gemini runtime 'Use here' regressions", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.stubGlobal("DataTransfer", MockDataTransfer);
    vi.stubGlobal("ClipboardEvent", MockClipboardEvent);
    vi.stubGlobal("ClipboardItem", MockClipboardItem);
    vi.spyOn(window, "getComputedStyle").mockReturnValue({
      display: "block",
      visibility: "visible",
      opacity: "1",
    } as CSSStyleDeclaration);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prefers Gemini's inner light-DOM .ql-editor over the rich-textarea host", () => {
    const host = document.createElement("rich-textarea");
    const editor = document.createElement("div");
    editor.className = "ql-editor";
    editor.setAttribute("contenteditable", "plaintext-only");
    host.appendChild(editor);
    document.body.appendChild(host);

    markVisible(host);
    markVisible(editor);

    expect(findClipboardPasteTarget()).toBe(editor);
  });

  it("continues dispatching the synthetic paste when clipboard.write is denied", async () => {
    const host = document.createElement("rich-textarea");
    const editor = document.createElement("div");
    editor.className = "ql-editor";
    editor.setAttribute("contenteditable", "true");
    editor.focus = vi.fn();
    host.appendChild(editor);
    document.body.appendChild(host);

    markVisible(host);
    markVisible(editor);

    const write = vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { write },
    });

    const dispatchEvent = vi.spyOn(editor, "dispatchEvent");

    const ok = await transferViaClipboardPaste(new Blob(["image"], { type: "image/png" }));

    expect(ok).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0]?.[0].type).toBe("paste");
  });
});
