/**
 * Extension Info Reporter
 *
 * Reports the installed extension version to the GAL API on startup.
 * The API stores { extensionVersion, reportedAt } at users/{userId}/extensionInfo/current
 * in Firestore so the dashboard can display which version a user has installed.
 *
 * Design:
 * - Only reports if the user is authenticated (has an authToken)
 * - Called once per startup — not on every event
 * - Never throws — must not affect extension behaviour
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.gal.run';

const CACHE_KEY = 'extensionVersionLastReport'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Report the installed extension version to the GAL API.
 * Reads the auth token from chrome.storage.session (where authToken lives).
 * Silently no-ops if unauthenticated or if the request fails.
 * Skips the API call if the same version was already reported within the last 24 hours.
 */
export async function reportExtensionVersion(): Promise<void> {
  try {
    const current = chrome.runtime.getManifest().version;

    // Check deduplication cache before making any network call
    try {
      const cached = await chrome.storage.local.get(CACHE_KEY)
      const lastReport = cached[CACHE_KEY] as { version: string; timestamp: number } | undefined
      if (lastReport && lastReport.version === current && Date.now() - lastReport.timestamp < CACHE_TTL_MS) {
        return // already reported this version recently
      }
    } catch {
      // Cache read errors are non-fatal — proceed with the report
    }

    // Read the auth token — it lives in session storage (see service-worker.ts SESSION_STORAGE_KEYS)
    const sessionData = await chrome.storage.session.get('authToken');
    const token = sessionData['authToken'] as string | undefined;
    if (!token) {
      // Not authenticated — skip silently. Will be reported on next startup after login.
      return;
    }

    const response = await fetch(`${API_BASE_URL}/api/extension/version`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ version: current }),
    });

    // Save to cache only on success
    if (response.ok) {
      try {
        await chrome.storage.local.set({ [CACHE_KEY]: { version: current, timestamp: Date.now() } })
      } catch {
        // Cache write errors are non-fatal
      }
    }
  } catch {
    // Never throw from version reporting
  }
}
