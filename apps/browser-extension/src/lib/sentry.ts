/**
 * Sentry integration for GAL Chrome Extension.
 */
import * as Sentry from "@sentry/browser";
import { createBeforeSend } from "@gal/telemetry";

let initialized = false;

type SentryTags = Record<string, string | undefined>;

export function initSentry(): void {
  if (initialized) return;

  // Respect opt-out preferences
  const telemetryDisabled =
    import.meta.env.VITE_TELEMETRY_DISABLED === "1" ||
    import.meta.env.VITE_TELEMETRY_DISABLED === "true";

  const dsn = import.meta.env.VITE_SENTRY_DSN || "";
  if (telemetryDisabled) return;

  if (!dsn) {
    console.warn(
      "[GAL] Sentry is disabled because VITE_SENTRY_DSN is not configured.",
    );
    return;
  }

  Sentry.init({
    dsn,
    environment: "chrome-extension",
    release: `gal-chrome@${chrome.runtime.getManifest().version}`,
    tracesSampleRate: 0.1,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    beforeSend: createBeforeSend() as any,
  });

  initialized = true;
}

export function captureException(error: Error): void {
  if (!initialized) return;
  Sentry.captureException(error);
}

export function captureExceptionWithTags(
  error: unknown,
  tags: SentryTags,
): void {
  if (!initialized) return;

  const normalizedError =
    error instanceof Error ? error : new Error(String(error));

  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(tags)) {
      if (value) {
        scope.setTag(key, value);
      }
    }

    Sentry.captureException(normalizedError);
  });
}
