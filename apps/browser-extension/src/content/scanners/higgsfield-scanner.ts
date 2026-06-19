/**
 * Higgsfield Cinema Studio (higgsfield.ai/cinema-studio) config scanner.
 *
 * Reads the toolbar state: camera setup, aspect ratio, resolution, and
 * grid layout from the Cinema Studio UI.
 *
 * Key selectors (from issue ):
 *   - Camera button: find button whose text contains "mm" and "f/"
 *   - Aspect ratio / resolution: regex on toolbar button text
 *   - Saved cameras: "Saved" tab inside the camera selector popover
 */

import type {
  PlatformConfigResult,
  HiggsFieldConfig,
  HiggsFieldCamera,
} from "./types";

/**
 * Parse camera parameters from a button label.
 * Expected format examples: "35mm f/1.4", "50mm f/2.8", "24mm f/1.8"
 */
function parseCameraLabel(text: string): HiggsFieldCamera | null {
  const focalMatch = text.match(/(\d+)\s*mm/i);
  const apertureMatch = text.match(/f\/([\d.]+)/i);

  if (!focalMatch && !apertureMatch) return null;

  return {
    focalLength: focalMatch ? `${focalMatch[1]}mm` : null,
    aperture: apertureMatch ? `f/${apertureMatch[1]}` : null,
    label: text.trim(),
  };
}

/**
 * Find the active camera setup from toolbar buttons.
 * The camera button contains text like "35mm f/1.4".
 */
function readActiveCamera(): HiggsFieldCamera | null {
  // Look through all buttons for one containing camera-like text
  const buttons = document.querySelectorAll("button");
  for (const btn of buttons) {
    const text = btn.textContent ?? "";
    // Camera buttons contain both "mm" (focal length) and "f/" (aperture)
    if (text.includes("mm") && text.includes("f/")) {
      const camera = parseCameraLabel(text);
      if (camera) return camera;
    }
  }

  // Fallback: look for camera selector elements with data attributes
  const cameraSelector = document.querySelector(
    '[data-testid="camera-selector"], .camera-selector, .camera-setup-btn',
  );
  if (cameraSelector) {
    const text = cameraSelector.textContent ?? "";
    return parseCameraLabel(text);
  }

  return null;
}

/**
 * Read aspect ratio from toolbar.
 * Common patterns: "16:9", "9:16", "4:3", "1:1", "21:9"
 */
function readAspectRatio(): string | null {
  const buttons = document.querySelectorAll("button");
  for (const btn of buttons) {
    const text = btn.textContent?.trim() ?? "";
    // Match common aspect ratios
    if (/^\d+:\d+$/.test(text)) {
      return text;
    }
  }

  // Look for active/selected aspect ratio in a group
  const activeRatio = document.querySelector(
    '.aspect-ratio-selector [aria-pressed="true"], .aspect-ratio-group .active, [data-testid="aspect-ratio"] .selected',
  );
  if (activeRatio) {
    const text = activeRatio.textContent?.trim() ?? "";
    const match = text.match(/(\d+:\d+)/);
    if (match) return match[1];
  }

  return null;
}

/**
 * Read resolution from toolbar.
 * Common patterns: "1920x1080", "4K", "1080p", "720p"
 */
function readResolution(): string | null {
  const buttons = document.querySelectorAll("button");
  for (const btn of buttons) {
    const text = btn.textContent?.trim() ?? "";
    // Match resolution patterns
    if (/^\d{3,4}[xX]\d{3,4}$/.test(text) || /^\d{3,4}p$/.test(text) || /^\d+K$/i.test(text)) {
      return text;
    }
  }

  // Look for resolution in a settings panel or toolbar group
  const resEl = document.querySelector(
    '.resolution-selector [aria-pressed="true"], .resolution-group .active, [data-testid="resolution"] .selected',
  );
  if (resEl) {
    const text = resEl.textContent?.trim() ?? "";
    const match = text.match(/(\d{3,4}[xX]\d{3,4}|\d{3,4}p|\d+K)/i);
    if (match) return match[1];
  }

  return null;
}

/**
 * Read the current grid layout from toolbar.
 * Grid layouts may be "2x2", "3x3", "1x1", etc.
 */
function readGridLayout(): string | null {
  const buttons = document.querySelectorAll("button");
  for (const btn of buttons) {
    const text = btn.textContent?.trim() ?? "";
    // Match grid patterns
    if (/^\d+[xX]\d+$/.test(text) && text.includes("x")) {
      // Exclude resolutions (4 digits) -- grid layouts are small numbers
      const parts = text.toLowerCase().split("x");
      if (parseInt(parts[0]) <= 10 && parseInt(parts[1]) <= 10) {
        return text;
      }
    }
  }

  const gridEl = document.querySelector(
    '.grid-layout-selector [aria-pressed="true"], .grid-selector .active, [data-testid="grid-layout"]',
  );
  if (gridEl) {
    const text = gridEl.textContent?.trim() ?? "";
    const match = text.match(/(\d+[xX]\d+)/);
    if (match) return match[1];
  }

  return null;
}

/**
 * Read saved camera setups from the "Saved" tab in the camera selector.
 * These are only visible when the camera selector popover is open.
 */
function readSavedCameras(): HiggsFieldCamera[] {
  const cameras: HiggsFieldCamera[] = [];

  // Look for saved camera items in any popover or panel
  const savedItems = document.querySelectorAll(
    '.saved-cameras-list [role="option"], .camera-presets-saved .preset-item, .saved-tab .camera-item',
  );

  savedItems.forEach((item) => {
    const text = item.textContent ?? "";
    const camera = parseCameraLabel(text);
    if (camera) cameras.push(camera);
  });

  // Also check for a list of saved presets in button form
  if (cameras.length === 0) {
    const presetButtons = document.querySelectorAll(
      ".camera-preset-btn, .saved-camera-btn",
    );
    presetButtons.forEach((btn) => {
      const text = btn.textContent ?? "";
      const camera = parseCameraLabel(text);
      if (camera) cameras.push(camera);
    });
  }

  return cameras;
}

/**
 * Scan Higgsfield Cinema Studio toolbar configuration.
 *
 * Reads camera setup, aspect ratio, resolution, and grid layout
 * from the currently visible toolbar state.
 */
export function scanHiggsfield(): PlatformConfigResult {
  const camera = readActiveCamera();
  const aspectRatio = readAspectRatio();
  const resolution = readResolution();
  const gridLayout = readGridLayout();
  const savedCameras = readSavedCameras();

  const higgsConfig: HiggsFieldConfig = {
    camera,
    aspectRatio,
    resolution,
    gridLayout,
    savedCameras,
  };

  const parts: string[] = [];
  if (camera) parts.push(`Camera: ${camera.label}`);
  if (aspectRatio) parts.push(`Ratio: ${aspectRatio}`);
  if (resolution) parts.push(`Res: ${resolution}`);
  if (gridLayout) parts.push(`Grid: ${gridLayout}`);
  if (savedCameras.length > 0) parts.push(`${savedCameras.length} saved camera(s)`);

  const summary =
    parts.length > 0
      ? parts.join(" | ")
      : "No Cinema Studio config detected. Open the Cinema Studio toolbar.";

  return {
    platform: "higgsfield",
    scannedAt: new Date().toISOString(),
    summary,
    config: higgsConfig as unknown as Record<string, unknown>,
  };
}
