/**
 * Regression tests for Content-Security-Policy in Chrome Extension manifest
 *
 * Verifies that:
 * - manifest.json declares a content_security_policy for extension pages
 * - The CSP does not permit 'unsafe-eval' or 'unsafe-inline' in script-src
 * - web_accessible_resources is scoped to specific origins, not a wildcard
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface WebAccessibleResource {
  resources: string[];
  matches: string[];
}

interface Manifest {
  manifest_version: number;
  content_security_policy?: {
    extension_pages?: string;
    sandbox?: string;
    [key: string]: string | undefined;
  };
  web_accessible_resources?: WebAccessibleResource[];
  [key: string]: unknown;
}

const manifest: Manifest = JSON.parse(
  readFileSync(resolve(__dirname, "../public/manifest.json"), "utf-8"),
);

describe("manifest.json — Content-Security-Policy", () => {
  it("declares a content_security_policy field", () => {
    expect(
      manifest.content_security_policy,
      "manifest.json must contain a 'content_security_policy' field",
    ).toBeDefined();
  });

  it("declares a content_security_policy.extension_pages directive", () => {
    expect(
      manifest.content_security_policy?.extension_pages,
      "content_security_policy must contain an 'extension_pages' directive",
    ).toBeDefined();
  });

  it("does not include 'unsafe-eval' in extension_pages script-src", () => {
    const csp = manifest.content_security_policy?.extension_pages ?? "";
    expect(
      csp,
      "extension_pages CSP must not contain 'unsafe-eval'",
    ).not.toContain("'unsafe-eval'");
  });

  it("does not include 'unsafe-inline' in extension_pages script-src", () => {
    const csp = manifest.content_security_policy?.extension_pages ?? "";
    expect(
      csp,
      "extension_pages CSP must not contain 'unsafe-inline'",
    ).not.toContain("'unsafe-inline'");
  });
});

describe("manifest.json — web_accessible_resources", () => {
  it("declares web_accessible_resources", () => {
    expect(
      manifest.web_accessible_resources,
      "manifest.json must contain a 'web_accessible_resources' field",
    ).toBeDefined();
    expect(
      Array.isArray(manifest.web_accessible_resources),
      "web_accessible_resources must be an array",
    ).toBe(true);
    expect(
      manifest.web_accessible_resources!.length,
      "web_accessible_resources must have at least one entry",
    ).toBeGreaterThan(0);
  });

  it("does not use a bare wildcard (*) in any matches entry", () => {
    const allMatches = (manifest.web_accessible_resources ?? []).flatMap(
      (entry) => entry.matches,
    );

    for (const pattern of allMatches) {
      expect(
        pattern,
        `web_accessible_resources matches must not be a bare wildcard — found: "${pattern}"`,
      ).not.toBe("*");
    }
  });

  it("scopes every matches entry to a specific https origin (not <all_urls>)", () => {
    const allMatches = (manifest.web_accessible_resources ?? []).flatMap(
      (entry) => entry.matches,
    );

    for (const pattern of allMatches) {
      expect(
        pattern,
        `web_accessible_resources matches must not use '<all_urls>' — found: "${pattern}"`,
      ).not.toBe("<all_urls>");

      expect(
        pattern.startsWith("https://"),
        `web_accessible_resources matches must start with 'https://' — found: "${pattern}"`,
      ).toBe(true);
    }
  });
});
