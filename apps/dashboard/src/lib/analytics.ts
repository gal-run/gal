/**
 * Firebase Analytics (GA4) for GAL Dashboard.
 *
 * Tracks feature usage, page views, and key user actions.
 * Respects user privacy - no PII is collected.
 * Disabled in test environments, when telemetry is opted out,
 * or when analytics fails to initialize (SSR, ad blockers).
 */

import type { Analytics } from "firebase/analytics";

let analytics: Analytics | null = null;
let initialized = false;

const isTest = process.env.NODE_ENV === "test";

/**
 * Initialize Firebase Analytics.
 * Call once in the app entry point after Firebase app is initialized.
 * Safe to call in SSR - silently no-ops when window is unavailable.
 */
export async function initAnalytics(): Promise<void> {
  if (initialized || isTest || typeof window === "undefined") return;

  const telemetryDisabled =
    process.env["NEXT_PUBLIC_TELEMETRY_DISABLED"] === "1" ||
    process.env["NEXT_PUBLIC_TELEMETRY_DISABLED"] === "true";
  if (telemetryDisabled) return;

  try {
    const { app } = await import("@/lib/firebase");
    if (!app) return;

    const { getAnalytics, isSupported } = await import("firebase/analytics");
    const supported = await isSupported();
    if (!supported) return;

    analytics = getAnalytics(app);
    initialized = true;
  } catch {
    // Analytics may fail due to ad blockers, missing config, etc.
    // This is expected — silently degrade.
    console.warn("[ANALYTICS] Firebase Analytics failed to initialize");
  }
}

/**
 * Track a custom event.
 */
export function trackEvent(
  name: string,
  params?: Record<string, unknown>,
): void {
  if (!analytics) return;
  try {
    // Dynamic import to avoid bundling analytics in SSR
    import("firebase/analytics").then(({ logEvent }) => {
      logEvent(analytics!, name, params);
    });
  } catch {
    // Silently ignore tracking failures
  }
}

/**
 * Identify a user and set user properties for Remote Config targeting.
 * Uses anonymous org-level identifier, not PII.
 */
export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>,
): void {
  if (!analytics) return;
  try {
    import("firebase/analytics").then(({ setUserId, setUserProperties }) => {
      setUserId(analytics!, userId);
      if (properties) {
        // Firebase user properties must be string values
        const stringProps: Record<string, string> = {};
        for (const [key, value] of Object.entries(properties)) {
          if (value !== undefined && value !== null) {
            stringProps[key] = String(value);
          }
        }
        setUserProperties(analytics!, stringProps);
      }
    });
  } catch {
    // Silently ignore identification failures
  }
}

/**
 * Reset user identity (call on logout).
 * Firebase Analytics doesn't have a direct reset - set userId to null.
 */
export function resetIdentity(): void {
  if (!analytics) return;
  try {
    import("firebase/analytics").then(({ setUserId }) => {
      setUserId(analytics!, null as unknown as string);
    });
  } catch {
    // Silently ignore reset failures
  }
}

/**
 * Track a page view (for SPA navigation).
 */
export function trackPageView(path: string): void {
  if (!analytics) return;
  try {
    import("firebase/analytics").then(({ logEvent }) => {
      logEvent(analytics!, "page_view", { page_path: path });
    });
  } catch {
    // Silently ignore page view tracking failures
  }
}
