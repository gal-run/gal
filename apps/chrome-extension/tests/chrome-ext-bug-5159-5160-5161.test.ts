/**
 * Regression tests for chrome extension bugs,, and.
 *
 * — Save to GAL button injected into page nav/header (Gemini avatar images)
 * — 'Use here' fails on Gemini (editor detection too narrow)
 * — Hide toggle not respected + missing on correct images
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { __testHooks } from "../src/content/asset-clipboard";

const assetClipboardSource = readFileSync(join(__dirname, "../src/content/asset-clipboard.ts"),
 "utf8",);

type MockImageOptions = {
 src?: string;
 alt?: string;
 naturalWidth?: number;
 naturalHeight?: number;
 rectWidth?: number;
 rectHeight?: number;
 closest?: (selector: string) => Element | null;
 getAttribute?: (name: string) => string | null;
};

function makeImage(options: MockImageOptions = {}): HTMLImageElement {
 const {
 src = "https://lh3.googleusercontent.com/generated.png",
 alt = "",
 naturalWidth = 512,
 naturalHeight = 512,
 rectWidth = 512,
 rectHeight = 512,
 closest = () => null,
 } = options;

 const getAttribute = options.getAttribute ?? ((name: string) => {
 if (name === "alt") return alt;
 if (name === "src") return src;
 return null;
 });

 return {
 src,
 currentSrc: "",
 naturalWidth,
 naturalHeight,
 closest,
 getAttribute,
 getBoundingClientRect: () =>
 ({ width: rectWidth, height: rectHeight }) as DOMRect,
 } as unknown as HTMLImageElement;
}

// ---------------------------------------------------------------------------
// — Save to GAL button must NOT appear in nav/header containers
// ---------------------------------------------------------------------------

describe(" — Gemini nav/header injection guard", () => {
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

 it("PAGE_CHROME_CONTAINER_SELECTOR covers all required nav/chrome containers", () => {
 const sel = __testHooks.PAGE_CHROME_CONTAINER_SELECTOR;
 expect(sel).toContain("header");
 expect(sel).toContain("nav");
 expect(sel).toContain('[role="banner"]');
 expect(sel).toContain('[role="navigation"]');
 expect(sel).toContain('[role="toolbar"]');
 expect(sel).toContain('[aria-label*="navigation" i]');
 expect(sel).toContain('[aria-label*="toolbar" i]');
 });

 it("rejects a googleusercontent avatar inside a <header> element", () => {
 const avatarInHeader = makeImage({
 src: "https://lh3.googleusercontent.com/user-avatar.png",
 closest: (sel) => (sel.includes("header") ? ({} as Element) : null),
 });
 expect(__testHooks.isImageInjectionCandidate(avatarInHeader)).toBe(false);
 expect(__testHooks.isRelevantGeneratedImage(avatarInHeader, "gemini")).toBe(false);
 });

 it("rejects a googleusercontent image inside a [role='navigation'] container", () => {
 const imageInNav = makeImage({
 src: "https://lh3.googleusercontent.com/some-image.png",
 closest: (sel) => (sel.includes('[role="navigation"]') || sel.includes("[role='navigation']") ? ({} as Element) : null),
 });
 expect(__testHooks.isImageInjectionCandidate(imageInNav)).toBe(false);
 });

 it("rejects a googleusercontent image inside a [role='banner'] container", () => {
 const imageInBanner = makeImage({
 src: "https://lh3.googleusercontent.com/some-image.png",
 closest: (sel) => (sel.includes('[role="banner"]') ? ({} as Element) : null),
 });
 expect(__testHooks.isImageInjectionCandidate(imageInBanner)).toBe(false);
 });

 it("rejects small images that are likely avatars or icons (under MIN_IMAGE_DIMENSION_PX)", () => {
 const tinyImage = makeImage({
 src: "https://lh3.googleusercontent.com/avatar.png",
 naturalWidth: 48,
 naturalHeight: 48,
 rectWidth: 48,
 rectHeight: 48,
 });
 expect(__testHooks.isImageInjectionCandidate(tinyImage)).toBe(false);
 expect(__testHooks.MIN_IMAGE_DIMENSION_PX).toBeGreaterThanOrEqual(96);
 });

 it("accepts large generated Gemini image outputs outside page chrome", () => {
 const generated = makeImage({
 src: "https://lh3.googleusercontent.com/generated-output.png",
 });
 expect(__testHooks.isImageInjectionCandidate(generated)).toBe(true);
 expect(__testHooks.isRelevantGeneratedImage(generated, "gemini")).toBe(true);
 });

 it("rejects images with avatar-like alt text even if URL matches", () => {
 const avatarAlt = makeImage({
 src: "https://lh3.googleusercontent.com/profile.png",
 alt: "User Avatar",
 });
 expect(__testHooks.isRelevantGeneratedImage(avatarAlt, "gemini")).toBe(false);
 });

 it("rejects images with icon-like alt text", () => {
 const iconAlt = makeImage({
 src: "https://lh3.googleusercontent.com/icon.png",
 alt: "App Icon",
 });
 expect(__testHooks.isRelevantGeneratedImage(iconAlt, "gemini")).toBe(false);
 });
});

// ---------------------------------------------------------------------------
// — 'Use here' must work on Gemini editors (broad selector set)
// ---------------------------------------------------------------------------

describe(" — Gemini 'Use here' editor compatibility", () => {
 it("PASTE_TARGET_SELECTORS includes rich-textarea for Gemini host element", () => {
 expect(assetClipboardSource).toContain('"rich-textarea"');
 });

 it("PASTE_TARGET_SELECTORS includes non-boolean contenteditable for Gemini variants", () => {
 expect(assetClipboardSource).toContain('[contenteditable]:not([contenteditable="false"])');
 });

 it("PASTE_TARGET_SELECTORS includes [role='textbox'] fallback", () => {
 expect(assetClipboardSource).toContain('[role="textbox"]');
 });

 it("PASTE_TARGET_SELECTORS includes Gemini textarea fallbacks", () => {
 expect(assetClipboardSource).toContain('textarea[aria-label*="message" i]');
 expect(assetClipboardSource).toContain('textarea[placeholder*="message" i]');
 });

 it("shadow-root traversal is implemented to reach Gemini's inner editor", () => {
 expect(assetClipboardSource).toContain("function findOpenShadowRoots");
 expect(assetClipboardSource).toContain("SHADOW_PASTE_TARGET_SELECTORS");
 expect(assetClipboardSource).toContain("active.shadowRoot");
 expect(assetClipboardSource).toContain("shadowRoot.host");
 });

 it("rich-textarea shadow editors are probed via SHADOW_PASTE_TARGET_SELECTORS", () => {
 expect(assetClipboardSource).toContain('rich-textarea [contenteditable]');
 });
});

// ---------------------------------------------------------------------------
// — Hide toggle must be respected; correct images targeted
// ---------------------------------------------------------------------------

describe(" — inFieldButtonDisabled preference wiring", () => {
 afterEach(() => {
 vi.resetModules();
 vi.restoreAllMocks();
 vi.unstubAllGlobals();
 });

 it("initAssetClipboard reads inFieldButtonDisabled from chrome.storage.sync on startup", async () => {
 const syncGet = vi.fn().mockResolvedValue({ inFieldButtonDisabled: true });

 const documentMock = {
 head: { appendChild: vi.fn() },
 body: {},
 getElementById: vi.fn().mockReturnValue(null),
 createElement: vi.fn(() => ({ id: "", style: {}, textContent: "" })),
 querySelectorAll: vi.fn(() => []),
 } as unknown as Document;

 vi.stubGlobal("document", documentMock);
 vi.stubGlobal("MutationObserver", class {
 observe = vi.fn();
 });
 vi.stubGlobal("chrome", {
 storage: {
 sync: {
 get: syncGet,
 onChanged: { addListener: vi.fn() },
 },
 },
 });

 const { initAssetClipboard } = await import("../src/content/asset-clipboard");
 await initAssetClipboard("gemini");

 expect(syncGet).toHaveBeenCalledWith("inFieldButtonDisabled");
 });

 it("live changes to inFieldButtonDisabled hide and re-show overlays via onChanged listener", async () => {
 const buttons = [
 { style: { display: "" } },
 { style: { display: "" } },
 ] as unknown as HTMLElement[];

 const syncListeners: Array<(changes: Record<string, { newValue: unknown }>) => void> = [];
 const syncGet = vi.fn().mockResolvedValue({ inFieldButtonDisabled: false });

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

 // Listener registered
 expect(syncListeners).toHaveLength(1);

 // Buttons start visible (inFieldButtonDisabled=false)
 expect(buttons.every((btn) => btn.style.display === "inline-flex")).toBe(true);

 // Disable — buttons must be hidden
 syncListeners[0]({ inFieldButtonDisabled: { newValue: true } });
 expect(buttons.every((btn) => btn.style.display === "none")).toBe(true);

 // Re-enable — buttons must re-appear
 syncListeners[0]({ inFieldButtonDisabled: { newValue: false } });
 expect(buttons.every((btn) => btn.style.display === "inline-flex")).toBe(true);
 });

 it("applySaveButtonVisibility is exported via __testHooks for testing", () => {
 expect(typeof __testHooks.applySaveButtonVisibility).toBe("function");
 });
});
