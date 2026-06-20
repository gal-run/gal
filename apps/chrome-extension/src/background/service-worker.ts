/**
 * Background service worker for GAL Chrome Extension
 * Handles extension lifecycle and background tasks
 */

import { captureExceptionWithTags, initSentry } from "../lib/sentry";
import {
 storeUserSession,
 setSyncMetadata,
 checkStorageUsage,
} from "../lib/storage";
import type { FetchResult, Command } from "../lib/api";
import type { SyncMetadata, SyncState } from "../lib/storage";
import {
 initTelemetry,
 trackEvent,
 flushEvents,
 handleFlushAlarm,
} from "../lib/telemetry";
import { reportExtensionVersion } from "../lib/extension-info";
import {
 listCapturableBrowserProfileTabs,
 saveBrowserProfileFromTab,
} from "../lib/browser-profile-capture";
import {
 getInteractiveElements,
 showLabels,
 clickElement,
 typeIntoElement,
 scrollPage,
 removeLabels,
} from "../content/browser-use-agent";

// Initialize error tracking
initSentry();

// Initialize telemetry (async, never blocks)
initTelemetry();

// Allow popup and content scripts to access chrome.storage.session.
// By default, session storage is only accessible from the service worker.
chrome.storage.session.setAccessLevel({
 accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS",
});

const IS_DEV = import.meta.env.DEV;
const API_BASE_URL = import.meta.env.VITE_API_URL || "https://api.gal.run";

// ---- Storage helpers (lightweight, no lib/storage import needed here) ----

/** Keys that live in chrome.storage.session (ephemeral, cleared on browser restart) */
const SESSION_STORAGE_KEYS = new Set(["authToken", "activeGpt", "activeGem"]);

/**
 * Cache keys eligible for LRU eviction, ordered from lowest to highest
 * priority. Mirrors the list in lib/storage.ts.
 */
const SW_EVICTABLE_CACHE_KEYS = [
 "scan_chatgpt",
 "scan_gemini",
 "cachedSyncHint",
 "cachedSyncHintTimestamp",
 "cachedSyncStatus",
 "cachedSyncStatusTimestamp",
 "cachedSyncMetadata",
 "cachedAuthStatus",
 "cachedAuthStatusTimestamp",
 "cachedOrganizations",
 "cachedOrganizationsTimestamp",
 "cachedCommands",
 "cachedCommandsTimestamp",
];

/** Detect chrome.storage QuotaExceededError */
function isQuotaExceededError(error: unknown): boolean {
 if (error instanceof DOMException && error.name === "QuotaExceededError") {
 return true;
 }
 const message =
 error instanceof Error
 ? error.message
 : typeof error === "string"
 ? error
 : "";
 return (message.includes("QUOTA_BYTES") ||
 message.includes("QuotaExceededError") ||
 message.includes("quota") ||
 message.includes("exceeded the maximum"));
}

/** Evict stale cache entries to free space */
async function evictCacheEntries(): Promise<string[]> {
 const evicted: string[] = [];
 for (const key of SW_EVICTABLE_CACHE_KEYS) {
 try {
 const existing = await chrome.storage.local.get(key);
 if (existing[key] !== undefined) {
 await chrome.storage.local.remove(key);
 evicted.push(key);
 }
 } catch {
 // Continue evicting
 }
 }
 return evicted;
}

/**
 * Safe write to chrome.storage.local with QuotaExceededError handling.
 * Evicts stale cache entries and retries once on quota error.
 */
async function safeLocalSet(items: Record<string, unknown>): Promise<void> {
 try {
 await chrome.storage.local.set(items);
 } catch (error) {
 if (!isQuotaExceededError(error)) throw error;

 log("QuotaExceededError — evicting stale cache entries");
 const evicted = await evictCacheEntries();
 log("Evicted keys:", evicted);

 try {
 await chrome.storage.local.set(items);
 } catch (retryError) {
 if (isQuotaExceededError(retryError)) {
 try {
 await chrome.storage.local.set({
 storageWarning: "Storage full — some data may be stale",
 });
 } catch {
 // Cannot even store the warning
 }
 }
 throw retryError;
 }
 }
}

async function getStorageData(key: string): Promise<string | null> {
 try {
 const store = SESSION_STORAGE_KEYS.has(key)
 ? chrome.storage.session
 : chrome.storage.local;
 const result = await store.get(key);
 const value = result[key] as string | undefined;
 return value ?? null;
 } catch {
 return null;
 }
}

async function setStorageData(key: string, value: string): Promise<void> {
 try {
 const store = SESSION_STORAGE_KEYS.has(key)
 ? chrome.storage.session
 : chrome.storage.local;
 if (SESSION_STORAGE_KEYS.has(key)) {
 await store.set({ [key]: value });
 } else {
 await safeLocalSet({ [key]: value });
 }
 } catch {
 // Non-critical
 }
}

async function setCacheEntry(key: string, value: unknown): Promise<void> {
 try {
 await safeLocalSet({
 [key]: JSON.stringify(value),
 [`${key}Timestamp`]: Date.now(),
 });
 } catch {
 // Non-critical
 }
}

// ---- Retry with exponential backoff ----

const RETRY_CONFIG = {
 maxAttempts: 3,
 baseDelayMs: 1000,
 maxDelayMs: 10000,
};

/**
 * Execute a fetch function with retry and exponential backoff.
 * Only retries on retryable errors; success and empty return immediately.
 */
async function fetchWithRetry<T>(fn: () => Promise<FetchResult<T>>,
 config = RETRY_CONFIG,): Promise<FetchResult<T>> {
 let lastResult: FetchResult<T> = {
 status: "error",
 error: "no_attempt",
 retryable: false,
 };
 for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
 lastResult = await fn();
 if (lastResult.status === "success" || lastResult.status === "empty")
 return lastResult;
 if (!lastResult.retryable || attempt === config.maxAttempts - 1)
 return lastResult;
 const delay = Math.min(config.baseDelayMs * Math.pow(2, attempt),
 config.maxDelayMs,);
 await new Promise((r) => setTimeout(r, delay));
 }
 return lastResult;
}

/**
 * Keep the service worker alive during a critical fetch by creating a
 * short-lived alarm. The alarm itself is a no-op — its mere existence
 * prevents Chrome from terminating the worker mid-flight.
 */
async function criticalFetch<T>(fn: () => Promise<T>): Promise<T> {
 await chrome.alarms.create("keepalive", { delayInMinutes: 1.5 });
 try {
 return await fn();
 } finally {
 await chrome.alarms.clear("keepalive");
 }
}

// ---- Network helpers for pre-population ----

async function fetchOrganizationsFromAPI(token: string,): Promise<Array<{ login: string }>> {
 try {
 const response = await fetch(`${API_BASE_URL}/organizations`, {
 headers: {
 Authorization: `Bearer ${token}`,
 "Content-Type": "application/json",
 },
 });
 if (!response.ok) return [];
 const data = (await response.json()) as {
 organizations?: Array<{ name: string }>;
 };
 return (data.organizations || []).map((org) => ({ login: org.name }));
 } catch {
 return [];
 }
}

/**
 * Fetch commands from the API, returning a typed FetchResult.
 * Distinguishes network errors, auth failures, empty configs, and success
 * so callers can make informed cache decisions.
 */
async function fetchCommandsFromAPI(token: string,
 orgName: string,): Promise<FetchResult<Command[]>> {
 try {
 const response = await fetch(`${API_BASE_URL}/organizations/${encodeURIComponent(orgName)}/approved-config?platform=claude`,
 {
 headers: {
 Authorization: `Bearer ${token}`,
 "Content-Type": "application/json",
 },
 },);

 if (!response.ok) {
 const status = response.status;
 if (status === 401 || status === 403) {
 return { status: "error", error: "auth_expired", retryable: false };
 }
 if (status >= 500) {
 return { status: "error", error: `http_${status}`, retryable: true };
 }
 return { status: "error", error: `http_${status}`, retryable: false };
 }

 const data = (await response.json()) as {
 approved?: boolean;
 commands?: Array<{
 name: string;
 content: string;
 sourceRepo?: string;
 sourcePath?: string;
 }>;
 };
 const rawCommands = data.commands || [];
 if (rawCommands.length === 0) {
 return { status: "empty" };
 }
 // Normalize to the Command shape (add id like lib/api.ts does)
 const commands: Command[] = rawCommands.map((item, idx) => ({
 id: `cmd-${idx}-${item.name}`,
 name: item.name,
 content: item.content,
 sourceRepo: item.sourceRepo,
 sourcePath: item.sourcePath,
 }));
 return { status: "success", data: commands };
 } catch (err) {
 const message = err instanceof Error ? err.message : "network";
 return { status: "error", error: message, retryable: true };
 }
}

const inFlightFetches = new Map<string, Promise<FetchResult<Command[]>>>();

// Per-tab rate limiting for PREFETCH_COMMANDS messages
const PREFETCH_DEBOUNCE_MS = 30_000;
const lastPrefetchByTab = new Map<number, number>();

async function fetchCommandsDeduped(token: string,
 orgName: string,): Promise<FetchResult<Command[]>> {
 const existing = inFlightFetches.get(orgName);
 if (existing) return existing;
 // Set the promise FIRST (synchronously) before any await, so concurrent
 // callers hitting this code path in the same microtask see the entry
 // and deduplicate correctly.
 const promise = (async () => {
 try {
 return await criticalFetch(() =>
 fetchWithRetry(() => fetchCommandsFromAPI(token, orgName)),);
 } finally {
 inFlightFetches.delete(orgName);
 }
 })();
 inFlightFetches.set(orgName, promise);
 return promise;
}

// ---- Proactive pre-population ----

/**
 * Compute the SyncState from a FetchResult and environment.
 */
function syncStateFromResult<T>(result: FetchResult<T>): SyncState {
 if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
 if (result.status === "success") return "fresh";
 if (result.status === "empty") return "empty";
 return "error";
}

/**
 * Apply a FetchResult to the per-org command cache.
 * - success → overwrite with new data
 * - empty → overwrite with empty array
 * - error → keep existing cache (never lose good data)
 */
async function applyCacheResult(orgName: string,
 result: FetchResult<Command[]>,): Promise<void> {
 const now = Date.now();
 const syncState = syncStateFromResult(result);

 // Read existing sync metadata to preserve lastSuccessAt
 let prevMeta: SyncMetadata | null = null;
 try {
 const raw = await chrome.storage.local.get("cachedSyncMetadata");
 if (raw.cachedSyncMetadata) {
 const all = JSON.parse(raw.cachedSyncMetadata as string) as Record<
 string,
 SyncMetadata
 >;
 prevMeta = all[orgName] ?? null;
 }
 } catch {
 /* ignore */
 }

 const meta: SyncMetadata = {
 syncState,
 lastFetchAt: now,
 lastSuccessAt:
 result.status === "success" || result.status === "empty"
 ? now
 : (prevMeta?.lastSuccessAt ?? null),
 lastError: result.status === "error" ? result.error : undefined,
 };

 // Write sync metadata
 await setSyncMetadata(orgName, meta);

 // Cache update logic — never overwrite good data on error
 if (result.status === "error") {
 log("Fetch failed for org:",
 orgName,
 `(${result.error}) — keeping existing cache`,);
 return; // preserve whatever is already cached
 }

 const existing = await chrome.storage.local.get(["cachedCommands"]);
 let cmdCache: Record<string, unknown[]> = {};
 try {
 const raw = existing.cachedCommands as string | undefined;
 if (raw) cmdCache = JSON.parse(raw) as Record<string, unknown[]>;
 } catch {
 /* ignore */
 }

 if (result.status === "success") {
 cmdCache[orgName] = result.data;
 await setCacheEntry("cachedCommands", cmdCache);
 trackEvent("extension.config_fetched", {
 platform: "claude",
 workflow_count: result.data.length,
 });
 log("Updated commands for org:",
 orgName,
 `(${result.data.length} commands)`,);
 } else if (result.status === "empty") {
 cmdCache[orgName] = [];
 await setCacheEntry("cachedCommands", cmdCache);
 log("Org has no workflows:", orgName);
 }
}

/**
 * Fetch organizations and commands for the current (or first) org and
 * write them into chrome.storage.local so the content script palette has
 * data available even before the popup is ever opened.
 */
async function prefetchCommandsForAllOrgs(): Promise<void> {
 const token = await getStorageData("authToken");
 if (!token) return;

 const orgs = await fetchOrganizationsFromAPI(token);
 if (!orgs.length) return;

 const currentOrg = await getStorageData("selectedOrg");
 if (!currentOrg) {
 await setStorageData("selectedOrg", orgs[0].login);
 }

 const orgName = currentOrg ?? orgs[0].login;
 const result = await fetchCommandsDeduped(token, orgName);
 await applyCacheResult(orgName, result);

 // Record prefetch timestamp so popup can dedup REFRESH_COMMANDS
 try {
 await safeLocalSet({ lastSwPrefetchTimestamp: Date.now() });
 } catch {
 /* non-critical */
 }
}

/**
 * Fetch and cache commands for a specific org, merging with the existing
 * per-org cache so other orgs' entries are preserved.
 * Uses retry + cache protection.
 */
async function prefetchCommandsForOrg(orgName: string): Promise<void> {
 const token = await getStorageData("authToken");
 if (!token) return;

 const result = await fetchCommandsDeduped(token, orgName);
 await applyCacheResult(orgName, result);

 // Record prefetch timestamp so popup can dedup REFRESH_COMMANDS
 try {
 await safeLocalSet({ lastSwPrefetchTimestamp: Date.now() });
 } catch {
 /* non-critical */
 }
}

// ---- AI platform URL detection ----

const AI_PLATFORM_HOSTS = [
 "claude.ai",
 "chatgpt.com",
 "gemini.google.com",
 "aistudio.google.com",
 "jules.google.com",
 "klingai.com",
 "higgsfield.ai",
 "midjourney.com",
 "ideogram.ai",
 "leonardo.ai",
 "runwayml.com",
 "pika.art",
 "github.com",
];

function isAIPlatformUrl(url: string): boolean {
 try {
 const { hostname } = new URL(url);
 return AI_PLATFORM_HOSTS.some((host) => hostname.includes(host));
 } catch {
 return false;
 }
}

// ---- Synchronous top-level event listener registration (MV3 requirement) ----

// Pre-populate on extension install/update, and handle install-specific actions
chrome.runtime.onInstalled.addListener((details) => {
 if (details.reason === "install") {
 log("Extension installed");
 trackEvent("extension.installed");
 // Open welcome page
 chrome.tabs.create({ url: "https://app.gal.run/welcome" });
 } else if (details.reason === "update") {
 log("Extension updated");
 trackEvent("extension.updated", {
 previous_version: details.previousVersion,
 });
 }
 // Session start heartbeat on every install/update
 trackEvent("extension.session_start");
 prefetchCommandsForAllOrgs();
 // Report installed version to GAL API so dashboard can display it
 reportExtensionVersion();
});

// Pre-populate on browser startup (service worker restart)
chrome.runtime.onStartup.addListener(() => {
 trackEvent("extension.session_start");
 prefetchCommandsForAllOrgs();
 // Report installed version to GAL API so dashboard can display it
 reportExtensionVersion();
});

// Pre-populate when user switches to an AI platform tab
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
 try {
 const tab = await chrome.tabs.get(tabId);
 if (tab.url && isAIPlatformUrl(tab.url)) {
 prefetchCommandsForAllOrgs();
 }
 } catch {
 // Tab may have been closed
 }
});

// Pre-populate when an AI platform tab finishes loading
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
 if (changeInfo.status === "complete" && tab.url && isAIPlatformUrl(tab.url)) {
 prefetchCommandsForAllOrgs();
 }
});

// Periodic refresh every 5 minutes.
// Add random jitter (0–60 s) to the initial delay so browser instances
// don't all hit the API at exactly the same instant (thundering herd).
const jitterSeconds = Math.random() * 60;
chrome.alarms.create("refresh-commands", {
 delayInMinutes: jitterSeconds / 60,
 periodInMinutes: 5,
});
chrome.alarms.onAlarm.addListener((alarm) => {
 if (alarm.name === "refresh-commands") {
 prefetchCommandsForAllOrgs();
 // Check storage usage and warn if approaching quota
 checkStorageUsage()
.then((usage) => {
 if (usage.warning) {
 log("Storage warning:", usage.warning);
 }
 })
.catch(() => {});
 }
 // Telemetry flush alarm
 handleFlushAlarm(alarm.name);
 // "keepalive" and "oauth-keepalive" alarms are no-ops — they exist only to prevent SW termination
});

// Network recovery: auto-refresh when connectivity is restored
// Service workers support the standard online/offline events.
self.addEventListener("online", () => {
 log("Network recovered — refreshing commands");
 prefetchCommandsForAllOrgs();
});

function log(...args: unknown[]) {
 if (IS_DEV) {
 console.log("[GAL]",...args);
 }
}

// Push the extension Bearer token to any open app.gal.run tabs so the dashboard
// content script can convert it into a gal_session cookie (Extension → Dashboard sync).
async function pushTokenToDashboard(token: string): Promise<void> {
 let tabs: chrome.tabs.Tab[];
 try {
 tabs = await chrome.tabs.query({ url: "https://app.gal.run/*" });
 } catch {
 // chrome.runtime.lastError — tabs API may be unavailable
 return;
 }
 if (!tabs || tabs.length === 0) return;
 for (const tab of tabs) {
 if (tab.id) {
 chrome.tabs
.sendMessage(tab.id, {
 type: "GAL_PUSH_TOKEN_TO_DASHBOARD",
 token,
 })
.catch(() => {}); // tab may not have content script loaded
 }
 }
}

function reportAuthError(error: unknown, requestId?: string): string {
 const normalizedError =
 error instanceof Error ? error : new Error(String(error));

 captureExceptionWithTags(normalizedError, {
 extension_id: chrome.runtime.id,
 error_message: normalizedError.message,
 request_id: requestId,
 });

 return normalizedError.message;
}

/**
 * Run the GitHub OAuth flow from the service worker context so it survives
 * the popup being closed by Chrome when the user clicks the OAuth window.
 *
 * On success: stores the session and writes galAuthComplete=true to storage
 * so the popup (or its storage.onChanged listener) can pick up the result.
 * On failure: writes galAuthError to storage.
 */
export async function handleGitHubAuth(): Promise<void> {
 let requestId: string | undefined;

 // Keep the service worker alive for the duration of the OAuth flow.
 // Uses chrome.alarms instead of setInterval so the keep-alive survives
 // service worker suspension. The alarm fires every 0.4 min (~24s)
 // which is under Chrome's 30s inactivity threshold.
 const OAUTH_KEEPALIVE_ALARM = "oauth-keepalive";
 await chrome.alarms.create(OAUTH_KEEPALIVE_ALARM, {
 periodInMinutes: 0.4,
 });

 try {
 const redirectUri = chrome.identity.getRedirectURL("github-callback");
 const authInitUrl = new URL(`${API_BASE_URL}/auth/github`);
 authInitUrl.searchParams.set("client", "chrome-extension");
 authInitUrl.searchParams.set("response", "json");
 authInitUrl.searchParams.set("redirect", redirectUri);

 // Fetch the GitHub OAuth redirect URL from the GAL API.
 // No credentials needed — this is an initialization request that returns
 // a GitHub OAuth URL. Cookies are irrelevant for service worker context.
 const response = await fetch(authInitUrl.toString(), {
 headers: { Accept: "application/json" },
 });
 requestId =
 response.headers.get("x-request-id") ||
 response.headers.get("x-trace-id") ||
 undefined;
 const data = (await response.json().catch(() => null)) as {
 authUrl?: string;
 message?: string;
 error?: string;
 } | null;

 if (!response.ok) {
 const errMsg = reportAuthError(new Error(data?.message || data?.error || "Failed to start auth"),
 requestId,);
 await chrome.storage.local.set({ galAuthError: errMsg });
 return;
 }

 if (!data?.authUrl) {
 const errMsg = reportAuthError(new Error("No auth URL provided"),
 requestId,);
 await chrome.storage.local.set({ galAuthError: errMsg });
 return;
 }

 const authUrl: string = data.authUrl;
 const responseUrl = await new Promise<string | undefined>((resolve, reject) => {
 chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true },
 (callbackUrl) => {
 // chrome.runtime.lastError is only valid inside this callback
 if (chrome.runtime.lastError) {
 reject(new Error(chrome.runtime.lastError.message));
 return;
 }
 resolve(callbackUrl);
 },);
 },).catch((err) => {
 // Re-throw with a clear message; caught by the outer try/catch
 throw err instanceof Error ? err : new Error(String(err));
 });

 if (!responseUrl) {
 const errMsg = reportAuthError(new Error("Auth cancelled or no response received"),
 requestId,);
 await chrome.storage.local.set({ galAuthError: errMsg });
 return;
 }

 // Parse callback parameters
 const callbackUrl = new URL(responseUrl);
 const callbackError = callbackUrl.searchParams.get("error");
 if (callbackError) {
 const errMsg = reportAuthError(new Error(callbackError), requestId);
 await chrome.storage.local.set({ galAuthError: errMsg });
 return;
 }

 const token = callbackUrl.searchParams.get("token");
 const userId = callbackUrl.searchParams.get("userId");
 const userLogin = callbackUrl.searchParams.get("login");

 if (!token || !userId || !userLogin) {
 const errMsg = reportAuthError(new Error("Invalid auth response"),
 requestId,);
 await chrome.storage.local.set({ galAuthError: errMsg });
 return;
 }

 // Persist session so the popup can read it immediately on re-open
 await storeUserSession({ authToken: token, userId, userLogin });

 // Sync token to any open dashboard tabs (Extension → Dashboard)
 pushTokenToDashboard(token);

 // Signal the popup (or its storage listener) that auth is complete
 await chrome.storage.local.set({ galAuthComplete: true });

 // Report extension version now that the user is authenticated
 reportExtensionVersion();

 log("GitHub auth complete for", userLogin);
 } catch (error) {
 const errMsg = reportAuthError(error, requestId);
 log("GitHub auth failed:", errMsg);
 await chrome.storage.local.set({ galAuthError: errMsg });
 } finally {
 await chrome.alarms.clear(OAUTH_KEEPALIVE_ALARM);
 }
}

// Handle messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
 log("Message received:", message.type);

 // Validate sender origin (security)
 if (sender.id !== chrome.runtime.id) {
 log("Rejected message from unknown sender:", sender.id);
 return false;
 }

 // Handle on-demand prefetch request from content script (cold-start fallback)
 // Per-tab debounce: skip if same tab sent PREFETCH_COMMANDS within 30s
 if (message.type === "PREFETCH_COMMANDS") {
 const tabId = sender.tab?.id;
 if (tabId != null) {
 const lastTs = lastPrefetchByTab.get(tabId);
 if (lastTs && Date.now() - lastTs < PREFETCH_DEBOUNCE_MS) {
 sendResponse({ ok: true, debounced: true });
 return true;
 }
 lastPrefetchByTab.set(tabId, Date.now());
 }
 prefetchCommandsForAllOrgs()
.then(() => sendResponse({ ok: true }))
.catch(() => sendResponse({ ok: false }));
 return true; // Keep channel open for async response
 }

 // Handle org-switch refresh request from popup
 if (message.type === "REFRESH_COMMANDS") {
 const orgName = message.orgName as string | undefined;
 if (orgName) {
 prefetchCommandsForOrg(orgName)
.then(() => sendResponse({ ok: true }))
.catch(() => sendResponse({ ok: false }));
 } else {
 prefetchCommandsForAllOrgs()
.then(() => sendResponse({ ok: true }))
.catch(() => sendResponse({ ok: false }));
 }
 return true; // Keep channel open for async response
 }

 // Handle token from content script (dashboard → extension sync)
 if (message.type === "GAL_STORE_TOKEN" && message.token) {
 chrome.storage.session.set({ authToken: message.token });
 return false;
 }

 // Handle request from popup/api.ts to push token to open dashboard tabs
 // (extension → dashboard sync, called after extension login)
 if (message.type === "GAL_PUSH_TOKEN_TO_DASHBOARD_TABS" && message.token) {
 pushTokenToDashboard(message.token);
 return false;
 }

 // Handle GitHub OAuth flow on behalf of the popup.
 // The popup cannot host launchWebAuthFlow because Chrome closes it as soon
 // as the user clicks the OAuth window. Running it here keeps the service
 // worker alive for the duration of the flow.
 if (message.type === "START_GITHUB_AUTH") {
 handleGitHubAuth()
.then(() => sendResponse({ started: true }))
.catch((err) =>
 sendResponse({
 started: false,
 error: err instanceof Error ? err.message : String(err),
 }),);
 return true; // Keep message channel open for async response
 }

 if (message.type === "GET_ACTIVE_TAB") {
 chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
 if (chrome.runtime.lastError) {
 sendResponse({ tab: undefined });
 return;
 }
 sendResponse({ tab: tabs?.[0] });
 });
 return true; // Keep channel open for async response
 }

 if (message.type === "GAL_PING") {
 sendResponse({
 ok: true,
 version: chrome.runtime.getManifest().version,
 });
 return false;
 }

 if (message.type === "GAL_BROWSER_PROFILE_LIST_TABS") {
 listCapturableBrowserProfileTabs()
.then((result) => sendResponse({ ok: true,...result }))
.catch((error) =>
 sendResponse({
 ok: false,
 error: error instanceof Error ? error.message : String(error),
 }),);
 return true;
 }

 if (message.type === "GAL_BROWSER_PROFILE_CAPTURE") {
 const tabId =
 typeof message.tabId === "number" ? message.tabId : Number.NaN;
 const profileName =
 typeof message.profileName === "string" ? message.profileName : undefined;

 if (!Number.isFinite(tabId)) {
 sendResponse({ ok: false, error: "A valid tab ID is required." });
 return false;
 }

 saveBrowserProfileFromTab(tabId, profileName)
.then((result) => sendResponse({ ok: true, result }))
.catch((error) =>
 sendResponse({
 ok: false,
 error: error instanceof Error ? error.message : String(error),
 }),);
 return true;
 }

 if (message.type === "OPEN_POPUP" || message.type === "GAL_OPEN_POPUP") {
 // Attempt to open the popup programmatically.
 // chrome.action.openPopup() requires Chrome 99+ and user gesture context.
 // If it fails, fall back to opening as a new tab.
 chrome.action
.openPopup()
.then(() => {
 sendResponse({ success: true });
 })
.catch(() => {
 log("openPopup failed, falling back to tab");
 chrome.tabs.create({
 url: chrome.runtime.getURL("popup.html"),
 });
 sendResponse({ success: true, fallback: "tab" });
 });
 return true;
 }

 // Handle image fetch proxy for content scripts blocked by Cross-Origin-Resource-Policy.
 // The service worker context is not subject to the same-site restriction that blocks
 // content-script fetches for lh3.googleusercontent.com images (Gemini).
 // Use credentials: "include" for lh3 URLs so authenticated/cookie-gated images succeed.
 if (message.type === "GAL_FETCH_IMAGE" && message.url) {
 const imageUrl = message.url as string;
 const needsCredentials = imageUrl.includes("lh3.googleusercontent.com");
 fetch(imageUrl, { credentials: needsCredentials ? "include" : "omit" })
.then((res) => {
 if (!res.ok) throw new Error(`HTTP ${res.status}`);
 return res.blob();
 })
.then((blob) => {
 const reader = new FileReader();
 reader.onloadend = () =>
 sendResponse({ dataUrl: reader.result as string });
 reader.onerror = () => sendResponse({ dataUrl: null });
 reader.readAsDataURL(blob);
 })
.catch(() => sendResponse({ dataUrl: null }));
 return true; // async response
 }

 // Handle MAIN-world image fetch via chrome.scripting.executeScript.
 // This bypasses page CSP (e.g. Gemini) because the injection happens at the
 // browser/C++ level, not via inline <script> elements.
 if (message.type === "GAL_FETCH_IMAGE_MAIN_WORLD" && message.url) {
 const tabId = sender.tab?.id;
 if (!tabId) {
 sendResponse({ dataUrl: null });
 return true;
 }
 const targetUrl = message.url as string;
 chrome.scripting
.executeScript({
 target: { tabId },
 world: "MAIN",
 func: (url: string) => {
 return fetch(url, { credentials: "include" })
.then((res) => {
 if (!res.ok) throw new Error("HTTP " + res.status);
 return res.blob();
 })
.then((blob) =>
 new Promise<string | null>((resolve) => {
 const reader = new FileReader();
 reader.onloadend = () => resolve(reader.result as string);
 reader.onerror = () => resolve(null);
 reader.readAsDataURL(blob);
 }),)
.catch(() => null);
 },
 args: [targetUrl],
 })
.then((results) => {
 const dataUrl = results?.[0]?.result ?? null;
 sendResponse({ dataUrl });
 })
.catch(() => sendResponse({ dataUrl: null }));
 return true; // async response
 }

 // Handle image download request from the popup.
 // The popup cannot use <a download> for data URLs due to extension CSP,
 // so we delegate to chrome.downloads.download in the service worker.
 if (message.type === "GAL_DOWNLOAD_IMAGE") {
 const { url, filename } = message as {
 type: string;
 url: string;
 filename?: string;
 };
 chrome.downloads
.download({
 url,
 filename: filename || "gal-clipboard-image.png",
 saveAs: true,
 })
.then(() => sendResponse({ ok: true }))
.catch((err: unknown) =>
 sendResponse({
 ok: false,
 error: err instanceof Error ? err.message : String(err),
 }),);
 return true; // async response
 }

 if (message.type === "INJECT_TEXT") {
 // Inject text into active tab
 chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
 if (chrome.runtime.lastError || !tabs || tabs.length === 0) return;
 if (tabs[0]?.id) {
 chrome.tabs.sendMessage(tabs[0].id, {
 type: "INSERT_TEXT",
 text: message.text,
 });
 }
 });
 sendResponse({ success: true });
 return true;
 }

 // Tab highlighting via chrome.tabGroups API
 if (message.type === "HIGHLIGHT_TAB") {
 const tabId = message.tabId as number | undefined;
 const color = (message.color as string) || "orange";
 const label = (message.label as string) || "GAL Automated";
 (async () => {
 try {
 const targetId =
 tabId ||
 (await chrome.tabs.query({ active: true, currentWindow: true }))[0]
 ?.id;
 if (!targetId) {
 sendResponse({ error: "No tab found" });
 return;
 }
 try {
 await chrome.tabs.ungroup(targetId);
 } catch {}
 const groupId = await chrome.tabs.group({ tabIds: targetId });
 await chrome.tabGroups.update(groupId, {
 color: color as "orange",
 title: label,
 collapsed: false,
 });
 sendResponse({ tabId: targetId, groupId, color, label });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 if (message.type === "CLEAR_HIGHLIGHT") {
 const tabId = message.tabId as number | undefined;
 (async () => {
 try {
 if (tabId) {
 await chrome.tabs.ungroup(tabId);
 } else {
 const tabs = await chrome.tabs.query({});
 for (const t of tabs) {
 try {
 await chrome.tabs.ungroup(t.id!);
 } catch {}
 }
 }
 sendResponse({ cleared: true });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 // Browser-use: get labeled interactive elements from the active tab
 if (message.type === "BROWSER_USE_GET_ELEMENTS") {
 (async () => {
 try {
 const tabs = await chrome.tabs.query({
 active: true,
 currentWindow: true,
 });
 const tabId = tabs[0]?.id;
 if (!tabId) {
 sendResponse({ error: "No active tab" });
 return;
 }
 const [result] = await chrome.scripting.executeScript({
 target: { tabId },
 func: getInteractiveElements,
 });
 const elements = result?.result;
 if (!elements) {
 sendResponse({ error: "Failed to get elements" });
 return;
 }
 await chrome.scripting.executeScript({
 target: { tabId },
 func: showLabels,
 args: [elements.elements],
 });
 sendResponse({ elements: elements.elements });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 // Browser-use: get enhanced interactive elements (with browser-use metadata)
 if (message.type === "BROWSER_USE_GET_ENHANCED_ELEMENTS") {
 (async () => {
 try {
 const tabs = await chrome.tabs.query({
 active: true,
 currentWindow: true,
 });
 const tabId = tabs[0]?.id;
 if (!tabId) {
 sendResponse({ error: "No active tab" });
 return;
 }
 const [result] = await chrome.scripting.executeScript({
 target: { tabId },
 func: getInteractiveElements,
 });
 const elements = result?.result;
 if (!elements) {
 sendResponse({ error: "Failed to get elements" });
 return;
 }
 // Optionally show labels as well so the user can see indices
 await chrome.scripting.executeScript({
 target: { tabId },
 func: showLabels,
 args: [elements.elements],
 });
 sendResponse({ elements: elements.elements });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 // Browser-use: click element by index
 if (message.type === "BROWSER_USE_CLICK") {
 const index = message.index as number;
 (async () => {
 try {
 const tabs = await chrome.tabs.query({
 active: true,
 currentWindow: true,
 });
 const tabId = tabs[0]?.id;
 if (!tabId) {
 sendResponse({ error: "No active tab" });
 return;
 }
 const [result] = await chrome.scripting.executeScript({
 target: { tabId },
 func: clickElement,
 args: [index],
 });
 sendResponse(result?.result || { success: false, index });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 // Browser-use: type text into element by index
 if (message.type === "BROWSER_USE_TYPE") {
 const index = message.index as number;
 const text = message.text as string;
 const clear = message.clear === true;
 (async () => {
 try {
 const tabs = await chrome.tabs.query({
 active: true,
 currentWindow: true,
 });
 const tabId = tabs[0]?.id;
 if (!tabId) {
 sendResponse({ error: "No active tab" });
 return;
 }
 const [result] = await chrome.scripting.executeScript({
 target: { tabId },
 func: typeIntoElement,
 args: [index, text, clear],
 });
 sendResponse(result?.result || { success: false, index });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 // Browser-use: scroll the page
 if (message.type === "BROWSER_USE_SCROLL") {
 const amount = message.amount as number;
 (async () => {
 try {
 const tabs = await chrome.tabs.query({
 active: true,
 currentWindow: true,
 });
 const tabId = tabs[0]?.id;
 if (!tabId) {
 sendResponse({ error: "No active tab" });
 return;
 }
 const [result] = await chrome.scripting.executeScript({
 target: { tabId },
 func: scrollPage,
 args: [amount],
 });
 sendResponse(result?.result || { scrolled: 0 });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 // Browser-use: remove all element labels
 if (message.type === "BROWSER_USE_CLEAR_LABELS") {
 (async () => {
 try {
 const tabs = await chrome.tabs.query({
 active: true,
 currentWindow: true,
 });
 const tabId = tabs[0]?.id;
 if (!tabId) {
 sendResponse({ error: "No active tab" });
 return;
 }
 await chrome.scripting.executeScript({
 target: { tabId },
 func: removeLabels,
 });
 sendResponse({ cleared: true });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 // ── Chrome API Bridge ───────────────────────────────────────────────

 if (message.type === "CHROME_API_TABS_QUERY") {
 (async () => {
 try {
 const queryInfo = (message.queryInfo || {}) as chrome.tabs.QueryInfo;
 const tabs = await chrome.tabs.query(queryInfo);
 sendResponse({ tabs });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 if (message.type === "CHROME_API_TABS_CREATE") {
 (async () => {
 try {
 const createProperties = (message.createProperties ||
 {}) as chrome.tabs.CreateProperties;
 const tab = await chrome.tabs.create(createProperties);
 sendResponse({ tab });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 if (message.type === "CHROME_API_TABS_REMOVE") {
 (async () => {
 try {
 const tabIds = message.tabIds as number | number[];
 if (Array.isArray(tabIds)) {
 await chrome.tabs.remove(tabIds);
 } else {
 await chrome.tabs.remove(tabIds);
 }
 sendResponse({ removed: true });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 if (message.type === "CHROME_API_TABGROUPS_QUERY") {
 (async () => {
 try {
 const queryInfo = (message.queryInfo ||
 {}) as chrome.tabGroups.QueryInfo;
 const groups = await chrome.tabGroups.query(queryInfo);
 sendResponse({ groups });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 if (message.type === "CHROME_API_TABGROUPS_UPDATE") {
 (async () => {
 try {
 const groupId = message.groupId as number;
 const updateProperties = (message.updateProperties ||
 {}) as chrome.tabGroups.UpdateProperties;
 const group = await chrome.tabGroups.update(groupId, updateProperties);
 sendResponse({ group });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 if (message.type === "CHROME_API_BOOKMARKS_SEARCH") {
 (async () => {
 try {
 const query = message.query as string;
 const results = await chrome.bookmarks.search(query);
 sendResponse({ results });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 if (message.type === "CHROME_API_HISTORY_SEARCH") {
 (async () => {
 try {
 const query = (message.query || {}) as chrome.history.HistoryQuery;
 const results = await chrome.history.search(query);
 sendResponse({ results });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 if (message.type === "CHROME_API_WINDOWS_CREATE") {
 (async () => {
 try {
 const createData = (message.createData ||
 {}) as chrome.windows.CreateData;
 const window = await chrome.windows.create(createData);
 sendResponse({ window });
 } catch (e) {
 sendResponse({ error: String(e) });
 }
 })();
 return true;
 }

 return false;
});

// Handle extension icon click (status bar / toolbar click to open)
// chrome.action.onClicked fires when there is no default_popup,
// but since we have default_popup set, it auto-opens. However,
// we handle the OPEN_POPUP message from content scripts to ensure
// clicking the status bar element also opens the extension popup.

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
 log("Command triggered:", command);

 if (command === "open-command-palette") {
 trackEvent("extension.palette_opened");
 // Open popup or trigger content script
 chrome.action.openPopup().catch(() => {
 // Fallback: if openPopup fails (some Chrome versions),
 // open as a new tab instead
 log("openPopup failed, falling back to tab");
 chrome.tabs.create({
 url: chrome.runtime.getURL("popup.html"),
 });
 });
 }

 if (command === "_execute_workflow_palette") {
 trackEvent("extension.workflow_palette_opened");
 // Forward the workflow palette shortcut to the active tab's content script
 chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
 if (chrome.runtime.lastError || !tabs || tabs.length === 0) return;
 if (tabs[0]?.id) {
 chrome.tabs
.sendMessage(tabs[0].id, {
 type: "OPEN_WORKFLOW_PALETTE",
 })
.catch(() => {
 // Content script may not be loaded on this page
 });
 }
 });
 }
});

// Keep service worker alive (only needed for long-running operations)
// Note: Manifest V3 service workers automatically wake on events
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

function startKeepAlive() {
 // Only use keep-alive during active operations, not continuously
 if (!keepAliveInterval && IS_DEV) {
 keepAliveInterval = setInterval(() => {
 // Silent ping - only log in dev mode
 log("Keep-alive ping");
 }, 25000); // Chrome kills workers after 30s of inactivity
 }
}

function stopKeepAlive() {
 if (keepAliveInterval) {
 clearInterval(keepAliveInterval);
 keepAliveInterval = null;
 }
}

// Start keep-alive only in development
if (IS_DEV) {
 startKeepAlive();
}

// Clean up on service worker suspension (correct event for MV3)
chrome.runtime.onSuspend?.addListener(() => {
 log("Service worker suspending");
 stopKeepAlive();
 // Flush any pending telemetry before suspension
 flushEvents();
});

log("Service worker initialized");
