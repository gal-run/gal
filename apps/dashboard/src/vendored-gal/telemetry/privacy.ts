/**
 * Privacy utilities for telemetry data.
 * Ensures no PII is sent to any telemetry service.
 */

/** Patterns that indicate PII in string values */
const PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, // Email addresses
  /ghp_[a-zA-Z0-9]{36}/g, // GitHub PATs
  /gho_[a-zA-Z0-9]{36}/g, // GitHub OAuth tokens
  /gh[rsu]_[a-zA-Z0-9]{20,}/g, // GitHub session/user/refresh tokens
  /github_pat_[a-zA-Z0-9_]{20,}/g, // Fine-grained GitHub PATs
  /sk-[a-zA-Z0-9]{48}/g, // OpenAI API keys
  /sk-ant-[a-zA-Z0-9-]{95}/g, // Anthropic API keys
  /sk-ant-oat01-[a-zA-Z0-9._-]+/g, // Claude OAuth setup tokens
  /xoxb-[a-zA-Z0-9-]+/g, // Slack tokens
  /AKIA[0-9A-Z]{16}/g, // AWS access keys
  /ASIA[0-9A-Z]{16}/g, // AWS temporary access keys
  /Bearer\s+[a-zA-Z0-9._-]+/g, // Bearer tokens
  /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+/g, // JWTs
  /\/Users\/[^/\s]+/g, // macOS user paths
  /\/home\/[^/\s]+/g, // Linux user paths
  /C:\\Users\\[^\\\s]+/g, // Windows user paths
];

/** Scrub PII from a string value */
export function scrubPII(value: string): string {
  let scrubbed = value;
  for (const pattern of PII_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, "[REDACTED]");
  }
  return scrubbed;
}

/** Scrub PII from an object (deep) */
export function scrubObjectPII(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = scrubPII(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "string"
          ? scrubPII(item)
          : typeof item === "object" && item !== null
            ? scrubObjectPII(item as Record<string, unknown>)
            : item
      );
    } else if (
      typeof value === "object" &&
      value !== null
    ) {
      result[key] = scrubObjectPII(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Sensitive header names that should be stripped from Sentry breadcrumbs */
export const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "x-csrf-token",
]);

/** Strip sensitive headers from a headers object */
export function stripSensitiveHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      cleaned[key] = "[REDACTED]";
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}
