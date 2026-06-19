/**
 * Gemini Gems config scanner.
 *
 * Reads Gem configuration from the Gem Manager edit view at
 * gemini.google.com/gems/view. For each gem the user opens in Edit mode,
 * we read the name, description, and instructions fields.
 *
 * Key selectors (from issue ):
 *   - Name:         input[aria-label="Input for a Gem name"]
 *   - Description:  textarea.description-input
 *   - Instructions: .instructions-input-container .ql-editor
 *
 * The instructions field uses a Quill.js rich-text editor -- we read
 * .textContent (not .value) to get plain text.
 */

import type { PlatformConfigResult, GeminiGemConfig } from "./types";

/**
 * Extract the gem ID from the current URL.
 * Gem edit pages have paths like /gem/{GEM_ID} or /gems/view/{GEM_ID}.
 */
function extractGemId(): string | null {
  const match = location.pathname.match(/\/gem(?:s\/view)?\/([^/?#]+)/);
  return match ? match[1] : null;
}

/**
 * Read text from a Quill.js editor container.
 * Quill renders content inside a .ql-editor div; we use .textContent
 * to get the plain text representation.
 */
function readQuillEditor(container: Element | null): string {
  if (!container) return "";
  const editor = container.querySelector(".ql-editor");
  return editor?.textContent?.trim() ?? "";
}

/**
 * Read the configuration of the currently open Gem edit view.
 * Returns null if the edit view is not open or required fields are missing.
 */
function readCurrentGemConfig(): GeminiGemConfig | null {
  const nameInput = document.querySelector<HTMLInputElement>(
    'input[aria-label="Input for a Gem name"]',
  );
  // Fall back to any input inside a gem-name wrapper if aria-label is absent
  const nameEl =
    nameInput ??
    document.querySelector<HTMLInputElement>('.gem-name-input input, [data-testid="gem-name"] input');

  if (!nameEl) return null;

  const name = nameEl.value.trim();

  const descTextarea = document.querySelector<HTMLTextAreaElement>(
    "textarea.description-input",
  );
  const description = descTextarea?.value?.trim() ?? "";

  const instructionsContainer = document.querySelector(
    ".instructions-input-container",
  );
  const instructions = readQuillEditor(instructionsContainer);

  const gemId = extractGemId();

  return { gemId, name, description, instructions };
}

/**
 * Enumerate "My Gems" from the Gem Manager list page (/gems/view).
 * Each gem link contains an href to /gem/{ID}. We collect basic metadata
 * (id + name) for gems visible in the DOM. Full config requires opening
 * each gem's edit view.
 */
function enumerateMyGems(): Array<{ gemId: string; name: string }> {
  const gems: Array<{ gemId: string; name: string }> = [];
  const links = document.querySelectorAll('a[href*="/gem/"]');
  const seen = new Set<string>();

  links.forEach((el) => {
    const href = (el as HTMLAnchorElement).href;
    const match = href.match(/\/gem\/([^/?#]+)/);
    if (!match) return;

    const gemId = match[1];
    if (seen.has(gemId)) return;
    seen.add(gemId);

    const name =
      (el as HTMLElement).textContent?.trim() ||
      el.querySelector("h2, h3, span")?.textContent?.trim() ||
      gemId;

    gems.push({ gemId, name });
  });

  return gems;
}

/**
 * Scan Gemini Gems configuration.
 *
 * Behaviour depends on the current page:
 * - On a Gem edit page: reads full config (name, description, instructions).
 * - On the Gem Manager list (/gems/view): enumerates visible "My Gems".
 */
export function scanGeminiGems(): PlatformConfigResult {
  const currentGem = readCurrentGemConfig();
  const listedGems = enumerateMyGems();

  const config: Record<string, unknown> = {};
  let summary: string;

  if (currentGem) {
    config.currentGem = currentGem;
    summary = `Read Gem config: "${currentGem.name}"`;
  } else if (listedGems.length > 0) {
    config.gems = listedGems;
    summary = `Found ${listedGems.length} Gem(s) in Gem Manager`;
  } else {
    summary = "No Gem config detected. Open a Gem edit view or the Gem Manager.";
  }

  if (listedGems.length > 0 && currentGem) {
    config.gems = listedGems;
  }

  return {
    platform: "gemini-gems",
    scannedAt: new Date().toISOString(),
    summary,
    config,
  };
}
