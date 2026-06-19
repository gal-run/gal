/**
 * Platform config scanner registry.
 *
 * Maps platform hostnames to their scanner functions so the content script
 * can invoke the correct scanner based on the current page URL.
 *
 * Scanning is always manual (user-triggered) -- never automatic.
 */

import type { PlatformConfigResult } from "./types";
import { scanGeminiGems } from "./gemini-gems-scanner";
import { scanAIStudio } from "./ai-studio-scanner";
import { scanHiggsfield } from "./higgsfield-scanner";
import { scanKling } from "./kling-scanner";
import { scanSora } from "./sora-scanner";

export type { PlatformConfigResult } from "./types";

/** A scanner function that reads config from the current page DOM. */
type ScannerFn = () => PlatformConfigResult;

/**
 * Registry mapping hostname substrings to scanner functions.
 *
 * The scanner is selected by checking if the current page's hostname
 * contains the key string. More specific entries are checked first.
 */
const SCANNER_REGISTRY: Array<{ hostPattern: string; scanner: ScannerFn }> = [
  // AI Studio must be checked before generic gemini.google.com
  { hostPattern: "aistudio.google.com", scanner: scanAIStudio },
  // Gemini Gems -- only on gemini.google.com (not aistudio)
  { hostPattern: "gemini.google.com", scanner: scanGeminiGems },
  // Higgsfield Cinema Studio
  { hostPattern: "higgsfield.ai", scanner: scanHiggsfield },
  // Kling AI
  { hostPattern: "klingai.com", scanner: scanKling },
  // Sora (OpenAI video/image generation)
  { hostPattern: "sora.chatgpt.com", scanner: scanSora },
];

/**
 * Find and run the appropriate scanner for the given URL.
 *
 * Returns null if no scanner is registered for the URL's hostname.
 */
export function scanPlatformConfig(url?: string): PlatformConfigResult | null {
  const targetUrl = url ?? location.href;
  let hostname: string;

  try {
    hostname = new URL(targetUrl).hostname;
  } catch {
    return null;
  }

  for (const { hostPattern, scanner } of SCANNER_REGISTRY) {
    if (hostname.includes(hostPattern)) {
      try {
        return scanner();
      } catch (error) {
        console.error(`[GAL] Scanner error for ${hostPattern}:`, error);
        return {
          platform: hostPattern,
          scannedAt: new Date().toISOString(),
          summary: `Scan failed: ${error instanceof Error ? error.message : "unknown error"}`,
          config: { error: true },
        };
      }
    }
  }

  return null;
}

/**
 * Check whether a config scanner is available for the given URL.
 */
export function hasScannerForUrl(url?: string): boolean {
  const targetUrl = url ?? location.href;
  try {
    const hostname = new URL(targetUrl).hostname;
    return SCANNER_REGISTRY.some(({ hostPattern }) =>
      hostname.includes(hostPattern),
    );
  } catch {
    return false;
  }
}

/**
 * List all supported scanner platform patterns (for display in UI).
 */
export function getSupportedPlatforms(): string[] {
  return SCANNER_REGISTRY.map(({ hostPattern }) => hostPattern);
}
