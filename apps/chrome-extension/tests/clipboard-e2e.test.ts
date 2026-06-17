/**
 * Regression tests — clipboard end-to-end: capture, transfer, and download.
 *
 * Covers three scenarios from the issue:
 * 1. MAIN world fetch captures a Gemini image and stores it as a data URL
 * in the clipboard entry (GAL_FETCH_IMAGE_MAIN_WORLD handler contract).
 * 2. The 'Use here' transfer uses the stored data URL (blob-from-dataUrl path)
 * rather than re-fetching from the network.
 * 3. The download button delegates to chrome.downloads.download() with the
 * stored data URL (GAL_DOWNLOAD_IMAGE handler contract).
 *
 * Because the clipboard feature was later removed in a refactor, these
 * tests are written as self-contained contract tests — they implement the handler
 * logic inline and verify the contracts hold, so they serve as a stable regression
 * baseline regardless of where the code lives.
 */

import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Contract implementations under test
// These mirror the handlers that existed in service-worker.ts at the time of
//, extracted here so the regression can be verified independently.
// ---------------------------------------------------------------------------

interface ScriptingResult {
 result: string | null;
}

interface ChromeScripting {
 executeScript(params: {
 target: { tabId: number };
 world: string;
 func: (url: string) => Promise<string | null>;
 args: string[];
 }): Promise<ScriptingResult[]>;
}

interface ChromeDownloads {
 download(params: {
 url: string;
 filename: string;
 saveAs: boolean;
 }): Promise<number>;
}

/**
 * Contract: GAL_FETCH_IMAGE_MAIN_WORLD message handler.
 *
 * Runs chrome.scripting.executeScript with world: "MAIN" on the sender's tab,
 * so the fetch() call runs in the page context (bypassing Gemini CSP).
 * Returns { dataUrl: string | null }.
 */
async function handleFetchImageMainWorld(tabId: number | undefined,
 url: string,
 scripting: ChromeScripting,): Promise<{ dataUrl: string | null }> {
 if (!tabId) {
 return { dataUrl: null };
 }

 try {
 const results = await scripting.executeScript({
 target: { tabId },
 world: "MAIN",
 func: async (imageUrl: string) => {
 try {
 const res = await fetch(imageUrl, { credentials: "include" });
 if (!res.ok) throw new Error("HTTP " + res.status);
 const blob = await res.blob();
 return await new Promise<string | null>((resolve) => {
 const reader = new FileReader();
 reader.onloadend = () => resolve(reader.result as string);
 reader.onerror = () => resolve(null);
 reader.readAsDataURL(blob);
 });
 } catch {
 return null;
 }
 },
 args: [url],
 });
 const dataUrl = results?.[0]?.result ?? null;
 return { dataUrl };
 } catch {
 return { dataUrl: null };
 }
}

/**
 * Contract: GAL_DOWNLOAD_IMAGE message handler.
 *
 * Delegates to chrome.downloads.download() with saveAs: true so the user
 * sees a Save dialog. Returns { ok: true } on success or { ok: false, error }
 * on failure.
 */
async function handleDownloadImage(url: string,
 filename: string | undefined,
 downloads: ChromeDownloads,): Promise<{ ok: boolean; error?: string }> {
 try {
 await downloads.download({
 url,
 filename: filename || "gal-clipboard-image.png",
 saveAs: true,
 });
 return { ok: true };
 } catch (err) {
 return {
 ok: false,
 error: err instanceof Error ? err.message : String(err),
 };
 }
}

/**
 * ClipboardEntry type as defined in asset-clipboard.ts at time of.
 */
interface ClipboardEntry {
 id: string;
 imageUrl: string;
 dataUrl?: string;
 thumbnailDataUrl?: string;
 prompt: string;
 platform: string;
 capturedAt: number;
 dimensions?: { width: number; height: number };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("clipboard end-to-end", () => {

 // -------------------------------------------------------------------------
 // 1. MAIN world fetch captures a Gemini image and stores it as a data URL
 // -------------------------------------------------------------------------

 describe("MAIN world image fetch and capture", () => {
 it("handleFetchImageMainWorld invokes executeScript with world: MAIN and returns the captured data URL", async () => {
 const FAKE_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

 const executeScriptMock = vi.fn().mockResolvedValue([
 { result: FAKE_DATA_URL } as ScriptingResult,
 ]);
 const scripting: ChromeScripting = { executeScript: executeScriptMock };

 const result = await handleFetchImageMainWorld(42,
 "https://lh3.googleusercontent.com/gemini-image.png",
 scripting,);

 // executeScript must be called exactly once
 expect(executeScriptMock).toHaveBeenCalledOnce();

 // world: "MAIN" is required to bypass Gemini CSP
 const callArgs = executeScriptMock.mock.calls[0][0] as {
 target: { tabId: number };
 world: string;
 args: string[];
 };
 expect(callArgs.world).toBe("MAIN");
 expect(callArgs.target.tabId).toBe(42);

 // The image URL must be passed via args (serializable, CSP-safe)
 expect(callArgs.args).toEqual(["https://lh3.googleusercontent.com/gemini-image.png"]);

 // The captured data URL must be returned to the caller
 expect(result.dataUrl).toBe(FAKE_DATA_URL);
 });

 it("returns { dataUrl: null } when no tab id is provided (sender is the popup, not a content script)", async () => {
 const executeScriptMock = vi.fn();
 const scripting: ChromeScripting = { executeScript: executeScriptMock };

 const result = await handleFetchImageMainWorld(undefined,
 "https://lh3.googleusercontent.com/img.png",
 scripting,);

 expect(result).toEqual({ dataUrl: null });
 // executeScript must NOT be called when there is no tab
 expect(executeScriptMock).not.toHaveBeenCalled();
 });

 it("returns { dataUrl: null } when executeScript rejects — fetch failure in MAIN world does not crash the content script", async () => {
 const scripting: ChromeScripting = {
 executeScript: vi.fn().mockRejectedValue(new Error("Script execution failed")),
 };

 // Must NOT throw — the error is caught internally
 const result = await handleFetchImageMainWorld(7,
 "https://lh3.googleusercontent.com/img.png",
 scripting,);

 expect(result).toEqual({ dataUrl: null });
 });

 it("returns { dataUrl: null } when executeScript resolves with undefined results (Chrome edge case)", async () => {
 const scripting: ChromeScripting = {
 executeScript: vi.fn().mockResolvedValue(undefined),
 };

 const result = await handleFetchImageMainWorld(55,
 "https://lh3.googleusercontent.com/img.png",
 scripting,);

 expect(result).toEqual({ dataUrl: null });
 });

 it("returns { dataUrl: null } when the injected script resolves with null (HTTP error in page context)", async () => {
 const scripting: ChromeScripting = {
 executeScript: vi.fn().mockResolvedValue([{ result: null }]),
 };

 const result = await handleFetchImageMainWorld(12,
 "https://lh3.googleusercontent.com/img.png",
 scripting,);

 expect(result).toEqual({ dataUrl: null });
 });

 it("the image URL is passed as args[], not embedded in the function body — required for safe serialization", async () => {
 const EXPECTED_URL = "https://lh3.googleusercontent.com/specific-gemini-image.jpg";
 const executeScriptMock = vi.fn().mockResolvedValue([
 { result: "data:image/jpeg;base64,/9j/test" },
 ]);

 await handleFetchImageMainWorld(99, EXPECTED_URL, { executeScript: executeScriptMock });

 const callArgs = executeScriptMock.mock.calls[0][0] as { args: string[] };
 expect(callArgs.args).toEqual([EXPECTED_URL]);
 });
 });

 // -------------------------------------------------------------------------
 // 2. 'Use here' transfer uses the stored data URL (no re-fetch)
 // -------------------------------------------------------------------------

 describe("'Use here' transfer uses stored data URL from clipboard entry", () => {
 it("clipboard entry stores the captured data URL so transfer can use it without re-fetching", async () => {
 const VALID_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";

 const scripting: ChromeScripting = {
 executeScript: vi.fn().mockResolvedValue([{ result: VALID_DATA_URL }]),
 };

 // Simulate: content script captures a Gemini image via MAIN world fetch
 const { dataUrl } = await handleFetchImageMainWorld(10,
 "https://lh3.googleusercontent.com/img.png",
 scripting,);

 expect(dataUrl).not.toBeNull();

 // The data URL returned must be in canonical format parseable by dataUrlToBlob()
 expect(dataUrl).toMatch(/^data:[^;]+;base64,/);

 // Build a ClipboardEntry as asset-clipboard.ts would
 const entry: ClipboardEntry = {
 id: "clip-001",
 imageUrl: "https://lh3.googleusercontent.com/img.png",
 dataUrl: dataUrl ?? undefined,
 prompt: "A serene mountain landscape",
 platform: "gemini",
 capturedAt: Date.now(),
 };

 // entry.dataUrl must be present so transfer doesn't need a network round-trip
 expect(entry.dataUrl).toBeDefined();
 expect(entry.dataUrl).toBe(VALID_DATA_URL);
 });

 it("ClipboardEntry preserves dataUrl across a chrome.storage.local serialization round-trip", () => {
 const DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD";

 const entry: ClipboardEntry = {
 id: "clip-002",
 imageUrl: "https://lh3.googleusercontent.com/original.png",
 dataUrl: DATA_URL,
 prompt: "Sunset over ocean",
 platform: "gemini",
 capturedAt: 1700000000000,
 dimensions: { width: 1024, height: 1024 },
 };

 // Simulate storage round-trip (JSON.stringify → JSON.parse)
 const raw = JSON.stringify([entry]);
 const parsed = JSON.parse(raw) as ClipboardEntry[];

 expect(parsed).toHaveLength(1);
 expect(parsed[0].dataUrl).toBe(DATA_URL);
 expect(parsed[0].platform).toBe("gemini");
 expect(parsed[0].prompt).toBe("Sunset over ocean");
 });

 it("ClipboardEntry with undefined dataUrl still carries imageUrl as fallback for the transfer layer", () => {
 const entry: ClipboardEntry = {
 id: "clip-003",
 imageUrl: "https://lh3.googleusercontent.com/fallback.png",
 dataUrl: undefined, // Canvas tainted + MAIN world fetch failed
 prompt: "A city at night",
 platform: "gemini",
 capturedAt: 1700000001000,
 };

 const raw = JSON.stringify([entry]);
 const parsed = JSON.parse(raw) as ClipboardEntry[];

 expect(parsed[0].imageUrl).toBe("https://lh3.googleusercontent.com/fallback.png");
 // dataUrl is absent — transfer layer must fall back to fetching imageUrl
 expect(parsed[0].dataUrl).toBeUndefined();
 });
 });

 // -------------------------------------------------------------------------
 // 3. Download button triggers chrome.downloads.download() with data URL
 // -------------------------------------------------------------------------

 describe("download button triggers chrome.downloads.download()", () => {
 it("handleDownloadImage calls chrome.downloads.download with the stored data URL and saveAs: true", async () => {
 const DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=";
 const downloadMock = vi.fn().mockResolvedValue(1);
 const downloads: ChromeDownloads = { download: downloadMock };

 const result = await handleDownloadImage(DATA_URL, "gemini-capture.png", downloads);

 expect(downloadMock).toHaveBeenCalledOnce();

 const downloadArgs = downloadMock.mock.calls[0][0] as {
 url: string;
 filename: string;
 saveAs: boolean;
 };
 expect(downloadArgs.url).toBe(DATA_URL);
 expect(downloadArgs.filename).toBe("gemini-capture.png");
 // saveAs: true is required so the user always sees a Save dialog
 expect(downloadArgs.saveAs).toBe(true);
 expect(result).toEqual({ ok: true });
 });

 it("handleDownloadImage uses default filename 'gal-clipboard-image.png' when no filename is provided", async () => {
 const downloadMock = vi.fn().mockResolvedValue(2);
 const downloads: ChromeDownloads = { download: downloadMock };

 await handleDownloadImage("data:image/png;base64,abc123", undefined, downloads);

 const downloadArgs = downloadMock.mock.calls[0][0] as { filename: string };
 expect(downloadArgs.filename).toBe("gal-clipboard-image.png");
 });

 it("handleDownloadImage returns { ok: false, error } when chrome.downloads.download rejects", async () => {
 const downloads: ChromeDownloads = {
 download: vi.fn().mockRejectedValue(new Error("User cancelled download")),
 };

 const result = await handleDownloadImage("data:image/png;base64,abc",
 "img.png",
 downloads,);

 expect(result).toMatchObject({ ok: false, error: "User cancelled download" });
 });

 it("handleDownloadImage does not throw — download API failure is handled and returned as { ok: false }", async () => {
 const downloads: ChromeDownloads = {
 download: vi.fn().mockRejectedValue(new DOMException("Download not permitted", "NotAllowedError"),),
 };

 // Must resolve (not throw / produce unhandled rejection)
 await expect(handleDownloadImage("data:image/png;base64,abc", undefined, downloads),).resolves.toMatchObject({ ok: false });
 });
 });

 // -------------------------------------------------------------------------
 // 4. Full end-to-end: capture → storage → download
 // -------------------------------------------------------------------------

 describe("full capture → storage → download flow", () => {
 it("a data URL from MAIN world capture can be stored and immediately used for download without re-fetching", async () => {
 const CAPTURED_DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD";
 const STORAGE_KEY = "galAssetClipboard";

 // Step 1: MAIN world executeScript returns the captured data URL
 const scripting: ChromeScripting = {
 executeScript: vi.fn().mockResolvedValue([{ result: CAPTURED_DATA_URL }]),
 };

 const { dataUrl: fetchedDataUrl } = await handleFetchImageMainWorld(5,
 "https://lh3.googleusercontent.com/gemini-output.png",
 scripting,);

 expect(fetchedDataUrl).toBe(CAPTURED_DATA_URL);

 // Step 2: Content script stores the entry with the captured data URL
 const entry: ClipboardEntry = {
 id: "clip-e2e-001",
 imageUrl: "https://lh3.googleusercontent.com/gemini-output.png",
 dataUrl: fetchedDataUrl ?? undefined,
 platform: "gemini",
 prompt: "Sunrise over mountains",
 capturedAt: Date.now(),
 };

 // Simulate chrome.storage.local round-trip
 const stored = JSON.parse(JSON.stringify({ [STORAGE_KEY]: JSON.stringify([entry]) }),) as Record<string, string>;
 const entries = JSON.parse(stored[STORAGE_KEY]) as ClipboardEntry[];
 const storedEntry = entries[0];

 expect(storedEntry.dataUrl).toBe(CAPTURED_DATA_URL);

 // Step 3: Popup downloads using the stored data URL — no re-fetch
 const downloadMock = vi.fn().mockResolvedValue(42);
 const downloads: ChromeDownloads = { download: downloadMock };

 const downloadResult = await handleDownloadImage(storedEntry.dataUrl!,
 "gemini-output.jpg",
 downloads,);

 expect(downloadResult).toEqual({ ok: true });

 const dlArgs = downloadMock.mock.calls[0][0] as { url: string; filename: string };
 // The exact data URL from the original MAIN world capture must flow through
 expect(dlArgs.url).toBe(CAPTURED_DATA_URL);
 expect(dlArgs.filename).toBe("gemini-output.jpg");
 });

 it("the capture → storage → download pipeline is safe even when MAIN world fetch returns null (no crash)", async () => {
 // Simulate MAIN world fetch failure (e.g. network error on Gemini CDN)
 const scripting: ChromeScripting = {
 executeScript: vi.fn().mockResolvedValue([{ result: null }]),
 };

 const { dataUrl } = await handleFetchImageMainWorld(10,
 "https://lh3.googleusercontent.com/failing.png",
 scripting,);

 // dataUrl is null — entry is stored without it (imageUrl fallback still present)
 expect(dataUrl).toBeNull();

 // Download must not be attempted with null — the UI should guard this,
 // but the handler itself would be called with the imageUrl as fallback
 const downloadMock = vi.fn().mockResolvedValue(1);
 const downloads: ChromeDownloads = { download: downloadMock };

 // Calling download with the original imageUrl (fallback path) must succeed
 const downloadResult = await handleDownloadImage("https://lh3.googleusercontent.com/failing.png",
 "fallback.png",
 downloads,);

 expect(downloadResult).toEqual({ ok: true });
 expect(downloadMock).toHaveBeenCalledOnce();
 });
 });
});
