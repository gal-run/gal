import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const contentScriptSource = readFileSync(
  join(__dirname, "../src/content/content.tsx"),
  "utf8",
);

describe("content script regressions", () => {
  it("removes stale legacy floating-button roots/nodes from pre-upgrade content scripts", () => {
    expect(contentScriptSource).toContain('document.getElementById("gal-extension-root")');
    expect(contentScriptSource).toContain("if (legacyRoot) legacyRoot.remove();");
    expect(contentScriptSource).toContain('querySelectorAll(".gal-floating-button")');
    expect(contentScriptSource).toContain("legacyFloatingButton.remove()");
    expect(contentScriptSource).toContain(
      "Cleanup legacy floating button injected by old extension versions",
    );
  });

  it("refreshes cached commands whenever the workflow palette opens to avoid stale entries", () => {
    expect(contentScriptSource).toContain(
      "Always refresh commands on open (fix for stale workflow palette — )",
    );
    expect(contentScriptSource).toContain("openWorkflowPalette = (");
    expect(contentScriptSource).toContain("loadCommandsCached();");
  });

  it("keeps Kling prompt selectors plus editor-injection fallback contracts wired for ProseMirror/TipTap surfaces", () => {
    expect(contentScriptSource).toContain("// Kling AI");
    expect(contentScriptSource).toContain('div.ProseMirror[contenteditable="true"]');
    expect(contentScriptSource).toContain("swebot-prompt-editor .ProseMirror");
    expect(contentScriptSource).toContain('.tiptap.ProseMirror[contenteditable="true"]');
    expect(contentScriptSource).toContain("const inserted = document.execCommand(\"insertText\", false, text);");
    expect(contentScriptSource).toContain("execCommand may be unsupported in some contexts");
  });
});
