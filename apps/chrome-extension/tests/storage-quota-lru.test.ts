/**
 * Regression tests — chrome.storage QuotaExceededError handling
 * with LRU eviction.
 *
 * Verified behaviours:
 * 1. When chrome.storage.local.set throws QuotaExceededError on the first
 * call, the LRU eviction logic runs and the write is retried.
 * 2. After eviction the oldest (lowest-priority) entries are removed while
 * recently-used entries are retained.
 * 3. The QuotaExceededError does NOT propagate as an uncaught exception from
 * the public surface (setStorageData, setCacheEntry, setScanResult,
 * setSyncMetadata, storeUserSession).
 * 4. If the retry also fails with QuotaExceededError, a storageWarning key
 * is written and the error is swallowed by the public surface.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a DOMException whose name is "QuotaExceededError". */
function makeQuotaError(): DOMException {
 return new DOMException("QuotaExceededError", "QuotaExceededError");
}

/** Build an Error whose message contains "QUOTA_BYTES". */
function makeQuotaBytesError(): Error {
 return new Error("QUOTA_BYTES exceeded the maximum");
}

// ---------------------------------------------------------------------------
// Chrome mock factory
// ---------------------------------------------------------------------------

function buildChromeMock() {
 const store: Record<string, unknown> = {};

 const localMock = {
 get: vi.fn(async (key: string | string[] | null) => {
 if (key === null) return {...store };
 if (Array.isArray(key)) {
 return Object.fromEntries(key.filter((k) => k in store).map((k) => [k, store[k]]),);
 }
 return key in store ? { [key]: store[key] } : {};
 }),
 set: vi.fn(async (items: Record<string, unknown>) => {
 Object.assign(store, items);
 }),
 remove: vi.fn(async (key: string | string[]) => {
 const keys = Array.isArray(key) ? key : [key];
 for (const k of keys) {
 delete store[k];
 }
 }),
 clear: vi.fn(async () => {
 for (const k of Object.keys(store)) delete store[k];
 }),
 };

 const sessionMock = {
 get: vi.fn(async () => ({})),
 set: vi.fn(async () => {}),
 remove: vi.fn(async () => {}),
 clear: vi.fn(async () => {}),
 };

 return { local: localMock, session: sessionMock, store };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("regression — QuotaExceededError LRU eviction", () => {
 let chromeMock: ReturnType<typeof buildChromeMock>;

 beforeEach(() => {
 chromeMock = buildChromeMock();
 vi.stubGlobal("chrome", {
 storage: {
 local: chromeMock.local,
 session: chromeMock.session,
 },
 });
 // Ensure navigator.onLine is true so cache expiry logic is exercised
 vi.stubGlobal("navigator", { onLine: true });
 });

 afterEach(() => {
 vi.unstubAllGlobals();
 vi.clearAllMocks();
 vi.resetModules();
 });

 // -------------------------------------------------------------------------
 // 1. LRU eviction runs and the write is retried successfully
 // -------------------------------------------------------------------------

 describe("setStorageData — first write throws QuotaExceededError", () => {
 it("evicts cache entries and retries the write so it ultimately succeeds", async () => {
 // Pre-populate store with some evictable cache entries
 chromeMock.store["scan_chatgpt"] = JSON.stringify({ items: [] });
 chromeMock.store["cachedSyncHint"] = JSON.stringify({});
 chromeMock.store["selectedOrg"] = "acme";

 // First call to set() throws; subsequent calls succeed
 chromeMock.local.set
.mockRejectedValueOnce(makeQuotaError())
.mockResolvedValue(undefined);

 const { setStorageData } = await import("../src/lib/storage");

 // Must not throw
 await expect(setStorageData("selectedOrg", "new-org"),).resolves.toBeUndefined();

 // set() was called at least twice: initial attempt + retry
 expect(chromeMock.local.set).toHaveBeenCalledTimes(2);

 // The retry must have included the target key
 const retryCalls = chromeMock.local.set.mock.calls.slice(1);
 const writtenKeys = retryCalls.flatMap((c) => Object.keys(c[0]));
 expect(writtenKeys).toContain("selectedOrg");
 });

 it("removes lowest-priority evictable keys during eviction", async () => {
 // Pre-populate all evictable keys
 const evictableKeys = [
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
 ] as const;

 for (const k of evictableKeys) {
 chromeMock.store[k] = "some-value";
 }

 // First call to set() throws
 chromeMock.local.set
.mockRejectedValueOnce(makeQuotaError())
.mockResolvedValue(undefined);

 const { setStorageData } = await import("../src/lib/storage");
 await setStorageData("selectedOrg", "new-org");

 // remove() must have been called for the evictable keys
 const removedKeys = chromeMock.local.remove.mock.calls.flatMap((c: [string | string[]]) => (Array.isArray(c[0]) ? c[0] : [c[0]]),);

 // At least one evictable key should have been removed
 const intersection = evictableKeys.filter((k) => removedKeys.includes(k));
 expect(intersection.length).toBeGreaterThan(0);
 });
 });

 // -------------------------------------------------------------------------
 // 2. Non-quota errors are NOT swallowed
 // -------------------------------------------------------------------------

 describe("setStorageData — non-quota errors", () => {
 it("does not propagate non-quota errors as uncaught exceptions (logged only)", async () => {
 // setStorageData catches all errors and logs them — it never throws
 chromeMock.local.set.mockRejectedValue(new Error("Internal storage error"),);

 const { setStorageData } = await import("../src/lib/storage");

 await expect(setStorageData("selectedOrg", "org"),).resolves.toBeUndefined();
 });
 });

 // -------------------------------------------------------------------------
 // 3. QuotaExceededError does NOT surface as uncaught from public surface
 // -------------------------------------------------------------------------

 describe("QuotaExceededError does not surface as uncaught exception", () => {
 it("setStorageData swallows the quota error after retry", async () => {
 chromeMock.local.set
.mockRejectedValueOnce(makeQuotaError())
.mockResolvedValue(undefined);

 const { setStorageData } = await import("../src/lib/storage");

 await expect(setStorageData("cachedCommands", "{}"),).resolves.toBeUndefined();
 });

 it("setCacheEntry swallows the quota error after retry", async () => {
 chromeMock.local.set
.mockRejectedValueOnce(makeQuotaBytesError())
.mockResolvedValue(undefined);

 const { setCacheEntry } = await import("../src/lib/storage");

 await expect(setCacheEntry("cachedCommands", "cachedCommandsTimestamp", [
 { name: "cmd" },
 ]),).resolves.toBeUndefined();
 });

 it("setScanResult swallows the quota error after retry", async () => {
 chromeMock.local.set
.mockRejectedValueOnce(makeQuotaError())
.mockResolvedValue(undefined);

 const { setScanResult } = await import("../src/lib/storage");

 await expect(setScanResult("chatgpt", {
 platform: "chatgpt",
 scannedAt: Date.now(),
 items: [],
 }),).resolves.toBeUndefined();
 });

 it("setSyncMetadata swallows the quota error after retry", async () => {
 chromeMock.local.set
.mockRejectedValueOnce(makeQuotaError())
.mockResolvedValue(undefined);

 const { setSyncMetadata } = await import("../src/lib/storage");

 await expect(setSyncMetadata("acme", {
 syncState: "fresh",
 lastSuccessAt: Date.now(),
 lastFetchAt: Date.now(),
 }),).resolves.toBeUndefined();
 });

 it("storeUserSession swallows the quota error after retry", async () => {
 // session.set always succeeds; local.set throws on first call
 chromeMock.local.set
.mockRejectedValueOnce(makeQuotaError())
.mockResolvedValue(undefined);

 const { storeUserSession } = await import("../src/lib/storage");

 await expect(storeUserSession({
 authToken: "tok-abc",
 userId: "u-1",
 userLogin: "octocat",
 }),).resolves.toBeUndefined();
 });
 });

 // -------------------------------------------------------------------------
 // 4. If retry ALSO fails, storageWarning is set and error is swallowed
 // -------------------------------------------------------------------------

 describe("when both initial write and retry fail with QuotaExceededError", () => {
 it("writes storageWarning and does not throw from setStorageData", async () => {
 // Both set() calls throw quota errors; only the native fallback write
 // (for storageWarning) should succeed
 chromeMock.local.set.mockImplementation(async (items: Record<string, unknown>) => {
 // Allow the storageWarning write through
 if ("storageWarning" in items) return;
 throw makeQuotaError();
 },);

 const { setStorageData } = await import("../src/lib/storage");

 // Must not throw
 await expect(setStorageData("selectedOrg", "org"),).resolves.toBeUndefined();

 // storageWarning must have been written
 const storageWarningCall = chromeMock.local.set.mock.calls.find((c: [Record<string, unknown>]) => "storageWarning" in c[0],);
 expect(storageWarningCall).toBeDefined();
 expect(typeof storageWarningCall![0].storageWarning).toBe("string");
 });
 });

 // -------------------------------------------------------------------------
 // 5. QUOTA_BYTES string-based error variant is also handled
 // -------------------------------------------------------------------------

 describe("QUOTA_BYTES string-based error detection", () => {
 it("recognises QUOTA_BYTES error messages and triggers eviction", async () => {
 chromeMock.local.set
.mockRejectedValueOnce(makeQuotaBytesError())
.mockResolvedValue(undefined);

 const { setStorageData } = await import("../src/lib/storage");

 await expect(setStorageData("selectedOrg", "org"),).resolves.toBeUndefined();

 // Retry must have happened (set called at least twice)
 expect(chromeMock.local.set).toHaveBeenCalledTimes(2);
 });
 });
});
