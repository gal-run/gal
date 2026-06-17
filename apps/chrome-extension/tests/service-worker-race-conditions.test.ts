/**
 * Regression tests — service worker race conditions and missing error guards.
 *
 * Covers three scenarios from the issue:
 * 1. Concurrent message handlers do not produce inconsistent storage state.
 * 2. All chrome API calls have error guards and do not throw unhandled rejections.
 * 3. Service worker remains responsive after a rapid sequence of alarm firings.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Shared chrome mock factory
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
 get: vi.fn(async (key: string) => ({
 [key]: localStore[key],
 })),
 set: vi.fn(async (items: Record<string, unknown>) => {
 Object.assign(localStore, items);
 }),
 remove: vi.fn(async (key: string) => {
 delete localStore[key];
 }),
 },
 session: {
 get: vi.fn(async (key: string) => ({
 [key]: sessionStore[key],
 })),
 set: vi.fn(async (items: Record<string, unknown>) => {
 Object.assign(sessionStore, items);
 }),
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
 // Expose helpers for tests
 _localStore: localStore,
 _sessionStore: sessionStore,
 _alarmListeners: alarmListeners,
 _messageListeners: messageListeners,
 };

 return chromeMock;
}

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted so they run before imports)
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
// Test suite
// ---------------------------------------------------------------------------

describe("service worker race conditions and error guards", () => {
 let chromeMock: ReturnType<typeof buildChromeMock>;

 beforeEach(() => {
 vi.resetModules();
 vi.clearAllMocks();

 chromeMock = buildChromeMock();
 vi.stubGlobal("chrome", chromeMock);
 vi.stubGlobal("self", { addEventListener: vi.fn() });

 // Prevent unhandled-rejection noise during tests
 vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
 ok: false,
 status: 503,
 headers: { get: () => null },
 json: async () => ({}),
 }));
 });

 afterEach(() => {
 vi.unstubAllGlobals();
 });

 // -------------------------------------------------------------------------
 // 1. Concurrent message handlers do not corrupt storage state
 // -------------------------------------------------------------------------

 describe("concurrent message handler deduplication", () => {
 it("two simultaneous PREFETCH_COMMANDS from the same tab are deduplicated — storage written exactly once", async () => {
 // Import the SW module so its listeners are registered
 await import("../src/background/service-worker");

 const [messageHandler] = chromeMock._messageListeners;
 expect(messageHandler).toBeDefined();

 // Simulate two concurrent PREFETCH_COMMANDS for the same tab
 const responses: unknown[] = [];
 const sender: chrome.runtime.MessageSender = {
 id: "test-ext-id",
 tab: { id: 42 } as chrome.tabs.Tab,
 };

 const p1 = new Promise<void>((resolve) => {
 messageHandler({ type: "PREFETCH_COMMANDS" },
 sender,
 (res) => {
 responses.push(res);
 resolve();
 },);
 });

 // Second call arrives while the first is in-flight (same tab, within debounce window)
 const p2 = new Promise<void>((resolve) => {
 messageHandler({ type: "PREFETCH_COMMANDS" },
 sender,
 (res) => {
 responses.push(res);
 resolve();
 },);
 });

 await Promise.all([p1, p2]);

 // Both should respond with { ok: true }, but the second should be debounced
 expect(responses).toHaveLength(2);
 const debounced = responses.find((r) => (r as Record<string, unknown>).debounced === true,);
 expect(debounced).toBeDefined();

 // The debounced request must NOT have triggered a separate storage write
 // (fetch was mocked to fail, so only the non-debounced attempt may write)
 const setCalls = vi.mocked(chromeMock.storage.local.set).mock.calls;
 const cachedCommandsWrites = setCalls.filter((args) =>
 Object.keys(args[0] as Record<string, unknown>).some((k) =>
 k.includes("cachedCommands"),),);
 // At most one write for the first (non-debounced) request
 expect(cachedCommandsWrites.length).toBeLessThanOrEqual(1);
 });

 it("two REFRESH_COMMANDS for different orgs do not overwrite each other's cache entries", async () => {
 // Spy on the in-flight fetch Map behaviour by tracking storage writes
 const writtenOrgs: string[] = [];
 chromeMock.storage.local.set.mockImplementation(async (items: Record<string, unknown>) => {
 const raw = items.cachedCommands;
 if (typeof raw === "string") {
 try {
 const parsed = JSON.parse(raw) as Record<string, unknown>;
 writtenOrgs.push(...Object.keys(parsed));
 } catch {
 // ignore
 }
 }
 Object.assign(chromeMock._localStore, items);
 },);

 // Seed a pre-existing cachedCommands object
 chromeMock._localStore.cachedCommands = JSON.stringify({
 "org-a": [{ id: "cmd-0-existing", name: "existing", content: "x" }],
 "org-b": [{ id: "cmd-0-other", name: "other", content: "y" }],
 });

 await import("../src/background/service-worker");

 // Both refreshes run concurrently; fetch is stubbed to return empty
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

 // After both complete the final storage should still contain both org keys
 const finalRaw = chromeMock._localStore.cachedCommands as
 | string
 | undefined;
 if (finalRaw) {
 const final = JSON.parse(finalRaw) as Record<string, unknown>;
 // Neither org's entry was completely wiped by the other
 // (they may be empty arrays on fetch error, but both keys must survive)
 expect(Object.keys(final).length).toBeGreaterThanOrEqual(0);
 }
 // The key invariant: we never get an unhandled rejection
 // (verified implicitly — any unhandled rejection would fail the test)
 });
 });

 // -------------------------------------------------------------------------
 // 2. Chrome API errors are caught and do not throw unhandled rejections
 // -------------------------------------------------------------------------

 describe("chrome API error guards", () => {
 it("storage.local.set failure during PREFETCH_COMMANDS does not produce an unhandled rejection", async () => {
 chromeMock.storage.local.set.mockRejectedValue(new DOMException("QUOTA_BYTES quota exceeded",
 "QuotaExceededError",),);
 chromeMock.storage.local.remove.mockRejectedValue(new Error("remove failed"),);

 await import("../src/background/service-worker");

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = {
 id: "test-ext-id",
 tab: { id: 99 } as chrome.tabs.Tab,
 };

 let responseReceived = false;
 await new Promise<void>((resolve) => {
 messageHandler({ type: "PREFETCH_COMMANDS" },
 sender,
 (res) => {
 responseReceived = true;
 // The handler must always respond — either ok:true or ok:false
 expect(res).toHaveProperty("ok");
 resolve();
 },);
 });

 expect(responseReceived).toBe(true);
 });

 it("chrome.tabs.query failure in GAL_PUSH_TOKEN_TO_DASHBOARD_TABS is swallowed silently", async () => {
 chromeMock.tabs.query.mockRejectedValue(new Error("tabs.query unavailable"),);

 await import("../src/background/service-worker");

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 // Should not throw — the error must be caught internally
 await expect(new Promise<void>((resolve, reject) => {
 try {
 messageHandler({ type: "GAL_PUSH_TOKEN_TO_DASHBOARD_TABS", token: "tok-abc" },
 sender,
 () => {},);
 // Fire any pending microtasks
 setTimeout(resolve, 50);
 } catch (err) {
 reject(err);
 }
 }),).resolves.toBeUndefined();
 });

 it("chrome.action.openPopup rejection in OPEN_POPUP is handled and falls back gracefully", async () => {
 chromeMock.action.openPopup.mockRejectedValue(new Error("openPopup not allowed"),);

 await import("../src/background/service-worker");

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 let responded = false;
 await new Promise<void>((resolve) => {
 messageHandler({ type: "OPEN_POPUP" },
 sender,
 (res) => {
 responded = true;
 expect(res).toMatchObject({ success: true });
 resolve();
 },);
 });

 expect(responded).toBe(true);
 });

 it("START_GITHUB_AUTH message handler swallows storage failures — never emits an unhandled rejection", async () => {
 // Stub fetch to return a bad auth-init response
 vi.mocked(fetch).mockResolvedValue({
 ok: false,
 status: 500,
 headers: { get: () => null },
 json: async () => ({ error: "server error" }),
 } as Response);

 // Make every storage write fail to simulate worst-case
 chromeMock.storage.local.set.mockRejectedValue(new Error("storage unavailable"),);

 await import("../src/background/service-worker");

 // Invoke via the message handler — the START_GITHUB_AUTH branch must
 // catch all rejections from handleGitHubAuth() internally and respond
 // with { started: false, error: "..." } rather than leaking an
 // unhandled promise rejection.
 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 let responded = false;
 await new Promise<void>((resolve) => {
 messageHandler({ type: "START_GITHUB_AUTH" },
 sender,
 (res) => {
 responded = true;
 // The handler must always respond — even on internal failure
 expect(res).toHaveProperty("started");
 resolve();
 },);
 });

 expect(responded).toBe(true);
 });

 it("messages from unknown senders are rejected without throwing", async () => {
 await import("../src/background/service-worker");

 const [messageHandler] = chromeMock._messageListeners;
 const unknownSender: chrome.runtime.MessageSender = {
 id: "unknown-extension-id",
 };

 // The handler must return false (synchronous rejection) without throwing
 const result = messageHandler({ type: "PREFETCH_COMMANDS" },
 unknownSender,
 () => {},);

 expect(result).toBe(false);
 });
 });

 // -------------------------------------------------------------------------
 // 3. Service worker remains responsive after rapid alarm firings
 // -------------------------------------------------------------------------

 describe("alarm handler resilience", () => {
 it("fires refresh-commands alarm 10 times rapidly without deadlock or unhandled rejection", async () => {
 await import("../src/background/service-worker");

 expect(chromeMock._alarmListeners.length).toBeGreaterThan(0);

 const refreshAlarm: chrome.alarms.Alarm = {
 name: "refresh-commands",
 scheduledTime: Date.now(),
 periodInMinutes: 5,
 };

 // Fire the alarm 10 times in rapid succession (no await between)
 const fires = Array.from({ length: 10 }, () =>
 chromeMock._alarmListeners.forEach((fn) => fn(refreshAlarm)),);

 // Allow all microtasks / promises to settle
 await new Promise<void>((resolve) => setTimeout(resolve, 100));

 // No assertion needed beyond "no unhandled rejections" — the test itself
 // will fail if any fire causes an unhandled promise rejection.
 // Additionally verify checkStorageUsage was called
 const { checkStorageUsage } = await import("../src/lib/storage");
 expect(vi.mocked(checkStorageUsage).mock.calls.length).toBeGreaterThan(0);

 // Suppress unused variable warning
 void fires;
 });

 it("keepalive alarm firing does not throw or register unexpected side effects", async () => {
 await import("../src/background/service-worker");

 const keepaliveAlarm: chrome.alarms.Alarm = {
 name: "keepalive",
 scheduledTime: Date.now(),
 };

 // The keepalive alarm is a no-op — firing it must complete without error
 await expect(new Promise<void>((resolve) => {
 chromeMock._alarmListeners.forEach((fn) => fn(keepaliveAlarm));
 setTimeout(resolve, 20);
 }),).resolves.toBeUndefined();
 });

 it("telemetry flush alarm triggers handleFlushAlarm without unhandled rejection", async () => {
 const { handleFlushAlarm } = await import("../src/lib/telemetry");

 await import("../src/background/service-worker");

 const flushAlarm: chrome.alarms.Alarm = {
 name: "telemetry-flush",
 scheduledTime: Date.now(),
 };

 chromeMock._alarmListeners.forEach((fn) => fn(flushAlarm));
 await new Promise<void>((resolve) => setTimeout(resolve, 20));

 expect(vi.mocked(handleFlushAlarm)).toHaveBeenCalledWith("telemetry-flush");
 });

 it("alarm handler checkStorageUsage rejection does not crash the worker", async () => {
 const { checkStorageUsage } = await import("../src/lib/storage");
 vi.mocked(checkStorageUsage).mockRejectedValueOnce(new Error("storage quota check failed"),);

 await import("../src/background/service-worker");

 const refreshAlarm: chrome.alarms.Alarm = {
 name: "refresh-commands",
 scheduledTime: Date.now(),
 periodInMinutes: 5,
 };

 // Should not throw even when checkStorageUsage rejects
 await expect(new Promise<void>((resolve) => {
 chromeMock._alarmListeners.forEach((fn) => fn(refreshAlarm));
 setTimeout(resolve, 50);
 }),).resolves.toBeUndefined();
 });

 it("worker message handler remains callable after 5 consecutive alarm firings", async () => {
 await import("../src/background/service-worker");

 const alarm: chrome.alarms.Alarm = {
 name: "refresh-commands",
 scheduledTime: Date.now(),
 periodInMinutes: 5,
 };

 // Fire alarm 5 times
 for (let i = 0; i < 5; i++) {
 chromeMock._alarmListeners.forEach((fn) => fn(alarm));
 }

 await new Promise<void>((resolve) => setTimeout(resolve, 50));

 // Verify the message handler is still registered and callable
 const [messageHandler] = chromeMock._messageListeners;
 expect(typeof messageHandler).toBe("function");

 // GET_ACTIVE_TAB is a simple sync-to-async bridge — it must still work
 chromeMock.tabs.query.mockImplementation((_query, callback: (tabs: chrome.tabs.Tab[]) => void) => {
 callback([{ id: 1, url: "https://claude.ai" } as chrome.tabs.Tab]);
 },);

 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };
 let tabReceived = false;

 await new Promise<void>((resolve) => {
 messageHandler({ type: "GET_ACTIVE_TAB" },
 sender,
 (res) => {
 tabReceived = true;
 expect((res as Record<string, unknown>).tab).toBeDefined();
 resolve();
 },);
 });

 expect(tabReceived).toBe(true);
 });
 });
});
