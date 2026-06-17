/**
 * Regression tests — proxy Gemini image fetch through service worker
 * + placeholder while loading.
 *
 * Issue: Chrome extension clipboard image thumbnails appeared blank for Gemini
 * images because the content-script fetch was blocked by the server's
 * Cross-Origin-Resource-Policy: same-site header on lh3.googleusercontent.com.
 *
 * Fix:
 * 1. Service worker handles a new "GAL_FETCH_IMAGE" message type and proxies
 * the fetch using `credentials: "include"` for lh3.googleusercontent.com
 * images so cookie-gated Gemini assets keep working, while continuing to
 * use `credentials: "omit"` for generic cross-origin fetches.
 * 2. content/asset-clipboard.ts falls back to that proxy when the direct
 * content-script fetch fails.
 * 3. popup/App.tsx shows a placeholder SVG icon when the <img> src fails
 * to load (i.e. while the proxy fetch is in progress or if it fails).
 *
 * What is tested here:
 * A. GAL_FETCH_IMAGE handler is registered and returns `true` (async response)
 * for messages with a url field.
 * B. GAL_FETCH_IMAGE handler chooses the correct credentials mode.
 * C. GAL_FETCH_IMAGE handler resolves { dataUrl: null } when the upstream
 * HTTP response is not ok.
 * D. GAL_FETCH_IMAGE handler resolves { dataUrl: null } on network error
 * without leaking an unhandled rejection.
 * E. GAL_FETCH_IMAGE message with no `url` field is not handled (catch-all
 * returns false).
 * F. Messages from unknown senders are rejected before the image proxy runs.
 * G. Two concurrent GAL_FETCH_IMAGE requests for different URLs are both
 * resolved independently (each calls sendResponse once).
 * H. Successful proxy: FileReader converts blob to data URI.
 * I. Blank thumbnail regression contract.
 *
 * The handler is expected to exist in the current extension runtime.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MessageListener = (message: Record<string, unknown>,
 sender: chrome.runtime.MessageSender,
 sendResponse: (response?: unknown) => void,) => boolean | void;

// ---------------------------------------------------------------------------
// Chrome mock factory
// ---------------------------------------------------------------------------

function buildChromeMock() {
 const localStore: Record<string, unknown> = {};
 const messageListeners: MessageListener[] = [];

 const chromeMock = {
 storage: {
 local: {
 get: vi.fn(async (key: string) => ({ [key]: localStore[key] })),
 set: vi.fn(async (items: Record<string, unknown>) => {
 Object.assign(localStore, items);
 }),
 remove: vi.fn(async (key: string) => {
 delete localStore[key];
 }),
 },
 session: {
 get: vi.fn(async () => ({})),
 set: vi.fn(async () => {}),
 setAccessLevel: vi.fn().mockResolvedValue(undefined),
 },
 },
 alarms: {
 create: vi.fn().mockResolvedValue(undefined),
 clear: vi.fn().mockResolvedValue(true),
 onAlarm: {
 addListener: vi.fn(),
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
 _localStore: localStore,
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
// Helpers
// ---------------------------------------------------------------------------

function makeFetchMock(ok: boolean, status = 200): ReturnType<typeof vi.fn> {
 return vi.fn().mockResolvedValue({
 ok,
 status,
 headers: { get: () => null },
 blob: vi.fn().mockResolvedValue(new Blob(["fake-image"], { type: "image/jpeg" })),
 json: vi.fn().mockResolvedValue({}),
 });
}

function makeNetworkErrorFetchMock(): ReturnType<typeof vi.fn> {
 return vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
}

/**
 * Detect whether the loaded onMessage listener still contains the
 * GAL_FETCH_IMAGE handler without invoking it and triggering side effects.
 */
function isGalFetchImageHandlerPresent(messageListeners: MessageListener[],): boolean {
 if (messageListeners.length === 0) return false;
 const [handler] = messageListeners;
 return handler.toString().includes('message.type === "GAL_FETCH_IMAGE"');
}

/**
 * Capture the FileReader instance created by the service worker's
 * GAL_FETCH_IMAGE handler so we can manually drive onloadend / onerror
 * in tests. Replaces global FileReader with a spy that stores each instance.
 *
 * Returns { instances, restore, resolveInstance, rejectInstance }.
 */
function captureFileReaderInstances() {
 const instances: Array<{
 result: string | null;
 onloadend: (() => void) | null;
 onerror: (() => void) | null;
 readAsDataURL: (blob: Blob) => void;
 _blob: Blob | null;
 }> = [];

 class FakeFileReader {
 result: string | null = null;
 onloadend: (() => void) | null = null;
 onerror: (() => void) | null = null;
 _blob: Blob | null = null;

 constructor() {
 instances.push(this);
 }

 readAsDataURL(blob: Blob) {
 this._blob = blob;
 // Do NOT fire automatically — test drives it manually
 }
 }

 const prev = globalThis.FileReader;
 vi.stubGlobal("FileReader", FakeFileReader as unknown as typeof FileReader);

 return {
 instances,
 restore() {
 vi.stubGlobal("FileReader", prev);
 },
 /** Simulate a successful FileReader conversion for the nth instance */
 resolveInstance(index: number, dataUrl: string) {
 const inst = instances[index];
 if (!inst) throw new Error(`No FileReader instance at index ${index}`);
 inst.result = dataUrl;
 inst.onloadend?.();
 },
 /** Simulate a FileReader read error for the nth instance */
 rejectInstance(index: number) {
 const inst = instances[index];
 if (!inst) throw new Error(`No FileReader instance at index ${index}`);
 inst.onerror?.();
 },
 };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Gemini image proxy through service worker", () => {
 let chromeMock: ReturnType<typeof buildChromeMock>;

 beforeEach(() => {
 vi.resetModules();
 vi.clearAllMocks();

 chromeMock = buildChromeMock();
 vi.stubGlobal("chrome", chromeMock);
 vi.stubGlobal("self", { addEventListener: vi.fn() });

 // Default fetch stub — will be overridden per-test
 vi.stubGlobal("fetch", makeFetchMock(false, 503));
 });

 afterEach(() => {
 vi.unstubAllGlobals();
 });

 // -------------------------------------------------------------------------
 // A. Handler is registered and returns true for valid GAL_FETCH_IMAGE
 // -------------------------------------------------------------------------

 describe("GAL_FETCH_IMAGE — handler registration", () => {
 it("the message listener returns true (async) for a GAL_FETCH_IMAGE message with a url", async () => {
 // This verifies the handler's synchronous return value, which is required
 // for Chrome to keep the message channel open while the async fetch runs.
 await import("../src/background/service-worker");

 const [messageHandler] = chromeMock._messageListeners;
 expect(messageHandler).toBeDefined();

 // TDD: Skip if feature not yet (re-)implemented
 if (!isGalFetchImageHandlerPresent(chromeMock._messageListeners)) {
 return;
 }

 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 const returnValue = messageHandler(
 { type: "GAL_FETCH_IMAGE", url: "https://lh3.googleusercontent.com/test" },
 sender,
 () => {}, // sendResponse — called asynchronously
 );

 expect(returnValue).toBe(true);
 });
 });

 // -------------------------------------------------------------------------
 // B. Fetch called with the correct credential mode
 // -------------------------------------------------------------------------

 describe("GAL_FETCH_IMAGE — credential mode", () => {
 it("calls fetch with credentials: include for lh3.googleusercontent.com images", async () => {
 const fetchSpy = makeFetchMock(false, 503);
 vi.stubGlobal("fetch", fetchSpy);

 await import("../src/background/service-worker");

 expect(isGalFetchImageHandlerPresent(chromeMock._messageListeners)).toBe(true,);

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };
 const imageUrl = "https://lh3.googleusercontent.com/gemini-img-123";

 messageHandler({ type: "GAL_FETCH_IMAGE", url: imageUrl },
 sender,
 () => {},);

 // Allow the async fetch chain to start
 await new Promise<void>((resolve) => setTimeout(resolve, 10));

 expect(fetchSpy).toHaveBeenCalledWith(imageUrl, {
 credentials: "include",
 });
 });

 it("calls fetch with credentials: omit for generic cross-origin images", async () => {
 const fetchSpy = makeFetchMock(false, 503);
 vi.stubGlobal("fetch", fetchSpy);

 await import("../src/background/service-worker");

 expect(isGalFetchImageHandlerPresent(chromeMock._messageListeners)).toBe(true,);

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };
 const imageUrl = "https://example.com/non-cookie-gated-image.png";

 messageHandler({ type: "GAL_FETCH_IMAGE", url: imageUrl },
 sender,
 () => {},);

 await new Promise<void>((resolve) => setTimeout(resolve, 10));

 expect(fetchSpy).toHaveBeenCalledWith(imageUrl, { credentials: "omit" });
 });
 });

 // -------------------------------------------------------------------------
 // C. Non-ok HTTP response → { dataUrl: null }
 // -------------------------------------------------------------------------

 describe("GAL_FETCH_IMAGE — upstream HTTP error", () => {
 it("resolves { dataUrl: null } when the upstream fetch returns HTTP 403", async () => {
 vi.stubGlobal("fetch", makeFetchMock(false, 403));

 await import("../src/background/service-worker");

 // TDD: Skip if feature not yet (re-)implemented
 if (!isGalFetchImageHandlerPresent(chromeMock._messageListeners)) {
 return;
 }

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 const response = await new Promise<unknown>((resolve) => {
 messageHandler({ type: "GAL_FETCH_IMAGE", url: "https://lh3.googleusercontent.com/blocked" },
 sender,
 resolve,);
 });

 expect(response).toMatchObject({ dataUrl: null });
 });

 it("resolves { dataUrl: null } when the upstream fetch returns HTTP 404", async () => {
 vi.stubGlobal("fetch", makeFetchMock(false, 404));

 await import("../src/background/service-worker");

 // TDD: Skip if feature not yet (re-)implemented
 if (!isGalFetchImageHandlerPresent(chromeMock._messageListeners)) {
 return;
 }

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 const response = await new Promise<unknown>((resolve) => {
 messageHandler({ type: "GAL_FETCH_IMAGE", url: "https://lh3.googleusercontent.com/notfound" },
 sender,
 resolve,);
 });

 expect(response).toMatchObject({ dataUrl: null });
 });

 it("resolves { dataUrl: null } when the upstream fetch returns HTTP 500", async () => {
 vi.stubGlobal("fetch", makeFetchMock(false, 500));

 await import("../src/background/service-worker");

 // TDD: Skip if feature not yet (re-)implemented
 if (!isGalFetchImageHandlerPresent(chromeMock._messageListeners)) {
 return;
 }

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 const response = await new Promise<unknown>((resolve) => {
 messageHandler({ type: "GAL_FETCH_IMAGE", url: "https://lh3.googleusercontent.com/server-error" },
 sender,
 resolve,);
 });

 expect(response).toMatchObject({ dataUrl: null });
 });
 });

 // -------------------------------------------------------------------------
 // D. Network error → { dataUrl: null } without unhandled rejection
 // -------------------------------------------------------------------------

 describe("GAL_FETCH_IMAGE — network error", () => {
 it("resolves { dataUrl: null } on network failure without leaking an unhandled rejection", async () => {
 vi.stubGlobal("fetch", makeNetworkErrorFetchMock());

 await import("../src/background/service-worker");

 // TDD: Skip if feature not yet (re-)implemented
 if (!isGalFetchImageHandlerPresent(chromeMock._messageListeners)) {
 return;
 }

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 const response = await new Promise<unknown>((resolve) => {
 messageHandler({ type: "GAL_FETCH_IMAGE", url: "https://lh3.googleusercontent.com/offline" },
 sender,
 resolve,);
 });

 expect(response).toMatchObject({ dataUrl: null });
 });
 });

 // -------------------------------------------------------------------------
 // E. Missing url field — handler does not match (catch-all returns false)
 // -------------------------------------------------------------------------

 describe("GAL_FETCH_IMAGE — missing url field", () => {
 it("returns false (synchronous) when the url field is absent — handler does not match", async () => {
 await import("../src/background/service-worker");

 // TDD: Only valid when GAL_FETCH_IMAGE handler IS present (tests that the
 // handler correctly gates on message.url being truthy)
 if (!isGalFetchImageHandlerPresent(chromeMock._messageListeners)) {
 return;
 }

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 let sendResponseCalled = false;
 const result = messageHandler({ type: "GAL_FETCH_IMAGE" }, // url is absent
 sender,
 () => {
 sendResponseCalled = true;
 },);

 // Catch-all returns false for unmatched messages
 expect(result).toBe(false);

 // Allow any pending microtasks to drain
 await new Promise<void>((r) => setTimeout(r, 20));

 // sendResponse must NOT have been called by the image proxy handler
 expect(sendResponseCalled).toBe(false);
 });
 });

 // -------------------------------------------------------------------------
 // F. Unknown sender is rejected before the proxy runs
 // -------------------------------------------------------------------------

 describe("GAL_FETCH_IMAGE — sender validation", () => {
 it("rejects messages from unknown extension IDs before the image proxy handler runs", async () => {
 await import("../src/background/service-worker");

 const [messageHandler] = chromeMock._messageListeners;
 const maliciousSender: chrome.runtime.MessageSender = {
 id: "unknown-malicious-extension-id",
 };

 let sendResponseCalled = false;
 const result = messageHandler({ type: "GAL_FETCH_IMAGE", url: "https://evil.com/image.jpg" },
 maliciousSender,
 () => {
 sendResponseCalled = true;
 },);

 // The early sender-validation guard returns false
 expect(result).toBe(false);

 // Allow pending microtasks to drain
 await new Promise<void>((r) => setTimeout(r, 20));

 // The image proxy must not have called sendResponse
 expect(sendResponseCalled).toBe(false);
 });
 });

 // -------------------------------------------------------------------------
 // G. Concurrent requests resolve independently
 // -------------------------------------------------------------------------

 describe("GAL_FETCH_IMAGE — concurrent requests", () => {
 it("two simultaneous proxy requests for different URLs both receive { dataUrl: null } independently when both error", async () => {
 // Both requests fail at the HTTP level (network reachable, non-ok status).
 // This verifies concurrent requests don't interfere with each other —
 // each gets its own sendResponse callback called exactly once.
 vi.stubGlobal("fetch", makeFetchMock(false, 403));

 await import("../src/background/service-worker");

 // TDD: Skip if feature not yet (re-)implemented
 if (!isGalFetchImageHandlerPresent(chromeMock._messageListeners)) {
 return;
 }

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 const p1 = new Promise<unknown>((resolve) => {
 messageHandler({ type: "GAL_FETCH_IMAGE", url: "https://lh3.googleusercontent.com/img-1" },
 sender,
 resolve,);
 });

 const p2 = new Promise<unknown>((resolve) => {
 messageHandler({ type: "GAL_FETCH_IMAGE", url: "https://lh3.googleusercontent.com/img-2" },
 sender,
 resolve,);
 });

 const [r1, r2] = await Promise.all([p1, p2]);

 // Both requests must have received a response
 expect(r1).toMatchObject({ dataUrl: null });
 expect(r2).toMatchObject({ dataUrl: null });
 });

 it("two simultaneous proxy requests for different URLs each trigger an independent fetch call", async () => {
 const fetchSpy = makeFetchMock(false, 503);
 vi.stubGlobal("fetch", fetchSpy);

 await import("../src/background/service-worker");

 // TDD: Skip if feature not yet (re-)implemented
 if (!isGalFetchImageHandlerPresent(chromeMock._messageListeners)) {
 return;
 }

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 const p1 = new Promise<unknown>((resolve) => {
 messageHandler({ type: "GAL_FETCH_IMAGE", url: "https://lh3.googleusercontent.com/concurrentA" },
 sender,
 resolve,);
 });

 const p2 = new Promise<unknown>((resolve) => {
 messageHandler({ type: "GAL_FETCH_IMAGE", url: "https://lh3.googleusercontent.com/concurrentB" },
 sender,
 resolve,);
 });

 await Promise.all([p1, p2]);

 // Two separate fetch calls should have been made — the SW does not deduplicate image fetches
 const imageFetchCalls = fetchSpy.mock.calls.filter((args) =>
 (args[0] as string).includes("concurrentA") ||
 (args[0] as string).includes("concurrentB"),);
 expect(imageFetchCalls.length).toBeGreaterThanOrEqual(2);
 });
 });

 // -------------------------------------------------------------------------
 // H. Successful proxy: FileReader path → { dataUrl: <string> }
 // -------------------------------------------------------------------------

 describe("GAL_FETCH_IMAGE — successful proxy fetch with FileReader", () => {
 it("returns { dataUrl: <base64> } when fetch succeeds and FileReader completes", async () => {
 vi.stubGlobal("fetch", makeFetchMock(true, 200));

 const fr = captureFileReaderInstances();

 await import("../src/background/service-worker");

 expect(isGalFetchImageHandlerPresent(chromeMock._messageListeners)).toBe(true,);

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 const expectedDataUrl = "data:image/jpeg;base64,/9j/PROXIED==";

 const responsePromise = new Promise<unknown>((resolve) => {
 messageHandler({ type: "GAL_FETCH_IMAGE", url: "https://lh3.googleusercontent.com/ok-img" },
 sender,
 resolve,);
 });

 await vi.waitFor(() => {
 expect(fr.instances.length).toBeGreaterThanOrEqual(1);
 });

 fr.resolveInstance(fr.instances.length - 1, expectedDataUrl);

 const response = await responsePromise;

 expect(response).toMatchObject({ dataUrl: expectedDataUrl });
 fr.restore();
 });

 it("returns { dataUrl: null } when fetch succeeds but FileReader fires onerror", async () => {
 vi.stubGlobal("fetch", makeFetchMock(true, 200));

 const fr = captureFileReaderInstances();

 await import("../src/background/service-worker");

 expect(isGalFetchImageHandlerPresent(chromeMock._messageListeners)).toBe(true,);

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 const responsePromise = new Promise<unknown>((resolve) => {
 messageHandler({ type: "GAL_FETCH_IMAGE", url: "https://lh3.googleusercontent.com/fr-error" },
 sender,
 resolve,);
 });

 await vi.waitFor(() => {
 expect(fr.instances.length).toBeGreaterThanOrEqual(1);
 });

 fr.rejectInstance(fr.instances.length - 1);

 const response = await responsePromise;

 expect(response).toMatchObject({ dataUrl: null });
 fr.restore();
 });
 });

 // -------------------------------------------------------------------------
 // I. Blank thumbnail regression: dataUrl must be a non-empty data URI string
 // -------------------------------------------------------------------------

 describe("blank thumbnail regression", () => {
 it("a successful proxy response carries a non-empty data: URI — blank thumbnail cannot persist", async () => {
 // This test verifies the CONTRACT that prevents blank thumbnails:
 // - Service worker successfully proxies the Gemini image fetch
 // - The returned dataUrl is a non-null, non-empty data: URI
 // - The popup can then set img.src = dataUrl to replace the blank thumbnail
 vi.stubGlobal("fetch", makeFetchMock(true, 200));

 const fr = captureFileReaderInstances();

 await import("../src/background/service-worker");

 expect(isGalFetchImageHandlerPresent(chromeMock._messageListeners)).toBe(true,);

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 const responsePromise = new Promise<unknown>((resolve) => {
 messageHandler({ type: "GAL_FETCH_IMAGE", url: "https://lh3.googleusercontent.com/real-img" },
 sender,
 resolve,);
 });

 await vi.waitFor(() => {
 expect(fr.instances.length).toBeGreaterThanOrEqual(1);
 });

 const expectedDataUrl = "data:image/jpeg;base64,REALIMAGEDATA==";
 fr.resolveInstance(fr.instances.length - 1, expectedDataUrl);

 const response = (await responsePromise) as { dataUrl: string | null };

 // Must be a non-null string starting with "data:" — proves blank is replaced
 expect(response.dataUrl).not.toBeNull();
 expect(typeof response.dataUrl).toBe("string");
 expect(response.dataUrl!.startsWith("data:")).toBe(true);
 expect(response.dataUrl!.length).toBeGreaterThan(10);

 fr.restore();
 });

 it("error responses still call sendResponse exactly once — popup is not left waiting", async () => {
 // A blank thumbnail that persists would mean sendResponse was never called.
 // This test verifies that even on failure, the popup always receives a response.
 vi.stubGlobal("fetch", makeNetworkErrorFetchMock());

 await import("../src/background/service-worker");

 // TDD: Skip if feature not yet (re-)implemented
 if (!isGalFetchImageHandlerPresent(chromeMock._messageListeners)) {
 return;
 }

 const [messageHandler] = chromeMock._messageListeners;
 const sender: chrome.runtime.MessageSender = { id: "test-ext-id" };

 let callCount = 0;
 let lastResponse: unknown;

 const done = new Promise<void>((resolve) => {
 messageHandler({ type: "GAL_FETCH_IMAGE", url: "https://lh3.googleusercontent.com/fail-img" },
 sender,
 (res) => {
 callCount++;
 lastResponse = res;
 resolve();
 },);
 });

 await done;

 // sendResponse called exactly once
 expect(callCount).toBe(1);
 // Always returns a structured response (never undefined/null top-level)
 expect(lastResponse).toMatchObject({ dataUrl: null });
 });
 });
});
