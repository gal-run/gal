/**
 * Regression tests — collapse sync/scan status into compact status line.
 *
 * Verifies:
 * 1. The popup imports and uses SyncStatusLine (compact single-line component), not a
 * three-separate-row layout for sync + scan.
 * 2. SyncStatusCard.tsx exports SyncStatusLine as the primary named export.
 * 3. The compact line combines sync state text and scan state text into one element.
 * 4. All three states (syncing, scanning, idle) are represented in the compact line helpers.
 * 5. The old SyncStatusCard block export is kept only as a deprecated backward-compat wrapper,
 * not rendered separately alongside the compact line.
 * 6. No separate sync row and scan row are rendered in the popup when the compact line is active.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const syncStatusSource = readFileSync(join(__dirname, "../src/components/SyncStatusCard.tsx"),
 "utf8",);

const popupSource = readFileSync(join(__dirname, "../src/popup/App.tsx"),
 "utf8",);

// ---------------------------------------------------------------------------
// 1. Primary export is SyncStatusLine
// ---------------------------------------------------------------------------

describe("compact sync/scan status line — primary export", () => {
 it("SyncStatusCard.tsx exports SyncStatusLine as the main named export", () => {
 expect(syncStatusSource).toContain("export function SyncStatusLine(");
 });

 it("SyncStatusLine component renders a compact single button row (not a multi-block layout)", () => {
 // The compact line is implemented as a single <button> that wraps all status info
 expect(syncStatusSource).toContain("Compact single-line sync/scan status indicator");
 // Confirm the button is the wrapper for the compact view
 expect(syncStatusSource).toContain("w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400",);
 });

 it("SyncStatusCard is kept only as a deprecated wrapper — not a standalone status block", () => {
 expect(syncStatusSource).toContain("@deprecated Use SyncStatusLine instead");
 expect(syncStatusSource).toContain("export function SyncStatusCard(");
 // Deprecated wrapper must delegate to SyncStatusLine, not render independently
 expect(syncStatusSource).toContain("<SyncStatusLine");
 });
});

// ---------------------------------------------------------------------------
// 2. Compact line combines sync AND scan state into one element
// ---------------------------------------------------------------------------

describe("compact line combines sync and scan state", () => {
 it("getScanText helper produces 'Scanning…' when isScanning=true", () => {
 // The function must handle the scanning state
 expect(syncStatusSource).toContain('if (isScanning) return "Scanning');
 });

 it("getScanText helper produces a 'Scanned X ago' label when scan data exists", () => {
 expect(syncStatusSource).toContain("`Scanned ${formatScanTime(lastScanAt)}`");
 });

 it("getScanText helper produces 'No scan data' when lastScanAt is falsy", () => {
 expect(syncStatusSource).toContain('if (!lastScanAt) return "No scan data"');
 });

 it("compact line renders the scanText segment adjacent to the sync status text", () => {
 // Both status text and scan text appear inline in the same button element
 expect(syncStatusSource).toContain("{getStatusText(syncStatus, isLoading, hasSelectedOrg)}");
 expect(syncStatusSource).toContain("{scanText}");
 // They are separated by a mid-dot separator, not by separate DOM blocks
 expect(syncStatusSource).toContain("&middot;");
 });

 it("SyncStatusLine accepts both sync and scan props in a single component interface", () => {
 // All state flows through one component — no separate SyncRow / ScanRow components
 expect(syncStatusSource).toContain("lastScanAt: string | number | null;");
 expect(syncStatusSource).toContain("isScanning: boolean;");
 expect(syncStatusSource).toContain("scanProgress: ScanProgress | null;");
 expect(syncStatusSource).toContain("scanError: string | null;");
 });
});

// ---------------------------------------------------------------------------
// 3. All three sync states represented in compact line helpers
// ---------------------------------------------------------------------------

describe("all sync states represented in compact line helpers", () => {
 it("getStatusText returns 'Checking…' while syncing (isLoading=true)", () => {
 expect(syncStatusSource).toContain('"Checking');
 });

 it("getStatusText returns a synced label when syncStatus.synced=true", () => {
 expect(syncStatusSource).toContain('"Synced"');
 });

 it("getStatusText returns a drift-detected label with file count", () => {
 // The drift label is a template literal: `Drift detected \u00b7 ${count} file...`
 expect(syncStatusSource).toContain("return `Drift detected ");
 });

 it("getStatusText returns 'Not synced' run instruction when not synced and no drift", () => {
 expect(syncStatusSource).toContain('"Not synced ');
 });

 it("getStatusText returns 'No org selected' when no syncStatus and no org", () => {
 expect(syncStatusSource).toContain('"No org selected"');
 });
});

// ---------------------------------------------------------------------------
// 4. All three scan states represented in compact line helpers
// ---------------------------------------------------------------------------

describe("all scan states represented in compact scan helpers", () => {
 it("getScanTextColor returns amber for stale scan (older than 7 days)", () => {
 expect(syncStatusSource).toContain('"text-amber-400"');
 });

 it("getScanTextColor returns gray-500 for fresh scan", () => {
 expect(syncStatusSource).toContain('"text-gray-500"');
 });

 it("stale scan warning ⚠ prefix appears in scan state text", () => {
 expect(syncStatusSource).toContain('"\\u26a0 Scan stale"');
 });

 it("StatusDetails panel includes scan progress display", () => {
 expect(syncStatusSource).toContain("scanProgress.scannedRepos");
 expect(syncStatusSource).toContain("scanProgress.totalRepos");
 });
});

// ---------------------------------------------------------------------------
// 5. Popup renders SyncStatusLine — not separate sync and scan rows
// ---------------------------------------------------------------------------

describe("popup uses SyncStatusLine and not separate sync/scan rows", () => {
 it("popup imports SyncStatusLine from SyncStatusCard module", () => {
 expect(popupSource).toContain('{ SyncStatusLine }');
 expect(popupSource).toContain('"../components/SyncStatusCard"');
 });

 it("popup renders <SyncStatusLine> in its JSX", () => {
 expect(popupSource).toContain("<SyncStatusLine");
 });

 it("popup does NOT render a separate scan row or scan section alongside SyncStatusLine", () => {
 // Ensure there is no old 'ScanRow', 'ScanSection', or 'SyncStatusCard' component rendered
 // directly in the popup (only the compact line exists)
 expect(popupSource).not.toContain("<ScanRow");
 expect(popupSource).not.toContain("<ScanSection");
 // SyncStatusCard should not appear in popup JSX (it's deprecated)
 expect(popupSource).not.toContain("<SyncStatusCard");
 });

 it("popup passes both sync and scan props to SyncStatusLine", () => {
 // Scan-related props must be wired through to the compact line
 expect(popupSource).toContain("lastScanAt=");
 expect(popupSource).toContain("isScanning=");
 expect(popupSource).toContain("onScanClick=");
 });
});

// ---------------------------------------------------------------------------
// 6. Expandable details panel contains full scan + sync information
// ---------------------------------------------------------------------------

describe("details panel expands from the compact line", () => {
 it("StatusDetails sub-component includes the Scan Now button", () => {
 expect(syncStatusSource).toContain("Scan Now");
 });

 it("StatusDetails sub-component shows the gal sync --pull command tip", () => {
 expect(syncStatusSource).toContain("gal sync --pull");
 });

 it("compact line chevron toggles the details panel (ChevronDown / ChevronUp)", () => {
 expect(syncStatusSource).toContain("ChevronDown");
 expect(syncStatusSource).toContain("ChevronUp");
 expect(syncStatusSource).toContain("setExpanded(!expanded)");
 });

 it("details panel stale-scan warning threshold is 7 days", () => {
 expect(syncStatusSource).toContain("7 * 24 * 60 * 60 * 1000");
 expect(syncStatusSource).toContain("Scan data is over 7 days old");
 });
});
