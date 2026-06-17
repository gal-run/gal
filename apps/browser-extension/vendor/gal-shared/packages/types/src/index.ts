/**
 * Shared type definitions for the GAL browser extension.
 *
 * These types describe the data contracts exchanged with the GAL API
 * (telemetry pipeline, audience tiers, active design project summaries)
 * and the public-facing legal URLs surfaced in the login view.
 */

// ---- Legal / public URLs ----

/** Public Terms of Service URL shown in the login view. */
export const GAL_TERMS_URL = "https://gal.run/terms";

/** Public Privacy Policy URL shown in the login view. */
export const GAL_PRIVACY_URL = "https://gal.run/privacy";

// ---- Audience tiers ----

/**
 * Visibility tiers for feature-flagged pages. Ordered from least to most
 * privileged: a higher tier satisfies any requirement at or below it.
 */
export type AudienceTier = "public" | "free" | "partners" | "internal";

// ---- Active design project summary ----

/**
 * Lightweight summary of the user's active design project, persisted in
 * chrome.storage and surfaced as a progress card in the popup.
 */
export interface ActiveDesignProjectSummary {
  /** Project type label (e.g. "video", "image"). */
  type: string;
  /** Human-readable project name. */
  name: string;
  /** Total number of scenes in the project. */
  totalScenes: number;
  /** Number of scenes completed so far. */
  completedScenes: number;
}

// ---- Telemetry ----

/**
 * Telemetry event type identifiers emitted by the extension. Open-ended on
 * purpose so new event names can be added without a type bump; the
 * `extension.*` namespace is the convention used today.
 */
export type TelemetryEventType = `extension.${string}` | (string & {});

/** Severity levels for telemetry events. */
export type TelemetrySeverity = "DEBUG" | "INFO" | "WARN" | "ERROR";

/**
 * Attribute bag attached to a telemetry event. Values are flattened to
 * primitives before transmission; `undefined` values are dropped.
 */
export type ExtensionEventAttributes = Record<
  string,
  string | number | boolean | null | undefined
>;

/** Resource descriptor attached to every telemetry event. */
export interface TelemetryResource {
  "service.name": string;
  "service.version": string;
  "host.os": "darwin" | "linux" | "win32";
  "host.arch": string;
}

/**
 * Enhanced telemetry event envelope (schema v2) posted to the GAL API
 * telemetry pipeline.
 */
export interface EnhancedTelemetryEvent {
  id: string;
  timestamp: string;
  severity: TelemetrySeverity;
  resource: TelemetryResource;
  eventType: TelemetryEventType;
  attributes: Record<string, string | number | boolean | null>;
  installationId: string;
}
