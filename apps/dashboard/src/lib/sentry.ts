/**
 * Sentry re-export for manual error capture in components.
 *
 * DEPRECATED: The manual `initSentry()` function has been removed.
 * Initialization is now handled automatically by:
 * - sentry.client.config.ts (browser)
 * - sentry.server.config.ts (Node.js server)
 * - sentry.edge.config.ts (Edge/middleware)
 *
 * Import directly from "@sentry/nextjs" instead of this file.
 */
export * from "@sentry/nextjs";
