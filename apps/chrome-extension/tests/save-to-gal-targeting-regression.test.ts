// @vitest-environment jsdom

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
 initAssetClipboard,
 setAssetClipboardDisabled,
} from "../src/content/asset-clipboard";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "../src/content/asset-clipboard.ts"),
 "utf-8",);

function createGeneratedImage(parent: HTMLElement): HTMLImageElement {
 // Wrap in a <generated-image> custom element to match Gemini's DOM structure
 // and the scoped selector "generated-image img".
 const host = document.createElement("generated-image");
 const img = document.createElement("img");
 img.src = "https://lh3.googleusercontent.com/generated-image.png";
 Object.defineProperty(img, "naturalWidth", { configurable: true, value: 512 });
 Object.defineProperty(img, "naturalHeight", { configurable: true, value: 512 });
 host.appendChild(img);
 parent.appendChild(host);
 return img;
}

function getAllSaveButtons(): HTMLButtonElement[] {
 return Array.from(document.querySelectorAll<HTMLButtonElement>(".gal-clipboard-save-btn"));
}

describe("Save to GAL targeting + toggle behavior regressions", () => {
 beforeEach(() => {
 document.head.innerHTML = "";
 document.body.innerHTML = "";
 setAssetClipboardDisabled(false);

 // Stub the Chrome extension storage API required by initAssetClipboard.
 vi.stubGlobal("chrome", {
 storage: {
 sync: {
 get: vi.fn().mockResolvedValue({ inFieldButtonDisabled: false }),
 onChanged: {
 addListener: vi.fn(),
 },
 },
 },
 });
 });

 afterEach(() => {
 vi.unstubAllGlobals();
 });

 it("injects on generated Gemini images, shows on hover, and skips nav/header images", async () => {
 const header = document.createElement("header");
 createGeneratedImage(header);
 document.body.appendChild(header);

 const imageCard = document.createElement("div");
 const cardImage = createGeneratedImage(imageCard);
 document.body.appendChild(imageCard);

 await initAssetClipboard("gemini");

 expect(header.querySelector(".gal-clipboard-save-btn")).toBeNull();

 const button = imageCard.querySelector<HTMLButtonElement>(".gal-clipboard-save-btn");
 expect(button).toBeTruthy();

 const wrapper = cardImage.parentElement as HTMLElement;
 wrapper.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
 expect(button?.classList.contains("gal-clipboard-visible")).toBe(true);
 });

 it("removes overlays immediately when disabled and re-injects when re-enabled", async () => {
 createGeneratedImage(document.body);
 await initAssetClipboard("gemini");
 expect(getAllSaveButtons()).toHaveLength(1);

 setAssetClipboardDisabled(true);
 expect(getAllSaveButtons()).toHaveLength(0);

 createGeneratedImage(document.body);
 await new Promise((resolve) => setTimeout(resolve, 70));
 expect(getAllSaveButtons()).toHaveLength(0);

 setAssetClipboardDisabled(false);
 expect(getAllSaveButtons()).toHaveLength(2);
 });

 it("keeps Save to GAL visibility hover-scoped to image overlays", () => {
 expect(source).toContain('wrapper.addEventListener("mouseenter"');
 expect(source).toContain('btn.classList.add("gal-clipboard-visible")');
 expect(source).toContain('wrapper.addEventListener("mouseleave"');
 expect(source).toContain('btn.classList.remove("gal-clipboard-visible")');
 expect(source).toContain(".gal-clipboard-save-btn.gal-clipboard-visible");
 expect(source).toContain("opacity: 0;");
 });
});
