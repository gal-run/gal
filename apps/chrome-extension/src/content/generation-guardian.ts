/**
 * Generation Guardian
 *
 * Monitors AI generation failures on supported platforms and offers retry.
 * Uses MutationObserver to detect error DOM patterns and per-platform timeouts
 * to surface a non-intrusive toast notification with a Retry button.
 *
 * Stores the last 20 generation attempts in chrome.storage.local under the
 * key "generationAttempts".
 */

import { isContextValid, onContextInvalidated } from "./context-guard";
import { getGalShadowRoot } from "./shadow-host";

// ---- Platform failure detection configuration ----

const FAILURE_PATTERNS: Record<
 string,
 { errorSelectors: string[]; timeoutMs: number }
> = {
 gemini: {
 errorSelectors: [
 "[data-error-message]",
 ".error-container",
 'div[class*="error-message"]',
 'div[class*="failed"]',
 ],
 timeoutMs: 90_000,
 },
 kling: {
 errorSelectors: [
 ".task-failed",
 ".generation-error",
 '[class*="error-state"]',
 ],
 timeoutMs: 300_000,
 },
 "ai-studio": {
 errorSelectors: [
 ".error-banner",
 '[class*="error"]',
 'div[role="alert"]',
 ],
 timeoutMs: 120_000,
 },
};

/** Platforms that Generation Guardian watches. */
const SUPPORTED_PLATFORMS = new Set(Object.keys(FAILURE_PATTERNS));

// ---- Types ----

export interface GenerationAttempt {
 id: string;
 platform: string;
 timestamp: number;
 status: "pending" | "success" | "failed" | "timeout";
 retryCount: number;
}

// ---- Internal state ----

let activeObserver: MutationObserver | null = null;
let activeTimeout: ReturnType<typeof setTimeout> | null = null;
let currentAttempt: GenerationAttempt | null = null;
let activeToast: HTMLElement | null = null;

// ---- Storage helpers ----

const MAX_STORED_ATTEMPTS = 20;
const STORAGE_KEY = "generationAttempts";

async function loadAttempts(): Promise<GenerationAttempt[]> {
 try {
 const result = await chrome.storage.local.get(STORAGE_KEY);
 const raw = result[STORAGE_KEY];
 return Array.isArray(raw) ? (raw as GenerationAttempt[]) : [];
 } catch {
 return [];
 }
}

async function saveAttempt(attempt: GenerationAttempt): Promise<void> {
 try {
 const existing = await loadAttempts();

 // Replace if same id already exists, otherwise prepend
 const idx = existing.findIndex((a) => a.id === attempt.id);
 if (idx !== -1) {
 existing[idx] = attempt;
 } else {
 existing.unshift(attempt);
 }

 // Keep only the most recent MAX_STORED_ATTEMPTS
 const trimmed = existing.slice(0, MAX_STORED_ATTEMPTS);
 await chrome.storage.local.set({ [STORAGE_KEY]: trimmed });
 } catch {
 // Non-critical — best-effort storage
 }
}

// ---- Toast UI ----

function injectGuardianStyles(): void {
 const root = getGalShadowRoot();
 if (root.querySelector("#gal-guardian-styles")) return;
 const style = document.createElement("style");
 style.id = "gal-guardian-styles";
 style.textContent = `
@keyframes galGuardianSlideIn {
 from { opacity: 0; transform: translateY(8px); }
 to { opacity: 1; transform: translateY(0); }
}

#gal-guardian-toast {
 position: fixed;
 bottom: 80px;
 right: 24px;
 z-index: 2147483647;
 background: #1e293b;
 color: #f1f5f9;
 border: 1px solid #ef4444;
 border-radius: 12px;
 padding: 12px 16px;
 font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
 font-size: 13px;
 line-height: 1.5;
 box-shadow: 0 8px 32px rgba(0,0,0,0.35);
 max-width: 320px;
 animation: galGuardianSlideIn 200ms cubic-bezier(0.34,1.56,0.64,1);
 pointer-events: auto;
}

#gal-guardian-toast.gal-guardian-title {
 font-weight: 600;
 color: #fca5a5;
}

#gal-guardian-toast.gal-guardian-sub {
 color: #94a3b8;
 font-size: 12px;
 margin-top: 2px;
}

#gal-guardian-toast.gal-guardian-actions {
 display: flex;
 gap: 8px;
 margin-top: 8px;
}

#gal-guardian-toast.gal-guardian-retry {
 background: #ef4444;
 color: #fff;
 border: none;
 border-radius: 6px;
 padding: 4px 12px;
 font-size: 12px;
 font-weight: 600;
 cursor: pointer;
 line-height: 1.5;
}

#gal-guardian-toast.gal-guardian-retry:hover {
 background: #dc2626;
}

#gal-guardian-toast.gal-guardian-dismiss {
 background: transparent;
 color: #94a3b8;
 border: none;
 font-size: 12px;
 cursor: pointer;
 padding: 4px 8px;
 line-height: 1.5;
}

#gal-guardian-toast.gal-guardian-dismiss:hover {
 color: #f1f5f9;
}
 `;
 root.appendChild(style);
}

function showFailureToast(platform: string, reason: "error" | "timeout"): void {
 removeToast();

 injectGuardianStyles();

 const toast = document.createElement("div");
 toast.id = "gal-guardian-toast";

 const label =
 reason === "timeout"
 ? `Generation timed out on ${platform}`
 : `Generation failed on ${platform}`;
 const sub =
 reason === "timeout"
 ? "The request exceeded the expected duration."
 : "An error was detected in the page.";

 toast.innerHTML = `
 <div style="display:flex;align-items:flex-start;gap:10px">
 <div style="color:#ef4444;font-size:16px;line-height:1">⚠</div>
 <div style="flex:1">
 <div class="gal-guardian-title">${label}</div>
 <div class="gal-guardian-sub">${sub}</div>
 <div class="gal-guardian-actions">
 <button class="gal-guardian-retry">Retry</button>
 <button class="gal-guardian-dismiss">Dismiss</button>
 </div>
 </div>
 </div>
 `;

 getGalShadowRoot().appendChild(toast);
 activeToast = toast;

 const retryBtn = toast.querySelector<HTMLButtonElement>(".gal-guardian-retry");
 const dismissBtn = toast.querySelector<HTMLButtonElement>(".gal-guardian-dismiss");

 retryBtn?.addEventListener("click", () => {
 handleRetry(platform);
 removeToast();
 });

 dismissBtn?.addEventListener("click", () => {
 removeToast();
 });
}

function removeToast(): void {
 if (activeToast) {
 activeToast.remove();
 activeToast = null;
 }
}

// ---- Retry logic ----

/** Platform-specific selectors for native retry buttons. */
const RETRY_BUTTON_SELECTORS: Record<string, string[]> = {
 gemini: [
 'button[aria-label*="retry" i]',
 'button[aria-label*="Regenerate" i]',
 'button[data-test-id*="retry"]',
 ],
 kling: [
 'button[class*="retry"]',
 'button[aria-label*="retry" i]',
 ".task-retry-btn",
 ],
 "ai-studio": [
 'button[aria-label*="retry" i]',
 'button[aria-label*="Regenerate" i]',
 'button[class*="retry"]',
 ],
};

function handleRetry(platform: string): void {
 if (currentAttempt) {
 currentAttempt.retryCount += 1;
 void saveAttempt({...currentAttempt, status: "pending" });
 }

 // 1. Try clicking a native retry / regenerate button
 const selectors = RETRY_BUTTON_SELECTORS[platform] ?? [];
 for (const sel of selectors) {
 const btn = document.querySelector<HTMLButtonElement>(sel);
 if (btn) {
 console.log(`[GAL Guardian] Clicking native retry button: ${sel}`);
 btn.click();
 return;
 }
 }

 // 2. Fallback: find and re-submit the primary prompt form / submit button
 const submitSelectors = [
 'button[type="submit"]',
 'button[aria-label*="submit" i]',
 'button[aria-label*="send" i]',
 'button[data-testid*="submit"]',
 'button[data-testid*="send"]',
 ];

 for (const sel of submitSelectors) {
 const btn = document.querySelector<HTMLButtonElement>(sel);
 if (btn && !btn.disabled) {
 console.log(`[GAL Guardian] Fallback: clicking submit button: ${sel}`);
 btn.click();
 return;
 }
 }

 console.warn("[GAL Guardian] No retry or submit button found.");
}

// ---- Core monitoring ----

function stopMonitorInternal(): void {
 if (activeObserver) {
 activeObserver.disconnect();
 activeObserver = null;
 }
 if (activeTimeout !== null) {
 clearTimeout(activeTimeout);
 activeTimeout = null;
 }
}

function handleFailure(platform: string,
 reason: "error" | "timeout",): void {
 stopMonitorInternal();

 if (currentAttempt) {
 currentAttempt.status = "failed";
 void saveAttempt(currentAttempt);
 }

 console.log(`[GAL Guardian] Failure detected on ${platform}: ${reason}`);
 showFailureToast(platform, reason);
}

/**
 * Start monitoring for generation failures on the given platform.
 *
 * Should be called when the user submits a generation request or when a
 * workflow is injected on a supported platform.
 */
export function startGenerationMonitor(platform: string): void {
 if (!SUPPORTED_PLATFORMS.has(platform)) return;

 // Clean up any previous monitor
 stopMonitorInternal();
 removeToast();

 const config = FAILURE_PATTERNS[platform];
 if (!config) return;

 // Create a new attempt record
 currentAttempt = {
 id: `${platform}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
 platform,
 timestamp: Date.now(),
 status: "pending",
 retryCount: 0,
 };
 void saveAttempt(currentAttempt);

 console.log(`[GAL Guardian] Monitoring started for ${platform}`);

 // Watch for error DOM patterns
 const { errorSelectors } = config;

 const checkForErrors = (): boolean => {
 for (const sel of errorSelectors) {
 const el = document.querySelector(sel);
 if (el) {
 // Only trigger if the element has visible content (avoids hidden placeholders)
 const text = (el as HTMLElement).innerText?.trim() ?? "";
 const rect = (el as HTMLElement).getBoundingClientRect();
 const isVisible = rect.width > 0 || rect.height > 0 || text.length > 0;
 if (isVisible) return true;
 }
 }
 return false;
 };

 // Initial check in case error is already present
 if (checkForErrors()) {
 handleFailure(platform, "error");
 return;
 }

 // MutationObserver — watch for DOM mutations that match error patterns
 activeObserver = new MutationObserver(() => {
 if (!isContextValid()) {
 stopMonitorInternal();
 return;
 }
 if (checkForErrors()) {
 handleFailure(platform, "error");
 }
 });

 activeObserver.observe(document.body, {
 childList: true,
 subtree: true,
 attributes: true,
 attributeFilter: ["class", "data-error-message"],
 });

 // Stop monitor if extension is reloaded while a generation is in progress
 onContextInvalidated(stopMonitorInternal);

 // Platform timeout
 activeTimeout = setTimeout(() => {
 if (!isContextValid()) return;
 // Only fire timeout if still pending (i.e. success was not signalled)
 if (currentAttempt?.status === "pending") {
 handleFailure(platform, "timeout");
 }
 }, config.timeoutMs);
}

/**
 * Stop monitoring and mark the current attempt as successful.
 *
 * Should be called when a success state is detected on the page.
 */
export function stopGenerationMonitor(): void {
 stopMonitorInternal();
 removeToast();

 if (currentAttempt && currentAttempt.status === "pending") {
 currentAttempt.status = "success";
 void saveAttempt(currentAttempt);
 console.log("[GAL Guardian] Generation succeeded, monitor stopped.");
 }
}
