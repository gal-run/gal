/**
 * Shared types for platform config scanners.
 *
 * Each scanner reads the current DOM state of its platform and returns
 * a structured config snapshot. Scanning is manual (user-triggered via
 * popup or keyboard shortcut) -- never automatic/background.
 */

/** Result returned by every platform scanner. */
export interface PlatformConfigResult {
  /** Platform identifier (matches detectPlatform() values). */
  platform: string;
  /** ISO timestamp of when the scan was performed. */
  scannedAt: string;
  /** Human-readable summary of what was found. */
  summary: string;
  /** Platform-specific configuration data. */
  config: Record<string, unknown>;
}

/** Gemini Gem config read from the Edit view. */
export interface GeminiGemConfig {
  gemId: string | null;
  name: string;
  description: string;
  instructions: string;
}

/** AI Studio run-settings snapshot. */
export interface AIStudioConfig {
  model: string;
  temperature: number | null;
  aspectRatio: string | null;
  resolution: string | null;
  thinkingLevel: string | null;
  systemInstructions: string;
  tools: AIStudioToolState[];
}

export interface AIStudioToolState {
  name: string;
  enabled: boolean;
}

/** Higgsfield Cinema Studio toolbar state. */
export interface HiggsFieldConfig {
  camera: HiggsFieldCamera | null;
  aspectRatio: string | null;
  resolution: string | null;
  gridLayout: string | null;
  savedCameras: HiggsFieldCamera[];
}

export interface HiggsFieldCamera {
  focalLength: string | null;
  aperture: string | null;
  label: string;
}

/** Kling AI generation config. */
export interface KlingImageConfig {
  mode: "image";
  model: string;
  prompt: string;
  generationMode: string;
  aspectRatio: string;
  outputCount: number | null;
}

export interface KlingVideoConfig {
  mode: "video";
  model: string;
  prompt: string;
  generationMode: string;
  duration: string;
  aspectRatio: string;
}

export type KlingConfig = KlingImageConfig | KlingVideoConfig;

/** Sora generation config. */
export interface SoraConfig {
  prompt: string;
  mediaType: string | null;
  aspectRatio: string | null;
  resolution: string | null;
  duration: string | null;
  variations: string | null;
  style: string | null;
}
