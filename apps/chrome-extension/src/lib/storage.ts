/**
 * Chrome storage helpers for managing extension state
 */

// ---- Quota / storage constants ----

/** chrome.storage.local quota is 10 MB */
const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024;

/** Warn the popup when usage exceeds 8 MB */
const STORAGE_WARNING_THRESHOLD_BYTES = 8 * 1024 * 1024;

/**
 * Cache keys eligible for LRU eviction, ordered from lowest to highest
 * priority. When storage is full we evict from the front of this list first.
 */
const EVICTABLE_CACHE_KEYS: Array<keyof StorageData> = [
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

// ---- QuotaExceededError detection ----

/**
 * Detect whether an error is a chrome.storage QuotaExceededError.
 * Chrome surfaces these as DOMException with a specific message,
 * or as runtime.lastError strings containing "QUOTA_BYTES".
 */
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

// ---- LRU eviction ----

/**
 * Evict cache entries from chrome.storage.local until enough space is freed.
 * Starts with the lowest-priority keys (see EVICTABLE_CACHE_KEYS) and works
 * up. Returns the list of keys that were evicted.
 */
async function evictCacheEntries(): Promise<string[]> {
 const evicted: string[] = [];
 for (const key of EVICTABLE_CACHE_KEYS) {
 try {
 // Only remove keys that actually exist
 const existing = await chrome.storage.local.get(key);
 if (existing[key] !== undefined) {
 await chrome.storage.local.remove(key);
 evicted.push(key);
 }
 } catch {
 // Continue evicting even if one key fails
 }
 }
 return evicted;
}

/**
 * Attempt to write to chrome.storage.local with QuotaExceededError handling.
 * If the initial write fails due to quota, we evict cache entries (LRU) and
 * retry once. If the retry also fails we surface a warning to the popup via
 * the `storageWarning` key and re-throw so callers can decide what to do.
 */
async function safeLocalSet(items: Record<string, unknown>): Promise<void> {
 try {
 await chrome.storage.local.set(items);
 } catch (error) {
 if (!isQuotaExceededError(error)) throw error;

 console.warn("[GAL] QuotaExceededError — evicting stale cache entries");
 const evicted = await evictCacheEntries();
 console.warn("[GAL] Evicted keys:", evicted);

 try {
 await chrome.storage.local.set(items);
 } catch (retryError) {
 if (isQuotaExceededError(retryError)) {
 // Surface error to the popup so the user sees a warning.
 // We write directly with the native API to avoid recursion.
 try {
 await chrome.storage.local.set({
 storageWarning: "Storage full — some data may be stale",
 });
 } catch {
 // If even the warning cannot be stored, give up silently.
 }
 }
 throw retryError;
 }
 }
}

// ---- Storage usage monitoring ----

/**
 * Check current chrome.storage.local usage and return a summary.
 * Also stores a warning string if usage exceeds the 8 MB threshold.
 */
export async function checkStorageUsage(): Promise<{
 bytesInUse: number;
 quotaBytes: number;
 percentUsed: number;
 warning: string | null;
}> {
 try {
 const bytesInUse = await chrome.storage.local.getBytesInUse(null);
 const percentUsed = Math.round((bytesInUse / STORAGE_QUOTA_BYTES) * 100);
 let warning: string | null = null;

 if (bytesInUse > STORAGE_WARNING_THRESHOLD_BYTES) {
 warning = `Storage usage high: ${percentUsed}% (${(bytesInUse / (1024 * 1024)).toFixed(1)} MB / 10 MB)`;
 // Persist warning so the popup can display it
 try {
 await chrome.storage.local.set({ storageWarning: warning });
 } catch {
 // Non-critical
 }
 } else {
 // Clear any previous warning
 try {
 await chrome.storage.local.remove("storageWarning");
 } catch {
 // Non-critical
 }
 }

 return {
 bytesInUse,
 quotaBytes: STORAGE_QUOTA_BYTES,
 percentUsed,
 warning,
 };
 } catch {
 return {
 bytesInUse: 0,
 quotaBytes: STORAGE_QUOTA_BYTES,
 percentUsed: 0,
 warning: null,
 };
 }
}

// ---- Sync state types for resilient sync layer ----

/**
 * Possible sync states surfaced to the UI.
 * - "fresh" → data was fetched recently and is up-to-date
 * - "stale" → data is older than TTL but still usable
 * - "error" → last fetch failed (retryable or not)
 * - "offline" → navigator.onLine is false; showing cached data
 * - "empty" → org has no configured workflows (not an error)
 */
export type SyncState = "fresh" | "stale" | "error" | "offline" | "empty";

/**
 * Metadata about the last sync for an org's commands.
 * Stored alongside cached commands so the UI can show sync status.
 */
export interface SyncMetadata {
 /** Current sync state */
 syncState: SyncState;
 /** Timestamp of the last successful fetch (ms since epoch) */
 lastSuccessAt: number | null;
 /** Timestamp of the most recent fetch attempt (ms since epoch) */
 lastFetchAt: number;
 /** Error message from the last failed fetch, if any */
 lastError?: string;
}

/** Detected GPT context from chatgpt.com/g/{id} pages */
export interface ActiveGptInfo {
 platform: "chatgpt";
 gptId: string;
 gptName: string;
 detectedAt: number;
}

/** Detected Gem context from gemini.google.com/gem/{id} pages */
export interface ActiveGemInfo {
 platform: "gemini";
 gemId: string;
 gemName: string;
 detectedAt: number;
}

/** Result of a passive platform scan (GPTs or Gems) */
export interface PlatformScanResult {
 platform: "chatgpt" | "gemini";
 scannedAt: number; // unix timestamp (ms)
 items: Array<{
 id: string; // GPT ID or Gem ID
 name: string; // display name
 url: string; // direct link
 }>;
}

/**
 * Session storage data — stored in chrome.storage.session.
 * Cleared on browser restart. NOT accessible to content scripts
 * via chrome.storage.local, reducing XSS token exposure.
 */
export interface SessionStorageData {
 authToken?: string;
 // Active GPT detection for chatgpt.com/g/{id} pages
 activeGpt?: string; // JSON-serialized ActiveGptInfo | null
 // Active Gem detection for gemini.google.com/gem/{id} pages
 activeGem?: string; // JSON-serialized ActiveGemInfo | null
}

/** Keys that live in chrome.storage.session */
export const SESSION_KEYS: Array<keyof SessionStorageData> = [
 "authToken",
 "activeGpt",
 "activeGem",
];

/**
 * Persistent storage data — stored in chrome.storage.local.
 * Survives browser restarts. Used for user profile, caches, and settings.
 */
export interface StorageData {
 userId?: string;
 userLogin?: string;
 userName?: string;
 userEmail?: string;
 organizationName?: string;
 selectedOrg?: string;
 isAdmin?: boolean;
 lastSync?: number;
 // Cached API response data for instant popup open
 cachedAuthStatus?: string; // JSON-serialized AuthStatus
 cachedAuthStatusTimestamp?: number;
 cachedOrganizations?: string; // JSON-serialized Organization[]
 cachedOrganizationsTimestamp?: number;
 cachedCommands?: string; // JSON-serialized { [orgName: string]: Command[] }
 cachedCommandsTimestamp?: number;
 cachedSyncHint?: string; // JSON-serialized { [orgName: string]: SyncCopilotHintResponse }
 cachedSyncHintTimestamp?: number;
 cachedSyncStatus?: string; // JSON-serialized { [orgName: string]: SyncStatus }
 cachedSyncStatusTimestamp?: number;
 // OAuth flow coordination between popup and service worker
 galAuthComplete?: boolean;
 galAuthError?: string;
 // Platform onboarding scan results
 scan_chatgpt?: string; // JSON-serialized PlatformScanResult
 scan_gemini?: string; // JSON-serialized PlatformScanResult
 // Flag to request a re-scan on next platform focus
 scanRequested?: boolean;
 // Active run-design project summary for status card
 // JSON-serialized ActiveDesignProjectSummary | null
 activeDesignProject?: string;
 // Per-org sync metadata for resilient sync layer
 // JSON-serialized { [orgName: string]: SyncMetadata }
 cachedSyncMetadata?: string;
 // Storage quota warning surfaced to the popup
 storageWarning?: string;
 // Per-org discovered configs cache with 5-min TTL
 // JSON-serialized { [orgName: string]: DiscoveredConfigsResponse }
 cachedDiscoveredConfigs?: string;
 cachedDiscoveredConfigsTimestamp?: number;
 // Timestamp of last SW prefetch (used to dedup popup REFRESH_COMMANDS)
 lastSwPrefetchTimestamp?: number;
}

/**
 * Get data from Chrome persistent storage (chrome.storage.local)
 */
export async function getStorageData<K extends keyof StorageData>(key: K,): Promise<StorageData[K] | null> {
 try {
 const result = await chrome.storage.local.get(key);
 const value = result[key as string] as StorageData[K] | undefined;
 return value ?? null;
 } catch (error) {
 console.error(`Failed to get ${key} from storage:`, error);
 return null;
 }
}

/**
 * Set data in Chrome persistent storage (chrome.storage.local).
 * Handles QuotaExceededError with LRU eviction and retry.
 */
export async function setStorageData<K extends keyof StorageData>(key: K,
 value: StorageData[K],): Promise<void> {
 try {
 await safeLocalSet({ [key]: value });
 } catch (error) {
 console.error(`Failed to set ${key} in storage:`, error);
 }
}

/**
 * Get data from Chrome session storage (chrome.storage.session).
 * Session storage is cleared on browser restart and is not accessible
 * to content scripts via chrome.storage.local.
 */
export async function getSessionData<K extends keyof SessionStorageData>(key: K,): Promise<SessionStorageData[K] | null> {
 try {
 const result = await chrome.storage.session.get(key);
 const value = result[key as string] as SessionStorageData[K] | undefined;
 return value ?? null;
 } catch (error) {
 console.error(`Failed to get ${key} from session storage:`, error);
 return null;
 }
}

/**
 * Set data in Chrome session storage (chrome.storage.session).
 */
export async function setSessionData<K extends keyof SessionStorageData>(key: K,
 value: SessionStorageData[K],): Promise<void> {
 try {
 await chrome.storage.session.set({ [key]: value });
 } catch (error) {
 console.error(`Failed to set ${key} in session storage:`, error);
 }
}

/**
 * Get all storage data (persistent + session merged)
 */
export async function getAllStorageData(): Promise<
 Partial<StorageData & SessionStorageData>
> {
 try {
 const [local, session] = await Promise.all([
 chrome.storage.local.get(null),
 chrome.storage.session.get(null),
 ]);
 return {...local,...session } as Partial<
 StorageData & SessionStorageData
 >;
 } catch (error) {
 console.error("Failed to get all storage data:", error);
 return {};
 }
}

/**
 * Clear all storage data (persistent + session)
 */
export async function clearStorageData(): Promise<void> {
 try {
 await Promise.all([
 chrome.storage.local.clear(),
 chrome.storage.session.clear(),
 ]);
 } catch (error) {
 console.error("Failed to clear storage:", error);
 }
}

/**
 * Remove specific keys from storage.
 * Automatically routes session keys to chrome.storage.session
 * and persistent keys to chrome.storage.local.
 */
export async function removeStorageData(keys: Array<keyof StorageData | keyof SessionStorageData>,): Promise<void> {
 try {
 const sessionKeysSet = new Set<string>(SESSION_KEYS);
 const localKeys = keys.filter((k) => !sessionKeysSet.has(k));
 const sessKeys = keys.filter((k) => sessionKeysSet.has(k));
 const promises: Promise<void>[] = [];
 if (localKeys.length > 0) {
 promises.push(chrome.storage.local.remove(localKeys));
 }
 if (sessKeys.length > 0) {
 promises.push(chrome.storage.session.remove(sessKeys));
 }
 await Promise.all(promises);
 } catch (error) {
 console.error("Failed to remove storage keys:", error);
 }
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
 const token = await getSessionData("authToken");
 const userId = await getStorageData("userId");
 return !!(token && userId);
}

/**
 * Get current user info
 */
export async function getCurrentUser(): Promise<{
 userId: string;
 userLogin: string;
 userName?: string;
 userEmail?: string;
 isAdmin: boolean;
} | null> {
 const userId = await getStorageData("userId");
 const userLogin = await getStorageData("userLogin");
 const userName = await getStorageData("userName");
 const userEmail = await getStorageData("userEmail");
 const isAdmin = await getStorageData("isAdmin");

 if (!userId || !userLogin) {
 return null;
 }

 return {
 userId,
 userLogin,
 userName: userName ?? undefined,
 userEmail: userEmail ?? undefined,
 isAdmin: isAdmin ?? false,
 };
}

/**
 * Store user session data.
 * authToken goes to chrome.storage.session; everything else to chrome.storage.local.
 * Handles QuotaExceededError with LRU eviction and retry.
 */
export async function storeUserSession(data: {
 authToken: string;
 userId: string;
 userLogin: string;
 userName?: string;
 userEmail?: string;
 organizationName?: string;
 isAdmin?: boolean;
}): Promise<void> {
 const { authToken,...persistentData } = data;
 await Promise.all([
 chrome.storage.session.set({ authToken }),
 safeLocalSet(persistentData),
 ]);
}

/**
 * Clear user session.
 * Removes authToken from session storage and profile data from local storage.
 */
export async function clearUserSession(): Promise<void> {
 await Promise.all([
 chrome.storage.session.remove(["authToken"]),
 chrome.storage.local.remove([
 "userId",
 "userLogin",
 "userName",
 "userEmail",
 "organizationName",
 "isAdmin",
 ]),
 ]);
 // Also clear cached data on logout
 await clearCachedData();
}

// ---- Cache Layer for Stale-While-Revalidate ----

/** Default TTL: 5 minutes. Data older than this triggers a background refresh. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Maximum cache age: 30 minutes. Data older than this is not used at all. */
const CACHE_MAX_AGE_MS = 30 * 60 * 1000;

export interface CacheEntry<T> {
 data: T;
 timestamp: number;
}

/**
 * Write a cached value to Chrome storage.
 * Handles QuotaExceededError with LRU eviction and retry.
 */
export async function setCacheEntry<T>(dataKey: keyof StorageData,
 timestampKey: keyof StorageData,
 value: T,): Promise<void> {
 try {
 await safeLocalSet({
 [dataKey]: JSON.stringify(value),
 [timestampKey]: Date.now(),
 });
 } catch (error) {
 console.error(`Failed to set cache for ${String(dataKey)}:`, error);
 }
}

/**
 * Read a cached value from Chrome storage.
 * Returns null if no cache exists or if cache exceeds max age.
 *
 * Offline resilience: when navigator.onLine is false, the cache
 * is NEVER expired — stale data is always better than no data.
 */
export async function getCacheEntry<T>(dataKey: keyof StorageData,
 timestampKey: keyof StorageData,): Promise<CacheEntry<T> | null> {
 try {
 const result = await chrome.storage.local.get([dataKey, timestampKey]);
 const raw = result[dataKey];
 const timestamp = result[timestampKey] as number | undefined;

 if (!raw || !timestamp) return null;

 // Offline resilience: never expire cache when offline
 const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
 if (!isOffline && Date.now() - timestamp > CACHE_MAX_AGE_MS) return null;

 return { data: JSON.parse(raw as string) as T, timestamp };
 } catch (error) {
 console.error(`Failed to get cache for ${String(dataKey)}:`, error);
 return null;
 }
}

/**
 * Check if a cache entry is stale (older than TTL but not expired).
 * Stale entries can still be displayed while refreshing in the background.
 */
export function isCacheStale(timestamp: number): boolean {
 return Date.now() - timestamp > CACHE_TTL_MS;
}

/**
 * Clear all cached API response data.
 */
export async function clearCachedData(): Promise<void> {
 try {
 await chrome.storage.local.remove([
 "cachedAuthStatus",
 "cachedAuthStatusTimestamp",
 "cachedOrganizations",
 "cachedOrganizationsTimestamp",
 "cachedCommands",
 "cachedCommandsTimestamp",
 "cachedSyncHint",
 "cachedSyncHintTimestamp",
 "cachedSyncStatus",
 "cachedSyncStatusTimestamp",
 "cachedSyncMetadata",
 ]);
 } catch (error) {
 console.error("Failed to clear cached data:", error);
 }
}

// ---- Platform Scan Helpers ----

type ScanPlatform = "chatgpt" | "gemini";

/**
 * Get stored scan result for a platform.
 */
export async function getScanResult(platform: ScanPlatform,): Promise<PlatformScanResult | null> {
 const key = `scan_${platform}`;
 try {
 const result = await chrome.storage.local.get(key);
 const raw = result[key] as string | undefined;
 if (!raw) return null;
 return JSON.parse(raw) as PlatformScanResult;
 } catch (error) {
 console.error(`Failed to parse scan result for ${platform}:`, error);
 return null;
 }
}

/**
 * Store scan result for a platform.
 * Handles QuotaExceededError with LRU eviction and retry.
 */
export async function setScanResult(platform: ScanPlatform,
 result: PlatformScanResult,): Promise<void> {
 const key = `scan_${platform}`;
 try {
 await safeLocalSet({ [key]: JSON.stringify(result) });
 } catch (error) {
 console.error(`Failed to store scan result for ${platform}:`, error);
 }
}

// ---- Sync Metadata Helpers ----

/**
 * Read per-org sync metadata from storage.
 */
export async function getSyncMetadata(orgName: string,): Promise<SyncMetadata | null> {
 try {
 const result = await chrome.storage.local.get("cachedSyncMetadata");
 const raw = result.cachedSyncMetadata as string | undefined;
 if (!raw) return null;
 const all = JSON.parse(raw) as Record<string, SyncMetadata>;
 return all[orgName] ?? null;
 } catch {
 return null;
 }
}

/**
 * Write per-org sync metadata to storage (merges with existing entries).
 * Handles QuotaExceededError with LRU eviction and retry.
 */
export async function setSyncMetadata(orgName: string,
 meta: SyncMetadata,): Promise<void> {
 try {
 const result = await chrome.storage.local.get("cachedSyncMetadata");
 const raw = result.cachedSyncMetadata as string | undefined;
 let all: Record<string, SyncMetadata> = {};
 if (raw) {
 try {
 all = JSON.parse(raw) as Record<string, SyncMetadata>;
 } catch {
 /* ignore */
 }
 }
 all[orgName] = meta;
 await safeLocalSet({ cachedSyncMetadata: JSON.stringify(all) });
 } catch {
 // Non-critical
 }
}

// ---- User Preferences (chrome.storage.sync) ----

/**
 * Sync-stored user preferences that persist across devices.
 */
export interface SyncPreferences {
 /** When true, the in-field GAL button is hidden from chat inputs */
 inFieldButtonDisabled?: boolean;
}

/**
 * Get a user preference from chrome.storage.sync.
 */
export async function getSyncPreference<K extends keyof SyncPreferences>(key: K,): Promise<SyncPreferences[K] | null> {
 try {
 const result = await chrome.storage.sync.get(key);
 const value = result[key as string] as SyncPreferences[K] | undefined;
 return value ?? null;
 } catch (error) {
 console.error(`Failed to get sync preference ${key}:`, error);
 return null;
 }
}

/**
 * Set a user preference in chrome.storage.sync.
 */
export async function setSyncPreference<K extends keyof SyncPreferences>(key: K,
 value: SyncPreferences[K],): Promise<void> {
 try {
 await chrome.storage.sync.set({ [key]: value });
 } catch (error) {
 console.error(`Failed to set sync preference ${key}:`, error);
 }
}
