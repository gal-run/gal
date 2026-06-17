import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const manifest = JSON.parse(readFileSync(join(__dirname, "../public/manifest.json"), "utf8"),) as {
 host_permissions: string[];
 optional_host_permissions: string[];
 commands: Record<string, { suggested_key?: { default?: string; mac?: string } }>;
 content_scripts: Array<{ matches: string[]; js: string[] }>;
};

const viteConfigSource = readFileSync(join(__dirname, "../vite.config.ts"),
 "utf8",);

const viteContentConfigSource = readFileSync(join(__dirname, "../vite.content.config.ts"),
 "utf8",);

describe("manifest/runtime regressions", () => {
 it("keeps required host permissions for GAL governance baseline + core runtime surfaces", () => {
 expect(manifest.host_permissions).toContain("https://api.gal.run/*");
 expect(manifest.host_permissions).toContain("https://app.gal.run/*");
 expect(manifest.host_permissions).toContain("https://claude.ai/*");
 expect(manifest.host_permissions).toContain("https://chatgpt.com/*");
 expect(manifest.host_permissions).toContain("https://gemini.google.com/*");
 expect(manifest.host_permissions).toContain("https://github.com/*");
 expect(manifest.host_permissions).toContain("https://lh3.googleusercontent.com/*");
 });

 it("keeps lower-frequency AI hosts optional to reduce install-time permissions", () => {
 expect(manifest.optional_host_permissions).toContain("https://aistudio.google.com/*");
 expect(manifest.optional_host_permissions).toContain("https://midjourney.com/*");
 expect(manifest.optional_host_permissions).toContain("https://ideogram.ai/*");
 expect(manifest.optional_host_permissions).toContain("https://leonardo.ai/*");
 expect(manifest.optional_host_permissions).toContain("https://runwayml.com/*");
 expect(manifest.optional_host_permissions).toContain("https://pika.art/*");
 expect(manifest.optional_host_permissions).toContain("https://klingai.com/*");
 expect(manifest.optional_host_permissions).toContain("https://higgsfield.ai/*");
 expect(manifest.optional_host_permissions).toContain("https://sora.chatgpt.com/*");
 expect(manifest.host_permissions).not.toContain("https://aistudio.google.com/*");
 });

 it("keeps command shortcuts declared for popup and workflow palette wiring", () => {
 expect(manifest.commands).toHaveProperty("open-command-palette");
 expect(manifest.commands).toHaveProperty("_execute_workflow_palette");
 expect(manifest.commands["open-command-palette"]?.suggested_key?.default,).toBe("Ctrl+Shift+P");
 expect(manifest.commands["_execute_workflow_palette"]?.suggested_key?.default,).toBe("Ctrl+Shift+G");
 });

 it("keeps content-script build outputs aligned with manifest script names", () => {
 const listedScripts = manifest.content_scripts.flatMap((entry) => entry.js);
 expect(listedScripts).toContain("content.js");
 expect(listedScripts).toContain("auth-bridge.js");

 expect(viteContentConfigSource).toContain("src/content/content.tsx");
 expect(viteContentConfigSource).toContain("entryFileNames: '[name].js'");
 expect(viteConfigSource).toContain("'auth-bridge': resolve(__dirname, 'src/content/auth-bridge.ts')");
 expect(viteConfigSource).toContain("return 'auth-bridge.js'");
 });
});
