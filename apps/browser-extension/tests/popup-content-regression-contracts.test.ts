import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const popupSource = readFileSync(
  join(__dirname, "../src/popup/App.tsx"),
  "utf8",
);

const contentSource = readFileSync(
  join(__dirname, "../src/content/content.tsx"),
  "utf8",
);

const workflowPaletteSource = readFileSync(
  join(__dirname, "../src/content/WorkflowPalette.tsx"),
  "utf8",
);

const commandCardSource = readFileSync(
  join(__dirname, "../src/components/CommandCard.tsx"),
  "utf8",
);

const syncStatusSource = readFileSync(
  join(__dirname, "../src/components/SyncStatusCard.tsx"),
  "utf8",
);

const apiSource = readFileSync(
  join(__dirname, "../src/lib/api.ts"),
  "utf8",
);

describe("popup/content regression contracts", () => {
  it("keeps in-field icon sizing/anchoring and duplicate-safe click wiring", () => {
    expect(contentSource).toContain(".gal-infield-icon {");
    expect(contentSource).toContain("top: 1px;");
    expect(contentSource).toContain("right: 8px;");
    expect(contentSource).toContain("width: 22px;");
    expect(contentSource).toContain("height: 22px;");
    expect(contentSource).toContain("if (anchor.querySelector(\".gal-infield-icon\")) return;");
    expect(contentSource).toContain("icon.addEventListener(\"mousedown\", (e) => {");
    expect(contentSource).toContain("icon.addEventListener(\"click\", (e) => {");
    expect(contentSource).toContain("tryOpenWorkflowPalette(input);");
  });

  it("keeps workflow palette anchored and viewport-clamped near the active input", () => {
    expect(workflowPaletteSource).toContain("const PALETTE_WIDTH = 480;");
    expect(workflowPaletteSource).toContain("const EDGE_MARGIN = 8;");
    expect(workflowPaletteSource).toContain("const rawRight = vw - rect.right;");
    expect(workflowPaletteSource).toContain(
      "const minRight = Math.max(EDGE_MARGIN, vw - PALETTE_WIDTH - EDGE_MARGIN);",
    );
    expect(workflowPaletteSource).toContain(
      "paletteStyle.right = `${Math.min(rawRight, minRight)}px`;",
    );
  });

  it("keeps popup/header branding contracts aligned to GAL accent/logo styles", () => {
    expect(popupSource).toContain("<svg viewBox=\"0 0 36 36\" className=\"w-7 h-7\" fill=\"none\">");
    expect(popupSource).toContain("fill=\"#00FF2A\"");
    expect(popupSource).toContain("<h1 className=\"text-base font-bold text-white\">GAL</h1>");
    expect(contentSource).toContain("icon.innerHTML = `<svg viewBox=\"0 0 36 36\" fill=\"none\"");
    expect(contentSource).toContain("--gal-accent: #00ff2a;");
    expect(contentSource).toContain("--gal-accent-bg: rgba(0, 255, 42, 0.08);");
    expect(contentSource).toContain("--gal-surface-base: #0a0a0a;");
    expect(contentSource).toContain("--gal-surface-raised: #141414;");
  });

  it("keeps cache-first popup restore and background revalidation for reopen latency", () => {
    expect(popupSource).toContain("// ---- Cache-first initialization ----");
    expect(popupSource).toContain("restoreFromCacheAndRevalidate();");
    expect(popupSource).toContain("const cacheRestoredRef = useRef(false);");
    expect(popupSource).toContain("orgRestoredFromCacheRef");
  });

  it("keeps scan freshness UX and dashboard-link simplification in popup status surfaces", () => {
    expect(syncStatusSource).toContain("if (!lastScanAt) return \"No scan data\";");
    expect(syncStatusSource).toContain("if (stale) return \"\\u26a0 Scan stale\";");
    expect(syncStatusSource).toContain(
      "Scan data is over 7 days old. Click &quot;Scan Now&quot; to refresh.",
    );
    expect(popupSource).toContain("title=\"Open Dashboard\"");
    expect(popupSource).toContain("<WorkspaceSwitcher");
    expect(popupSource).toContain("<SyncStatusLine");
  });

  it("keeps active GPT/Gem detection, onboarding scans, and Kling platform mapping", () => {
    expect(contentSource).toContain("function detectActiveGpt(): void {");
    expect(contentSource).toContain("function detectActiveGem(): void {");
    expect(contentSource).toContain("location.pathname.match(/\\/gem\\/([^/?]+)/)");
    expect(contentSource).toContain("type: \"GEM_DETECTED\"");
    expect(contentSource).toContain("async function scanChatGptGpts(): Promise<void> {");
    expect(contentSource).toContain("async function scanGeminiGems(): Promise<void> {");
    expect(contentSource).toContain("scan_chatgpt");
    expect(contentSource).toContain("scan_gemini");
    expect(apiSource).toContain("if (url.includes(\"klingai.com\")) return \"kling\";");
  });

  it("keeps cross-platform asset/workflow transfer path with direct editor injection + clipboard fallback", () => {
    expect(commandCardSource).toContain("type: \"INSERT_WORKFLOW_TEXT\"");
    expect(commandCardSource).toContain("await navigator.clipboard.writeText(command.content);");
    expect(contentSource).toContain("// ---- Message Bridge: INSERT_WORKFLOW_TEXT from popup ----");
    expect(contentSource).toContain("message.type === \"INSERT_WORKFLOW_TEXT\"");
  });

  it("keeps Firestore discovery source + release namespace/compat guardrails", () => {
    expect(apiSource).toContain(
      "Get discovered configs from Firestore cache (via API).",
    );
    expect(apiSource).toContain(
      "`/organizations/${encodeURIComponent(orgName)}/discovered-configs?${params}`",
    );
    expect(apiSource).toContain("const orgTier = resolveOrgTier(orgAudienceTier, \"free\");");
  });
});
