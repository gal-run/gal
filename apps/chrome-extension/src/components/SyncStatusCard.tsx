import { useState } from "react";
import {
 CheckCircle,
 AlertTriangle,
 Minus,
 Loader2,
 ChevronDown,
 ChevronUp,
 Clock,
 RefreshCw,
} from "lucide-react";
import type { SyncStatus, SyncCopilotHintResponse, ScanProgress } from "../lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a date string as a relative time (e.g., "5m ago", "2h ago"). */
function formatRelativeDate(dateStr: string): string {
 try {
 const date = new Date(dateStr);
 const now = new Date();
 const diffMs = now.getTime() - date.getTime();

 if (diffMs < 60000) return "just now";
 if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
 if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
 const diffDays = Math.floor(diffMs / 86400000);
 if (diffDays < 7) return `${diffDays}d ago`;
 return date.toLocaleDateString();
 } catch {
 return dateStr;
 }
}

/** Format a date string or timestamp (ms) as a relative time for scan freshness. */
function formatScanTime(dateStr: string | number): string {
 try {
 const date = typeof dateStr === "number" ? new Date(dateStr) : new Date(dateStr);
 const now = new Date();
 const diffMs = now.getTime() - date.getTime();
 const diffMin = Math.floor(diffMs / 60000);
 const diffHr = Math.floor(diffMin / 60);
 const diffDays = Math.floor(diffHr / 24);

 if (diffMin < 1) return "just now";
 if (diffMin < 60) return `${diffMin}m ago`;
 if (diffHr < 24) return `${diffHr}h ago`;
 if (diffDays < 7) return `${diffDays}d ago`;
 return date.toLocaleDateString();
 } catch {
 return String(dateStr);
 }
}

function isOlderThan7Days(dateStr: string | number | null | undefined): boolean {
 if (dateStr === undefined) return false;
 if (!dateStr) return true;
 try {
 const date = typeof dateStr === "number" ? new Date(dateStr) : new Date(dateStr);
 const now = new Date();
 return now.getTime() - date.getTime() > 7 * 24 * 60 * 60 * 1000;
 } catch {
 return true;
 }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SyncStatusLineProps {
 syncStatus: SyncStatus | null;
 isLoading?: boolean;
 hasSelectedOrg?: boolean;
 /** Effective last scan timestamp (server or platform, whichever is most recent) */
 lastScanAt: string | number | null;
 scanFreshnessLoaded: boolean;
 /** Sync Copilot hint, if available */
 syncHint: SyncCopilotHintResponse | null;
 /** Callback to trigger a new scan */
 onScanClick: () => void;
 /** Whether a scan is currently in progress */
 isScanning: boolean;
 /** Scan progress data */
 scanProgress: ScanProgress | null;
 /** Scan error message */
 scanError: string | null;
 /** Callback to report the sync copilot hint as incorrect */
 onReportIncorrect?: (hint: SyncCopilotHintResponse) => void;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusIcon({
 syncStatus,
 isLoading,
 hasSelectedOrg,
}: {
 syncStatus: SyncStatus | null;
 isLoading?: boolean;
 hasSelectedOrg?: boolean;
}) {
 if (isLoading || (!syncStatus && hasSelectedOrg)) {
 return <Loader2 className="w-3 h-3 text-gray-400 animate-spin flex-shrink-0" />;
 }
 if (!syncStatus) {
 return <Minus className="w-3 h-3 text-gray-500 flex-shrink-0" />;
 }
 if (syncStatus.driftDetected) {
 return <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />;
 }
 if (syncStatus.synced) {
 return <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />;
 }
 // Not synced
 return <Minus className="w-3 h-3 text-gray-500 flex-shrink-0" />;
}

function getStatusText(syncStatus: SyncStatus | null,
 isLoading?: boolean,
 hasSelectedOrg?: boolean,): string {
 if (isLoading || (!syncStatus && hasSelectedOrg)) {
 return "Checking\u2026";
 }
 if (!syncStatus) {
 return "No org selected";
 }
 if (syncStatus.driftDetected) {
 const count = syncStatus.driftFiles.length;
 return `Drift detected \u00b7 ${count} file${count !== 1 ? "s" : ""}`;
 }
 if (syncStatus.synced) {
 const parts: string[] = ["Synced"];
 if (syncStatus.configVersion) parts.push(`v${syncStatus.configVersion}`);
 return parts.join(" \u00b7 ");
 }
 return "Not synced \u00b7 Run gal sync --pull";
}

function getScanText(lastScanAt: string | number | null,
 scanFreshnessLoaded: boolean,
 isScanning: boolean,): string {
 if (isScanning) return "Scanning\u2026";
 if (!scanFreshnessLoaded) return "";
 if (!lastScanAt) return "No scan data";
 const stale = isOlderThan7Days(lastScanAt);
 if (stale) return "\u26a0 Scan stale";
 return `Scanned ${formatScanTime(lastScanAt)}`;
}

function getScanTextColor(lastScanAt: string | number | null,
 scanFreshnessLoaded: boolean,): string {
 if (!scanFreshnessLoaded || !lastScanAt) return "text-gray-500";
 if (isOlderThan7Days(lastScanAt)) return "text-amber-400";
 return "text-gray-500";
}

// ---------------------------------------------------------------------------
// Expanded details panel
// ---------------------------------------------------------------------------

function StatusDetails({
 syncStatus,
 syncHint,
 lastScanAt,
 scanFreshnessLoaded,
 onScanClick,
 isScanning,
 scanProgress,
 scanError,
 onReportIncorrect,
}: Omit<SyncStatusLineProps, "isLoading" | "hasSelectedOrg">) {
 return (<div className="mt-1 p-2.5 rounded-lg bg-gray-800/50 border border-gray-700 text-xs space-y-2">
 {/* Sync details */}
 {syncStatus && (<div className="space-y-1">
 <div className="flex items-center gap-1.5">
 {syncStatus.synced ? (<CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />) : syncStatus.driftDetected ? (<AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />) : (<Minus className="w-3 h-3 text-gray-500 flex-shrink-0" />)}
 <span className={syncStatus.synced ? "text-green-400" : syncStatus.driftDetected ? "text-amber-400" : "text-gray-400"}>
 {syncStatus.synced ? "Config Synced" : syncStatus.driftDetected ? "Drift Detected" : "Not Synced"}
 </span>
 </div>
 {syncStatus.lastSyncAt && (<p className="text-gray-500 pl-[18px]">
 Last sync: {formatRelativeDate(syncStatus.lastSyncAt)}
 </p>)}
 {syncStatus.configVersion && (<p className="text-gray-500 pl-[18px]">
 Version: v{syncStatus.configVersion}
 </p>)}
 {syncStatus.driftDetected && syncStatus.driftFiles.length > 0 && (<p className="text-gray-400 pl-[18px]">
 {syncStatus.driftFiles.length} file{syncStatus.driftFiles.length !== 1 ? "s" : ""} differ.
 Run <code className="px-1 py-0.5 bg-gray-700 rounded text-xs">gal sync --pull</code> to restore.
 </p>)}
 {!syncStatus.synced && !syncStatus.driftDetected && (<p className="text-gray-500 pl-[18px]">
 Run <code className="px-1 py-0.5 bg-gray-700 rounded text-xs">gal sync --pull</code> to download config.
 </p>)}
 </div>)}

 {/* Sync Copilot hint */}
 {syncHint && (<div className="p-1.5 rounded bg-gal-accent/10 border border-gal-accent/20">
 <div className="flex items-start justify-between gap-1">
 <p className="text-gal-accent">
 Sync Copilot: {syncHint.source}/{syncHint.rolloutMode}
 </p>
 {onReportIncorrect && (<button
 onClick={() => onReportIncorrect(syncHint)}
 className="flex-shrink-0 text-[9px] text-gray-500 hover:text-amber-400 transition-colors px-1 py-0.5 rounded border border-transparent hover:border-amber-400/30"
 title="Report this advice as incorrect"
 >
 Report
 </button>)}
 </div>
 {syncHint.hint.recommendedSequence[0] && (<p className="text-[#ededed] mt-0.5">
 {syncHint.hint.recommendedSequence[0]}
 </p>)}
 </div>)}

 {/* Tip */}
 <p className="text-gray-600">
 Tip: <code className="px-1 py-0.5 bg-gray-700/50 rounded text-xs text-gray-400">gal sync --check</code>
 </p>

 {/* Scan section */}
 <div className="border-t border-gray-700/50 pt-2 space-y-1.5">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-1.5 text-gray-400">
 <Clock className="w-3 h-3" />
 {scanFreshnessLoaded && (lastScanAt ? (<span>Last scan: {formatScanTime(lastScanAt)}</span>) : (<span>No scan data</span>))}
 </div>
 <button
 onClick={(e) => {
 e.stopPropagation();
 onScanClick();
 }}
 disabled={isScanning}
 className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-gal-accent/20 border border-gal-accent/40 text-gal-accent hover:bg-gal-accent/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
 >
 {isScanning ? (<Loader2 className="w-3 h-3 animate-spin" />) : (<RefreshCw className="w-3 h-3" />)}
 {isScanning ? "Scanning\u2026" : "Scan Now"}
 </button>
 </div>

 {/* Scan Progress */}
 {isScanning && scanProgress && (<div className="p-1.5 rounded bg-gal-accent/5 border border-gal-accent/20">
 <div className="flex items-center justify-between text-gal-accent mb-1">
 <span>
 {scanProgress.scannedRepos}/{scanProgress.totalRepos} repos
 </span>
 <span>{scanProgress.elapsedSeconds}s</span>
 </div>
 <div className="w-full h-1 bg-[#141414] rounded-full overflow-hidden">
 <div
 className="h-full bg-gal-accent rounded-full transition-all duration-300"
 style={{ width: `${scanProgress.percentage}%` }}
 />
 </div>
 {scanProgress.currentRepo && (<p className="text-[#737373] mt-0.5 truncate">
 Scanning: {scanProgress.currentRepo}
 </p>)}
 </div>)}

 {/* Scan Error */}
 {scanError && (<div className="p-1.5 rounded bg-red-500/10 border border-red-500/30">
 <p className="text-red-400">{scanError}</p>
 </div>)}

 {/* Stale Scan Alert */}
 {scanFreshnessLoaded && isOlderThan7Days(lastScanAt) && !isScanning && (<div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 flex items-center gap-1.5">
 <AlertTriangle className="w-3 h-3 text-amber-400 flex-shrink-0" />
 <p className="text-amber-300">
 Scan data is over 7 days old. Click &quot;Scan Now&quot; to refresh.
 </p>
 </div>)}
 </div>
 </div>);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Compact single-line sync/scan status indicator (~28px) that expands on click
 * to reveal full details including sync copilot hint, scan button, etc.
 *
 * Replaces the old SyncStatusCard + Sync Copilot hint + Scan row (3 blocks, ~120px).
 */
export function SyncStatusLine({
 syncStatus,
 isLoading,
 hasSelectedOrg,
 lastScanAt,
 scanFreshnessLoaded,
 syncHint,
 onScanClick,
 isScanning,
 scanProgress,
 scanError,
 onReportIncorrect,
}: SyncStatusLineProps) {
 const [expanded, setExpanded] = useState(false);

 const scanText = getScanText(lastScanAt, scanFreshnessLoaded, isScanning);
 const scanColor = getScanTextColor(lastScanAt, scanFreshnessLoaded);

 return (<div className="relative">
 {/* Compact line - always visible */}
 <button
 onClick={() => setExpanded(!expanded)}
 className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-400 hover:bg-gray-800/50 rounded-lg transition-colors"
 >
 <StatusIcon syncStatus={syncStatus} isLoading={isLoading} hasSelectedOrg={hasSelectedOrg} />
 <span className="truncate">{getStatusText(syncStatus, isLoading, hasSelectedOrg)}</span>
 {scanText && (<>
 <span className="text-gray-600 flex-shrink-0">&middot;</span>
 <span className={`flex-shrink-0 ${scanColor}`}>{scanText}</span>
 </>)}
 {expanded ? (<ChevronUp className="w-3 h-3 ml-auto flex-shrink-0 text-gray-600" />) : (<ChevronDown className="w-3 h-3 ml-auto flex-shrink-0 text-gray-600" />)}
 </button>

 {/* Expandable details - shown on click */}
 {expanded && (<StatusDetails
 syncStatus={syncStatus}
 syncHint={syncHint}
 lastScanAt={lastScanAt}
 scanFreshnessLoaded={scanFreshnessLoaded}
 onScanClick={onScanClick}
 isScanning={isScanning}
 scanProgress={scanProgress}
 scanError={scanError}
 onReportIncorrect={onReportIncorrect}
 />)}
 </div>);
}

// ---------------------------------------------------------------------------
// Legacy export (kept for backward compatibility if imported elsewhere)
// ---------------------------------------------------------------------------

/** @deprecated Use SyncStatusLine instead */
export function SyncStatusCard({
 syncStatus,
 isLoading,
 hasSelectedOrg,
}: {
 syncStatus: SyncStatus | null;
 isLoading?: boolean;
 hasSelectedOrg?: boolean;
}) {
 return (<SyncStatusLine
 syncStatus={syncStatus}
 isLoading={isLoading}
 hasSelectedOrg={hasSelectedOrg}
 lastScanAt={null}
 scanFreshnessLoaded={false}
 syncHint={null}
 onScanClick={() => {}}
 isScanning={false}
 scanProgress={null}
 scanError={null}
 />);
}
