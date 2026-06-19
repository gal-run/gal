/**
 * AI Studio (aistudio.google.com) config scanner.
 *
 * Reads the Run Settings sidebar state on demand. AI Studio does not
 * persist "saved agents" -- everything is ephemeral in the current session.
 *
 * Key selectors (from issue ):
 *   - Model:              ms-model-selector [data-test-id="model-name"]
 *   - Temperature:        [role="slider"][aria-valuenow] inside temperature section
 *   - System instructions: textarea.in-run-settings
 *   - Tool toggles:       .settings-item.settings-tool (check toggle state)
 *
 * IMPORTANT: Never use #mat-select-N -- these are dynamic Angular IDs that
 * change across page loads.
 */

import type { PlatformConfigResult, AIStudioConfig, AIStudioToolState } from "./types";

/**
 * Read the currently selected model name from the model selector.
 */
function readModel(): string {
  // Primary selector: the data-test-id used by Angular's model selector
  const modelEl = document.querySelector(
    'ms-model-selector [data-test-id="model-name"]',
  );
  if (modelEl?.textContent?.trim()) {
    return modelEl.textContent.trim();
  }

  // Fallback: look for any element with model-name data attribute
  const fallback = document.querySelector('[data-test-id="model-name"]');
  if (fallback?.textContent?.trim()) {
    return fallback.textContent.trim();
  }

  // Last resort: look for the model display in the run settings panel
  const runSettingsModel = document.querySelector(
    '.run-settings-section .model-name, .run-settings .model-selector-text',
  );
  return runSettingsModel?.textContent?.trim() ?? "unknown";
}

/**
 * Read the temperature slider value.
 * AI Studio uses an aria-valuenow attribute on a slider role element.
 */
function readTemperature(): number | null {
  // Find sliders with aria-valuenow -- the temperature slider is typically
  // the first one in the run settings panel.
  const sliders = document.querySelectorAll<HTMLElement>(
    '.run-settings [role="slider"][aria-valuenow], .settings-section [role="slider"][aria-valuenow]',
  );

  for (const slider of sliders) {
    // Check if this slider is in a temperature-related section
    const parent = slider.closest(".settings-section, .settings-item, .run-settings-section");
    const label = parent?.querySelector("label, .section-title, .setting-label");
    const labelText = label?.textContent?.toLowerCase() ?? "";

    if (labelText.includes("temperature") || sliders.length === 1) {
      const value = slider.getAttribute("aria-valuenow");
      if (value !== null) {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) return parsed;
      }
    }
  }

  // Fallback: look for a temperature input field
  const tempInput = document.querySelector<HTMLInputElement>(
    'input[aria-label*="temperature" i], input[data-test-id*="temperature" i]',
  );
  if (tempInput) {
    const parsed = parseFloat(tempInput.value);
    if (!isNaN(parsed)) return parsed;
  }

  return null;
}

/**
 * Read system instructions from the run-settings textarea.
 */
function readSystemInstructions(): string {
  const textarea = document.querySelector<HTMLTextAreaElement>(
    "textarea.in-run-settings",
  );
  if (textarea) return textarea.value.trim();

  // Fallback: look for system instructions in other common locations
  const fallback = document.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label*="system" i], textarea[placeholder*="system" i]',
  );
  return fallback?.value?.trim() ?? "";
}

/**
 * Read a mat-select value by its aria-label.
 * AI Studio uses Angular Material selects with dynamic IDs (#mat-select-N)
 * that must NEVER be used. Instead we select by aria-label.
 */
function readMatSelectByLabel(label: string): string | null {
  const select = document.querySelector<HTMLElement>(
    `mat-select[aria-label="${label}"]`,
  );
  if (!select) return null;

  const valueEl = select.querySelector(".mat-mdc-select-min-line");
  return valueEl?.textContent?.trim() ?? null;
}

/**
 * Read the aspect ratio setting from the Run Settings sidebar.
 */
function readAspectRatio(): string | null {
  return readMatSelectByLabel("Aspect ratio");
}

/**
 * Read the resolution setting from the Run Settings sidebar.
 */
function readResolution(): string | null {
  return readMatSelectByLabel("Resolution");
}

/**
 * Read the thinking level setting from the Run Settings sidebar.
 */
function readThinkingLevel(): string | null {
  return readMatSelectByLabel("Thinking Level");
}

/**
 * Read tool toggle states from the settings panel.
 * Tools appear as .settings-item.settings-tool elements with toggle switches.
 */
function readTools(): AIStudioToolState[] {
  const tools: AIStudioToolState[] = [];

  const toolItems = document.querySelectorAll(
    ".settings-item.settings-tool, .tool-toggle-item",
  );

  toolItems.forEach((item) => {
    const nameEl = item.querySelector(
      ".setting-label, .tool-name, label, .settings-item-label",
    );
    const name = nameEl?.textContent?.trim() ?? "unknown";

    // Check for Angular Material toggle or standard checkbox
    const toggle = item.querySelector<HTMLElement>(
      'mat-slide-toggle, [role="switch"], input[type="checkbox"]',
    );

    let enabled = false;
    if (toggle) {
      if (toggle.tagName === "INPUT") {
        enabled = (toggle as HTMLInputElement).checked;
      } else {
        // mat-slide-toggle uses aria-checked or class-based state
        const ariaChecked = toggle.getAttribute("aria-checked");
        enabled =
          ariaChecked === "true" ||
          toggle.classList.contains("mat-mdc-slide-toggle-checked") ||
          toggle.classList.contains("mat-checked");
      }
    }

    tools.push({ name, enabled });
  });

  return tools;
}

/**
 * Scan AI Studio run-settings configuration.
 *
 * Reads the current session state from the Run Settings sidebar.
 * Returns the model, temperature, system instructions, and tool toggles.
 */
export function scanAIStudio(): PlatformConfigResult {
  const model = readModel();
  const temperature = readTemperature();
  const aspectRatio = readAspectRatio();
  const resolution = readResolution();
  const thinkingLevel = readThinkingLevel();
  const systemInstructions = readSystemInstructions();
  const tools = readTools();

  const studioConfig: AIStudioConfig = {
    model,
    temperature,
    aspectRatio,
    resolution,
    thinkingLevel,
    systemInstructions,
    tools,
  };

  const parts: string[] = [`Model: ${model}`];
  if (temperature !== null) parts.push(`Temp: ${temperature}`);
  if (aspectRatio) parts.push(`Ratio: ${aspectRatio}`);
  if (resolution) parts.push(`Res: ${resolution}`);
  if (thinkingLevel) parts.push(`Thinking: ${thinkingLevel}`);
  if (systemInstructions) parts.push("Has system instructions");
  if (tools.length > 0) {
    const enabled = tools.filter((t) => t.enabled).length;
    parts.push(`Tools: ${enabled}/${tools.length} enabled`);
  }

  return {
    platform: "ai-studio",
    scannedAt: new Date().toISOString(),
    summary: parts.join(" | "),
    config: studioConfig as unknown as Record<string, unknown>,
  };
}
