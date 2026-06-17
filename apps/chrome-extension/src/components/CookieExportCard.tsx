import { useState } from "react";
import { Shield, Loader2, Check, AlertTriangle } from "lucide-react";
import { createBrowserProfile } from "../lib/api";
import {
 extractBrowserProfileFromTab,
} from "../lib/browser-profile-capture";
import { originPatternFromUrl } from "../lib/host-permissions";

interface CookieExportCardProps {
 /** Whether the user is authenticated */
 isAuthenticated: boolean;
}

type ExportState = "idle" | "extracting" | "naming" | "uploading" | "success" | "error";

/**
 * Card component for exporting browser cookies as a Playwright-compatible
 * storageState and uploading them to the GAL API as a browser profile.
 *
 * Used by background agents to authenticate with websites during automated
 * browser tasks (e.g., Playwright scripts).
 *
 * Fix: Uses URL-based + multi-strategy cookie query instead of
 * hostname-only to capture cookies scoped at the root/registrable domain.
 */
export function CookieExportCard({ isAuthenticated }: CookieExportCardProps) {
 const [state, setState] = useState<ExportState>("idle");
 const [profileName, setProfileName] = useState("");
 const [cookieCount, setCookieCount] = useState(0);
 const [localStorageEntryCount, setLocalStorageEntryCount] = useState(0);
 const [domain, setDomain] = useState("");
 const [scanDomain, setScanDomain] = useState("");
 const [error, setError] = useState<string | null>(null);
 // Store extracted cookies between the extraction and upload steps
 const [extractedState, setExtractedState] = useState<string | null>(null);

 const handleExtract = async () => {
 setError(null);
 setState("extracting");

 try {
 // Request cookies permission on-demand (moved to optional_permissions to reduce install-time footprint)
 const granted = await chrome.permissions.request({ permissions: ["cookies"] });
 if (!granted) {
 throw new Error("Cookie access permission is required to save browser auth.");
 }

 // Get the current active tab URL to extract the domain
 const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
 if (!tab?.url) {
 throw new Error("No active tab URL found");
 }

 const url = new URL(tab.url);
 const tabDomain = url.hostname;
 setDomain(tabDomain);
 setScanDomain(tabDomain);

 const originPattern = originPatternFromUrl(tab.url);
 if (!originPattern) {
 throw new Error("Could not determine site permission pattern.");
 }

 const hasOriginPermission = await chrome.permissions.contains({
 origins: [originPattern],
 });

 if (!hasOriginPermission) {
 // Request permission dynamically for any host
 // This allows capturing browser auth from ANY website
 const grantedOrigin = await chrome.permissions.request({
 origins: [originPattern],
 });
 if (!grantedOrigin) {
 throw new Error(`Site access for ${tabDomain} is required to save browser auth.`,);
 }
 }

 const extraction = await extractBrowserProfileFromTab(tab);
 setCookieCount(extraction.cookieCount);
 setLocalStorageEntryCount(extraction.localStorageEntryCount);
 setExtractedState(extraction.storageState);
 setProfileName(extraction.suggestedName);
 setState("naming");
 } catch (err) {
 setError(err instanceof Error ? err.message : "Failed to extract cookies");
 setState("error");
 }
 };

 const handleUpload = async () => {
 if (!profileName.trim() || !extractedState) return;

 setState("uploading");
 setError(null);

 try {
 const result = await createBrowserProfile({
 name: profileName.trim(),
 domains: [domain],
 storageState: extractedState,
 });

 if (!result.success) {
 throw new Error(result.error || "Upload failed");
 }

 setState("success");
 // Reset after a delay
 setTimeout(() => {
 setState("idle");
 setProfileName("");
 setCookieCount(0);
 setLocalStorageEntryCount(0);
 setDomain("");
 setScanDomain("");
 setExtractedState(null);
 }, 3000);
 } catch (err) {
 setError(err instanceof Error ? err.message : "Failed to upload profile");
 setState("error");
 }
 };

 const handleReset = () => {
 setState("idle");
 setProfileName("");
 setCookieCount(0);
 setLocalStorageEntryCount(0);
 setDomain("");
 setScanDomain("");
 setExtractedState(null);
 setError(null);
 };

 if (!isAuthenticated) return null;

 return (<div className="mt-2 p-2.5 rounded-lg bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]">
 <div className="flex items-center gap-1.5 mb-1.5">
 <Shield className="w-3.5 h-3.5 text-gal-accent" />
 <span className="text-[10px] font-semibold text-[#737373] uppercase tracking-wider">
 Browser Auth
 </span>
 </div>

 {/* Idle state - show extract button */}
 {state === "idle" && (<button
 onClick={handleExtract}
 className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-gal-accent/15 border border-gal-accent/30 text-gal-accent hover:bg-gal-accent/25 transition-colors"
 >
 <Shield className="w-3 h-3" />
 Save Browser Auth
 </button>)}

 {/* Extracting state - show loading spinner and domain being scanned */}
 {state === "extracting" && (<div className="flex items-center gap-2 text-xs text-[#a1a1a1]">
 <Loader2 className="w-3.5 h-3.5 animate-spin text-gal-accent" />
 <span>
 Scanning{scanDomain ? (<> <span className="text-[#ededed]">{scanDomain}</span>…</>) : (" for cookies…")}
 </span>
 </div>)}

 {/* Naming state - prompt for profile name */}
 {state === "naming" && (<div className="space-y-2">
 <p className="text-[10px] text-[#a1a1a1]">
 Found <span className="text-gal-accent font-medium">{cookieCount} {cookieCount === 1 ? "cookie" : "cookies"}</span>
 {localStorageEntryCount > 0 && (<>
 {" "}and <span className="text-gal-accent font-medium">{localStorageEntryCount} local storage {localStorageEntryCount === 1 ? "entry" : "entries"}</span>
 </>)} from{" "}
 <span className="text-[#ededed]">{domain}</span>
 </p>
 <input
 type="text"
 value={profileName}
 onChange={(e) => setProfileName(e.target.value)}
 placeholder="Profile name"
 className="w-full px-2.5 py-1.5 rounded-md text-xs bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.12)] text-[#ededed] placeholder-[#737373] focus:outline-none focus:border-gal-accent/50"
 autoFocus
 onKeyDown={(e) => {
 if (e.key === "Enter" && profileName.trim()) {
 handleUpload();
 }
 }}
 />
 <div className="flex gap-1.5">
 <button
 onClick={handleUpload}
 disabled={!profileName.trim()}
 className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-gal-accent/15 border border-gal-accent/30 text-gal-accent hover:bg-gal-accent/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
 >
 Save Profile
 </button>
 <button
 onClick={handleReset}
 className="px-3 py-1.5 rounded-md text-xs font-medium bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.12)] text-[#a1a1a1] hover:text-[#ededed] transition-colors"
 >
 Cancel
 </button>
 </div>
 </div>)}

 {/* Uploading state */}
 {state === "uploading" && (<div className="flex items-center gap-2 text-xs text-[#a1a1a1]">
 <Loader2 className="w-3.5 h-3.5 animate-spin text-gal-accent" />
 <span>Uploading profile...</span>
 </div>)}

 {/* Success state */}
 {state === "success" && (<div className="flex items-center gap-2 text-xs text-green-400">
 <Check className="w-3.5 h-3.5" />
 <span>Profile saved! Available for background agents.</span>
 </div>)}

 {/* Error state */}
 {state === "error" && (<div className="space-y-1.5">
 <div className="flex items-center gap-1.5 text-xs text-red-400">
 <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
 <span>{error}</span>
 </div>
 <button
 onClick={handleReset}
 className="text-[10px] text-[#737373] hover:text-[#a1a1a1] transition-colors"
 >
 Try again
 </button>
 </div>)}
 </div>);
}
