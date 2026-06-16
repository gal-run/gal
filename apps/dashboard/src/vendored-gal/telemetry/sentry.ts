/**
 * Shared Sentry configuration for all GAL surfaces.
 *
 * Each surface imports these helpers and calls the appropriate init function.
 * The actual @sentry/* packages are peer dependencies of each app, not this package.
 */

import { getEnvironment, isTelemetryDisabled } from "./constants.js";
import { scrubPII, SENSITIVE_HEADERS } from "./privacy.js";

/** Base Sentry configuration shared across all surfaces */
export interface SentryBaseConfig {
  dsn: string;
  environment: string;
  release: string;
  enabled: boolean;
  /** Sample rate for performance/transaction tracing (0.0 - 1.0) */
  tracesSampleRate: number;
}

/** Get shared Sentry configuration for a given surface */
export function getSentryConfig(options: {
  dsn: string;
  surface: "api" | "cli" | "dashboard" | "vscode" | "chrome";
  version: string;
}): SentryBaseConfig {
  const env = getEnvironment();
  const disabled = isTelemetryDisabled();

  return {
    dsn: disabled ? "" : options.dsn,
    environment: env,
    release: `gal-${options.surface}@${options.version}`,
    enabled: !disabled && !!options.dsn,
    tracesSampleRate: env === "production" ? 0.2 : 1.0,
  };
}

/**
 * A Sentry event representation containing the minimum fields needed
 * for PII scrubbing. Compatible with any @sentry/* package's event type.
 */
export interface SentryEventLike {
  message?: string;
  level?: string;
  fingerprint?: string[];
  exception?: {
    values?: Array<{
      value?: string;
      type?: string;
      stacktrace?: {
        frames?: Array<{
          filename?: string;
        }>;
      };
    }>;
  };
  breadcrumbs?: Array<{
    data?: {
      headers?: Record<string, string>;
    };
  }>;
}

/**
 * Create a Sentry beforeSend hook that scrubs PII from events.
 * Works with any @sentry/* package (node, react, browser).
 *
 * Usage:
 *   Sentry.init({ beforeSend: createBeforeSend() });
 */
export function createBeforeSend(): (
  event: SentryEventLike,
) => SentryEventLike | null {
  return (event: SentryEventLike): SentryEventLike | null => {
    // Strip file paths from exceptions
    if (event.exception?.values) {
      for (const exception of event.exception.values) {
        if (exception.value) {
          exception.value = scrubPII(exception.value);
        }
        // Scrub stack frame file paths
        if (exception.stacktrace?.frames) {
          for (const frame of exception.stacktrace.frames) {
            if (frame.filename) {
              // Keep only the relative path from project root
              frame.filename = frame.filename.replace(
                /^.*\/(apps|packages)\//,
                "$1/",
              );
            }
          }
        }
      }
    }

    // Strip sensitive headers from breadcrumbs
    if (event.breadcrumbs) {
      for (const crumb of event.breadcrumbs) {
        if (crumb.data?.headers) {
          for (const header of SENSITIVE_HEADERS) {
            if (header in crumb.data.headers) {
              crumb.data.headers[header] = "[REDACTED]";
            }
          }
        }
      }
    }

    // Strip PII from message
    if (event.message) {
      event.message = scrubPII(event.message);
    }

    // Downgrade GCP permission / serviceUsageConsumer errors (#3200)
    // These are IAM configuration issues, not application bugs.
    // Fingerprint them so they group into a single Sentry issue and
    // downgrade severity to warning to reduce alert noise.
    if (isGcpPermissionEvent(event)) {
      event.level = "warning";
      event.fingerprint = ["gcp-permission-error"];
    }

    return event;
  };
}

/**
 * GCP permission error patterns that indicate IAM configuration issues.
 * These are not application bugs and should be downgraded in Sentry.
 */
const GCP_PERMISSION_ERROR_PATTERNS = [
  "roles/serviceusage",
  "serviceusageconsumer",
  "caller does not have required permission to use project",
  "grant the caller the role",
] as const;

/**
 * Check whether a Sentry event represents a GCP IAM permission error (#3200).
 *
 * Inspects exception values and event message for patterns like:
 *   "Caller does not have required permission to use project gal-run.
 *    Grant the caller the roles/serviceusage.serviceUsageConsumer role."
 */
function isGcpPermissionEvent(event: SentryEventLike): boolean {
  const textsToCheck: string[] = [];

  if (event.message) textsToCheck.push(event.message);

  if (event.exception?.values) {
    for (const exc of event.exception.values) {
      if (exc.value) textsToCheck.push(exc.value);
      if (exc.type) textsToCheck.push(exc.type);
    }
  }

  const combined = textsToCheck.join(" ").toLowerCase();
  return GCP_PERMISSION_ERROR_PATTERNS.some((p) => combined.includes(p));
}

/**
 * Sanitize error for Sentry capture.
 * Removes sensitive data while preserving useful debug info.
 */
export function sanitizeError(error: Error): {
  message: string;
  name: string;
  stack?: string;
} {
  return {
    message: scrubPII(error.message),
    name: error.name,
    stack: error.stack ? scrubPII(error.stack) : undefined,
  };
}
