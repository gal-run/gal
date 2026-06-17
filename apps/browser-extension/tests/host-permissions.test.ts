import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isOptionalHostOrigin,
  isRequestableHostOrigin,
  originPatternFromUrl,
} from "../src/lib/host-permissions";

const manifest = JSON.parse(
  readFileSync(join(__dirname, "../public/manifest.json"), "utf8"),
) as {
  host_permissions?: string[];
  optional_host_permissions?: string[];
};

describe("host-permissions helpers", () => {
  it("normalizes origin patterns from URLs", () => {
    expect(originPatternFromUrl("https://aistudio.google.com/prompts/new_chat")).toBe(
      "https://aistudio.google.com/*",
    );
    expect(originPatternFromUrl("https://claude.ai/new")).toBe("https://claude.ai/*");
  });

  it("returns null for invalid URL values", () => {
    expect(originPatternFromUrl("not-a-url")).toBeNull();
    expect(originPatternFromUrl("")).toBeNull();
  });

  it("classifies optional host origins from the manifest", () => {
    expect(
      isOptionalHostOrigin(manifest, "https://aistudio.google.com/*"),
    ).toBe(true);
    expect(isOptionalHostOrigin(manifest, "https://claude.ai/*")).toBe(false);
  });

  it("marks both required and optional origins as requestable", () => {
    expect(isRequestableHostOrigin(manifest, "https://claude.ai/*")).toBe(true);
    expect(
      isRequestableHostOrigin(manifest, "https://midjourney.com/*"),
    ).toBe(true);
    expect(isRequestableHostOrigin(manifest, "https://example.com/*")).toBe(false);
  });
});
