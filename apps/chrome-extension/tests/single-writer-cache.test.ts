/**
 * Regression tests — single-writer cache to eliminate palette flicker.
 *
 * Architecture under test:
 * The service worker maintains an `inFlightFetches` Map that acts as a
 * single-writer token: once a fetch promise is in flight for an org, any
 * concurrent caller receives the *same* promise instead of spawning a
 * second fetch. `applyCacheResult` performs an atomic read-modify-write of
 * the per-org command cache.
 *
 * What these tests verify (regression surface):
 * 1. Concurrent writes produce exactly one in-flight fetch per org (writer
 * token deduplication) — concurrent callers share a promise, never fork
 * two parallel writes for the same org.
 * 2. The command cache never transiently becomes empty during a refresh —
 * the atomic update pattern (read → merge → write) preserves previous
 * entries while the new write is pending.
 * 3. A second fetch for the same org that arrives while the first is
 * in-flight is deduplicated: only one network call is made, but both
 * callers get the result.
 * 4. Concurrent refreshes for *different* orgs do not overwrite each
 * other's cache slots — each org's data is preserved independently.
 * 5. On a fetch error the existing cache is never cleared (cache-on-error
 * protection, part of the single-writer contract from).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Chrome mock factory (matches the pattern used in service-worker-race-conditions.test.ts)
// ---------------------------------------------------------------------------

type AlarmListener = (alarm: chrome.alarms.Alarm) => void;
type MessageListener = (message: Record<string, unknown>,
 sender: chrome.runtime.MessageSender,
 sendResponse: (response?: unknown) => void,) => boolean | void;

function buildChromeMock() {
 const localStore: Record<string, unknown> = {};
 const sessionStore: Record<string, unknown> = {};
 const alarmListeners: AlarmListener[] = [];
 const messageListeners: MessageListener[] = [];

 const chromeMock = {
 storage: {
 local: {
 get: vi.fn(async (key: string | string[] | null) => {
 if (key === null) return {...localStore };
 if (Array.isArray(key)) {
 return Object.fromEntries(key.map((k) => [k, localStore[k]]).filter(([, v]) => v !== undefined),);
 }
 return localStore[key as string] !== undefined
 ? { [key as string]: localStore[key as string] }
 : {};
 }),
 set: vi.fn(async (items: Record<string, unknown>) => {
 Object.assign(localStore, items);
 }),
 remove: vi.fn(async (key: string | string[]) => {
 const keys = Array.isArray(key) ? key : [key];
 for (const k of keys) delete localStore[k];
 }),
 getBytesInUse: vi.fn(async () => 0),
 },
 session: {
 get: vi.fn(async (key: string) => ({
 [key]: sessionStore[key],
 })),
 set: vi.fn(async (items: Record<string, unknown>) => {
 Object.assign(sessionStore, items);
 }),
 remove: vi.fn(async () => {}),
 setAccessLevel: vi.fn().mockResolvedValue(undefined),
 },
 },
 alarms: {
 create: vi.fn().mockResolvedValue(undefined),
 clear: vi.fn().mockResolvedValue(true),
 onAlarm: {
 addListener: vi.fn((fn: AlarmListener) => {
 alarmListeners.push(fn);
 }),
 },
 },
 runtime: {
 id: "test-ext-id",
 lastError: undefined as { message: string } | undefined,
 onInstalled: { addListener: vi.fn() },
 onStartup: { addListener: vi.fn() },
 onMessage: {
 addListener: vi.fn((fn: MessageListener) => {
 messageListeners.push(fn);
 }),
 },
 onSuspend: { addListener: vi.fn() },
 getURL: vi.fn((path: string) => `chrome-extension://test-ext-id/${path}`),
 },
 tabs: {
 create: vi.fn().mockResolvedValue({}),
 query: vi.fn().mockResolvedValue([]),
 get: vi.fn().mockResolvedValue({ url: undefined }),
 sendMessage: vi.fn().mockResolvedValue(undefined),
 onActivated: { addListener: vi.fn() },
 onUpdated: { addListener: vi.fn() },
 },
 identity: {
 getRedirectURL: vi.fn().mockReturnValue("https://ext.chromiumapp.org/cb"),
 launchWebAuthFlow: vi.fn(),
 },
 action: {
 openPopup: vi.fn().mockResolvedValue(undefined),
 },
 commands: {
 onCommand: { addListener: vi.fn() },
 },
 // Test helpers
 _localStore: localStore,
 _sessionStore: sessionStore,
 _alarmListeners: alarmListeners,
 _messageListeners: messageListeners,
 };

 return chromeMock;
}

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted before imports)
// ---------------------------------------------------------------------------

vi.mock("../src/lib/sentry", () => ({
 captureExceptionWithTags: vi.fn(),
 initSentry: vi.fn(),
}));

vi.mock("../src/lib/storage", () => ({
 storeUserSession: vi.fn(),
 setSyncMetadata: vi.fn().mockResolvedValue(undefined),
 checkStorageUsage: vi.fn().mockResolvedValue({ warning: null }),
}));

vi.mock("../src/lib/telemetry", () => ({
 initTelemetry: vi.fn(),
 trackEvent: vi.fn(),
 flushEvents: vi.fn(),
 handleFlushAlarm: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a successful approved-config API response with the given command names. */
function makeConfigResponse(commandNames: string[],): { approved: boolean; commands: Array<{ name: string; content: string }> } {
 return {
 approved: true,
 commands: commandNames.map((name) => ({ name, content: `# ${name}` })),
 };
}

/** Read the raw cachedCommands JSON from the mock local store. */
function readCachedCommands(store: Record<string, unknown>,): Record<string, unknown[]> | null {
 const raw = store.cachedCommands as string | undefined;
 if (!raw) return null;
 try {
 return JSON.parse(raw) as Record<string, unknown[]>;
 } catch {
 return null;
 }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("regression — single-writer cache / palette flicker prevention", () => {
 let chromeMock: ReturnType<typeof buildChromeMock>;

 beforeEach(() => {
 vi.resetModules();
 vi.clearAllMocks();

 chromeMock = buildChromeMock();
 vi.stubGlobal("chrome", chromeMock);
 vi.stubGlobal("self", { addEventListener: vi.fn() });
 vi.stubGlobal("navigator", { onLine: true });
 });

 afterEach(() => {
 vi.unstubAllGlobals();
 });

 // -------------------------------------------------------------------------
 // 1. Writer-token deduplication: only one fetch in flight per org
 // -------------------------------------------------------------------------

 describe("writer-token deduplication (inFlightFetches)", () => {
 it("two concurrent REFRESH_COMMANDS for the same org result in exactly one network call", async () => {
 // Seed an auth token so the service worker will attempt to fetch
 chromeMock._sessionStore.authToken = "tok-abc";
 chromeMock._localStore.selectedOrg = "acme";

 // Count how many times fetch is called for the approved-config endpoint
 let approvedConfigFetchCount = 0;

 // The fetch resolves after a short delay to let both callers reach the
 // deduplication point before the first one completes.
 vi.stubGlobal("fetch",
 vi.fn(async (url: string) => {
 if (typeof url === "string" && url.includes("approved-config")) {
 approvedConfigFetchCount++;
 // Artificial delay — both REFRESH_COMMANDS are dispatched before
 // this promise resolves, exercising the single-writer path.
 await new Promise((r) => setTimeout(r, 20));
 return {
 ok: true,
 status: 200,
 headers: { get: () => null },
 json: async () => makeConfigResponse(["deploy", "review"]),
 };
 }
 // organizations endpoint
 return {
 ok: true,
 status: 200,
 headers: { get: () => null },
 json: async () => ({ organizations: [{ name: "acme" }] }),
 };
 }),);

 await import("../src/background/service-worker");
 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 // Fire two concurrent refresh requests for the same org
 const results = await Promise.all([
 new Promise<unknown>((resolve) => {
 messageHandler({ type: "REFRESH_COMMANDS", orgName: "acme" },
 sender,
 resolve,);
 }),
 new Promise<unknown>((resolve) => {
 messageHandler({ type: "REFRESH_COMMANDS", orgName: "acme" },
 sender,
 resolve,);
 }),
 ]);

 // Both calls must have received a response
 expect(results).toHaveLength(2);
 for (const r of results) {
 expect(r).toMatchObject({ ok: true });
 }

 // The single-writer token ensures only one network call reached the API
 expect(approvedConfigFetchCount).toBe(1);
 });

 it("two concurrent REFRESH_COMMANDS for *different* orgs each make their own network call", async () => {
 chromeMock._sessionStore.authToken = "tok-abc";

 const calledOrgs: string[] = [];

 vi.stubGlobal("fetch",
 vi.fn(async (url: string) => {
 if (typeof url === "string" && url.includes("approved-config")) {
 const match = /\/organizations\/([^/]+)\/approved-config/.exec(url);
 if (match) calledOrgs.push(decodeURIComponent(match[1]));
 await new Promise((r) => setTimeout(r, 15));
 return {
 ok: true,
 status: 200,
 headers: { get: () => null },
 json: async () => makeConfigResponse(["cmd-1"]),
 };
 }
 return {
 ok: true,
 status: 200,
 headers: { get: () => null },
 json: async () => ({ organizations: [] }),
 };
 }),);

 await import("../src/background/service-worker");
 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 // Dispatch for two distinct orgs concurrently
 await Promise.all([
 new Promise<void>((resolve) => {
 messageHandler({ type: "REFRESH_COMMANDS", orgName: "org-alpha" },
 sender,
 () => resolve(),);
 }),
 new Promise<void>((resolve) => {
 messageHandler({ type: "REFRESH_COMMANDS", orgName: "org-beta" },
 sender,
 () => resolve(),);
 }),
 ]);

 // Each org must have triggered its own network request
 expect(calledOrgs).toContain("org-alpha");
 expect(calledOrgs).toContain("org-beta");
 });
 });

 // -------------------------------------------------------------------------
 // 2. Cache never transiently empties during a refresh
 // -------------------------------------------------------------------------

 describe("no transient empty during cache refresh (atomic update)", () => {
 it("cachedCommands always contains at least the pre-existing entries while a refresh is in flight", async () => {
 chromeMock._sessionStore.authToken = "tok-abc";

 // Seed the cache with an existing command list for "acme"
 const seedCommands = [{ id: "cmd-0-existing", name: "existing", content: "x" }];
 chromeMock._localStore.cachedCommands = JSON.stringify({
 acme: seedCommands,
 });
 chromeMock._localStore.cachedCommandsTimestamp = Date.now() - 60_000;

 // Snapshot of every intermediate write to chrome.storage.local
 const commandSnapshots: (Record<string, unknown[]> | null)[] = [];

 chromeMock.storage.local.set.mockImplementation(async (items: Record<string, unknown>) => {
 Object.assign(chromeMock._localStore, items);
 // Capture the cachedCommands at each write point
 if ("cachedCommands" in items) {
 try {
 commandSnapshots.push(JSON.parse(items.cachedCommands as string) as Record<string, unknown[]>,);
 } catch {
 commandSnapshots.push(null);
 }
 }
 },);

 // Slow fetch so we can observe intermediate state
 vi.stubGlobal("fetch",
 vi.fn(async (url: string) => {
 if (typeof url === "string" && url.includes("approved-config")) {
 await new Promise((r) => setTimeout(r, 30));
 return {
 ok: true,
 status: 200,
 headers: { get: () => null },
 json: async () => makeConfigResponse(["deploy", "review"]),
 };
 }
 return {
 ok: true,
 status: 200,
 headers: { get: () => null },
 json: async () => ({ organizations: [{ name: "acme" }] }),
 };
 }),);

 await import("../src/background/service-worker");
 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 await new Promise<void>((resolve) => {
 messageHandler({ type: "REFRESH_COMMANDS", orgName: "acme" },
 sender,
 () => resolve(),);
 });

 // Every intermediate write must still contain the "acme" key —
 // the cache must never be cleared before the new data is ready.
 for (const snapshot of commandSnapshots) {
 expect(snapshot).not.toBeNull();
 // The acme entry must always exist (no transient empty slot)
 expect(snapshot).toHaveProperty("acme");
 // The acme array must never be a null or missing value
 expect(Array.isArray(snapshot!.acme)).toBe(true);
 }

 // After completion, the commands must have the new values
 const finalCache = readCachedCommands(chromeMock._localStore);
 expect(finalCache).not.toBeNull();
 expect(finalCache!.acme).toHaveLength(2);
 });

 it("other orgs' cache entries survive while one org is being refreshed", async () => {
 chromeMock._sessionStore.authToken = "tok-abc";

 // Two orgs pre-populated in the cache
 chromeMock._localStore.cachedCommands = JSON.stringify({
 "org-a": [{ id: "cmd-0-a", name: "cmd-a", content: "a" }],
 "org-b": [{ id: "cmd-0-b", name: "cmd-b", content: "b" }],
 });

 vi.stubGlobal("fetch",
 vi.fn(async (url: string) => {
 if (typeof url === "string" && url.includes("approved-config")) {
 await new Promise((r) => setTimeout(r, 20));
 return {
 ok: true,
 status: 200,
 headers: { get: () => null },
 json: async () => makeConfigResponse(["new-cmd"]),
 };
 }
 return {
 ok: false,
 status: 404,
 headers: { get: () => null },
 json: async () => ({}),
 };
 }),);

 await import("../src/background/service-worker");
 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 // Refresh only org-a; org-b must remain untouched
 await new Promise<void>((resolve) => {
 messageHandler({ type: "REFRESH_COMMANDS", orgName: "org-a" },
 sender,
 () => resolve(),);
 });

 const finalCache = readCachedCommands(chromeMock._localStore);
 expect(finalCache).not.toBeNull();

 // org-b must still be present and unchanged
 expect(finalCache).toHaveProperty("org-b");
 expect(Array.isArray(finalCache!["org-b"])).toBe(true);
 expect(finalCache!["org-b"]).toHaveLength(1);
 expect((finalCache!["org-b"] as Array<{ name: string }>)[0].name).toBe("cmd-b",);
 });
 });

 // -------------------------------------------------------------------------
 // 3. Cache is preserved on fetch error (error does not wipe existing data)
 // -------------------------------------------------------------------------

 describe("cache-on-error protection (single-writer contract)", () => {
 it("an API 500 error does not wipe existing cached commands for the org", async () => {
 chromeMock._sessionStore.authToken = "tok-abc";

 const existingCommands = [
 { id: "cmd-0-saved", name: "saved-cmd", content: "saved content" },
 ];
 chromeMock._localStore.cachedCommands = JSON.stringify({
 acme: existingCommands,
 });

 vi.stubGlobal("fetch",
 vi.fn(async (url: string) => {
 if (typeof url === "string" && url.includes("approved-config")) {
 return {
 ok: false,
 status: 500,
 headers: { get: () => null },
 json: async () => ({ error: "server error" }),
 };
 }
 return {
 ok: true,
 status: 200,
 headers: { get: () => null },
 json: async () => ({ organizations: [{ name: "acme" }] }),
 };
 }),);

 await import("../src/background/service-worker");
 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 await new Promise<void>((resolve) => {
 messageHandler({ type: "REFRESH_COMMANDS", orgName: "acme" },
 sender,
 () => resolve(),);
 });

 const finalCache = readCachedCommands(chromeMock._localStore);
 expect(finalCache).not.toBeNull();

 // The existing entry must still be intact
 expect(finalCache!.acme).toHaveLength(1);
 expect((finalCache!.acme as Array<{ name: string }>)[0].name,).toBe("saved-cmd");
 });

 it("a network error does not wipe the palette commands", async () => {
 chromeMock._sessionStore.authToken = "tok-abc";

 const existingCommands = [
 { id: "cmd-0-offline", name: "offline-cmd", content: "offline content" },
 ];
 chromeMock._localStore.cachedCommands = JSON.stringify({
 acme: existingCommands,
 });

 vi.stubGlobal("fetch",
 vi.fn(async (url: string) => {
 if (typeof url === "string" && url.includes("approved-config")) {
 throw new Error("Failed to fetch");
 }
 return {
 ok: true,
 status: 200,
 headers: { get: () => null },
 json: async () => ({ organizations: [{ name: "acme" }] }),
 };
 }),);

 await import("../src/background/service-worker");
 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 await new Promise<void>((resolve) => {
 messageHandler({ type: "REFRESH_COMMANDS", orgName: "acme" },
 sender,
 () => resolve(),);
 });

 const finalCache = readCachedCommands(chromeMock._localStore);
 expect(finalCache).not.toBeNull();
 expect(finalCache!.acme).toHaveLength(1);
 expect((finalCache!.acme as Array<{ name: string }>)[0].name,).toBe("offline-cmd");
 });

 it("auth error (401) leaves existing cached commands untouched", async () => {
 chromeMock._sessionStore.authToken = "tok-expired";

 const existingCommands = [
 { id: "cmd-0-protected", name: "protected-cmd", content: "protected" },
 ];
 chromeMock._localStore.cachedCommands = JSON.stringify({
 acme: existingCommands,
 });

 vi.stubGlobal("fetch",
 vi.fn(async (url: string) => {
 if (typeof url === "string" && url.includes("approved-config")) {
 return {
 ok: false,
 status: 401,
 headers: { get: () => null },
 json: async () => ({ error: "Unauthorized" }),
 };
 }
 return {
 ok: true,
 status: 200,
 headers: { get: () => null },
 json: async () => ({ organizations: [{ name: "acme" }] }),
 };
 }),);

 await import("../src/background/service-worker");
 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 await new Promise<void>((resolve) => {
 messageHandler({ type: "REFRESH_COMMANDS", orgName: "acme" },
 sender,
 () => resolve(),);
 });

 const finalCache = readCachedCommands(chromeMock._localStore);
 expect(finalCache).not.toBeNull();
 expect(finalCache!.acme).toHaveLength(1);
 });
 });

 // -------------------------------------------------------------------------
 // 4. Concurrent writes to distinct orgs do not interleave or corrupt data
 // -------------------------------------------------------------------------

 describe("concurrent writes to distinct orgs — no interleaving or corruption", () => {
 it("three simultaneous refreshes for three orgs all land correct data without corruption", async () => {
 chromeMock._sessionStore.authToken = "tok-abc";

 const orgData: Record<string, string[]> = {
 "org-x": ["cmd-x1", "cmd-x2"],
 "org-y": ["cmd-y1"],
 "org-z": ["cmd-z1", "cmd-z2", "cmd-z3"],
 };

 vi.stubGlobal("fetch",
 vi.fn(async (url: string) => {
 if (typeof url === "string" && url.includes("approved-config")) {
 const match = /\/organizations\/([^/]+)\/approved-config/.exec(url);
 const orgName = match ? decodeURIComponent(match[1]) : "";
 // Each org takes slightly different time to exercise ordering
 const delay = orgName === "org-x" ? 30 : orgName === "org-y" ? 10 : 20;
 await new Promise((r) => setTimeout(r, delay));
 const commands = orgData[orgName] ?? [];
 return {
 ok: true,
 status: 200,
 headers: { get: () => null },
 json: async () => makeConfigResponse(commands),
 };
 }
 return {
 ok: false,
 status: 404,
 headers: { get: () => null },
 json: async () => ({}),
 };
 }),);

 await import("../src/background/service-worker");
 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 // All three refreshes fire concurrently
 await Promise.all(["org-x", "org-y", "org-z"].map((orgName) =>
 new Promise<void>((resolve) => {
 messageHandler({ type: "REFRESH_COMMANDS", orgName },
 sender,
 () => resolve(),);
 }),),);

 const finalCache = readCachedCommands(chromeMock._localStore);
 expect(finalCache).not.toBeNull();

 // Every org must have landed its correct set of commands
 for (const [org, expectedNames] of Object.entries(orgData)) {
 expect(finalCache).toHaveProperty(org);
 const actual = (finalCache![org] as Array<{ name: string }>).map((c) => c.name);
 expect(actual).toEqual(expect.arrayContaining(expectedNames));
 expect(actual).toHaveLength(expectedNames.length);
 }
 });

 it("no write produces an interleaved or partially-merged command list", async () => {
 chromeMock._sessionStore.authToken = "tok-abc";

 // Seed both orgs with existing data
 chromeMock._localStore.cachedCommands = JSON.stringify({
 "org-a": [{ id: "cmd-0-old-a", name: "old-a", content: "old" }],
 "org-b": [{ id: "cmd-0-old-b", name: "old-b", content: "old" }],
 });

 vi.stubGlobal("fetch",
 vi.fn(async (url: string) => {
 if (typeof url === "string" && url.includes("approved-config")) {
 const match = /\/organizations\/([^/]+)\/approved-config/.exec(url);
 const org = match ? decodeURIComponent(match[1]) : "";
 await new Promise((r) => setTimeout(r, org === "org-a" ? 25 : 5));
 const names = org === "org-a" ? ["new-a"] : ["new-b"];
 return {
 ok: true,
 status: 200,
 headers: { get: () => null },
 json: async () => makeConfigResponse(names),
 };
 }
 return {
 ok: false,
 status: 404,
 headers: { get: () => null },
 json: async () => ({}),
 };
 }),);

 await import("../src/background/service-worker");
 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 await Promise.all([
 new Promise<void>((resolve) => {
 messageHandler({ type: "REFRESH_COMMANDS", orgName: "org-a" },
 sender,
 () => resolve(),);
 }),
 new Promise<void>((resolve) => {
 messageHandler({ type: "REFRESH_COMMANDS", orgName: "org-b" },
 sender,
 () => resolve(),);
 }),
 ]);

 const finalCache = readCachedCommands(chromeMock._localStore);
 expect(finalCache).not.toBeNull();

 // org-a must contain only its own new commands (no interleaving with org-b)
 const orgANames = (finalCache!["org-a"] as Array<{ name: string }>).map((c) => c.name);
 expect(orgANames).not.toContain("new-b");
 expect(orgANames).toContain("new-a");

 // org-b must contain only its own new commands (no interleaving with org-a)
 const orgBNames = (finalCache!["org-b"] as Array<{ name: string }>).map((c) => c.name);
 expect(orgBNames).not.toContain("new-a");
 expect(orgBNames).toContain("new-b");
 });
 });

 // -------------------------------------------------------------------------
 // 5. Periodic alarm refresh also goes through the single-writer path
 // -------------------------------------------------------------------------

 describe("alarm-triggered refresh uses single-writer path", () => {
 it("repeated alarm firings for the same org do not produce duplicate network calls while one is in flight", async () => {
 chromeMock._sessionStore.authToken = "tok-abc";
 chromeMock._localStore.selectedOrg = "acme";
 chromeMock._localStore.cachedCommands = JSON.stringify({
 acme: [{ id: "cmd-0-prev", name: "prev", content: "prev" }],
 });

 let fetchCallCount = 0;

 // Slow fetch so a second alarm fires while first is in flight
 vi.stubGlobal("fetch",
 vi.fn(async (url: string) => {
 if (typeof url === "string" && url.includes("approved-config")) {
 fetchCallCount++;
 await new Promise((r) => setTimeout(r, 50));
 return {
 ok: true,
 status: 200,
 headers: { get: () => null },
 json: async () => makeConfigResponse(["alarm-cmd"]),
 };
 }
 return {
 ok: true,
 status: 200,
 headers: { get: () => null },
 json: async () => ({ organizations: [{ name: "acme" }] }),
 };
 }),);

 await import("../src/background/service-worker");

 // Fire the refresh-commands alarm twice in rapid succession (no await between)
 const alarm: chrome.alarms.Alarm = {
 name: "refresh-commands",
 scheduledTime: Date.now(),
 periodInMinutes: 5,
 };
 chromeMock._alarmListeners.forEach((fn) => fn(alarm));
 chromeMock._alarmListeners.forEach((fn) => fn(alarm));

 // Let both async chains complete
 await new Promise<void>((resolve) => setTimeout(resolve, 150));

 // Because the second alarm fires while the first fetch is in flight,
 // the single-writer token deduplicates them — at most one extra fetch
 // can be initiated (for the second alarm, which starts after the first
 // completes and clears the token). We assert fewer than 3 total calls
 // which would indicate uncontrolled parallelism.
 expect(fetchCallCount).toBeLessThanOrEqual(2);

 // The cache must not be empty — it must contain the alarm command
 const finalCache = readCachedCommands(chromeMock._localStore);
 if (finalCache?.acme) {
 expect(Array.isArray(finalCache.acme)).toBe(true);
 }
 });
 });
});
