/**
 * GAL Cross-Platform Asset Clipboard
 *
 * Captures generated AI images and enables transfer between platforms.
 * Stores image URLs and metadata in chrome.storage.local (not blobs — too large).
 * Maximum 20 entries, oldest removed first.
 */

// NOTE: Asset clipboard "Save to GAL" buttons are injected into the host
// page DOM (positioned relative to generated images), so their styles must
// remain in document.head. The buttons use gal-prefixed classes to avoid
// conflicts with host page CSS.

import { getSyncPreference } from "../lib/storage";

// Image output selectors per platform
const IMAGE_OUTPUT_SELECTORS: Record<string, string[]> = {
 // Scope to Gemini's generated-image / single-image custom elements so we
 // never accidentally target page-chrome images (avatars, enterprise logos,
 // nav icons) that live outside the response area.
 gemini: ["generated-image img", "single-image img"],
 "ai-studio": [".output-image img", 'img[alt*="Generated"]'],
 // ChatGPT uses alt="Generated image:..." for generated images.
 // Decorative blur copies have alt="" so they are excluded by this selector.
 chatgpt: ['img[alt^="Generated image:"]'],
 // Kling project page: generated images appear inside.images-message items.
 kling: [".images-message.image-item img"],
};

export interface ClipboardEntry {
 id: string;
 imageUrl: string; // original URL for display/download
 dataUrl?: string; // base64 data URL captured at save time (avoids auth issues in popup)
 thumbnailDataUrl?: string; // small JPEG data URL for popup preview (~8-20KB)
 prompt: string;
 platform: string;
 capturedAt: number;
 dimensions?: { width: number; height: number };
}

const STORAGE_KEY = "galAssetClipboard";
const MAX_ENTRIES = 20;

/** Registry of images that have already had a save button injected */
const injectedImages = new WeakSet<HTMLImageElement>();

/**
 * Track the last-known `src` for each injected image so we can detect
 * src-swap regenerations (e.g. Gemini reusing the same <img> node).
 */
const injectedSrcMap = new WeakMap<HTMLImageElement, string>();

/**
 * Registry of images that have a pending `load` listener attached.
 * Separate from `injectedImages` so `injectSaveButton` can proceed
 * normally when the load callback fires.
 */
const pendingLoadImages = new WeakSet<HTMLImageElement>();

/**
 * For ChatGPT: track buttons injected into the hover overlay.
 * ChatGPT images are absolutely positioned so we cannot use the standard
 * wrapper approach — we inject into the existing overlay instead.
 */
const chatgptInjectedButtons = new WeakMap<HTMLImageElement, HTMLButtonElement>();

// Exclude global page chrome containers where Save-to-GAL must never appear.
const PAGE_CHROME_CONTAINER_SELECTOR = [
 "header",
 "nav",
 "top-bar-actions",
 '[role="banner"]',
 '[role="navigation"]',
 '[role="toolbar"]',
 '[aria-label*="navigation" i]',
 '[aria-label*="toolbar" i]',
 // Gemini-specific: enterprise logo injected into the top-bar via Angular
 ".enterprise-ogb-wrapper",
].join(", ");

// Skip tiny/icon-like images (avatars, logos) that are not generated outputs.
const MIN_IMAGE_DIMENSION_PX = 96;
const MIN_IMAGE_AREA_PX = 96 * 96;
let saveToGalOverlaysDisabled = false;
let activeAssetClipboardPlatform: string | null = null;

function removeAllSaveButtonsFromPage(): void {
 const wrappers = new Set<HTMLElement>();

 document
.querySelectorAll<HTMLElement>(".gal-clipboard-save-wrapper")
.forEach((wrapper) => wrappers.add(wrapper));

 document
.querySelectorAll<HTMLButtonElement>(".gal-clipboard-save-btn")
.forEach((btn) => {
 const wrapper = btn.parentElement;
 if (wrapper instanceof HTMLElement) {
 if (wrapper.classList.contains("gal-clipboard-save-wrapper")) {
 wrappers.add(wrapper);
 } else {
 // ChatGPT-style: button injected directly into the hover overlay.
 // Find the tracked img and clean up state, then remove the button.
 const container = btn.closest<HTMLElement>('[id^="image-"]');
 const img = container?.querySelector<HTMLImageElement>('img[alt^="Generated image:"]');
 btn.remove();
 if (img) {
 injectedImages.delete(img);
 injectedSrcMap.delete(img);
 chatgptInjectedButtons.delete(img);
 }
 }
 }
 });

 wrappers.forEach((wrapper) => {
 const firstChild = wrapper.firstElementChild;
 const img = wrapper.querySelector<HTMLImageElement>("img");
 const parent = wrapper.parentNode;
 if (firstChild && parent) {
 // Restore the first child (img directly, or the platform's <button> that
 // contains the img) rather than extracting just the img and losing its button.
 parent.insertBefore(firstChild, wrapper);
 if (img) {
 injectedImages.delete(img);
 injectedSrcMap.delete(img);
 pendingLoadImages.delete(img);
 }
 }
 wrapper.remove();
 });

 document
.querySelectorAll<HTMLButtonElement>(".gal-clipboard-save-btn")
.forEach((btn) => btn.remove());
}

export function setAssetClipboardDisabled(disabled: boolean): void {
 saveToGalOverlaysDisabled = disabled;

 if (saveToGalOverlaysDisabled) {
 removeAllSaveButtonsFromPage();
 return;
 }

 if (activeAssetClipboardPlatform) {
 scanForGeneratedImages(activeAssetClipboardPlatform);
 }
}

function isImageInjectionCandidate(img: HTMLImageElement): boolean {
 if (!img.src) return false;

 if (img.closest(PAGE_CHROME_CONTAINER_SELECTOR)) {
 return false;
 }

 const style = window.getComputedStyle(img);
 if (style.display === "none" || style.visibility === "hidden") {
 return false;
 }

 // Skip pointer-events check when img is inside a <button>: the button
 // intentionally absorbs pointer events, but the image is still a real
 // generated output (e.g. Gemini's click-to-expand wrapper).
 if (style.pointerEvents === "none" &&
 img.parentElement?.nodeName !== "BUTTON") {
 return false;
 }

 const rect = img.getBoundingClientRect();
 const width = img.naturalWidth || rect.width;
 const height = img.naturalHeight || rect.height;

 return (width >= MIN_IMAGE_DIMENSION_PX &&
 height >= MIN_IMAGE_DIMENSION_PX &&
 width * height >= MIN_IMAGE_AREA_PX);
}

// Test-only hooks for deterministic unit tests in Node/Vitest.
export const __testHooks = {
 isImageInjectionCandidate,
 isRelevantGeneratedImage,
 applySaveButtonVisibility,
 findClipboardPasteTarget,
 transferViaClipboardPaste,
 PAGE_CHROME_CONTAINER_SELECTOR,
 MIN_IMAGE_DIMENSION_PX,
 MIN_IMAGE_AREA_PX,
};

/**
 * Global visibility state for Save to GAL image overlays.
 * Reuses the existing in-field toggle preference.
 */
let saveButtonHidden = false;
let saveButtonSyncListenerRegistered = false;

function applySaveButtonVisibility(hidden: boolean): void {
 saveButtonHidden = hidden;
 document.querySelectorAll<HTMLElement>(".gal-clipboard-save-btn").forEach((el) => {
 el.style.display = hidden ? "none" : "inline-flex";
 });
}

function getImageSourceUrl(img: HTMLImageElement): string {
 return (img.currentSrc ||
 img.src ||
 img.getAttribute("src") ||
 "").trim();
}

function hasMinimumImageSize(img: HTMLImageElement, minPx = 96): boolean {
 const naturalW = img.naturalWidth || 0;
 const naturalH = img.naturalHeight || 0;
 const rect = img.getBoundingClientRect();
 const renderW = rect.width || img.clientWidth || 0;
 const renderH = rect.height || img.clientHeight || 0;
 const measuredW = Math.max(naturalW, renderW);
 const measuredH = Math.max(naturalH, renderH);

 // For unloaded images we cannot size-gate yet; defer to onload path.
 if (measuredW === 0 && measuredH === 0) return true;
 return measuredW >= minPx && measuredH >= minPx;
}

function isRelevantGeneratedImage(img: HTMLImageElement, platform: string): boolean {
 const imageUrl = getImageSourceUrl(img);
 if (!imageUrl) return false;

 if (!hasMinimumImageSize(img)) return false;

 if (platform === "gemini") {
 const lowerUrl = imageUrl.toLowerCase();
 const supportedSource =
 lowerUrl.includes("googleusercontent.com") ||
 lowerUrl.startsWith("blob:") ||
 lowerUrl.startsWith("data:image/");
 if (!supportedSource) return false;

 // Prevent nav/header/page-chrome false positives.
 if (img.closest("header, nav, [role='navigation']")) return false;

 const alt = (img.getAttribute("alt") ?? "").toLowerCase();
 if (alt.includes("avatar") ||
 alt.includes("icon") ||
 alt.includes("logo")) {
 return false;
 }
 }

 if (platform === "chatgpt") {
 const lowerUrl = imageUrl.toLowerCase();
 // Only accept ChatGPT's generated-image CDN URLs, blobs, or data URIs.
 const isGeneratedUrl =
 lowerUrl.includes("/backend-api/estuary/content") ||
 lowerUrl.includes("oaiusercontent.com") ||
 lowerUrl.startsWith("blob:") ||
 lowerUrl.startsWith("data:image/");
 if (!isGeneratedUrl) return false;
 // Decorative aria-hidden copies are excluded by the selector, but guard here too.
 if (img.getAttribute("aria-hidden") === "true") return false;
 }

 return true;
}

/**
 * Capture a full-res data URL from an <img> element using the Canvas API.
 * Downscales to at most MAX_DIM on each axis and compresses as JPEG (quality 0.82).
 * This avoids cross-origin fetch issues because the image is already decoded
 * in the page context and drawn onto a same-origin canvas.
 */
const MAX_DIM = 1568;
const JPEG_QUALITY = 0.82;

function captureImageViaCanvas(img: HTMLImageElement,): string | undefined {
 try {
 let { naturalWidth: w, naturalHeight: h } = img;
 if (w === 0 || h === 0) return undefined;

 // Downscale if either dimension exceeds MAX_DIM
 if (w > MAX_DIM || h > MAX_DIM) {
 const scale = MAX_DIM / Math.max(w, h);
 w = Math.round(w * scale);
 h = Math.round(h * scale);
 }

 const canvas = document.createElement("canvas");
 canvas.width = w;
 canvas.height = h;
 const ctx = canvas.getContext("2d");
 if (!ctx) return undefined;
 ctx.drawImage(img, 0, 0, w, h);
 return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
 } catch {
 // Canvas tainted by cross-origin image — fall back to network fetch
 return undefined;
 }
}

/**
 * Fetch an image via the service worker using chrome.scripting.executeScript
 * in the MAIN world. This bypasses page CSP (e.g. Gemini's strict CSP that
 * blocks inline script injection) because the injection happens at the
 * browser/C++ level, not via DOM script elements.
 */
async function fetchImageInPageContext(url: string): Promise<string | undefined> {
 try {
 const response = await chrome.runtime.sendMessage({
 type: "GAL_FETCH_IMAGE_MAIN_WORLD",
 url,
 }) as { dataUrl: string | null } | undefined;
 return response?.dataUrl ?? undefined;
 } catch {
 return undefined;
 }
}

/**
 * Fetch an image as a base64 data URL, using page credentials so
 * auth-gated CDN URLs (e.g. lh3.googleusercontent.com) work inside
 * the content script context where cookies are available.
 * Used as a last-resort fallback when both Canvas and MAIN world fetch fail.
 */
async function fetchImageAsDataUrl(url: string): Promise<string | undefined> {
 // First try a direct fetch from the content script (has page cookies).
 try {
 const response = await fetch(url, { credentials: "include" });
 if (!response.ok) throw new Error(`HTTP ${response.status}`);
 const blob = await response.blob();
 return await new Promise<string>((resolve, reject) => {
 const reader = new FileReader();
 reader.onload = () => resolve(reader.result as string);
 reader.onerror = () => reject(reader.error);
 reader.readAsDataURL(blob);
 });
 } catch {
 // Content-script fetch failed (e.g. Cross-Origin-Resource-Policy: same-site).
 // Fall back to the background service worker which is not subject to CORP.
 try {
 const result = await chrome.runtime.sendMessage({
 type: "GAL_FETCH_IMAGE",
 url,
 }) as { dataUrl: string | null } | undefined;
 return result?.dataUrl ?? undefined;
 } catch {
 return undefined;
 }
 }
}

/**
 * Generate a thumbnail data URL from an existing full-size data URL.
 * Used when Canvas-based thumbnail capture fails (tainted canvas)
 * but we have a dataUrl from the MAIN world fetch.
 */
async function generateThumbnailFromDataUrl(dataUrl: string, maxSize = 200): Promise<string | undefined> {
 const thumbnailPromise = new Promise<string | undefined>((resolve) => {
 const img = new Image();
 img.onload = () => {
 try {
 const canvas = document.createElement("canvas");
 const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
 canvas.width = Math.round(img.width * scale);
 canvas.height = Math.round(img.height * scale);
 const ctx = canvas.getContext("2d");
 if (!ctx) { resolve(undefined); return; }
 ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
 resolve(canvas.toDataURL("image/jpeg", 0.65));
 } catch {
 resolve(undefined);
 }
 };
 img.onerror = () => resolve(undefined);
 img.src = dataUrl;
 });

 // Race against a 3s timeout to avoid blocking background enhancement
 const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 3_000));
 return Promise.race([thumbnailPromise, timeout]);
}

/**
 * Capture a thumbnail data URL from an <img> element using the Canvas API.
 * Scales down to a max dimension of 200px and encodes as JPEG at 0.65 quality
 * to produce a small (~8-20KB) preview suitable for the extension popup.
 */
function captureThumbDataUrl(img: HTMLImageElement): string | undefined {
 try {
 const MAX_DIM = 200;
 const { naturalWidth, naturalHeight } = img;
 if (naturalWidth === 0 || naturalHeight === 0) return undefined;

 const scale = Math.min(MAX_DIM / naturalWidth, MAX_DIM / naturalHeight, 1);
 const w = Math.round(naturalWidth * scale);
 const h = Math.round(naturalHeight * scale);

 const canvas = document.createElement("canvas");
 canvas.width = w;
 canvas.height = h;
 const ctx = canvas.getContext("2d");
 if (!ctx) return undefined;

 ctx.drawImage(img, 0, 0, w, h);
 return canvas.toDataURL("image/jpeg", 0.65);
 } catch {
 // Canvas may throw if the image is tainted (cross-origin without CORS headers).
 return undefined;
 }
}

/**
 * Store a clipboard entry in chrome.storage.local.
 * Removes the oldest entry if the cap of 20 is exceeded.
 */
export async function captureImage(entry: ClipboardEntry): Promise<void> {
 const entries = await getClipboardEntries();
 entries.unshift(entry);

 // Trim to MAX_ENTRIES
 const trimmed = entries.slice(0, MAX_ENTRIES);

 await chrome.storage.local.set({ [STORAGE_KEY]: JSON.stringify(trimmed) });
 console.log(`[GAL] Asset captured: ${entry.id} from ${entry.platform}`);
}

/**
 * Retrieve all clipboard entries from chrome.storage.local.
 */
export async function getClipboardEntries(): Promise<ClipboardEntry[]> {
 try {
 const result = await chrome.storage.local.get(STORAGE_KEY);
 const raw = result[STORAGE_KEY] as string | undefined;
 if (!raw) return [];
 return JSON.parse(raw) as ClipboardEntry[];
 } catch {
 return [];
 }
}

/**
 * Convert a base64 data URL to a Blob without any network request.
 * This avoids cross-origin issues entirely since we already have the data.
 */
function dataUrlToBlob(dataUrl: string): Blob {
 const [header, base64] = dataUrl.split(",");
 const mime = header.match(/:(.*?);/)?.[1] || "image/png";
 const binary = atob(base64);
 const bytes = new Uint8Array(binary.length);
 for (let i = 0; i < binary.length; i++) {
 bytes[i] = binary.charCodeAt(i);
 }
 return new Blob([bytes], { type: mime });
}

/**
 * Transfer an image via the Clipboard API and a synthetic paste event.
 * Works for any platform with a contenteditable editor (TipTap, ProseMirror, etc.).
 * Returns true on success.
 */
const FILE_INPUT_SELECTOR = 'input[type="file"][accept*="image" i], input[type="file"]';

const PASTE_TARGET_SELECTORS = [
 // Gemini chat composer variants (light DOM and host-level fallbacks)
 "rich-textarea",
 'rich-textarea [contenteditable]:not([contenteditable="false"])',
 'div.ql-editor[contenteditable]:not([contenteditable="false"])',
 '[aria-label*="message" i][role="textbox"]',
 '[aria-label*="prompt" i][role="textbox"]',
 // Google AI Studio — standard <textarea> with Angular msfilecopypaste directive.
 // The directive listens upstream via event delegation; bubbles:true (already set
 // in transferViaClipboardPaste) propagates the ClipboardEvent up to the listener.
 'textarea[msfilecopypaste]',
 // Kling Canvas (lab.klingai.com) — ant-design-vue custom contenteditable div.
 // Must come before.tiptap.ProseMirror: on the Kling project page both
 // elements are visible but.editable-input is the image-upload target.
 '.editable-input',
 // Rich-text editors used by other supported platforms
 '.tiptap.ProseMirror[contenteditable]:not([contenteditable="false"])',
 '.ProseMirror[contenteditable]:not([contenteditable="false"])',
 // Generic editable fallbacks
 '[role="textbox"]',
 'div[role="textbox"][contenteditable]:not([contenteditable="false"])',
 '[contenteditable]:not([contenteditable="false"])',
 // Textarea fallbacks for composer variants that do not expose contenteditable
 'textarea[aria-label*="message" i]',
 'textarea[aria-label*="prompt" i]',
 'textarea[placeholder*="message" i]',
 'textarea[placeholder*="prompt" i]',
];

const SHADOW_PASTE_TARGET_SELECTORS = [
 '.ql-editor[contenteditable]:not([contenteditable="false"])',
 '[contenteditable]:not([contenteditable="false"])',
 '[role="textbox"]',
 'textarea[aria-label*="message" i]',
 'textarea[aria-label*="prompt" i]',
 'textarea[placeholder*="message" i]',
 'textarea[placeholder*="prompt" i]',
 '[aria-label*="message" i][role="textbox"]',
 '[aria-label*="prompt" i][role="textbox"]',
];

function isElementVisible(el: HTMLElement): boolean {
 const style = window.getComputedStyle(el);
 if (style.display === "none" ||
 style.visibility === "hidden" ||
 style.opacity === "0" ||
 el.hidden ||
 el.getAttribute("aria-hidden") === "true") {
 return false;
 }

 const rect = el.getBoundingClientRect();
 return rect.width > 0 && rect.height > 0;
}

function isEditableTarget(el: Element | null): el is HTMLElement {
 if (!(el instanceof HTMLElement)) return false;
 return (el.matches('[contenteditable]:not([contenteditable="false"])') ||
 el.matches("textarea") ||
 el.matches('input[type="text"], input[type="search"], input:not([type])') ||
 el.matches('[role="textbox"]') ||
 el.matches("rich-textarea"));
}

function findVisibleTargetInRoot(root: ParentNode,
 selectors: readonly string[],): HTMLElement | null {
 for (const selector of selectors) {
 const target = Array.from(root.querySelectorAll<HTMLElement>(selector))
.find((el) => isElementVisible(el));
 if (target) return target;
 }
 return null;
}

function findOpenShadowRoots(): ShadowRoot[] {
 const roots: ShadowRoot[] = [];
 const seen = new Set<ShadowRoot>();
 const stack: Element[] = Array.from(document.querySelectorAll("*"));

 while (stack.length > 0) {
 const el = stack.pop();
 if (!(el instanceof HTMLElement)) continue;

 const shadowRoot = el.shadowRoot;
 if (!shadowRoot || seen.has(shadowRoot)) continue;

 seen.add(shadowRoot);
 roots.push(shadowRoot);
 stack.push(...Array.from(shadowRoot.querySelectorAll("*")));
 }

 return roots;
}

function findClipboardPasteTarget(): HTMLElement | null {
 const active = document.activeElement;

 // Gemini and similar editors keep the true input inside a shadow root.
 // Always probe shadow-root first — even if the host (e.g. rich-textarea)
 // itself passes isEditableTarget — so we return the innermost editable.
 if (active instanceof HTMLElement && active.shadowRoot) {
 const activeInShadow = active.shadowRoot.activeElement;
 if (isEditableTarget(activeInShadow) && isElementVisible(activeInShadow)) {
 return activeInShadow;
 }

 const targetInActiveShadow = findVisibleTargetInRoot(active.shadowRoot,
 SHADOW_PASTE_TARGET_SELECTORS,);
 if (targetInActiveShadow) return targetInActiveShadow;
 }

 // Prefer the currently-focused editable (fallback for non-shadow hosts).
 if (isEditableTarget(active) && isElementVisible(active)) {
 return active;
 }

 const directTarget = findVisibleTargetInRoot(document, PASTE_TARGET_SELECTORS);
 if (directTarget) {
 // When the found element is a custom-element wrapper (e.g. Gemini's <rich-textarea>),
 // prefer the innermost contenteditable inside it so paste lands on the element Gemini
 // actually listens on (.ql-editor), not the host.
 // Check shadow root first (for shadow-DOM builds), then light-DOM children — Gemini
 // currently places.ql-editor directly in <rich-textarea>'s light DOM.
 const innerTarget =
 (directTarget.shadowRoot
 ? findVisibleTargetInRoot(directTarget.shadowRoot, SHADOW_PASTE_TARGET_SELECTORS)
 : null) ??
 findVisibleTargetInRoot(directTarget, SHADOW_PASTE_TARGET_SELECTORS);
 if (innerTarget) return innerTarget;
 return directTarget;
 }

 for (const shadowRoot of findOpenShadowRoots()) {
 const shadowTarget = findVisibleTargetInRoot(shadowRoot,
 SHADOW_PASTE_TARGET_SELECTORS,);
 if (shadowTarget) return shadowTarget;

 const host = shadowRoot.host;
 if (isEditableTarget(host) && isElementVisible(host)) {
 return host;
 }
 }

 return null;
}

function findFileInputTarget(): HTMLInputElement | null {
 const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(FILE_INPUT_SELECTOR))
.filter((input) => !input.disabled && !input.readOnly);

 if (inputs.length === 0) return null;

 const visible = inputs.find((input) => isElementVisible(input));
 return visible ?? inputs[0];
}

async function transferViaClipboardPaste(blob: Blob): Promise<boolean> {
 const editor = findClipboardPasteTarget();
 if (!editor) return false;

 try {
 // Focus the editor so the paste target is correct
 editor.focus();

 // Optionally mirror to the system clipboard (best-effort — failure must NOT
 // abort the dispatch below, since Angular reads clipboardData.files from the
 // synthetic event directly and does not require the system clipboard).
 try {
 const clipboardItem = new ClipboardItem({ [blob.type]: blob });
 await navigator.clipboard.write([clipboardItem]);
 } catch {
 // Clipboard write permission denied or no user gesture — non-fatal.
 }

 // Synthesise a paste event carrying the image file.
 // Angular's uploader intercepts this on.ql-editor and routes the file
 // through its internal pipeline (reads clipboardData.files), so this is
 // the reliable path regardless of whether the system clipboard write above succeeded.
 const dataTransfer = new DataTransfer();
 dataTransfer.items.add(new File([blob], "gal-clipboard.png", { type: blob.type }));
 const pasteEvent = new ClipboardEvent("paste", {
 bubbles: true,
 cancelable: true,
 clipboardData: dataTransfer,
 });
 editor.dispatchEvent(pasteEvent);
 return true;
 } catch (err) {
 console.warn("[GAL] Clipboard paste transfer failed:", err);
 return false;
 }
}

/**
 * Transfer a clipboard entry to the current platform.
 *
 * Strategy:
 * 1. Resolve image blob from entry.dataUrl (preferred, no network) or entry.imageUrl (fallback fetch).
 * 2. Try injecting into the first visible <input type="file">.
 * 3. If no file input found, fall back to Clipboard API + synthetic paste on any contenteditable.
 * 4. If nothing works, throw with a user-readable message (caller shows error in popup).
 */
export async function transferToCurrentPlatform(entry: ClipboardEntry,): Promise<void> {
 // Resolve image bytes — prefer stored data URL (no network, no CORS)
 let blob: Blob | undefined;
 if (entry.dataUrl) {
 try {
 blob = dataUrlToBlob(entry.dataUrl);
 } catch (err) {
 console.warn("[GAL] Failed to convert stored data URL to blob:", err);
 }
 }

 // Fallback 1: fetch from original URL via content script (may fail cross-origin / CORP)
 if (!blob) {
 try {
 const res = await fetch(entry.imageUrl, { credentials: "include" });
 if (res.ok) blob = await res.blob();
 } catch (err) {
 console.warn("[GAL] Failed to fetch image from original URL:", err);
 }
 }

 // Fallback 2: MAIN world fetch (runs as the page with cookies — works for Gemini/lh3)
 if (!blob) {
 try {
 const mainWorldDataUrl = await fetchImageInPageContext(entry.imageUrl);
 if (mainWorldDataUrl) {
 blob = dataUrlToBlob(mainWorldDataUrl);
 }
 } catch (err) {
 console.warn("[GAL] MAIN world fetch failed:", err);
 }
 }

 if (!blob) {
 const isLh3 = entry.imageUrl.includes("lh3.googleusercontent.com");
 const msg = isLh3
 ? "This Gemini image has expired. Re-open the conversation and save it again."
 : "Could not load image — the source may have expired. Re-save it from the source page.";
 console.warn(`[GAL] Transfer failed for ${entry.id}: ${msg}`);
 throw new Error(msg);
 }

 const ext = blob.type.split("/")[1] || "png";
 const filename = `gal-clipboard-${entry.id}.${ext}`;

 // --- Strategy 1: file input injection ---
 const input = findFileInputTarget();

 if (input) {
 try {
 const file = new File([blob], filename, { type: blob.type });
 const dt = new DataTransfer();
 dt.items.add(file);
 input.files = dt.files;
 input.dispatchEvent(new Event("change", { bubbles: true }));
 console.log(`[GAL] Transferred image ${entry.id} to file input`);
 return;
 } catch (err) {
 console.warn("[GAL] File input injection failed, trying clipboard paste:", err);
 // Fall through to clipboard paste
 }
 }

 // --- Strategy 2: clipboard paste (for platforms without file inputs, e.g. Kling/TipTap) ---
 const pasteOk = await transferViaClipboardPaste(blob);
 if (pasteOk) {
 console.log(`[GAL] Transferred image ${entry.id} via clipboard paste`);
 return;
 }

 const msg = location.hostname.includes("gemini.google.com")
 ? "No upload target found in Gemini. Click inside the message box or open Upload files, then click 'Use here' again."
 : location.hostname.includes("aistudio.google.com")
 ? "No upload target found in AI Studio. Click inside the prompt box, then click 'Use here' again."
 : location.hostname.includes("klingai.com")
 ? "No upload target found in Kling. Click inside the prompt area or open the image upload panel, then click 'Use here' again."
 : location.hostname.includes("chatgpt.com")
 ? "No upload target found in ChatGPT. Click inside the message box, then click 'Use here' again."
 : "No file input or compatible editor found on this page. Try opening the upload dialog first, then click 'Use here' again.";
 console.warn(`[GAL] Transfer failed for ${entry.id}: ${msg}`);
 throw new Error(msg);
}

/**
 * Generate a short unique ID for a clipboard entry.
 */
function generateId(): string {
 return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Read the prompt text from the page (best-effort).
 * Returns an empty string if nothing meaningful is found.
 */
function readPromptText(): string {
 // Common prompt input selectors across Gemini / AI Studio
 const selectors = [
 'div.ql-editor[contenteditable]:not([contenteditable="false"])',
 'rich-textarea [contenteditable]:not([contenteditable="false"])',
 'textarea[aria-label="Enter a prompt"]',
 'textarea[aria-label*="message" i]',
 'textarea[placeholder*="message" i]',
 ];
 for (const sel of selectors) {
 const el = document.querySelector<HTMLElement>(sel);
 if (el) {
 const text = el instanceof HTMLTextAreaElement
 ? el.value.trim()
 : el.textContent?.trim();
 if (text) return text.slice(0, 500);
 }
 }
 return "";
}

/**
 * Background enhancement: fetch full-res dataUrl and thumbnail when
 * the synchronous Canvas capture failed (e.g. cross-origin tainted canvas).
 * Updates the existing storage entry in-place.
 *
 * Returns true if a dataUrl was successfully captured (or was not needed),
 * false if dataUrl capture was needed but all strategies failed.
 */
async function enhanceEntryInBackground(entryId: string,
 imageUrl: string,
 needsDataUrl: boolean,
 needsThumbnail: boolean,): Promise<boolean> {
 try {
 let dataUrl: string | undefined;

 if (needsDataUrl) {
 dataUrl =
 await fetchImageInPageContext(imageUrl) ??
 await fetchImageAsDataUrl(imageUrl);
 if (!dataUrl) {
 console.warn(`[GAL] All image capture strategies failed for ${entryId}`);
 return false; // Nothing to enhance — dataUrl unrecoverable
 }
 }

 let thumbnailDataUrl: string | undefined;
 if (needsThumbnail && dataUrl) {
 thumbnailDataUrl = await generateThumbnailFromDataUrl(dataUrl);
 }

 // Update the existing entry in storage
 const entries = await getClipboardEntries();
 const entry = entries.find((e) => e.id === entryId);
 if (!entry) return !needsDataUrl;

 if (dataUrl) entry.dataUrl = dataUrl;
 if (thumbnailDataUrl) entry.thumbnailDataUrl = thumbnailDataUrl;

 await chrome.storage.local.set({
 [STORAGE_KEY]: JSON.stringify(entries),
 });
 console.log(`[GAL] Background enhancement complete for ${entryId}`);
 return true;
 } catch {
 // Background enhancement failed — entry still has imageUrl as fallback
 console.warn(`[GAL] Background enhancement failed for ${entryId}`);
 return false;
 }
}

/**
 * Remove an existing save-button wrapper so the image can be re-injected
 * (e.g. after a src-swap regeneration).
 *
 * Handles two DOM layouts:
 * Normal: wrapper > img + save-btn
 * Button: wrapper > button > img (img inside platform's own button)
 */
function removeExistingSaveButton(img: HTMLImageElement): void {
 // ChatGPT: button is in the hover overlay, not in a wrapper div.
 const chatgptBtn = chatgptInjectedButtons.get(img);
 if (chatgptBtn) {
 chatgptBtn.remove();
 chatgptInjectedButtons.delete(img);
 injectedImages.delete(img);
 injectedSrcMap.delete(img);
 return;
 }

 // Walk up at most two levels to find the wrapper div we injected.
 const p1 = img.parentElement;
 const p2 = p1?.parentElement;
 const wrapper =
 p1?.classList.contains("gal-clipboard-save-wrapper") ? p1 :
 p2?.classList.contains("gal-clipboard-save-wrapper") ? p2 :
 null;

 if (wrapper) {
 const grandparent = wrapper.parentNode;
 if (grandparent) {
 // Re-insert the first child of the wrapper (img or button) in place.
 const firstChild = wrapper.firstElementChild;
 if (firstChild) grandparent.insertBefore(firstChild, wrapper);
 wrapper.remove();
 }
 }
 injectedImages.delete(img);
 injectedSrcMap.delete(img);
}

/**
 * Create and inject a "Save to GAL Clipboard" button overlay on a given image.
 */
function injectSaveButton(img: HTMLImageElement, platform: string): void {
 if (saveToGalOverlaysDisabled) {
 if (injectedImages.has(img)) {
 removeExistingSaveButton(img);
 }
 return;
 }

 // ChatGPT images are absolutely positioned — bypass the generic candidate
 // check (which would reject pointer-events:none imgs) since we inject into
 // the overlay rather than wrapping the img itself.
 if (platform !== "chatgpt" && !isImageInjectionCandidate(img)) {
 if (injectedImages.has(img)) {
 removeExistingSaveButton(img);
 }
 return;
 }

 const imageUrl = getImageSourceUrl(img);
 if (!imageUrl) return;

 if (injectedImages.has(img)) {
 // If src changed, remove the old wrapper/button and re-inject
 const prevSrc = injectedSrcMap.get(img);
 if (prevSrc && prevSrc !== imageUrl) {
 removeExistingSaveButton(img);
 // Fall through to re-inject below
 } else {
 return;
 }
 }
 injectedImages.add(img);
 injectedSrcMap.set(img, imageUrl);

 // ChatGPT: images are absolutely positioned inside overflow:hidden containers.
 // Wrapping them breaks the layout (width:100% resolves to 0 inside an
 // inline-block with an absolute child). Inject into the existing hover overlay.
 if (platform === "chatgpt") {
 if (chatgptInjectedButtons.has(img)) return;
 const container = img.closest<HTMLElement>('[id^="image-"]');
 const overlayLeft = container?.querySelector<HTMLElement>('[data-testid="image-gen-overlay-left-actions"]',);
 if (!overlayLeft) return;

 const btn = document.createElement("button");
 btn.className = "gal-clipboard-save-btn gal-clipboard-visible";
 btn.title = "Save to GAL Clipboard";
 btn.style.cssText = "position:static;opacity:1;";
 btn.innerHTML = `
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
 <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
 <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
 </svg>
 Save to GAL
 `;

 btn.addEventListener("click", async (e) => {
 e.preventDefault();
 e.stopPropagation();

 btn.textContent = "Saving...";
 btn.style.opacity = "0.7";

 const rect = img.getBoundingClientRect();
 const dataUrl = captureImageViaCanvas(img);
 const thumbnailDataUrl = captureThumbDataUrl(img);

 const entry: ClipboardEntry = {
 id: generateId(),
 imageUrl: getImageSourceUrl(img) || imageUrl,
 dataUrl,
 thumbnailDataUrl,
 prompt: readPromptText(),
 platform,
 capturedAt: Date.now(),
 dimensions:
 rect.width > 0
 ? { width: Math.round(rect.width), height: Math.round(rect.height) }
 : undefined,
 };

 await captureImage(entry);

 btn.textContent = "Saved!";
 btn.style.opacity = "1";
 btn.style.background = "#00ff2a33";
 btn.style.borderColor = "#00ff2a66";
 setTimeout(() => {
 btn.innerHTML = `
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
 <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
 <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
 </svg>
 Save to GAL
 `;
 btn.style.background = "";
 btn.style.borderColor = "";
 btn.style.opacity = "1";
 }, 2000);

 if (!dataUrl || !thumbnailDataUrl) {
 enhanceEntryInBackground(entry.id, entry.imageUrl, !dataUrl, !thumbnailDataUrl)
.then((ok) => {
 if (!ok && !dataUrl) {
 btn.textContent = "Saved (image may not transfer)";
 btn.style.background = "rgba(255, 170, 0, 0.2)";
 btn.style.borderColor = "rgba(255, 170, 0, 0.5)";
 btn.style.color = "#ffaa00";
 btn.title = "Image couldn't be fully captured. Try right-click > Copy Image instead.";
 setTimeout(() => {
 btn.innerHTML = `
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
 <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
 <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
 </svg>
 Save to GAL
 `;
 btn.style.background = "";
 btn.style.borderColor = "";
 btn.style.color = "";
 btn.style.opacity = "1";
 btn.title = "Save to GAL Clipboard";
 }, 5000);
 }
 });
 }
 });

 overlayLeft.prepend(btn);
 chatgptInjectedButtons.set(img, btn);
 return;
 }

 // Standard wrapper injection for all other platforms.
 const wrapper = document.createElement("div");
 wrapper.className = "gal-clipboard-save-wrapper";
 wrapper.style.cssText =
 "position:relative;display:inline-block;";

 const imgParent = img.parentNode;
 if (!imgParent) return;

 // When the img lives inside a platform's own <button> (e.g. Gemini's
 // click-to-expand), wrap the button instead of the img so the final DOM
 // stays valid: wrapper > button > img (not button > div > img).
 const elementToWrap: HTMLElement =
 imgParent.nodeName === "BUTTON" ? (imgParent as HTMLElement) : img;
 const parent = elementToWrap.parentNode;
 if (!parent) return;

 parent.insertBefore(wrapper, elementToWrap);
 wrapper.appendChild(elementToWrap);

 const btn = document.createElement("button");
 btn.className = "gal-clipboard-save-btn";
 btn.title = "Save to GAL Clipboard";
 btn.style.display = saveButtonHidden ? "none" : "inline-flex";
 btn.innerHTML = `
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
 <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
 <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
 </svg>
 Save to GAL
 `;

 btn.addEventListener("click", async (e) => {
 e.preventDefault();
 e.stopPropagation();

 // Instant click response
 btn.textContent = "Saving...";
 btn.style.opacity = "0.7";

 const rect = img.getBoundingClientRect();

 // PHASE 1: Instant save with whatever we can get synchronously
 const dataUrl = captureImageViaCanvas(img); // sync, fast
 const thumbnailDataUrl = captureThumbDataUrl(img); // sync, fast

 const entry: ClipboardEntry = {
 id: generateId(),
 imageUrl: getImageSourceUrl(img) || imageUrl,
 dataUrl,
 thumbnailDataUrl,
 prompt: readPromptText(),
 platform,
 capturedAt: Date.now(),
 dimensions:
 rect.width > 0
 ? { width: Math.round(rect.width), height: Math.round(rect.height) }
 : undefined,
 };

 await captureImage(entry); // Storage write (~50ms)

 // Show feedback IMMEDIATELY
 btn.textContent = "Saved!";
 btn.style.opacity = "";
 btn.style.background = "#00ff2a33";
 btn.style.borderColor = "#00ff2a66";
 setTimeout(() => {
 btn.innerHTML = `
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
 <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
 <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
 </svg>
 Save to GAL
 `;
 btn.style.background = "";
 btn.style.borderColor = "";
 }, 2000);

 // PHASE 2: Background enhancement (no user wait for success path)
 if (!dataUrl || !thumbnailDataUrl) {
 enhanceEntryInBackground(entry.id, entry.imageUrl, !dataUrl, !thumbnailDataUrl)
.then((ok) => {
 if (!ok && !dataUrl) {
 // All capture strategies failed — show a warning so the user
 // knows the image data wasn't fully saved and may not transfer later.
 btn.textContent = "Saved (image may not transfer)";
 btn.style.background = "rgba(255, 170, 0, 0.2)";
 btn.style.borderColor = "rgba(255, 170, 0, 0.5)";
 btn.style.color = "#ffaa00";
 btn.title = "Image couldn't be fully captured. Try right-click > Copy Image instead.";
 setTimeout(() => {
 btn.innerHTML = `
 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
 <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
 <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
 </svg>
 Save to GAL
 `;
 btn.style.background = "";
 btn.style.borderColor = "";
 btn.style.color = "";
 btn.title = "Save to GAL Clipboard";
 }, 5000);
 }
 });
 }
 });

 wrapper.appendChild(btn);

 // Show/hide on hover
 wrapper.addEventListener("mouseenter", () =>
 btn.classList.add("gal-clipboard-visible"),);
 wrapper.addEventListener("mouseleave", () =>
 btn.classList.remove("gal-clipboard-visible"),);
}

/**
 * Scan the page for platform-specific generated images and inject save buttons.
 * Defers injection for images that haven't finished loading yet.
 */
function scanForGeneratedImages(platform: string): void {
 if (saveButtonHidden) return;

 const selectors = IMAGE_OUTPUT_SELECTORS[platform];
 if (!selectors) return;
 if (saveToGalOverlaysDisabled) {
 removeAllSaveButtonsFromPage();
 return;
 }

 for (const sel of selectors) {
 document.querySelectorAll<HTMLImageElement>(sel).forEach((img) => {
 const imageUrl = getImageSourceUrl(img);
 if (!imageUrl) return;
 if (!isRelevantGeneratedImage(img, platform)) return;

 // ChatGPT images are absolutely positioned — skip the generic candidate
 // check since we inject into the overlay, not around the img itself.
 if (platform !== "chatgpt" && !isImageInjectionCandidate(img)) {
 if (injectedImages.has(img)) {
 removeExistingSaveButton(img);
 }
 return;
 }

 // Detect src-swap on already-injected images
 if (injectedImages.has(img)) {
 const prevSrc = injectedSrcMap.get(img);
 if (prevSrc && prevSrc !== imageUrl) {
 // src changed — force re-injection
 removeExistingSaveButton(img);
 } else {
 return; // already handled, no change
 }
 }

 if (img.naturalWidth > 0) {
 injectSaveButton(img, platform);
 } else if (!pendingLoadImages.has(img)) {
 // Image hasn't loaded yet — attach listener and mark to prevent duplicate listeners.
 // Uses pendingLoadImages (not injectedImages) so injectSaveButton's guard
 // won't block injection when the load callback fires.
 pendingLoadImages.add(img);
 img.addEventListener("load",
 () => {
 pendingLoadImages.delete(img);
 if (!isImageInjectionCandidate(img)) return;
 injectSaveButton(img, platform);
 },
 { once: true },);
 }
 });
 }
}

/**
 * Returns a debounced version of the given function.
 */
function debounce<T extends (...args: unknown[]) => void>(fn: T,
 ms: number,): (...args: Parameters<T>) => void {
 let timer: ReturnType<typeof setTimeout> | undefined;
 return (...args: Parameters<T>) => {
 clearTimeout(timer);
 timer = setTimeout(() => fn(...args), ms);
 };
}

/**
 * Initialize the asset clipboard for a given platform.
 * Sets up a MutationObserver to detect newly generated images and
 * injects "Save to GAL Clipboard" button overlays.
 */
export async function initAssetClipboard(platform: string): Promise<void> {
 if (!IMAGE_OUTPUT_SELECTORS[platform]) {
 // Platform not supported for image capture — skip
 return;
 }

 activeAssetClipboardPlatform = platform;

 // Load initial Save to GAL visibility from storage and wire live changes
 const inFieldButtonDisabled = await getSyncPreference("inFieldButtonDisabled");
 applySaveButtonVisibility(inFieldButtonDisabled === true);

 if (!saveButtonSyncListenerRegistered) {
 chrome.storage.sync.onChanged.addListener((changes) => {
 if (Object.prototype.hasOwnProperty.call(changes, "inFieldButtonDisabled")) {
 const hidden = changes.inFieldButtonDisabled.newValue === true;
 applySaveButtonVisibility(hidden);
 }
 });
 saveButtonSyncListenerRegistered = true;
 }

 // Inject button styles
 if (!document.getElementById("gal-clipboard-styles")) {
 const style = document.createElement("style");
 style.id = "gal-clipboard-styles";
 style.textContent = `
.gal-clipboard-save-btn {
 position: absolute;
 bottom: 8px;
 left: 8px;
 display: inline-flex;
 align-items: center;
 gap: 5px;
 padding: 4px 8px;
 background: rgba(30, 41, 59, 0.9);
 border: 1px solid rgba(55, 65, 81, 0.8);
 border-radius: 6px;
 color: #d1d5db;
 font-size: 11px;
 font-family: system-ui, sans-serif;
 font-weight: 500;
 cursor: pointer;
 opacity: 0;
 transition: opacity 150ms ease, background 200ms ease, border-color 200ms ease;
 z-index: 100;
 pointer-events: auto;
}
.gal-clipboard-save-btn.gal-clipboard-visible {
 opacity: 1;
}
.gal-clipboard-save-btn:hover {
 background: rgba(15, 20, 30, 0.95);
 border-color: rgba(0, 255, 42, 0.5);
 color: #00ff2a;
}
 `;
 document.head.appendChild(style);
 }

 // Initial scan
 scanForGeneratedImages(platform);

 // Watch for new images via MutationObserver — debounced to avoid thrashing,
 // and watching attribute changes to catch src-swap regenerations
 const debouncedScan = debounce(() => scanForGeneratedImages(platform), 50);

 const observer = new MutationObserver(debouncedScan);

 observer.observe(document.body, {
 childList: true,
 subtree: true,
 attributes: true,
 attributeFilter: ["src"],
 });

 console.log(`[GAL] Asset clipboard initialized for platform: ${platform}`);
}
