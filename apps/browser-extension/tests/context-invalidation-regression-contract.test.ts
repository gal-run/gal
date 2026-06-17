import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const contentSource = readFileSync(
  join(__dirname, "../src/content/content.tsx"),
  "utf8",
);

const guardianSource = readFileSync(
  join(__dirname, "../src/content/generation-guardian.ts"),
  "utf8",
);

describe("context invalidation regression contracts", () => {
  it("keeps the active GPT/Gem session writes catch-safe during extension reloads", () => {
    expect(contentSource).toContain(
      'chrome.storage.session.set({ activeGpt: JSON.stringify(gptInfo) }).catch(() => {});',
    );
    expect(contentSource).toContain(
      'chrome.storage.session.set({ activeGpt: JSON.stringify(null) }).catch(() => {});',
    );
    expect(contentSource).toContain(
      'chrome.storage.session.set({ activeGem: JSON.stringify(gemInfo) }).catch(() => {});',
    );
    expect(contentSource).toContain(
      'chrome.storage.session.set({ activeGem: JSON.stringify(null) }).catch(() => {});',
    );
  });

  it("keeps generation monitoring guarded and cleanup-bound to extension invalidation", () => {
    expect(guardianSource).toContain('import { isContextValid, onContextInvalidated } from "./context-guard";');
    expect(guardianSource).toContain("if (!isContextValid()) {");
    expect(guardianSource).toContain("stopMonitorInternal();");
    expect(guardianSource).toContain("onContextInvalidated(stopMonitorInternal);");
    expect(guardianSource).toContain("if (!isContextValid()) return;");
  });
});
