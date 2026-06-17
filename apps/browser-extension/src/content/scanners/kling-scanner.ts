/**
 * Kling AI (app.klingai.com) config scanner.
 *
 * Reads image generation and video generation settings from the Kling AI UI.
 *
 * Key selectors (from issue ):
 *   - Model:  .el-select.ai-web-select-model-version .name-new
 *   - Prompt: .tiptap.ProseMirror
 *   - Settings panel: only in DOM after .setting-select is clicked
 *
 * Pages:
 *   - Image gen: /global/image/new  (model, prompt, mode, aspect ratio, output count)
 *   - Video gen: /global/video/new  (model, prompt, mode, duration, aspect ratio)
 */

import type { PlatformConfigResult, KlingConfig } from "./types";

type KlingMode = "image" | "video" | null;

/**
 * Detect whether we are on an image or video generation page.
 */
function detectKlingMode(): KlingMode {
  const path = location.pathname;
  if (path.includes("/image")) return "image";
  if (path.includes("/video")) return "video";
  return null;
}

/**
 * Read the selected model name.
 */
function readModel(): string {
  // Primary selector from issue spec
  const modelEl = document.querySelector(
    ".el-select.ai-web-select-model-version .name-new",
  );
  if (modelEl?.textContent?.trim()) {
    return modelEl.textContent.trim();
  }

  // Fallback: broader search for model selectors
  const fallbacks = [
    ".model-version-select .name-new",
    ".ai-web-select-model-version .el-select__selected-item",
    '[class*="model-select"] .name',
    '[class*="model-version"] .selected',
  ];

  for (const sel of fallbacks) {
    const el = document.querySelector(sel);
    if (el?.textContent?.trim()) return el.textContent.trim();
  }

  return "unknown";
}

/**
 * Read the prompt text from the Tiptap/ProseMirror editor.
 */
function readPrompt(): string {
  const editor = document.querySelector<HTMLElement>(".tiptap.ProseMirror");
  if (editor) {
    // Tiptap uses contenteditable; textContent gives us the plain text
    return editor.textContent?.trim() ?? "";
  }

  // Fallback: textarea or other input
  const textarea = document.querySelector<HTMLTextAreaElement>(
    'textarea[placeholder*="prompt" i], textarea[placeholder*="describe" i]',
  );
  return textarea?.value?.trim() ?? "";
}

/**
 * Read the generation mode (e.g., "Standard", "Pro", "Professional").
 * Kling typically shows mode as a segmented button group or dropdown.
 */
function readGenerationMode(): string {
  // Look for active/selected mode buttons
  const activeMode = document.querySelector(
    '.mode-select [aria-pressed="true"], .mode-selector .active, .mode-tab.active, [class*="mode-select"] .is-active',
  );
  if (activeMode?.textContent?.trim()) {
    return activeMode.textContent.trim();
  }

  // Check for an el-radio-group with selected item
  const radioSelected = document.querySelector(
    '.el-radio-group .el-radio-button.is-active .el-radio-button__inner, .mode-group .selected',
  );
  if (radioSelected?.textContent?.trim()) {
    return radioSelected.textContent.trim();
  }

  return "unknown";
}

/**
 * Read the aspect ratio setting.
 * Kling shows aspect ratios as selectable buttons (e.g., "1:1", "16:9", "9:16").
 */
function readAspectRatio(): string {
  const activeRatio = document.querySelector(
    '.ratio-select [aria-pressed="true"], .ratio-selector .active, .aspect-ratio-item.active, [class*="ratio"] .is-active, [class*="aspect"] .selected',
  );
  if (activeRatio?.textContent?.trim()) {
    return activeRatio.textContent.trim();
  }

  // Look for aspect ratio in any button group
  const buttons = document.querySelectorAll(
    '[class*="ratio"] button, [class*="aspect"] button',
  );
  for (const btn of buttons) {
    const text = btn.textContent?.trim() ?? "";
    if (/^\d+:\d+$/.test(text) && btn.classList.contains("active")) {
      return text;
    }
    // Check for active class patterns in Element UI
    if (
      btn.closest(".is-active") ||
      btn.getAttribute("aria-pressed") === "true"
    ) {
      const match = text.match(/(\d+:\d+)/);
      if (match) return match[1];
    }
  }

  return "unknown";
}

/**
 * Read the output count for image generation.
 * Kling allows selecting 1-4 images per generation.
 */
function readOutputCount(): number | null {
  const countEl = document.querySelector(
    '.output-count .active, .image-count .is-active, [class*="num-select"] .active',
  );
  if (countEl?.textContent?.trim()) {
    const parsed = parseInt(countEl.textContent.trim(), 10);
    if (!isNaN(parsed)) return parsed;
  }

  // Look for a number input
  const numInput = document.querySelector<HTMLInputElement>(
    'input[type="number"][class*="count"], .el-input-number input',
  );
  if (numInput) {
    const parsed = parseInt(numInput.value, 10);
    if (!isNaN(parsed)) return parsed;
  }

  return null;
}

/**
 * Read the video duration setting.
 * Kling offers duration options like "5s", "10s".
 */
function readDuration(): string {
  const activeDuration = document.querySelector(
    '.duration-select .active, .duration-selector .is-active, [class*="duration"] .selected',
  );
  if (activeDuration?.textContent?.trim()) {
    return activeDuration.textContent.trim();
  }

  // Check segmented buttons
  const buttons = document.querySelectorAll('[class*="duration"] button');
  for (const btn of buttons) {
    if (
      btn.classList.contains("active") ||
      btn.classList.contains("is-active") ||
      btn.getAttribute("aria-pressed") === "true"
    ) {
      const text = btn.textContent?.trim() ?? "";
      if (text) return text;
    }
  }

  return "unknown";
}

/**
 * Scan Kling AI generation configuration.
 *
 * Detects whether the user is on the image or video generation page
 * and reads the relevant settings.
 */
export function scanKling(): PlatformConfigResult {
  const mode = detectKlingMode();

  if (!mode) {
    return {
      platform: "kling",
      scannedAt: new Date().toISOString(),
      summary: "Not on an image or video generation page.",
      config: { mode: null },
    };
  }

  const model = readModel();
  const prompt = readPrompt();
  const generationMode = readGenerationMode();
  const aspectRatio = readAspectRatio();

  let config: KlingConfig;
  const parts: string[] = [`Mode: ${mode}`, `Model: ${model}`];

  if (mode === "image") {
    const outputCount = readOutputCount();
    config = {
      mode: "image",
      model,
      prompt,
      generationMode,
      aspectRatio,
      outputCount,
    };
    if (generationMode !== "unknown") parts.push(`Gen: ${generationMode}`);
    parts.push(`Ratio: ${aspectRatio}`);
    if (outputCount !== null) parts.push(`Count: ${outputCount}`);
  } else {
    const duration = readDuration();
    config = {
      mode: "video",
      model,
      prompt,
      generationMode,
      duration,
      aspectRatio,
    };
    if (generationMode !== "unknown") parts.push(`Gen: ${generationMode}`);
    parts.push(`Duration: ${duration}`);
    parts.push(`Ratio: ${aspectRatio}`);
  }

  if (prompt) parts.push("Has prompt");

  return {
    platform: "kling",
    scannedAt: new Date().toISOString(),
    summary: parts.join(" | "),
    config: config as unknown as Record<string, unknown>,
  };
}
