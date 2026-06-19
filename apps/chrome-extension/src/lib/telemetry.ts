/**
 * Extension Telemetry Client
 *
 * Sends usage telemetry events to the GAL API telemetry pipeline.
 * Events flow: Extension -> POST /telemetry/events -> Firestore -> BigQuery.
 *
 * Privacy:
 * - installationId is a random UUID stored in chrome.storage.local (never tied to identity)
 * - No prompt content, no workflow content — only workflow IDs
 * - No URLs beyond the platform name
 * - Respects VITE_TELEMETRY_DISABLED=1
 *
 * Design:
 * - Never throws — telemetry must never affect extension behavior
 * - Queues events in memory, flushes in batches of <=25
 * - Flush on: batch full, alarm tick (every 2 min)
 */

import type {
 EnhancedTelemetryEvent,
 TelemetryEventType,
 ExtensionEventAttributes,
} from "@gal/types";

// ---- Configuration ----

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://api.gal.run";
const MAX_BATCH_SIZE = 25;
const FLUSH_ALARM_NAME = "gal-telemetry-flush";
const FLUSH_INTERVAL_MINUTES = 2;
const INSTALLATION_ID_KEY = "gal_telemetry_installation_id";

// ---- State ----

let disabled = false;
let installationId: string | null = null;
let extensionVersion = "unknown";
const eventQueue: EnhancedTelemetryEvent[] = [];
let initialized = false;

// ---- Helpers ----

function generateUUID(): string {
 // Use crypto.randomUUID if available (Chrome 92+), otherwise fallback
 if (typeof crypto !== "undefined" && crypto.randomUUID) {
 return crypto.randomUUID();
 }
 // Fallback for older environments
 return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
 const r = (Math.random() * 16) | 0;
 const v = c === "x" ? r : (r & 0x3) | 0x8;
 return v.toString(16);
 });
}

/**
 * Initialize the telemetry client.
 * Must be called once from the service worker (background.ts).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initTelemetry(): Promise<void> {
 if (initialized) return;
 initialized = true;

 // Respect opt-out
 const telemetryDisabled =
 import.meta.env.VITE_TELEMETRY_DISABLED === "1" ||
 import.meta.env.VITE_TELEMETRY_DISABLED === "true";

 if (telemetryDisabled) {
 disabled = true;
 return;
 }

 // Read extension version
 try {
 extensionVersion = chrome.runtime.getManifest().version;
 } catch {
 // Fallback — should not happen in a valid extension context
 }

 // Load or generate installationId
 try {
 const result = await chrome.storage.local.get(INSTALLATION_ID_KEY);
 if (result[INSTALLATION_ID_KEY]) {
 installationId = result[INSTALLATION_ID_KEY] as string;
 } else {
 installationId = generateUUID();
 await chrome.storage.local.set({
 [INSTALLATION_ID_KEY]: installationId,
 });
 }
 } catch {
 // If storage fails, generate an ephemeral ID (lost on SW restart)
 installationId = generateUUID();
 }

 // Set up periodic flush alarm (only in service worker context)
 try {
 await chrome.alarms.create(FLUSH_ALARM_NAME, {
 periodInMinutes: FLUSH_INTERVAL_MINUTES,
 });
 } catch {
 // Alarms API may not be available in content script context
 }
}

/**
 * Record a telemetry event.
 * Events are queued in memory and flushed in batches.
 * Never throws.
 */
export function trackEvent(eventType: TelemetryEventType,
 attributes: ExtensionEventAttributes = {},
 severity: EnhancedTelemetryEvent["severity"] = "INFO",): void {
 if (disabled || !installationId) return;

 try {
 const event: EnhancedTelemetryEvent = {
 id: generateUUID(),
 timestamp: new Date().toISOString(),
 severity,
 resource: {
 "service.name": "gal-chrome-extension",
 "service.version": extensionVersion,
 // Chrome extensions run in the browser, not a specific OS process,
 // but we can infer OS from navigator.userAgent
 "host.os": detectOS(),
 "host.arch": "x64", // Not reliably detectable in browser context
 },
 eventType,
 attributes: flattenAttributes({
 extension_version: extensionVersion,
...attributes,
 }),
 installationId,
 };

 eventQueue.push(event);

 // Auto-flush if batch is full
 if (eventQueue.length >= MAX_BATCH_SIZE) {
 flushEvents();
 }
 } catch {
 // Never throw from telemetry
 }
}

/**
 * Flush queued events to the API.
 * Called automatically on batch full and alarm tick.
 * Safe to call from any context. Never throws.
 */
export async function flushEvents(): Promise<void> {
 if (disabled || eventQueue.length === 0) return;

 const batch = eventQueue.splice(0, MAX_BATCH_SIZE);

 try {
 const response = await fetch(`${API_BASE_URL}/telemetry/events`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 events: batch,
 schemaVersion: "v2",
 }),
 });

 if (!response.ok) {
 // Put events back at the front of the queue for retry (up to 1 batch)
 if (eventQueue.length < MAX_BATCH_SIZE * 2) {
 eventQueue.unshift(...batch);
 }
 // else: drop events to prevent unbounded growth
 }
 } catch {
 // Network error — put events back for retry (up to 1 batch)
 if (eventQueue.length < MAX_BATCH_SIZE * 2) {
 eventQueue.unshift(...batch);
 }
 }
}

/**
 * Handle the flush alarm. Call this from the alarm listener in the
 * service worker when alarm.name === FLUSH_ALARM_NAME.
 */
export function handleFlushAlarm(alarmName: string): boolean {
 if (alarmName === FLUSH_ALARM_NAME) {
 flushEvents();
 return true;
 }
 return false;
}

/**
 * Get the flush alarm name for use in alarm listener registration.
 */
export { FLUSH_ALARM_NAME };

// ---- Internal helpers ----

/**
 * Detect OS from navigator.userAgent (best effort).
 */
function detectOS(): "darwin" | "linux" | "win32" {
 try {
 const ua = navigator.userAgent;
 if (ua.includes("Mac")) return "darwin";
 if (ua.includes("Win")) return "win32";
 return "linux";
 } catch {
 return "linux";
 }
}

/**
 * Flatten an attributes object to Record<string, string | number | boolean | null>
 * as required by EnhancedTelemetryEvent.
 */
function flattenAttributes(attrs: ExtensionEventAttributes,): Record<string, string | number | boolean | null> {
 const result: Record<string, string | number | boolean | null> = {};
 for (const [key, value] of Object.entries(attrs)) {
 if (value === undefined) continue;
 if (typeof value === "string" ||
 typeof value === "number" ||
 typeof value === "boolean" ||
 value === null) {
 result[key] = value;
 }
 }
 return result;
}
