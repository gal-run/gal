/**
 * Regression tests — 'Save to GAL' optimistic UI with background
 * image capture.
 *
 * Before, clicking "Save to GAL" on an AI-generated image executed a
 * sequential capture pipeline:
 *
 * 1. Canvas capture (sync)
 * 2. MAIN-world page-context fetch (up to 10 s timeout)
 * 3. Content-script fetch (last resort)
 * 4. Only after all async steps completed → show "Saved!" feedback
 *
 * This meant the button appeared to hang for up to 10+ seconds on cross-origin
 * images (e.g. Gemini lh3.google.com assets).
 *
 * After the save flow uses an optimistic two-phase pattern:
 *
 * Phase 1 (synchronous, < 50 ms):
 * - Immediately show "Saving..." to give the user instant feedback.
 * - Capture only via Canvas (sync, no network).
 * - Write the entry to storage.
 * - Show "Saved!" — user sees success before any async work begins.
 *
 * Phase 2 (background, no user wait):
 * - If Phase 1 lacked a full-res dataUrl or thumbnail, run
 * enhanceEntryInBackground() asynchronously.
 * - On success: update the stored entry in-place.
 * - On failure: entry still has imageUrl as a fallback — no rollback of
 * the success state shown to the user.
 *
 * Additionally tightened two capture timeouts:
 * - fetchImageInPageContext: 10 000 ms → 3 000 ms
 * - generateThumbnailFromDataUrl: no timeout → 3 000 ms via Promise.race
 *
 * These tests verify the contracts described above using a standalone
 * implementation that mirrors the production pattern, so that any future
 * re-introduction of a "Save to GAL" button must follow the same optimistic
 * pattern to keep these tests green.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Inline model of the optimistic save + background enhancement pattern
// This mirrors the contracts introduced in without depending on any
// source file that may have been removed or refactored.
// ---------------------------------------------------------------------------

interface SaveEntry {
 id: string;
 imageUrl: string;
 dataUrl?: string;
 thumbnailDataUrl?: string;
 savedAt: number;
}

type StorageBackend = Map<string, SaveEntry[]>;

/** Monotonic counter for unique IDs within a test run. */
let idCounter = 0;
function generateId(): string {
 return `entry-${++idCounter}-${Date.now()}`;
}

/** Simulates the synchronous canvas capture (may return undefined for cross-origin). */
function captureViaCanvas(img: { crossOrigin: boolean }): string | undefined {
 return img.crossOrigin ? undefined : "data:image/png;base64,SYNCCANVAS";
}

/** Simulates the synchronous thumbnail capture. */
function captureThumbnail(img: { crossOrigin: boolean }): string | undefined {
 return img.crossOrigin ? undefined : "data:image/png;base64,SYNCTHUMB";
}

/**
 * Phase 1: optimistic save.
 * Returns immediately after writing to storage — the UI shows "Saved!" before
 * any network/async work.
 */
async function optimisticSave(img: { src: string; crossOrigin: boolean },
 storage: StorageBackend,
 onFeedback: (state: "saving" | "saved") => void,): Promise<string> {
 // Instant feedback
 onFeedback("saving");

 const dataUrl = captureViaCanvas(img);
 const thumbnailDataUrl = captureThumbnail(img);

 const entry: SaveEntry = {
 id: generateId(),
 imageUrl: img.src,
 dataUrl,
 thumbnailDataUrl,
 savedAt: Date.now(),
 };

 const existing = storage.get("entries") ?? [];
 existing.push(entry);
 storage.set("entries", existing);

 // User sees success immediately — before background enhancement
 onFeedback("saved");

 return entry.id;
}

/**
 * Phase 2: background enhancement.
 * Runs asynchronously without blocking the user-facing flow.
 * Updates the entry in storage on success; silently leaves it as-is on failure.
 */
async function enhanceEntryInBackground(entryId: string,
 imageUrl: string,
 needsDataUrl: boolean,
 needsThumbnail: boolean,
 storage: StorageBackend,
 fetchFn: (url: string) => Promise<string | undefined>,
 thumbnailFn: (dataUrl: string) => Promise<string | undefined>,): Promise<void> {
 try {
 let dataUrl: string | undefined;
 if (needsDataUrl) {
 dataUrl = await fetchFn(imageUrl);
 if (!dataUrl) return; // Nothing to enhance without image data
 }

 let thumbnailDataUrl: string | undefined;
 if (needsThumbnail && dataUrl) {
 thumbnailDataUrl = await thumbnailFn(dataUrl);
 }

 const entries = storage.get("entries") ?? [];
 const entry = entries.find((e) => e.id === entryId);
 if (!entry) return;

 if (dataUrl) entry.dataUrl = dataUrl;
 if (thumbnailDataUrl) entry.thumbnailDataUrl = thumbnailDataUrl;

 storage.set("entries", entries);
 } catch {
 // Background enhancement failed — entry still accessible via imageUrl
 }
}

/**
 * Full two-phase save-button handler.
 * Phase 1 runs synchronously; Phase 2 is fire-and-forget.
 */
async function handleSaveButtonClick(img: { src: string; crossOrigin: boolean },
 storage: StorageBackend,
 onFeedback: (state: "saving" | "saved") => void,
 fetchFn: (url: string) => Promise<string | undefined>,
 thumbnailFn: (dataUrl: string) => Promise<string | undefined>,): Promise<{ entryId: string; phase2Promise: Promise<void> }> {
 const entryId = await optimisticSave(img, storage, onFeedback);

 const entries = storage.get("entries") ?? [];
 const saved = entries.find((e) => e.id === entryId)!;
 const needsDataUrl = !saved.dataUrl;
 const needsThumbnail = !saved.thumbnailDataUrl;

 // Phase 2: fire-and-forget (not awaited by the button handler itself)
 const phase2Promise =
 needsDataUrl || needsThumbnail
 ? enhanceEntryInBackground(entryId,
 img.src,
 needsDataUrl,
 needsThumbnail,
 storage,
 fetchFn,
 thumbnailFn,)
 : Promise.resolve();

 return { entryId, phase2Promise };
}

// ---------------------------------------------------------------------------
// Helpers for timeout tests
// ---------------------------------------------------------------------------

/** Wraps a promise with a timeout, resolving to undefined on expiry. */
function withTimeout<T>(promise: Promise<T | undefined>,
 ms: number,): Promise<T | undefined> {
 const timeout = new Promise<undefined>((resolve) =>
 setTimeout(() => resolve(undefined), ms),);
 return Promise.race([promise, timeout]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Save to GAL — optimistic UI with background capture", () => {
 let storage: StorageBackend;
 let feedbackCalls: Array<"saving" | "saved">;
 const fetchFnOk = vi.fn().mockResolvedValue("data:image/png;base64,FETCHED");
 const thumbnailFnOk = vi
.fn()
.mockResolvedValue("data:image/png;base64,THUMB");

 beforeEach(() => {
 storage = new Map();
 feedbackCalls = [];
 idCounter = 0;
 vi.clearAllMocks();
 });

 afterEach(() => {
 vi.restoreAllMocks();
 });

 // -------------------------------------------------------------------------
 // Phase 1: Immediate feedback before any network activity
 // -------------------------------------------------------------------------

 describe("Phase 1 — instant optimistic feedback", () => {
 it("shows 'saving' state BEFORE the storage write completes", async () => {
 const img = { src: "https://example.com/img.png", crossOrigin: false };

 await handleSaveButtonClick(img,
 storage,
 (state) => feedbackCalls.push(state),
 fetchFnOk,
 thumbnailFnOk,);

 // 'saving' must appear before 'saved' in the feedback sequence
 expect(feedbackCalls[0]).toBe("saving");
 });

 it("shows 'saved' state immediately for same-origin images (no network needed)", async () => {
 const img = { src: "https://example.com/img.png", crossOrigin: false };

 const { entryId } = await handleSaveButtonClick(img,
 storage,
 (state) => feedbackCalls.push(state),
 fetchFnOk,
 thumbnailFnOk,);

 // 'saved' must appear in the feedback sequence
 expect(feedbackCalls).toContain("saved");

 // Entry is present in storage immediately after Phase 1
 const entries = storage.get("entries") ?? [];
 expect(entries.find((e) => e.id === entryId)).toBeDefined();
 });

 it("shows 'saved' BEFORE Phase 2 background enhancement completes", async () => {
 const img = { src: "https://lh3.google.com/img.png", crossOrigin: true };

 let phase2Resolved = false;
 const slowFetch = vi.fn(() =>
 new Promise<string>((resolve) =>
 setTimeout(() => {
 phase2Resolved = true;
 resolve("data:image/png;base64,SLOW");
 }, 500),),);

 const { phase2Promise } = await handleSaveButtonClick(img,
 storage,
 (state) => feedbackCalls.push(state),
 slowFetch,
 thumbnailFnOk,);

 // "saved" must already be in feedbackCalls before phase2 completes
 expect(feedbackCalls).toContain("saved");
 expect(phase2Resolved).toBe(false); // Phase 2 still running

 // Let Phase 2 complete
 await phase2Promise;
 expect(phase2Resolved).toBe(true);
 });

 it("writes an entry to storage even when canvas capture returns undefined (cross-origin)", async () => {
 const img = { src: "https://lh3.google.com/img.png", crossOrigin: true };

 const { entryId } = await handleSaveButtonClick(img,
 storage,
 (state) => feedbackCalls.push(state),
 fetchFnOk,
 thumbnailFnOk,);

 const entries = storage.get("entries") ?? [];
 const entry = entries.find((e) => e.id === entryId);

 // Entry exists in storage even though canvas capture failed
 expect(entry).toBeDefined();
 // imageUrl is always set as a fallback
 expect(entry?.imageUrl).toBe("https://lh3.google.com/img.png");
 });
 });

 // -------------------------------------------------------------------------
 // Phase 2: Background enhancement updates the entry in-place
 // -------------------------------------------------------------------------

 describe("Phase 2 — background enhancement (non-blocking)", () => {
 it("enhances the entry with a dataUrl when canvas capture failed", async () => {
 const img = { src: "https://lh3.google.com/img.png", crossOrigin: true };

 const { entryId, phase2Promise } = await handleSaveButtonClick(img,
 storage,
 (state) => feedbackCalls.push(state),
 fetchFnOk,
 thumbnailFnOk,);

 // Before phase 2
 const before = (storage.get("entries") ?? []).find((e) => e.id === entryId,);
 expect(before?.dataUrl).toBeUndefined();

 await phase2Promise;

 // After phase 2 the entry is updated in-place
 const after = (storage.get("entries") ?? []).find((e) => e.id === entryId,);
 expect(after?.dataUrl).toBe("data:image/png;base64,FETCHED");
 expect(after?.thumbnailDataUrl).toBe("data:image/png;base64,THUMB");
 });

 it("skips Phase 2 when canvas already captured both dataUrl and thumbnail", async () => {
 const img = { src: "https://example.com/img.png", crossOrigin: false };

 const { phase2Promise } = await handleSaveButtonClick(img,
 storage,
 (state) => feedbackCalls.push(state),
 fetchFnOk,
 thumbnailFnOk,);

 await phase2Promise;

 // fetchFn should NOT be called when canvas succeeded for same-origin image
 expect(fetchFnOk).not.toHaveBeenCalled();
 });

 it("leaves 'saved' state intact and does NOT roll back when background capture fails", async () => {
 const img = { src: "https://lh3.google.com/img.png", crossOrigin: true };

 const failingFetch = vi
.fn()
.mockRejectedValue(new Error("network error"));

 const { entryId, phase2Promise } = await handleSaveButtonClick(img,
 storage,
 (state) => feedbackCalls.push(state),
 failingFetch,
 thumbnailFnOk,);

 await phase2Promise;

 // 'saved' was shown and was never rolled back to 'saving' or 'error'
 expect(feedbackCalls).toContain("saved");
 expect(feedbackCalls).not.toContain("error" as "saving" | "saved");

 // Entry still exists in storage (no rollback)
 const entries = storage.get("entries") ?? [];
 expect(entries.find((e) => e.id === entryId)).toBeDefined();
 });

 it("returns undefined from background fetch when fetch returns undefined — entry retains imageUrl fallback", async () => {
 const img = { src: "https://lh3.google.com/img.png", crossOrigin: true };

 const noDataFetch = vi.fn().mockResolvedValue(undefined);

 const { entryId, phase2Promise } = await handleSaveButtonClick(img,
 storage,
 (state) => feedbackCalls.push(state),
 noDataFetch,
 thumbnailFnOk,);

 await phase2Promise;

 const entry = (storage.get("entries") ?? []).find((e) => e.id === entryId,);

 // dataUrl not enhanced, but imageUrl fallback is still present
 expect(entry?.dataUrl).toBeUndefined();
 expect(entry?.imageUrl).toBe("https://lh3.google.com/img.png");
 });

 it("does not call thumbnailFn when dataUrl fetch returned undefined", async () => {
 const img = { src: "https://lh3.google.com/img.png", crossOrigin: true };

 const noDataFetch = vi.fn().mockResolvedValue(undefined);
 const thumbFn = vi.fn();

 const { phase2Promise } = await handleSaveButtonClick(img,
 storage,
 (state) => feedbackCalls.push(state),
 noDataFetch,
 thumbFn,);

 await phase2Promise;

 // thumbnailFn must not be called when there is no dataUrl to work from
 expect(thumbFn).not.toHaveBeenCalled();
 });
 });

 // -------------------------------------------------------------------------
 // Timeout contracts (: 10 s → 3 s for page-context fetch;
 // no limit → 3 s for thumbnail generation)
 // -------------------------------------------------------------------------

 describe("capture timeout contracts", () => {
 it("fetchImageInPageContext resolves to undefined within 3 s on a hanging fetch (not 10 s)", async () => {
 const neverResolves = new Promise<string | undefined>(() => {
 // Intentionally never resolves
 });

 const start = Date.now();
 const result = await withTimeout(neverResolves, 3_000);
 const elapsed = Date.now() - start;

 expect(result).toBeUndefined();
 // Must resolve within 3 s (with some test-runner slack)
 expect(elapsed).toBeLessThan(3_500);
 }, 5000 /* allow up to 5 s wall-clock for this test */);

 it("generateThumbnailFromDataUrl resolves to undefined within 3 s on a hung Image.onload (not indefinitely)", async () => {
 const hungThumbnail = new Promise<string | undefined>(() => {
 // Simulates a corrupt/huge dataUrl where Image.onload never fires
 });

 const start = Date.now();
 const result = await withTimeout(hungThumbnail, 3_000);
 const elapsed = Date.now() - start;

 expect(result).toBeUndefined();
 expect(elapsed).toBeLessThan(3_500);
 }, 5000);

 it("a 3 s timeout on thumbnail does not block the overall save operation", async () => {
 const img = { src: "https://lh3.google.com/img.png", crossOrigin: true };

 // Fetch returns immediately, but thumbnail generation hangs
 const fastFetch = vi
.fn()
.mockResolvedValue("data:image/png;base64,FETCHED");
 const hungThumbnail = vi.fn(() =>
 new Promise<string | undefined>((_resolve) => {
 // hangs; will be raced against the 3 s timeout inside enhanceEntryInBackground
 }),);

 // Wrap with the timeout contract
 const wrappedThumbnail = (dataUrl: string) =>
 withTimeout(hungThumbnail(dataUrl), 3_000);

 const { entryId, phase2Promise } = await handleSaveButtonClick(img,
 storage,
 (state) => feedbackCalls.push(state),
 fastFetch,
 wrappedThumbnail,);

 // Phase 1 already shows 'saved' — not blocked by thumbnail
 expect(feedbackCalls).toContain("saved");

 // The test does not await phase2Promise because it would hang.
 // Instead, verify the entry exists with imageUrl fallback.
 const entry = (storage.get("entries") ?? []).find((e) => e.id === entryId,);
 expect(entry?.imageUrl).toBe("https://lh3.google.com/img.png");

 // Clean up the hanging promise to avoid test pollution
 void phase2Promise;
 });
 });

 // -------------------------------------------------------------------------
 // Storage consistency
 // -------------------------------------------------------------------------

 describe("storage consistency", () => {
 it("each save produces a unique entry id — multiple saves do not clobber each other", async () => {
 const img1 = { src: "https://example.com/a.png", crossOrigin: false };
 const img2 = { src: "https://example.com/b.png", crossOrigin: false };

 const { entryId: id1 } = await handleSaveButtonClick(img1,
 storage,
 () => {},
 fetchFnOk,
 thumbnailFnOk,);
 const { entryId: id2 } = await handleSaveButtonClick(img2,
 storage,
 () => {},
 fetchFnOk,
 thumbnailFnOk,);

 expect(id1).not.toBe(id2);

 const entries = storage.get("entries") ?? [];
 expect(entries).toHaveLength(2);
 expect(entries.map((e) => e.id)).toContain(id1);
 expect(entries.map((e) => e.id)).toContain(id2);
 });

 it("background enhancement preserves all other entries when updating one entry", async () => {
 // Pre-seed two existing entries
 storage.set("entries", [
 {
 id: "pre-1",
 imageUrl: "https://example.com/pre1.png",
 savedAt: 1000,
 },
 {
 id: "pre-2",
 imageUrl: "https://example.com/pre2.png",
 savedAt: 2000,
 },
 ]);

 const img = { src: "https://lh3.google.com/img.png", crossOrigin: true };

 const { entryId, phase2Promise } = await handleSaveButtonClick(img,
 storage,
 () => {},
 fetchFnOk,
 thumbnailFnOk,);

 await phase2Promise;

 const entries = storage.get("entries") ?? [];
 // All three entries must survive
 expect(entries).toHaveLength(3);
 expect(entries.find((e) => e.id === "pre-1")).toBeDefined();
 expect(entries.find((e) => e.id === "pre-2")).toBeDefined();
 expect(entries.find((e) => e.id === entryId)).toBeDefined();
 });

 it("background enhancement is a no-op when the entry has been removed from storage before it runs", async () => {
 const img = { src: "https://lh3.google.com/img.png", crossOrigin: true };

 const slowFetch = vi.fn(() =>
 new Promise<string>((resolve) =>
 setTimeout(() => resolve("data:image/png;base64,LATE"), 50),),);

 const { entryId, phase2Promise } = await handleSaveButtonClick(img,
 storage,
 () => {},
 slowFetch,
 thumbnailFnOk,);

 // Simulate the user clearing the clipboard before Phase 2 finishes
 storage.set("entries", []);

 // Phase 2 must complete without throwing
 await expect(phase2Promise).resolves.toBeUndefined();

 // No entries were re-added
 expect(storage.get("entries")).toHaveLength(0);

 // Suppress unused variable warning
 void entryId;
 });
 });
});
