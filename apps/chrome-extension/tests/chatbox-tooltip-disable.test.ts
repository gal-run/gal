/**
 * Regression tests — Chrome Extension tooltip + disable option
 * for the chatbox injection button.
 *
 * Verified behaviours:
 * 1. The tooltip title and description copy are correctly defined in content.tsx.
 * 2. The tooltip renders on hover (after a 400ms delay) and its DOM structure
 * includes the correct copy, a disable toggle, and a switch element.
 * 3. The disable option is persisted to chrome.storage.sync via setSyncPreference.
 * 4. When the preference is loaded as disabled on initialisation, existing icons
 * are hidden immediately.
 * 5. When a storage.sync change arrives for inFieldButtonDisabled=true, all
 * existing in-field icons are hidden and open tooltips are removed.
 * 6. scanForChatInputs() is a no-op when the button is disabled — new icons
 * are never injected.
 * 7. getSyncPreference / setSyncPreference read and write only from
 * chrome.storage.sync (not local), so the setting persists across sessions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Source-level contract checks (static analysis of content.tsx and storage.ts)
// ---------------------------------------------------------------------------

const contentSource = readFileSync(join(__dirname, "../src/content/content.tsx"),
 "utf8",);

const storageSource = readFileSync(join(__dirname, "../src/lib/storage.ts"),
 "utf8",);

describe("regression — chatbox tooltip copy contracts (static)", () => {
 it("tooltip title copy is 'GAL Workflow Palette'", () => {
 expect(contentSource).toContain("GAL Workflow Palette");
 });

 it("tooltip description mentions '//' trigger shortcut", () => {
 expect(contentSource).toContain("<kbd>//</kbd>");
 });

 it("tooltip description mentions 'Cmd+Shift+G' keyboard shortcut", () => {
 expect(contentSource).toContain("<kbd>Cmd+Shift+G</kbd>");
 });

 it("tooltip has a 'Show this button' disable toggle label", () => {
 expect(contentSource).toContain("Show this button");
 });

 it("createTooltip function is defined in content.tsx", () => {
 expect(contentSource).toContain("function createTooltip(");
 });

 it("tooltip is shown on mouseenter after a 400ms delay", () => {
 expect(contentSource).toContain("setTimeout(showTooltip, 400)");
 });

 it("tooltip switch element uses data-checked attribute", () => {
 expect(contentSource).toContain('switchEl.dataset.checked = "true"');
 });

 it("clicking the disable toggle calls setSyncPreference with inFieldButtonDisabled", () => {
 expect(contentSource).toContain('setSyncPreference("inFieldButtonDisabled", newDisabled)',);
 });

 it("toggle emits a telemetry event when toggled", () => {
 expect(contentSource).toContain('trackEvent("extension.button_toggled", { button_enabled: !newDisabled })',);
 });
});

describe("regression — disable option storage contracts (static)", () => {
 it("SyncPreferences interface declares inFieldButtonDisabled as optional boolean", () => {
 expect(storageSource).toContain("inFieldButtonDisabled?: boolean");
 });

 it("getSyncPreference reads from chrome.storage.sync (not local)", () => {
 // Verify the function reads from chrome.storage.sync.get
 expect(storageSource).toContain("chrome.storage.sync.get(key)");
 });

 it("setSyncPreference writes to chrome.storage.sync (not local)", () => {
 // Verify the function writes to chrome.storage.sync.set
 expect(storageSource).toContain("chrome.storage.sync.set(");
 });
});

describe("regression — disable state initialisation and reactivity (static)", () => {
 it("content script loads inFieldButtonDisabled on startup via getSyncPreference", () => {
 expect(contentSource).toContain('getSyncPreference("inFieldButtonDisabled")',);
 });

 it("when loaded as disabled, existing icons are hidden immediately", () => {
 expect(contentSource).toContain('document.querySelectorAll<HTMLElement>(".gal-infield-icon").forEach',);
 // The next statement sets display:none
 expect(contentSource).toContain('el.style.display = "none"');
 });

 it("listens to chrome.storage.sync.onChanged for inFieldButtonDisabled changes", () => {
 expect(contentSource).toContain("chrome.storage.sync.onChanged.addListener");
 expect(contentSource).toContain('"inFieldButtonDisabled"');
 });

 it("when disabled via storage change, all in-field icons are set to display:none", () => {
 // The onChanged handler updates existing icons
 expect(contentSource).toContain('el.style.display = inFieldButtonDisabled ? "none" : "flex"',);
 });

 it("when disabled via storage change, only non-pinned tooltips are removed", () => {
 expect(contentSource).toContain('if (el.dataset.pinned !== "true") el.remove();',);
 });

 it("scanForChatInputs is a no-op when inFieldButtonDisabled is true", () => {
 expect(contentSource).toContain("if (inFieldButtonDisabled) return;");
 });
});

// ---------------------------------------------------------------------------
// Runtime unit tests — chrome.storage.sync mock
// ---------------------------------------------------------------------------

function buildChromeSyncMock() {
 const store: Record<string, unknown> = {};

 const syncMock = {
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
 onChanged: {
 addListener: vi.fn(),
 removeListener: vi.fn(),
 },
 };

 const localMock = {
 get: vi.fn(async () => ({})),
 set: vi.fn(async () => {}),
 remove: vi.fn(async () => {}),
 clear: vi.fn(async () => {}),
 onChanged: {
 addListener: vi.fn(),
 removeListener: vi.fn(),
 },
 };

 return { sync: syncMock, local: localMock, store };
}

describe("regression — getSyncPreference / setSyncPreference runtime", () => {
 let chromeMock: ReturnType<typeof buildChromeSyncMock>;

 beforeEach(() => {
 chromeMock = buildChromeSyncMock();
 vi.stubGlobal("chrome", {
 storage: {
 sync: chromeMock.sync,
 local: chromeMock.local,
 },
 });
 });

 afterEach(() => {
 vi.unstubAllGlobals();
 vi.clearAllMocks();
 vi.resetModules();
 });

 it("getSyncPreference returns null when key is absent", async () => {
 const { getSyncPreference } = await import("../src/lib/storage");
 const result = await getSyncPreference("inFieldButtonDisabled");
 expect(result).toBeNull();
 expect(chromeMock.sync.get).toHaveBeenCalledWith("inFieldButtonDisabled");
 });

 it("setSyncPreference writes to chrome.storage.sync with the given value", async () => {
 const { setSyncPreference } = await import("../src/lib/storage");
 await setSyncPreference("inFieldButtonDisabled", true);
 expect(chromeMock.sync.set).toHaveBeenCalledWith({
 inFieldButtonDisabled: true,
 });
 // Verify it was NOT written to local
 expect(chromeMock.local.set).not.toHaveBeenCalled();
 });

 it("getSyncPreference reads the persisted value back after setSyncPreference", async () => {
 // Simulate persistence: setSyncPreference writes to store; getSyncPreference reads it back
 const { setSyncPreference, getSyncPreference } = await import("../src/lib/storage");
 await setSyncPreference("inFieldButtonDisabled", true);

 // The mock store should now contain the value
 expect(chromeMock.store["inFieldButtonDisabled"]).toBe(true);

 // Simulate a fresh read
 const readBack = await getSyncPreference("inFieldButtonDisabled");
 expect(readBack).toBe(true);
 });

 it("setSyncPreference with false re-enables the button", async () => {
 const { setSyncPreference } = await import("../src/lib/storage");
 await setSyncPreference("inFieldButtonDisabled", false);
 expect(chromeMock.sync.set).toHaveBeenCalledWith({
 inFieldButtonDisabled: false,
 });
 });

 it("getSyncPreference does not throw when chrome.storage.sync.get rejects", async () => {
 chromeMock.sync.get.mockRejectedValueOnce(new Error("storage unavailable"));
 const { getSyncPreference } = await import("../src/lib/storage");
 // Should resolve to null rather than throwing
 await expect(getSyncPreference("inFieldButtonDisabled"),).resolves.toBeNull();
 });

 it("setSyncPreference does not throw when chrome.storage.sync.set rejects", async () => {
 chromeMock.sync.set.mockRejectedValueOnce(new Error("storage unavailable"));
 const { setSyncPreference } = await import("../src/lib/storage");
 // Should resolve without throwing
 await expect(setSyncPreference("inFieldButtonDisabled", true),).resolves.toBeUndefined();
 });
});
