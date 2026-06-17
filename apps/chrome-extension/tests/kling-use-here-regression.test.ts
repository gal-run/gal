import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const manifest = JSON.parse(readFileSync(join(__dirname, "../public/manifest.json"), "utf8"),) as {
 optional_host_permissions: string[];
 content_scripts: Array<{ matches: string[]; js: string[] }>;
};

const contentScriptSource = readFileSync(join(__dirname, "../src/content/content.tsx"),
 "utf8",);

const assetClipboardSource = readFileSync(join(__dirname, "../src/content/asset-clipboard.ts"),
 "utf8",);

describe("Kling 'Use here' regression contracts", () => {
 it("keeps Kling host coverage in manifest permissions and content-script matches", () => {
 expect(manifest.optional_host_permissions).toContain("https://klingai.com/*");
 expect(manifest.optional_host_permissions).toContain("https://app.klingai.com/*");
 expect(manifest.optional_host_permissions).toContain("https://lab.klingai.com/*");

 const contentMatches = manifest.content_scripts.flatMap((entry) => entry.matches);
 expect(contentMatches).toContain("https://klingai.com/*");
 expect(contentMatches).toContain("https://app.klingai.com/*");
 expect(contentMatches).toContain("https://lab.klingai.com/*");
 });

 it("initializes the asset clipboard on Kling Canvas pages", () => {
 expect(contentScriptSource).toContain('hostname.includes("lab.klingai.com")');
 expect(contentScriptSource).toContain('initAssetClipboard("kling")');
 });

 it("keeps Kling-specific upload selectors and fallback guidance", () => {
 expect(assetClipboardSource).toContain("'.editable-input'");
 expect(assetClipboardSource).toContain('location.hostname.includes("klingai.com")');
 expect(assetClipboardSource).toContain("No upload target found in Kling.");
 expect(assetClipboardSource).toContain("input[type=\"file\"][accept*=\"image\" i], input[type=\"file\"]");
 });
});
