/**
 * Shared telemetry constants across all GAL surfaces.
 *
 * Sentry DSNs are public (safe to embed in client code).
 * They only allow sending events to the project, not reading.
 */

/** Environment detection */
export function getEnvironment(): "production" | "development" | "test" {
  if (typeof process !== "undefined") {
    if (process.env["NODE_ENV"] === "test" || process.env["VITEST"])
      return "test";
    if (process.env["NODE_ENV"] === "production") return "production";
  }
  return "development";
}

/** Check if telemetry should be disabled */
export function isTelemetryDisabled(): boolean {
  if (typeof process !== "undefined") {
    return (
      process.env["GAL_TELEMETRY_DISABLED"] === "1" ||
      process.env["GAL_TELEMETRY_DISABLED"] === "true" ||
      process.env["DO_NOT_TRACK"] === "1"
    );
  }
  return false;
}

/** Telemetry API configuration */
export const TELEMETRY_API = {
  eventsEndpoint: "/telemetry/events",
  feedbackEndpoint: "/telemetry/feedback",
  batchSize: 100,
  flushIntervalMs: 30_000,
  requestTimeoutMs: 5_000,
} as const;

/** Event name constants for consistent tracking across surfaces */
export const EVENT_NAMES = {
  // Discovery
  DISCOVERY_SCAN_INITIATED: "discovery_scan_initiated",
  DISCOVERY_REPOS_FOUND: "discovery_repos_found",
  DISCOVERY_CONFIGS_DETECTED: "discovery_configs_detected",

  // Config approval
  CONFIG_VIEWED: "config_viewed",
  CONFIG_APPROVED: "config_approved",
  CONFIG_REJECTED: "config_rejected",

  // Sync
  SYNC_TRIGGERED: "sync_triggered",
  SYNC_COMPLETED: "sync_completed",
  SYNC_CONFLICT: "sync_conflict",

  // Auth
  AUTH_LOGIN: "auth_login",
  AUTH_LOGOUT: "auth_logout",
  AUTH_ORG_SWITCH: "auth_org_switch",

  // Navigation
  PAGE_VIEW: "page_view",

  // Background agents
  SESSION_CREATED: "session_created",
  SESSION_RESUMED: "session_resumed",

  // Extension
  COMMAND_EXECUTED: "command_executed",
  EXTENSION_ACTIVATED: "extension_activated",
} as const;
