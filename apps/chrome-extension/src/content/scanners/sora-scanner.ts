/**
 * Sora (sora.chatgpt.com) config scanner.
 *
 * Reads the prompt and toolbar combobox controls from Sora's video/image
 * generation UI.
 *
 * Key selectors (from):
 * - Prompt: textarea[placeholder="Describe your video..."]
 * - Controls: [role="combobox"] buttons matched by text pattern
 * - Media type: "Video" or "Image"
 * - Aspect ratio: \d+:\d+
 * - Resolution: \d+p
 * - Duration: \d+s
 * - Variations: \d+v
 * - Style: icon-only combobox -- read from the controlled listbox
 *
 * Manifest addition required: sora.chatgpt.com in host_permissions,
 * content_scripts, and web_accessible_resources.
 */

import type { PlatformConfigResult, SoraConfig } from "./types";

/**
 * Read the prompt textarea.
 */
function readPrompt(): string {
 const textarea = document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Describe your video..."]',);
 if (textarea) return textarea.value.trim();

 // Fallback: any textarea with a video/image description placeholder
 const fallback = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="Describe" i], textarea[placeholder*="video" i]',);
 return fallback?.value?.trim() ?? "";
}

/**
 * Read all [role="combobox"] buttons and classify them by their text content.
 *
 * Sora toolbar controls are all combobox buttons. We identify each by the
 * pattern of its visible text:
 * - Media type: exact "Video" or "Image"
 * - Aspect ratio: digits:digits (e.g. "16:9")
 * - Resolution: digits + "p" (e.g. "1080p")
 * - Duration: digits + "s" (e.g. "10s")
 * - Variations: digits + "v" (e.g. "4v")
 *
 * The style combobox is icon-only (no meaningful text), so we read its
 * selected value from the controlled listbox.
 */
function readComboboxControls(): Omit<SoraConfig, "prompt"> {
 const result: Omit<SoraConfig, "prompt"> = {
 mediaType: null,
 aspectRatio: null,
 resolution: null,
 duration: null,
 variations: null,
 style: null,
 };

 const comboboxes = document.querySelectorAll<HTMLElement>('[role="combobox"]',);

 for (const cb of comboboxes) {
 const text = cb.textContent?.trim() ?? "";

 if (/^(Video|Image)$/i.test(text)) {
 result.mediaType = text;
 } else if (/^\d+:\d+$/.test(text)) {
 result.aspectRatio = text;
 } else if (/^\d+p$/.test(text)) {
 result.resolution = text;
 } else if (/^\d+s$/.test(text)) {
 result.duration = text;
 } else if (/^\d+v$/.test(text)) {
 result.variations = text;
 } else if (!text || text.length <= 2) {
 // Icon-only combobox -- likely the style selector.
 // Read the selected style from the controlled listbox.
 result.style = readStyleFromCombobox(cb);
 }
 }

 return result;
}

/**
 * Read the currently selected style from an icon-only combobox.
 *
 * The combobox's aria-controls points to a listbox element. The selected
 * option within that listbox has aria-selected="true".
 */
function readStyleFromCombobox(combobox: HTMLElement): string | null {
 const controlsId = combobox.getAttribute("aria-controls");
 if (controlsId) {
 const listbox = document.getElementById(controlsId);
 if (listbox) {
 const selected = listbox.querySelector('[aria-selected="true"]');
 if (selected?.textContent?.trim()) {
 return selected.textContent.trim();
 }
 }
 }

 // Fallback: check aria-label or title on the combobox itself
 const label =
 combobox.getAttribute("aria-label") ??
 combobox.getAttribute("title") ??
 null;
 if (label && /style/i.test(label)) {
 // Try to find a selected option by traversing siblings or popover
 const popover = document.querySelector('[role="listbox"] [aria-selected="true"]',);
 if (popover?.textContent?.trim()) {
 return popover.textContent.trim();
 }
 }

 return null;
}

/**
 * Scan Sora video/image generation configuration.
 *
 * Reads the prompt textarea and all toolbar combobox controls.
 */
export function scanSora(): PlatformConfigResult {
 const prompt = readPrompt();
 const controls = readComboboxControls();

 const soraConfig: SoraConfig = {
 prompt,
...controls,
 };

 const parts: string[] = [];
 if (controls.mediaType) parts.push(`Type: ${controls.mediaType}`);
 if (controls.aspectRatio) parts.push(`Ratio: ${controls.aspectRatio}`);
 if (controls.resolution) parts.push(`Res: ${controls.resolution}`);
 if (controls.duration) parts.push(`Duration: ${controls.duration}`);
 if (controls.variations) parts.push(`Variations: ${controls.variations}`);
 if (controls.style) parts.push(`Style: ${controls.style}`);
 if (prompt) parts.push("Has prompt");

 const summary =
 parts.length > 0
 ? parts.join(" | ")
 : "No Sora config detected. Open the Sora generation UI.";

 return {
 platform: "sora",
 scannedAt: new Date().toISOString(),
 summary,
 config: soraConfig as unknown as Record<string, unknown>,
 };
}
