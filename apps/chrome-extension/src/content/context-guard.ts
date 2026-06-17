/**
 * Chrome Extension Context Guard
 *
 * Detects extension context invalidation (happens when the extension is
 * updated or reloaded while content scripts are still running on a page).
 *
 * Uses `chrome.runtime.connect()` to open a persistent port. When the
 * extension unloads, the port disconnects — that's our signal to stop all
 * chrome API calls, observers, and timers.
 *
 * Usage:
 * import { isContextValid, onContextInvalidated } from "./context-guard";
 *
 * // Guard a chrome API call
 * if (!isContextValid()) return;
 * chrome.runtime.sendMessage(...);
 *
 * // Register cleanup logic
 * onContextInvalidated(() => {
 * observer.disconnect();
 * clearTimeout(timer);
 * });
 */

let contextValid = true;
const invalidationCallbacks: Array<() => void> = [];

function invalidate(): void {
 if (!contextValid) return;
 contextValid = false;
 for (const cb of invalidationCallbacks) {
 try {
 cb();
 } catch {
 // Callbacks must not throw
 }
 }
}

// Open a port to the background service worker. When the extension is
// unloaded/updated, the port disconnects automatically — no keepalive needed.
try {
 const port = chrome.runtime.connect({ name: "gal-context-guard" });
 port.onDisconnect.addListener(invalidate);
} catch {
 // If connect() itself throws the context was already invalid on load.
 invalidate();
}

/**
 * Returns true if the extension context is still valid.
 * Always call this before any chrome.* API usage inside long-lived callbacks
 * (MutationObserver, setTimeout, setInterval, event listeners).
 */
export function isContextValid(): boolean {
 if (!contextValid) return false;
 // Secondary sync check: chrome.runtime.id disappears on invalidation.
 try {
 if (!chrome.runtime.id) {
 invalidate();
 return false;
 }
 } catch {
 invalidate();
 return false;
 }
 return true;
}

/**
 * Register a cleanup callback to run when the extension context is
 * invalidated. Callbacks are invoked once, synchronously, and must not throw.
 */
export function onContextInvalidated(cb: () => void): void {
 if (!contextValid) {
 // Already invalidated — run immediately.
 try {
 cb();
 } catch {
 /* ignore */
 }
 return;
 }
 invalidationCallbacks.push(cb);
}
