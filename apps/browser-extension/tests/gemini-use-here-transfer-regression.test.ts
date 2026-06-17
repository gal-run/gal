import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const assetClipboardSource = readFileSync(
  join(__dirname, "../src/content/asset-clipboard.ts"),
  "utf8",
);

describe("Gemini 'Use here' transfer compatibility", () => {
  it("supports non-boolean contenteditable targets used by Gemini composer variants", () => {
    expect(assetClipboardSource).toContain('[contenteditable]:not([contenteditable="false"])');
    expect(assetClipboardSource).toContain('rich-textarea [contenteditable]');
    expect(assetClipboardSource).toContain('"rich-textarea"');
    expect(assetClipboardSource).toContain('[role="textbox"]');
  });

  it("includes textarea fallback selectors for Gemini message inputs", () => {
    expect(assetClipboardSource).toContain('textarea[aria-label*="message" i]');
    expect(assetClipboardSource).toContain('textarea[placeholder*="message" i]');
  });

  it("searches open shadow roots to find Gemini editors rendered inside web components", () => {
    expect(assetClipboardSource).toContain("function findOpenShadowRoots");
    expect(assetClipboardSource).toContain("active.shadowRoot");
    expect(assetClipboardSource).toContain("SHADOW_PASTE_TARGET_SELECTORS");
  });
});
