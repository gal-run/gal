import { beforeEach, describe, expect, it, vi } from "vitest";

import { __testHooks } from "../src/content/asset-clipboard";

type ImageOptions = {
 closest?: (selector: string) => Element | null;
 naturalWidth?: number;
 naturalHeight?: number;
 rectWidth?: number;
 rectHeight?: number;
};

function makeImage(options: ImageOptions = {}): HTMLImageElement {
 const {
 closest = () => null,
 naturalWidth = 1024,
 naturalHeight = 768,
 rectWidth = 1024,
 rectHeight = 768,
 } = options;

 return {
 src: "https://example.com/generated-image.png",
 closest,
 naturalWidth,
 naturalHeight,
 getBoundingClientRect: () =>
 ({ width: rectWidth, height: rectHeight }) as DOMRect,
 } as unknown as HTMLImageElement;
}

describe("Save to GAL nav/header targeting guard regressions", () => {
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

 it("keeps ChatGPT-style nav/header containers blocked", () => {
 expect(__testHooks.PAGE_CHROME_CONTAINER_SELECTOR).toContain("header");
 expect(__testHooks.PAGE_CHROME_CONTAINER_SELECTOR).toContain("nav");

 const candidate = makeImage({
 closest: (selector) => (selector.includes("header") ? ({} as Element) : null),
 });

 expect(__testHooks.isImageInjectionCandidate(candidate)).toBe(false);
 });

 it("keeps Gemini-style banner/navigation containers blocked", () => {
 expect(__testHooks.PAGE_CHROME_CONTAINER_SELECTOR).toContain('[role="banner"]');
 expect(__testHooks.PAGE_CHROME_CONTAINER_SELECTOR).toContain('[role="navigation"]');

 const candidate = makeImage({
 closest: (selector) =>
 selector.includes('[role="banner"]') ? ({} as Element) : null,
 });

 expect(__testHooks.isImageInjectionCandidate(candidate)).toBe(false);
 });

 it("keeps aria-label navigation containers blocked", () => {
 expect(__testHooks.PAGE_CHROME_CONTAINER_SELECTOR).toContain('[aria-label*="navigation" i]',);

 const candidate = makeImage({
 closest: (selector) =>
 selector.includes('[aria-label*="navigation" i]')
 ? ({} as Element)
 : null,
 });

 expect(__testHooks.isImageInjectionCandidate(candidate)).toBe(false);
 });

 it("keeps AI Studio-style toolbar containers blocked", () => {
 expect(__testHooks.PAGE_CHROME_CONTAINER_SELECTOR).toContain('[role="toolbar"]');
 expect(__testHooks.PAGE_CHROME_CONTAINER_SELECTOR).toContain('[aria-label*="toolbar" i]',);

 const candidate = makeImage({
 closest: (selector) =>
 selector.includes('[role="toolbar"]') ? ({} as Element) : null,
 });

 expect(__testHooks.isImageInjectionCandidate(candidate)).toBe(false);
 });

 it("still allows large visible generated images outside page chrome", () => {
 const candidate = makeImage();
 expect(__testHooks.isImageInjectionCandidate(candidate)).toBe(true);
 });

 it("rejects tiny icon/avatar-like images even outside page chrome", () => {
 const candidate = makeImage({
 naturalWidth: 40,
 naturalHeight: 40,
 rectWidth: 40,
 rectHeight: 40,
 });
 expect(__testHooks.isImageInjectionCandidate(candidate)).toBe(false);
 });
});
