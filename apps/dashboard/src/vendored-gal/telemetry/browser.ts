/**
 * Browser-safe entry point for @gal/telemetry.
 *
 * Previously excluded the logger module because it had a top-level
 * static `import { createRequire } from "node:module"` that crashed
 * webpack client bundles. The logger has been refactored to lazily
 * load `createRequire` inside a try-catch and to detect browser
 * environments, so it is now safe to include here. In the browser,
 * createLogger returns a console-based fallback logger.
 */
export * from "./constants.js";
export * from "./privacy.js";
export * from "./logger.js";
export * from "./sentry.js";
