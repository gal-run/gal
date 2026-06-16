import * as Sentry from "@sentry/nextjs";
import { createBeforeSend } from "@gal/telemetry";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || "";
const telemetryDisabled =
  process.env["NEXT_PUBLIC_TELEMETRY_DISABLED"] === "1" ||
  process.env["NEXT_PUBLIC_TELEMETRY_DISABLED"] === "true";

if (dsn && !telemetryDisabled) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_ENVIRONMENT || "development",
    release: `gal-dashboard@${process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0"}`,

    // Performance: sample 20% in production, 100% in dev
    tracesSampleRate:
      process.env.NEXT_PUBLIC_ENVIRONMENT === "production" ? 0.2 : 1.0,

    // PII scrubbing via @gal/telemetry
    beforeSend: createBeforeSend() as unknown as Sentry.NodeOptions["beforeSend"],
  });
}
