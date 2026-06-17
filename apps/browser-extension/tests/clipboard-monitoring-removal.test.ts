/**
 * Regression tests for the current clipboard/generation boundary.
 *
 * The old " removal" contract is obsolete: the extension now intentionally
 * ships scoped generation monitoring and asset clipboard helpers on supported
 * hosts. These tests guard the boundary that exists today:
 *
 * - generation monitoring is host-scoped to supported surfaces
 * - asset clipboard initialization is host-scoped to Gemini and AI Studio
 * - privileged clipboard/browser APIs remain owned by the service worker
 * - manifest permissions stay narrow and avoid broad host injection
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "../src");
const CONTENT_SCRIPT = join(SRC, "content/content.tsx");
const SERVICE_WORKER = join(SRC, "background/service-worker.ts");
const MANIFEST = join(__dirname, "../public/manifest.json");

const contentScriptSource = readFileSync(CONTENT_SCRIPT, "utf8");
const serviceWorkerSource = readFileSync(SERVICE_WORKER, "utf8");
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
  permissions: string[];
  optional_permissions: string[];
};

const contentScripts = manifest.content_scripts ?? [];
const appGalBridgeScript = contentScripts.find((entry) =>
  entry.matches?.includes("https://app.gal.run/*"),
);
const productContentScript = contentScripts.find((entry) =>
  entry.js?.includes("content.js"),
);

describe("content script — generation and clipboard helpers are scoped to supported hosts", () => {
  it("keeps generation guardian host fragments limited to Gemini, Kling, and AI Studio", () => {
    expect(contentScriptSource).toContain('fragment: "gemini.google.com"');
    expect(contentScriptSource).toContain('fragment: "klingai.com"');
    expect(contentScriptSource).toContain('fragment: "aistudio.google.com"');
  });

  it("initializes the asset clipboard only on Gemini and AI Studio pages", () => {
    expect(contentScriptSource).toContain(
      'if (hostname.includes("gemini.google.com"))',
    );
    expect(contentScriptSource).toContain(
      'initAssetClipboard("gemini").catch(() => {});',
    );
    expect(contentScriptSource).toContain(
      'else if (hostname.includes("aistudio.google.com"))',
    );
    expect(contentScriptSource).toContain(
      'initAssetClipboard("ai-studio").catch(() => {});',
    );
  });

  it("keeps Gemini image-generation monitoring behind a Gemini hostname gate", () => {
    expect(contentScriptSource).toContain("let geminiImageObserver");
    expect(contentScriptSource).toContain(
      'if (location.hostname.includes("gemini.google.com")) {',
    );
    expect(contentScriptSource).toContain('type: "IMAGE_GENERATED"');
  });
});

describe("privileged clipboard/browser APIs remain isolated behind the service worker", () => {
  it("keeps proxy and download handlers in the service worker", () => {
    expect(serviceWorkerSource).toContain('message.type === "GAL_FETCH_IMAGE"');
    expect(serviceWorkerSource).toContain(
      'message.type === "GAL_FETCH_IMAGE_MAIN_WORLD"',
    );
    expect(serviceWorkerSource).toContain(
      'message.type === "GAL_DOWNLOAD_IMAGE"',
    );
  });

  it("keeps chrome.scripting and chrome.downloads calls out of the content script", () => {
    expect(serviceWorkerSource).toContain("chrome.scripting");
    expect(serviceWorkerSource).toContain("chrome.downloads");
    expect(contentScriptSource).not.toContain("chrome.scripting.executeScript");
    expect(contentScriptSource).not.toContain("chrome.downloads");
  });

  it("keeps content-side clipboard transfer message-driven instead of directly downloading", () => {
    expect(contentScriptSource).toContain("transferToCurrentPlatform");
    expect(contentScriptSource).not.toContain('type: "GAL_DOWNLOAD_IMAGE"');
  });
});

describe("manifest wiring stays narrow for the current feature set", () => {
  it("injects the auth bridge only on app.gal.run", () => {
    expect(appGalBridgeScript?.matches).toEqual(["https://app.gal.run/*"]);
    expect(appGalBridgeScript?.js).toEqual(["auth-bridge.js"]);
  });

  it("avoids broad content-script host injection", () => {
    expect(productContentScript?.matches).toBeDefined();
    expect(productContentScript?.matches).not.toContain("<all_urls>");
  });

  it("keeps scripting required and downloads/cookies optional", () => {
    expect(manifest.permissions).toContain("scripting");
    expect(manifest.permissions).toContain("tabs");
    expect(manifest.optional_permissions).toContain("downloads");
    expect(manifest.optional_permissions).toContain("cookies");
    expect(manifest.permissions).not.toContain("downloads");
    expect(manifest.permissions).not.toContain("cookies");
  });
});
