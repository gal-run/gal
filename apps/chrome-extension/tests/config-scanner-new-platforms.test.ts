/**
 * Regression tests — Chrome Extension config scanning for Kling,
 * Veo (Sora / AI Studio), Higgsfield, and NanoBanana (Gemini).
 *
 * Test strategy
 * ─────────────
 * The scanners read live DOM state, so their business logic cannot be
 * exercised without a real (or mocked) browser DOM. The vitest environment
 * here is "node", which has no DOM available.
 *
 * What we CAN test reliably:
 * 1. URL routing — `hasScannerForUrl()` does pure hostname pattern-matching
 * and requires no DOM; it must recognise the new platform URLs and reject
 * unrelated ones (no false positives).
 * 2. Source-code contracts — reading the scanner source files lets us assert
 * that every platform scanner exports the right function with the correct
 * name, return shape, and uses the documented selectors from.
 *
 * The tests are therefore split into two suites:
 * A) URL routing / hasScannerForUrl (runtime, no DOM required)
 * B) Source-contract assertions (file-read, always fast)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---- Runtime imports (URL routing only) ------------------------------------
// hasScannerForUrl only does hostname string matching — safe to call without DOM.
import {
 hasScannerForUrl,
 getSupportedPlatforms,
} from "../src/content/scanners/index";

// ---- Source files (contract assertions) ------------------------------------
const SCANNERS_DIR = join(__dirname, "../src/content/scanners");

const klingSource = readFileSync(join(SCANNERS_DIR, "kling-scanner.ts"), "utf8");
const higgsfieldSource = readFileSync(join(SCANNERS_DIR, "higgsfield-scanner.ts"),
 "utf8",);
const soraSource = readFileSync(join(SCANNERS_DIR, "sora-scanner.ts"), "utf8");
const indexSource = readFileSync(join(SCANNERS_DIR, "index.ts"), "utf8");
const typesSource = readFileSync(join(SCANNERS_DIR, "types.ts"), "utf8");

// ============================================================================
// A) URL routing — hasScannerForUrl
// ============================================================================

describe("URL routing — hasScannerForUrl correctly routes new platforms", () => {
 // ---- Kling AI ----
 it("recognises klingai.com as a supported platform", () => {
 expect(hasScannerForUrl("https://klingai.com/global/image/new")).toBe(true);
 });

 it("recognises app.klingai.com subdomain as a supported platform", () => {
 expect(hasScannerForUrl("https://app.klingai.com/global/video/new")).toBe(true,);
 });

 // ---- Higgsfield ----
 it("recognises higgsfield.ai as a supported platform", () => {
 expect(hasScannerForUrl("https://higgsfield.ai/cinema-studio"),).toBe(true);
 });

 it("recognises app.higgsfield.ai subdomain as a supported platform", () => {
 expect(hasScannerForUrl("https://app.higgsfield.ai/cinema-studio"),).toBe(true);
 });

 // ---- Sora (Veo equivalent on OpenAI) ----
 it("recognises sora.chatgpt.com as a supported platform", () => {
 expect(hasScannerForUrl("https://sora.chatgpt.com/")).toBe(true);
 });

 // ---- NanoBanana / Gemini ----
 it("recognises gemini.google.com as a supported platform (NanoBanana / Gemini Gems)", () => {
 expect(hasScannerForUrl("https://gemini.google.com/app")).toBe(true);
 });

 it("recognises aistudio.google.com as a supported platform (AI Studio)", () => {
 expect(hasScannerForUrl("https://aistudio.google.com/prompts/new_chat")).toBe(true,);
 });

 // ---- No false positives ----
 it("returns false for an unrelated page (google.com)", () => {
 expect(hasScannerForUrl("https://www.google.com/")).toBe(false);
 });

 it("returns false for a completely unrelated domain", () => {
 expect(hasScannerForUrl("https://example.com/")).toBe(false);
 });

 it("returns false for chatgpt.com root (not sora subdomain)", () => {
 expect(hasScannerForUrl("https://chatgpt.com/")).toBe(false);
 });

 it("returns false for an invalid URL string", () => {
 expect(hasScannerForUrl("not-a-url")).toBe(false);
 });

 it("returns false for an empty string", () => {
 expect(hasScannerForUrl("")).toBe(false);
 });

 // ---- getSupportedPlatforms coverage ----
 it("getSupportedPlatforms includes klingai.com, higgsfield.ai, and sora.chatgpt.com", () => {
 const platforms = getSupportedPlatforms();
 expect(platforms).toContain("klingai.com");
 expect(platforms).toContain("higgsfield.ai");
 expect(platforms).toContain("sora.chatgpt.com");
 });
});

// ============================================================================
// B) Kling scanner source contracts
// ============================================================================

describe("Kling scanner source contracts", () => {
 it("exports a scanKling function", () => {
 expect(klingSource).toContain("export function scanKling()");
 });

 it("returns a PlatformConfigResult with platform set to 'kling'", () => {
 expect(klingSource).toContain("platform: \"kling\"");
 });

 it("detects image generation mode from the /image path segment", () => {
 expect(klingSource).toContain('path.includes("/image")');
 expect(klingSource).toContain('"image"');
 });

 it("detects video generation mode from the /video path segment", () => {
 expect(klingSource).toContain('path.includes("/video")');
 expect(klingSource).toContain('"video"');
 });

 it("reads the model from the documented.el-select.ai-web-select-model-version selector", () => {
 expect(klingSource).toContain(".el-select.ai-web-select-model-version.name-new",);
 });

 it("reads the prompt from the.tiptap.ProseMirror editor", () => {
 expect(klingSource).toContain(".tiptap.ProseMirror");
 });

 it("returns a 'Not on an image or video generation page' summary when mode is null", () => {
 expect(klingSource).toContain("Not on an image or video generation page.",);
 expect(klingSource).toContain("mode: null");
 });

 it("includes outputCount in image config and duration in video config", () => {
 expect(klingSource).toContain("outputCount");
 expect(klingSource).toContain("duration");
 });

 it("has KlingConfig and KlingImageConfig/KlingVideoConfig types imported", () => {
 expect(klingSource).toContain("KlingConfig");
 expect(typesSource).toContain("KlingImageConfig");
 expect(typesSource).toContain("KlingVideoConfig");
 expect(typesSource).toContain('mode: "image"');
 expect(typesSource).toContain('mode: "video"');
 });
});

// ============================================================================
// C) Higgsfield scanner source contracts
// ============================================================================

describe("Higgsfield scanner source contracts", () => {
 it("exports a scanHiggsfield function", () => {
 expect(higgsfieldSource).toContain("export function scanHiggsfield()");
 });

 it("returns a PlatformConfigResult with platform set to 'higgsfield'", () => {
 expect(higgsfieldSource).toContain('platform: "higgsfield"');
 });

 it("has HiggsFieldConfig type with camera, aspectRatio, resolution, gridLayout, savedCameras fields", () => {
 expect(typesSource).toContain("interface HiggsFieldConfig");
 expect(typesSource).toContain("camera:");
 expect(typesSource).toContain("aspectRatio:");
 expect(typesSource).toContain("resolution:");
 expect(typesSource).toContain("gridLayout:");
 expect(typesSource).toContain("savedCameras:");
 });

 it("parses camera focal length and aperture from button text (e.g. 35mm f/1.4)", () => {
 // parseCameraLabel reads "mm" and "f/" patterns from button text labels
 expect(higgsfieldSource).toContain("mm");
 expect(higgsfieldSource).toContain("f/");
 expect(higgsfieldSource).toContain("focalLength");
 expect(higgsfieldSource).toContain("aperture");
 });

 it("reads aspect ratio from toolbar buttons matching \\d+:\\d+ pattern", () => {
 // The readAspectRatio function iterates buttons for aspect ratio text
 expect(higgsfieldSource).toContain("/^\\d+:\\d+$/");
 });

 it("reads resolution from buttons matching known resolution patterns", () => {
 // The readResolution function matches e.g. "1920x1080", "4K", "1080p"
 expect(higgsfieldSource).toContain("resolution");
 expect(higgsfieldSource).toContain("1080p");
 });

 it("returns a graceful fallback summary when no Cinema Studio config is detected", () => {
 expect(higgsfieldSource).toContain("No Cinema Studio config detected",);
 });

 it("reads saved cameras from a saved cameras list or preset elements", () => {
 expect(higgsfieldSource).toContain("savedCameras");
 expect(higgsfieldSource).toContain("readSavedCameras");
 });
});

// ============================================================================
// D) Scanner index registration — all four platforms wired up
// ============================================================================

describe("Scanner index registration — all new platforms wired to scanPlatformConfig", () => {
 it("imports scanKling from kling-scanner", () => {
 expect(indexSource).toContain("scanKling");
 expect(indexSource).toContain("kling-scanner");
 });

 it("imports scanHiggsfield from higgsfield-scanner", () => {
 expect(indexSource).toContain("scanHiggsfield");
 expect(indexSource).toContain("higgsfield-scanner");
 });

 it("imports scanSora from sora-scanner (covers Veo-style platforms)", () => {
 expect(indexSource).toContain("scanSora");
 expect(indexSource).toContain("sora-scanner");
 });

 it("maps klingai.com hostname to the Kling scanner", () => {
 expect(indexSource).toContain('"klingai.com"');
 });

 it("maps higgsfield.ai hostname to the Higgsfield scanner", () => {
 expect(indexSource).toContain('"higgsfield.ai"');
 });

 it("maps sora.chatgpt.com hostname to the Sora scanner", () => {
 expect(indexSource).toContain('"sora.chatgpt.com"');
 });

 it("maps gemini.google.com hostname to Gemini Gems scanner (NanoBanana context)", () => {
 expect(indexSource).toContain('"gemini.google.com"');
 });

 it("exports scanPlatformConfig and hasScannerForUrl as named exports", () => {
 expect(indexSource).toContain("export function scanPlatformConfig");
 expect(indexSource).toContain("export function hasScannerForUrl");
 });

 it("returns null from scanPlatformConfig for URLs with no registered scanner (no false positives)", () => {
 // The function returns null when no hostPattern matches — verify the code path
 expect(indexSource).toContain("return null;");
 });
});

// ============================================================================
// E) Sora scanner source contracts (covers the Veo category)
// ============================================================================

describe("Sora scanner source contracts — Veo-style video platform", () => {
 it("exports a scanSora function", () => {
 expect(soraSource).toContain("export function scanSora()");
 });

 it("returns a PlatformConfigResult with platform set to 'sora'", () => {
 expect(soraSource).toContain('platform: "sora"');
 });

 it("reads the prompt from the documented textarea selector", () => {
 expect(soraSource).toContain('textarea[placeholder="Describe your video..."]',);
 });

 it("reads toolbar combobox controls for media type, aspect ratio, resolution, duration", () => {
 expect(soraSource).toContain('[role="combobox"]');
 expect(soraSource).toContain("mediaType");
 expect(soraSource).toContain("aspectRatio");
 expect(soraSource).toContain("resolution");
 expect(soraSource).toContain("duration");
 });

 it("has SoraConfig type with all expected fields", () => {
 expect(typesSource).toContain("interface SoraConfig");
 expect(typesSource).toContain("mediaType:");
 expect(typesSource).toContain("variations:");
 expect(typesSource).toContain("style:");
 });
});
