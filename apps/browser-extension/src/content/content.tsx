import { createRoot } from "react-dom/client";
import { useState, useCallback, useEffect, useRef } from "react";
import { WorkflowPalette, LoginPrompt, stripTriggerText } from "./WorkflowPalette";
import { type Command as CommandType } from "../lib/api";
import {
  getStorageData,
  getSessionData,
  getCacheEntry,
  isCacheStale,
  getSyncMetadata,
  getSyncPreference,
  setSyncPreference,
} from "../lib/storage";
import type { SyncMetadata } from "../lib/storage";
import { shouldShowNewBadge } from "./workflow-search";
import { optimizeImage, DEFAULT_OPTIMIZE_OPTIONS } from "./image-optimizer";
import { showOptimizeToast } from "./image-optimizer-ui";
import {
  startGenerationMonitor,
  stopGenerationMonitor,
} from "./generation-guardian";
import {
  initAssetClipboard,
  setAssetClipboardDisabled,
  transferToCurrentPlatform,
  type ClipboardEntry,
} from "./asset-clipboard";
import { getGalShadowRoot } from "./shadow-host";
import { scanPlatformConfig, hasScannerForUrl } from "./scanners";
import { trackEvent, initTelemetry } from "../lib/telemetry";
import { detectPlatform } from "../lib/api";

// Initialize telemetry for content script context (non-blocking)
initTelemetry();

// Track platform detection
{
  const detectedPlatform = detectPlatform(window.location.href);
  if (detectedPlatform) {
    trackEvent("extension.platform_detected", { platform: detectedPlatform });
  }
}

// NOTE: globals.css is intentionally NOT imported here.
// It is only used by the popup (which has its own document).
// All content-script CSS is injected into the Shadow DOM below to
// prevent leaking Tailwind resets / theme variables into host pages.

// Cleanup legacy floating button injected by old extension versions (#gal-extension-root / .gal-floating-button)
// Old content scripts are not automatically terminated when the extension updates in already-open tabs.
// This block removes any leftover legacy DOM elements so they don't appear alongside the new UI.
const legacyRoot = document.getElementById("gal-extension-root");
if (legacyRoot) legacyRoot.remove();
document
  .querySelectorAll(".gal-floating-button")
  .forEach((legacyFloatingButton) => legacyFloatingButton.remove());

// ---- Shadow DOM: inject all GAL styles here (not document.head) ----

const shadowRoot = getGalShadowRoot();

// GAL theme CSS custom properties — scoped to the shadow DOM :host so they
// do NOT leak to the outer page's :root / body.
const themeStyle = document.createElement("style");
themeStyle.textContent = `
:host {
  /* GAL accent palette */
  --gal-accent: #00ff2a;
  --gal-accent-hover: #00cc22;
  --gal-accent-bg: rgba(0, 255, 42, 0.08);
  --gal-accent-border: rgba(0, 255, 42, 0.2);
  --gal-surface-base: #0a0a0a;
  --gal-surface-raised: #141414;
  --gal-surface-overlay: #1a1a1a;
  --gal-surface-overlay-hover: #242424;
  --gal-border-subtle: rgba(255, 255, 255, 0.08);
  --gal-border-default: rgba(255, 255, 255, 0.12);
  --gal-border-strong: rgba(255, 255, 255, 0.2);
  --gal-text-primary: #ededed;
  --gal-text-secondary: #a1a1a1;
  --gal-text-muted: #737373;
  --gal-surface-chip: rgba(255, 255, 255, 0.08);
}
`;
shadowRoot.appendChild(themeStyle);

// Content-script UI styles — all inside shadow DOM
const contentStyle = document.createElement("style");
contentStyle.textContent = `
/* GAL Chrome Extension - Content Script Styles (Shadow DOM isolated) */

/* Reset inherited styles inside shadow DOM so host page CSS does not
   bleed into GAL UI elements. */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.gal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 2147483645;
  animation: fadeIn 0.2s ease;
  pointer-events: auto;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.gal-palette {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  background: #1e293b;
  border: 1px solid #374151;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.2s ease;
  pointer-events: auto;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translate(-50%, -45%);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%);
  }
}

.gal-palette-header {
  padding: 16px;
  border-bottom: 1px solid #374151;
  display: flex;
  align-items: center;
  gap: 12px;
}

.gal-palette-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.gal-palette-footer {
  padding: 12px 16px;
  border-top: 1px solid #374151;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
`;
shadowRoot.appendChild(contentStyle);

// In-field icon styles stay in document.head because the icons are injected
// into the host page DOM (positioned relative to chat input elements).
const infieldStyle = document.createElement("style");
infieldStyle.textContent = `
/* ---- Workflow Injection In-Field Icon ---- */
.gal-infield-icon {
  position: absolute;
  top: 1px;
  right: 8px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2147483644;
  opacity: 1;
  padding: 0;
  pointer-events: auto;
}

.gal-infield-icon:hover {
  transform: scale(1.15);
}

/* ---- GAL In-Field Tooltip ---- */
.gal-infield-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  width: 260px;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 12px;
  z-index: 2147483645;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  pointer-events: auto;
  animation: galTooltipFadeIn 0.15s ease;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

@keyframes galTooltipFadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.gal-infield-tooltip-title {
  font-size: 13px;
  font-weight: 600;
  color: #ededed;
  margin: 0 0 4px 0;
  line-height: 1.3;
}

.gal-infield-tooltip-desc {
  font-size: 11px;
  color: #a1a1a1;
  margin: 0 0 10px 0;
  line-height: 1.4;
}

.gal-infield-tooltip-desc kbd {
  display: inline;
  padding: 1px 4px;
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 3px;
  color: #ededed;
}

.gal-infield-tooltip-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
  margin: 0 0 8px 0;
  border: none;
}

.gal-infield-tooltip-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  width: 100%;
}

.gal-infield-tooltip-toggle-label {
  font-size: 11px;
  color: #a1a1a1;
}

.gal-infield-tooltip-switch {
  position: relative;
  width: 32px;
  height: 18px;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 9px;
  transition: background 0.2s ease;
  flex-shrink: 0;
}

.gal-infield-tooltip-switch[data-checked="true"] {
  background: #00ff2a;
}

.gal-infield-tooltip-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s ease;
}

.gal-infield-tooltip-switch[data-checked="true"]::after {
  transform: translateX(14px);
}

.gal-infield-tooltip-hint {
  font-size: 10px;
  color: #00ff2a;
  margin: 8px 0 0 0;
  line-height: 1.4;
  animation: galTooltipFadeIn 0.15s ease;
}

`;
document.head.appendChild(infieldStyle);

// ---- Workflow Injection Trigger Layer ----

/**
 * Chat input selectors by platform.
 * These target the primary text input on each supported AI platform.
 */
const CHAT_INPUT_SELECTORS = [
  // ChatGPT / Codex Cloud — contentEditable div
  "#prompt-textarea",
  'div[contenteditable="true"][data-placeholder]',
  // Claude
  'div.ProseMirror[contenteditable="true"]',
  // Gemini
  'div.ql-editor[contenteditable="true"]',
  'rich-textarea div[contenteditable="true"]',
  // AI Studio
  'textarea[aria-label="Enter a prompt"]',
  // Jules (jules.google.com) — ProseMirror inside Angular custom element
  "swebot-prompt-editor .ProseMirror",
  // Jules fallback
  'textarea[name="q"]',
  // Kling AI
  '.tiptap.ProseMirror[contenteditable="true"]',
  // Higgsfield AI
  'textarea[placeholder*="prompt" i]',
  // Generic fallback
  'textarea[placeholder*="message"]',
  'textarea[placeholder*="Message"]',
  'div[contenteditable="true"][role="textbox"]',
].join(", ");

// ---- WorkflowPaletteHost — mounts WorkflowPalette and exposes an imperative open() ----

/**
 * Poll chrome.storage.local for a key until it has a non-null value or the
 * deadline is reached. Used as a cold-start fallback when selectedOrg has not
 * yet been written by the service worker.
 */
async function waitForStorage(
  key: string,
  timeoutMs: number,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await getStorageData(
      key as Parameters<typeof getStorageData>[0],
    );
    if (value) return value as string;
    await new Promise<void>((r) => setTimeout(r, 200));
  }
  return null;
}

/**
 * Imperative handles for opening/closing the workflow palette from outside React.
 * Set by the WorkflowPaletteHost component via useEffect.
 */
let openWorkflowPalette: (
  anchor: HTMLElement | null,
  triggerText?: string,
) => void = () => {};

let closeWorkflowPalette: () => void = () => {};

let isWorkflowPaletteOpen: () => boolean = () => false;

/** Returns true when the palette is currently in text-trigger (passive) mode. */
let isTriggeredByText: () => boolean = () => false;

/**
 * Imperative handle to open the login prompt overlay (shown to unauthenticated users).
 * Set by the LoginPromptHost component via useEffect.
 */
let openLoginPrompt: () => void = () => {};

/**
 * Auth-gated wrapper around openWorkflowPalette.
 * Checks chrome.storage.session for an authToken before opening the palette.
 * If the user is NOT authenticated, shows a minimal sign-in prompt instead.
 */
async function tryOpenWorkflowPalette(
  anchor: HTMLElement | null,
  triggerText?: string,
): Promise<void> {
  const token = await getSessionData("authToken");
  if (!token) {
    openLoginPrompt();
    return;
  }
  openWorkflowPalette(anchor, triggerText);
}

function WorkflowPaletteHost() {
  const [commands, setCommands] = useState<CommandType[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [triggerText, setTriggerText] = useState<string | undefined>(undefined);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [syncMeta, setSyncMeta] = useState<SyncMetadata | null>(null);
  const [triggeredByText, setTriggeredByText] = useState(false);
  // Ref mirrors triggeredByText so it is readable synchronously in the
  // imperative openWorkflowPalette handler (before React re-renders).
  const triggeredByTextRef = useRef(false);
  const currentOrgRef = useRef<string | null>(null);

  /**
   * Cache-first command loading (read-only).
   * The content script NEVER writes to cachedCommands — only the service
   * worker owns that cache key (single-writer architecture).
   * When the cache is stale or missing, we send REFRESH_COMMANDS to the
   * service worker and wait for the storage change to arrive.
   */
  const loadCommandsCached = useCallback(async () => {
    let orgName =
      currentOrgRef.current ?? (await getStorageData("selectedOrg")) ?? null;
    if (!orgName) {
      // Cold-start fallback: ask the service worker to prefetch, then wait
      // up to 3 s for selectedOrg to be populated.
      setIsFetching(true);
      try {
        chrome.runtime.sendMessage({ type: "PREFETCH_COMMANDS" });
      } catch (_) {
        // Service worker may be waking up — ignore
      }
      orgName = await waitForStorage("selectedOrg", 3000);
      setIsFetching(false);
      if (!orgName) {
        // Genuinely unauthenticated or no org configured
        setCommands([]);
        return;
      }
    }

    currentOrgRef.current = orgName;
    setOrgName(orgName);

    // Load sync metadata for this org
    const meta = await getSyncMetadata(orgName);
    if (meta) {
      // If cache is stale, reflect that in the displayed state
      const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
      if (isOffline && meta.syncState !== "error") {
        setSyncMeta({ ...meta, syncState: "offline" });
      } else if (
        meta.syncState === "fresh" &&
        meta.lastSuccessAt &&
        isCacheStale(meta.lastSuccessAt)
      ) {
        setSyncMeta({ ...meta, syncState: "stale" });
      } else {
        setSyncMeta(meta);
      }
    }

    const cachedCmds = await getCacheEntry<Record<string, CommandType[]>>(
      "cachedCommands",
      "cachedCommandsTimestamp",
    );

    if (cachedCmds && cachedCmds.data[orgName]) {
      setCommands(cachedCmds.data[orgName]);
      setIsFetching(false);
      if (isCacheStale(cachedCmds.timestamp)) {
        // Ask service worker to refresh — it will write to storage, and
        // our onChanged listener will pick up the update.
        try {
          chrome.runtime.sendMessage({ type: "REFRESH_COMMANDS", orgName });
        } catch (_) {
          // Service worker may be waking up
        }
      }
    } else {
      // No cached data for this org — ask the service worker to fetch.
      setIsFetching(true);
      try {
        chrome.runtime.sendMessage({ type: "REFRESH_COMMANDS", orgName });
      } catch (_) {
        // Service worker may be waking up
      }
    }
  }, []);

  // Listen for storage changes to selectedOrg and cachedCommands.
  // Only update the UI when the CURRENT org's commands actually changed
  // (single-writer architecture).
  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (Object.prototype.hasOwnProperty.call(changes, "selectedOrg")) {
        const newOrg = changes.selectedOrg.newValue as string | undefined;
        if (newOrg && newOrg !== currentOrgRef.current) {
          currentOrgRef.current = newOrg;
          setOrgName(newOrg);
          // Immediately show cached commands for the new org if available,
          // otherwise clear stale commands so the palette never shows the
          // previous org's workflows.
          (async () => {
            const cached = await getCacheEntry<Record<string, CommandType[]>>(
              "cachedCommands",
              "cachedCommandsTimestamp",
            );
            if (cached && cached.data[newOrg]) {
              setCommands(cached.data[newOrg]);
            } else {
              // No cached data for new org — clear to prevent stale display
              setCommands([]);
              setIsFetching(true);
            }
            // Trigger background refresh for freshness
            loadCommandsCached();
          })();
        }
      }

      if (Object.prototype.hasOwnProperty.call(changes, "cachedCommands")) {
        const orgName = currentOrgRef.current;
        if (!orgName) return;

        // Parse new and old values to check if THIS org's commands changed
        try {
          const newRaw = changes.cachedCommands.newValue as string | undefined;
          const oldRaw = changes.cachedCommands.oldValue as string | undefined;
          if (newRaw) {
            const newCache = JSON.parse(newRaw) as Record<
              string,
              CommandType[]
            >;
            const newCmds = newCache[orgName];
            if (newCmds) {
              // Only update if the commands for this org actually differ
              const oldCache = oldRaw
                ? (JSON.parse(oldRaw) as Record<string, CommandType[]>)
                : {};
              const oldCmds = oldCache[orgName];
              const newJson = JSON.stringify(newCmds);
              const oldJson = oldCmds ? JSON.stringify(oldCmds) : "";
              if (newJson !== oldJson) {
                setCommands(newCmds);
              }
              // Commands arrived for this org — clear loading state
              setIsFetching(false);
            }
          }
        } catch {
          // Fallback: reload from cache on parse error
          loadCommandsCached();
        }
      }

      // Sync metadata changes — update palette footer status
      if (Object.prototype.hasOwnProperty.call(changes, "cachedSyncMetadata")) {
        const orgName = currentOrgRef.current;
        if (!orgName) return;
        try {
          const newRaw = changes.cachedSyncMetadata.newValue as
            | string
            | undefined;
          if (newRaw) {
            const allMeta = JSON.parse(newRaw) as Record<string, SyncMetadata>;
            const meta = allMeta[orgName];
            if (meta) {
              const isOffline =
                typeof navigator !== "undefined" && !navigator.onLine;
              if (isOffline && meta.syncState !== "error") {
                setSyncMeta({ ...meta, syncState: "offline" });
              } else {
                setSyncMeta(meta);
              }
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    };
    chrome.storage.local.onChanged.addListener(handleStorageChange);
    return () =>
      chrome.storage.local.onChanged.removeListener(handleStorageChange);
  }, [loadCommandsCached]);

  // Expose imperative open/close/isOpen handles so non-React code can control the palette
  useEffect(() => {
    openWorkflowPalette = (
      newAnchor: HTMLElement | null,
      newTriggerText?: string,
    ) => {
      // Always refresh commands on open (fix for stale workflow palette — )
      loadCommandsCached();
      setAnchor(newAnchor ?? null);
      setTriggerText(newTriggerText);
      // Track whether this open was triggered by the // text shortcut.
      // When triggerText is provided, the palette was opened via typing //,
      // so we run in passive mode (no focus steal, query synced from triggerText).
      const byText = newTriggerText !== undefined;
      triggeredByTextRef.current = byText;
      setTriggeredByText(byText);
      setIsOpen(true);
    };
    closeWorkflowPalette = () => {
      setIsOpen(false);
      setAnchor(null);
      setTriggerText(undefined);
      triggeredByTextRef.current = false;
      setTriggeredByText(false);
    };
    isWorkflowPaletteOpen = () => isOpen;
    isTriggeredByText = () => triggeredByTextRef.current;
    return () => {
      openWorkflowPalette = () => {};
      closeWorkflowPalette = () => {};
      isWorkflowPaletteOpen = () => false;
      isTriggeredByText = () => false;
    };
  }, [loadCommandsCached, isOpen]);

  const handleClose = useCallback(() => {
    // Strip the // trigger text from the input before clearing state
    if (anchor && triggerText) {
      stripTriggerText(anchor, triggerText);
    }
    // Restore focus to the chat input
    if (anchor) {
      anchor.focus();
    }
    setIsOpen(false);
    setAnchor(null);
    setTriggerText(undefined);
    triggeredByTextRef.current = false;
    setTriggeredByText(false);
  }, [anchor, triggerText]);

  /** Manual retry: ask the service worker to re-fetch */
  const handleRetry = useCallback(() => {
    const org = currentOrgRef.current;
    if (!org) return;
    setIsFetching(true);
    try {
      chrome.runtime.sendMessage({ type: "REFRESH_COMMANDS", orgName: org });
    } catch (_) {
      // Service worker may be waking up
    }
  }, []);

  return (
    <WorkflowPalette
      commands={commands}
      isOpen={isOpen}
      isFetching={isFetching}
      onClose={handleClose}
      anchorElement={anchor}
      triggerText={triggerText}
      orgName={orgName ?? undefined}
      syncMetadata={syncMeta}
      onRetry={handleRetry}
      triggeredByText={triggeredByText}
    />
  );
}

/**
 * LoginPromptHost — mounts the LoginPrompt component inside the Shadow DOM
 * and exposes imperative open/close handles for non-React code.
 */
function LoginPromptHost() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    openLoginPrompt = () => setIsOpen(true);
    return () => {
      openLoginPrompt = () => {};
    };
  }, []);

  const handleClose = useCallback(() => setIsOpen(false), []);

  return <LoginPrompt isOpen={isOpen} onClose={handleClose} />;
}

// Mount the WorkflowPaletteHost inside the Shadow DOM
const paletteContainer = document.createElement("div");
paletteContainer.id = "gal-palette-root";
shadowRoot.appendChild(paletteContainer);
const paletteRoot = createRoot(paletteContainer);
paletteRoot.render(<WorkflowPaletteHost />);

// Mount the LoginPromptHost inside the Shadow DOM
const loginPromptContainer = document.createElement("div");
loginPromptContainer.id = "gal-login-prompt-root";
shadowRoot.appendChild(loginPromptContainer);
const loginPromptRoot = createRoot(loginPromptContainer);
loginPromptRoot.render(<LoginPromptHost />);

// ---- Trigger 1: Double-slash (//) detection ----

let lastInputValue = "";

/**
 * Get the text value of a chat input element.
 */
function getInputText(el: HTMLElement): string {
  if ("value" in el) {
    return (el as HTMLInputElement | HTMLTextAreaElement).value;
  }
  return el.textContent ?? "";
}

/**
 * Monitor input events on the document for the // trigger.
 * When the user types //, open the workflow palette with the input element
 * as the anchor. Any text after // becomes the initial search query.
 */
document.addEventListener(
  "input",
  (e) => {
    const target = e.target as HTMLElement;
    if (!target) return;

    // Only react to known chat input elements
    if (!target.matches(CHAT_INPUT_SELECTORS)) return;

    const currentValue = getInputText(target);
    const prevValue = lastInputValue;
    lastInputValue = currentValue;

    // Detect // being typed: look for // at the current cursor position
    // or at the end of the text
    const slashIdx = currentValue.lastIndexOf("//");

    // If the // was deleted and the palette is open in text-trigger mode, close it.
    if (slashIdx === -1) {
      if (isWorkflowPaletteOpen() && isTriggeredByText()) {
        closeWorkflowPalette();
      }
      return;
    }

    // Only trigger if // was just typed (wasn't in previous value at that position)
    const prevSlashIdx = prevValue.lastIndexOf("//");
    if (prevSlashIdx === slashIdx && prevValue.length <= currentValue.length) {
      // // position hasn't changed and text didn't shrink — user is continuing
      // to type after // (e.g. "//foo" → "//foob"). If the palette is already
      // open in text-trigger mode, update the triggerText so the search query
      // stays in sync. Do this by re-opening with the updated text; the host
      // handles this gracefully (just updates state without re-opening a new
      // palette instance).
      if (isWorkflowPaletteOpen() && isTriggeredByText()) {
        const afterSlash = currentValue.substring(slashIdx + 2);
        const updatedTriggerText = "//" + afterSlash;
        tryOpenWorkflowPalette(target, updatedTriggerText);
      }
      return;
    }

    // Extract query after //
    const afterSlash = currentValue.substring(slashIdx + 2);
    const triggerText = "//" + afterSlash;

    tryOpenWorkflowPalette(target, triggerText);
  },
  true,
);

// ---- Trigger 2: In-field icon injection ----

const iconRegistry = new WeakSet<HTMLElement>();

/** Cached preference — updated via chrome.storage.sync listener */
let inFieldButtonDisabled = false;

// Load initial preference
getSyncPreference("inFieldButtonDisabled").then((val) => {
  inFieldButtonDisabled = val === true;
  setAssetClipboardDisabled(inFieldButtonDisabled);
  // If disabled on load, remove any already-injected icons
  if (inFieldButtonDisabled) {
    document.querySelectorAll<HTMLElement>(".gal-infield-icon").forEach((el) => {
      el.style.display = "none";
    });
  }
});

// Listen for preference changes (from popup or tooltip toggle)
chrome.storage.sync.onChanged.addListener((changes) => {
  if (Object.prototype.hasOwnProperty.call(changes, "inFieldButtonDisabled")) {
    inFieldButtonDisabled = changes.inFieldButtonDisabled.newValue === true;
    setAssetClipboardDisabled(inFieldButtonDisabled);
    // Immediately show/hide all existing icons
    document.querySelectorAll<HTMLElement>(".gal-infield-icon").forEach((el) => {
      el.style.display = inFieldButtonDisabled ? "none" : "flex";
    });
    // Remove open tooltips when disabling — except pinned ones showing the
    // re-enable hint (they self-remove after 2 seconds).
    if (inFieldButtonDisabled) {
      document
        .querySelectorAll<HTMLElement>(".gal-infield-tooltip")
        .forEach((el) => {
          if (el.dataset.pinned !== "true") el.remove();
        });
    }
  }
});

/**
 * Create a rich tooltip element for the GAL in-field button.
 * Contains title, description, and a disable toggle.
 */
function createTooltip(_iconEl: HTMLElement): HTMLDivElement {
  const tooltip = document.createElement("div");
  tooltip.className = "gal-infield-tooltip";

  const title = document.createElement("p");
  title.className = "gal-infield-tooltip-title";
  title.textContent = "GAL Workflow Palette";

  const desc = document.createElement("p");
  desc.className = "gal-infield-tooltip-desc";
  desc.innerHTML =
    'Quickly insert org-approved workflows into your prompt. Trigger with <kbd>//</kbd> or <kbd>Cmd+Shift+G</kbd>.';

  const divider = document.createElement("hr");
  divider.className = "gal-infield-tooltip-divider";

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "gal-infield-tooltip-toggle";

  const label = document.createElement("span");
  label.className = "gal-infield-tooltip-toggle-label";
  label.textContent = "Show this button";

  const switchEl = document.createElement("span");
  switchEl.className = "gal-infield-tooltip-switch";
  switchEl.dataset.checked = "true";

  toggleBtn.appendChild(label);
  toggleBtn.appendChild(switchEl);

  // Toggle click handler
  toggleBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  toggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isCurrentlyEnabled = switchEl.dataset.checked === "true";
    const newDisabled = isCurrentlyEnabled;
    switchEl.dataset.checked = newDisabled ? "false" : "true";
    // Persist to chrome.storage.sync — the onChanged listener will handle visibility
    setSyncPreference("inFieldButtonDisabled", newDisabled);
    trackEvent("extension.button_toggled", { button_enabled: !newDisabled });
    if (newDisabled) {
      // Show re-enable hint before hiding — mark tooltip as pinned
      // so the hover hide timer cannot remove it early.
      tooltip.dataset.pinned = "true";
      const hint = document.createElement("p");
      hint.className = "gal-infield-tooltip-hint";
      hint.textContent =
        "To re-enable, click the GAL icon in the Chrome toolbar";
      tooltip.appendChild(hint);
      setTimeout(() => tooltip.remove(), 2000);
    } else {
      tooltip.remove();
    }
  });

  tooltip.appendChild(title);
  tooltip.appendChild(desc);
  tooltip.appendChild(divider);
  tooltip.appendChild(toggleBtn);

  // Prevent tooltip interactions from bubbling to the chat input
  tooltip.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  return tooltip;
}

/**
 * Create and inject a small GAL icon at the bottom-right of a chat input.
 * The icon appears on focus and disappears on blur.
 */
function injectInFieldIcon(input: HTMLElement): void {
  if (iconRegistry.has(input)) return;
  iconRegistry.add(input);

  // Walk up the DOM to find a suitable positioned ancestor for the icon.
  // We need a container that:
  //   1. Has a non-zero bounding box (is visible), AND
  //   2. Does NOT have overflow:hidden that would clip the absolutely-positioned icon.
  // If no suitable ancestor is found within 5 levels, fall back to the immediate parent.
  let anchor: HTMLElement | null = input.parentElement;
  if (!anchor) return;

  let candidate: HTMLElement | null = input.parentElement;
  for (let i = 0; i < 5 && candidate; i++) {
    const cs = getComputedStyle(candidate);
    const rect = candidate.getBoundingClientRect();
    const hasSize = rect.width > 0 && rect.height > 0;
    const clips =
      cs.overflow === "hidden" ||
      cs.overflowX === "hidden" ||
      cs.overflowY === "hidden";
    if (hasSize && !clips) {
      anchor = candidate;
      break;
    }
    candidate = candidate.parentElement;
  }

  // Guard against duplicate injection: if the chosen anchor already contains an icon,
  // skip re-injection. This prevents the MutationObserver from adding a second icon
  // when Angular (Gemini) moves the button DOM node, which triggers childList mutations.
  if (anchor.querySelector(".gal-infield-icon")) return;

  // Ensure the chosen anchor container is positioned so absolute children anchor correctly
  const anchorPosition = getComputedStyle(anchor).position;
  if (anchorPosition === "static") {
    anchor.style.position = "relative";
  }

  const icon = document.createElement("button");
  icon.className = "gal-infield-icon";
  // Remove basic title — tooltip replaces it
  icon.setAttribute("aria-label", "Open GAL workflow palette");

  // Avoid overlapping native buttons already present in the top-right of the
  // anchor (e.g. the download button on Google AI Studio — issue ).
  // Measure all existing buttons and button-like elements inside the anchor
  // that sit in the top-right quadrant and shift our icon leftward so it
  // sits ADJACENT to them rather than on top of them.
  {
    const anchorRect = anchor.getBoundingClientRect();
    const nativeButtons = anchor.querySelectorAll<HTMLElement>(
      "button:not(.gal-infield-icon), [role='button']:not(.gal-infield-icon)",
    );
    // Icon size + gap constant (px) used to place our icon just left of theirs
    const GAL_ICON_SIZE = 22;
    const GAL_ICON_GAP = 4;
    // Find the leftmost right-edge among native buttons that overlap the
    // same top region as our icon (top 40 % of the anchor height).
    const topThreshold = anchorRect.top + anchorRect.height * 0.4;
    let minLeft = Infinity;
    for (const btn of nativeButtons) {
      const btnRect = btn.getBoundingClientRect();
      // Only consider buttons that are:
      //  - visible (non-zero size)
      //  - within the right half of the anchor
      //  - within the top portion of the anchor
      if (
        btnRect.width > 0 &&
        btnRect.height > 0 &&
        btnRect.left >= anchorRect.left + anchorRect.width * 0.4 &&
        btnRect.top < topThreshold
      ) {
        if (btnRect.left < minLeft) {
          minLeft = btnRect.left;
        }
      }
    }
    if (minLeft !== Infinity) {
      // How far from the right edge of the anchor is the leftmost native button?
      const nativeButtonRightOffset = anchorRect.right - minLeft;
      // Place our icon just to the left of that native button
      const galRight = nativeButtonRightOffset + GAL_ICON_SIZE + GAL_ICON_GAP;
      icon.style.right = `${galRight}px`;
    }
  }
  icon.innerHTML = `<svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block">
  <rect width="36" height="36" rx="8" fill="black"/>
  <path d="M8 12L18 6L28 12V18L18 12L8 18V12Z" fill="#00FF2A"/>
  <path d="M8 18L18 12L28 18V24L18 18L8 24V18Z" fill="#00FF2A" fill-opacity="0.6"/>
  <path d="M8 24L18 18L28 24V30L18 24L8 30V24Z" fill="#00FF2A" fill-opacity="0.3"/>
</svg>`;

  // If button is currently disabled, hide it immediately
  if (inFieldButtonDisabled) {
    icon.style.display = "none";
  }

  // ---- Tooltip hover logic (400ms delay) ----
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;
  let activeTooltip: HTMLDivElement | null = null;

  function showTooltip() {
    // Don't show tooltip if the palette is already open
    if (isWorkflowPaletteOpen()) return;
    // Remove any existing tooltip first
    hideTooltip();
    activeTooltip = createTooltip(icon);
    // Keep tooltip visible while hovering over it
    activeTooltip.addEventListener("mouseenter", cancelHideTooltip);
    activeTooltip.addEventListener("mouseleave", scheduleHideTooltip);
    anchor!.appendChild(activeTooltip);
  }

  function hideTooltip() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    if (activeTooltip) {
      // Don't remove if pinned (showing re-enable hint)
      if (activeTooltip.dataset.pinned === "true") return;
      activeTooltip.remove();
      activeTooltip = null;
    }
  }

  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleHideTooltip() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      hideTooltip();
    }, 300);
  }

  function cancelHideTooltip() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  icon.addEventListener("mouseenter", () => {
    cancelHideTooltip();
    hoverTimer = setTimeout(showTooltip, 400);
  });

  icon.addEventListener("mouseleave", () => {
    scheduleHideTooltip();
  });

  // Hide tooltip when leaving the anchor entirely (safety net)
  anchor.addEventListener("mouseleave", () => {
    scheduleHideTooltip();
  });

  // Intercept mousedown BEFORE Angular/framework can treat it as cursor movement.
  // preventDefault() prevents the browser from changing focus (no focusout) and
  // prevents Angular from moving the button into the contenteditable div on Gemini.
  icon.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  icon.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Hide tooltip on click
    hideTooltip();
    if (isWorkflowPaletteOpen()) {
      closeWorkflowPalette();
    } else {
      tryOpenWorkflowPalette(input);
    }
  });

  anchor.appendChild(icon);
}

/**
 * Scan the page for chat inputs and inject in-field icons.
 * Skips injection when the user has disabled the in-field button.
 */
function scanForChatInputs(): void {
  // If user disabled the button, don't inject new icons (existing ones are
  // already hidden via the storage listener). New icons from this scan would
  // also be hidden immediately, but skipping entirely is cleaner.
  if (inFieldButtonDisabled) return;

  const inputs = document.querySelectorAll<HTMLElement>(CHAT_INPUT_SELECTORS);
  inputs.forEach(injectInFieldIcon);
}

// Initial scan + periodic re-scan for SPAs that dynamically add inputs
scanForChatInputs();
const chatInputObserver = new MutationObserver(() => {
  scanForChatInputs();
});
chatInputObserver.observe(document.body, { childList: true, subtree: true });

// ---- Message Bridge: INSERT_WORKFLOW_TEXT from popup ----

/**
 * Listen for INSERT_WORKFLOW_TEXT messages sent by the popup's CommandCard.
 * Finds the focused chat input (or the first detected one) and injects the
 * text using execCommand so the editor's own event handlers fire correctly.
 */
chrome.runtime.onMessage.addListener((message) => {
  if (
    message.type === "INSERT_WORKFLOW_TEXT" &&
    typeof message.content === "string"
  ) {
    const text: string = message.content;

    // Prefer the currently focused element if it matches a known chat input
    const active = document.activeElement as HTMLElement | null;
    let target: HTMLElement | null = null;
    if (active?.matches(CHAT_INPUT_SELECTORS)) {
      target = active;
    } else {
      target = document.querySelector<HTMLElement>(CHAT_INPUT_SELECTORS);
    }

    if (!target) {
      console.warn(
        "[GAL] INSERT_WORKFLOW_TEXT: no chat input found on this page",
      );
      return;
    }

    target.focus();
    const inserted = document.execCommand("insertText", false, text);
    if (!inserted) {
      // execCommand may be unsupported in some contexts; fall back to
      // dispatching a native input event with the full value set.
      if ("value" in target) {
        const el = target as HTMLInputElement | HTMLTextAreaElement;
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        el.value = el.value.slice(0, start) + text + el.value.slice(end);
        el.selectionStart = el.selectionEnd = start + text.length;
      } else {
        // contentEditable fallback
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
});

// ---- Trigger 3: Cmd+Shift+G global keyboard shortcut ----

// Listen for the Chrome commands API shortcut — toggle behaviour
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "OPEN_WORKFLOW_PALETTE") {
    if (isWorkflowPaletteOpen()) {
      closeWorkflowPalette();
      return;
    }
    // Find the active chat input, or fall back to the first detected one
    const active = document.activeElement as HTMLElement;
    let anchor: HTMLElement | null = null;
    if (active?.matches(CHAT_INPUT_SELECTORS)) {
      anchor = active;
    } else {
      anchor = document.querySelector<HTMLElement>(CHAT_INPUT_SELECTORS);
    }
    tryOpenWorkflowPalette(anchor);
  }
});

// Also support Cmd+Shift+G as a direct keydown listener (fallback if
// Chrome commands API is not configured or for dev convenience) — toggle behaviour
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toUpperCase() === "G") {
    e.preventDefault();
    if (isWorkflowPaletteOpen()) {
      closeWorkflowPalette();
      return;
    }
    const active = document.activeElement as HTMLElement;
    let anchor: HTMLElement | null = null;
    if (active?.matches(CHAT_INPUT_SELECTORS)) {
      anchor = active;
    } else {
      anchor = document.querySelector<HTMLElement>(CHAT_INPUT_SELECTORS);
    }
    tryOpenWorkflowPalette(anchor);
  }
});

// ---- Discoverability: NEW badge for first 3 sessions ----
shouldShowNewBadge()
  .then((show) => {
    if (show) {
      try {
        chrome.action.setBadgeText({ text: "NEW" });
        chrome.action.setBadgeBackgroundColor({ color: "#00ff41" });
      } catch {
        // chrome.action may not be available in content scripts in all contexts
      }
    }
  })
  .catch(() => {
    // Non-critical
  });

// ---- Codex Cloud context detection for chatgpt.com/codex ----

/**
 * Detect whether the user is on the Codex Cloud sub-path (/codex) of chatgpt.com.
 * When the platform context changes (entering or leaving /codex), emit a
 * PLATFORM_CONTEXT_CHANGED message so the popup can update its badge.
 */
let lastDetectedPlatform: string | null = null;

function detectCodexCloudContext(): void {
  if (!location.hostname.includes("chatgpt.com")) return;

  const isCodexCloud = location.pathname.startsWith("/codex");
  const currentPlatform = isCodexCloud ? "codex-cloud" : "chatgpt";

  if (currentPlatform !== lastDetectedPlatform) {
    lastDetectedPlatform = currentPlatform;
    chrome.runtime
      .sendMessage({
        type: "PLATFORM_CONTEXT_CHANGED",
        platform: currentPlatform,
      })
      .catch(() => {
        // Popup may not be open -- this is expected
      });
  }
}

// Run Codex Cloud detection on initial load
detectCodexCloudContext();

// ---- Active GPT Detection for chatgpt.com/g/{id} pages ----

/**
 * Detect active GPT from the current URL and page content.
 * Stores the detected GPT info in Chrome storage and emits a GPT_DETECTED message.
 */
function detectActiveGpt(): void {
  // Only run on chatgpt.com
  if (!location.hostname.includes("chatgpt.com")) return;

  const gptMatch = location.pathname.match(/\/g\/(g-[a-zA-Z0-9]+)/);
  const gptId = gptMatch?.[1];

  if (gptId) {
    // Read GPT name from page title or heading
    const gptName =
      document.title.replace(/ - ChatGPT$/i, "").trim() ||
      document.querySelector("h1")?.textContent?.trim() ||
      gptId;

    const gptInfo = {
      platform: "chatgpt" as const,
      gptId,
      gptName,
      detectedAt: Date.now(),
    };

    chrome.storage.session.set({ activeGpt: JSON.stringify(gptInfo) }).catch(() => {});
    chrome.runtime.sendMessage({ type: "GPT_DETECTED", gptInfo }).catch(() => {
      // Popup may not be open -- this is expected
    });
  } else {
    // Not on a GPT page -- clear any previous detection
    chrome.storage.session.set({ activeGpt: JSON.stringify(null) }).catch(() => {});
  }
}

// Run detection on initial load
detectActiveGpt();

// Monitor SPA route changes (ChatGPT is an SPA)
let lastPathname = location.pathname;

const gptRouteObserver = new MutationObserver(() => {
  if (location.pathname !== lastPathname) {
    lastPathname = location.pathname;
    // Small delay to let the page title update after navigation
    setTimeout(detectActiveGpt, 300);
    // Also re-evaluate Codex Cloud context on route change
    detectCodexCloudContext();
  }
});

gptRouteObserver.observe(document.body, { childList: true, subtree: true });

// Also listen for popstate (browser back/forward)
window.addEventListener("popstate", () => {
  lastPathname = location.pathname;
  setTimeout(detectActiveGpt, 300);
  detectCodexCloudContext();
  setTimeout(detectActiveGem, 300);
});

// ---- Active Gem Detection for gemini.google.com/gem/{id} pages ----

/**
 * Detect active Gem from the current URL and page content.
 * Stores the detected Gem info in Chrome storage and emits a GEM_DETECTED message.
 */
function detectActiveGem(): void {
  // Only run on gemini.google.com
  if (!location.hostname.includes("gemini.google.com")) return;

  const gemMatch = location.pathname.match(/\/gem\/([^/?]+)/);
  const gemId = gemMatch?.[1];

  if (gemId) {
    // Read Gem name from page heading or title
    const gemName =
      document.querySelector("h1, [data-gem-title]")?.textContent?.trim() ||
      document.title.replace(/ - Gemini$/i, "").trim() ||
      gemId;

    const gemInfo = {
      platform: "gemini" as const,
      gemId,
      gemName,
      detectedAt: Date.now(),
    };

    chrome.storage.session.set({ activeGem: JSON.stringify(gemInfo) }).catch(() => {});
    chrome.runtime.sendMessage({ type: "GEM_DETECTED", gemInfo }).catch(() => {
      // Popup may not be open -- this is expected
    });
  } else {
    // Not on a Gem page -- clear any previous detection
    chrome.storage.session.set({ activeGem: JSON.stringify(null) }).catch(() => {});
  }
}

// Run Gem detection on initial load
detectActiveGem();

// Monitor SPA route changes for Gemini (reuses gptRouteObserver's lastPathname tracking)
const gemRouteObserver = new MutationObserver(() => {
  if (location.pathname !== lastPathname) {
    // Small delay to let the page title update after navigation
    setTimeout(detectActiveGem, 300);
  }
});

gemRouteObserver.observe(document.body, { childList: true, subtree: true });

// ---- Onboarding Scan: Discover GPTs (ChatGPT) and Gems (Gemini) ----

/**
 * Passive platform scanning. Triggered on page focus/load, NOT background
 * visiting. Discovers GPTs from sidebar/URL on chatgpt.com and Gems from the
 * gems list or individual gem pages on gemini.google.com.
 *
 * Results stored under `scan_chatgpt` / `scan_gemini` in Chrome storage.
 */

interface ScanItem {
  id: string;
  name: string;
  url: string;
}

interface PlatformScanResult {
  platform: "chatgpt" | "gemini";
  scannedAt: number;
  items: ScanItem[];
}

/** Track whether a scan has already been performed this page session. */
let chatgptScanned = false;
let geminiScanned = false;

/**
 * Merge newly discovered items into existing scan results (avoids duplicates
 * by id). Returns merged array.
 */
function mergeItems(existing: ScanItem[], incoming: ScanItem[]): ScanItem[] {
  const map = new Map<string, ScanItem>();
  for (const item of existing) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, item);
  return Array.from(map.values());
}

// ---- ChatGPT GPT Scanning ----

/**
 * Extract GPT entries from the ChatGPT sidebar.
 * GPTs appear as nav links with href patterns like /g/g-{ID}-{slug}.
 */
function extractGptsFromSidebar(): ScanItem[] {
  const items: ScanItem[] = [];
  const links = document.querySelectorAll('nav a[href*="/g/g-"]');
  links.forEach((el) => {
    const href = (el as HTMLAnchorElement).href;
    const match = href.match(/\/g\/(g-[a-zA-Z0-9]+)(?:-([^/?#]+))?/);
    if (match) {
      const id = match[1];
      // Use the link text as name, or derive from slug, or fall back to ID
      const name =
        (el as HTMLElement).textContent?.trim() ||
        match[2]?.replace(/-/g, " ") ||
        id;
      items.push({
        id,
        name,
        url: `https://chatgpt.com/g/${id}`,
      });
    }
  });
  return items;
}

/**
 * Extract GPT from the current URL if on a /g/{id} page.
 */
function extractGptFromUrl(): ScanItem | null {
  const match = location.pathname.match(/\/g\/(g-[a-zA-Z0-9]+)/);
  if (!match) return null;

  const id = match[1];
  const name =
    document.title.replace(/ - ChatGPT$/i, "").trim() ||
    document.querySelector("h1")?.textContent?.trim() ||
    id;

  return {
    id,
    name,
    url: `https://chatgpt.com/g/${id}`,
  };
}

/**
 * Extract GPTs from the GPT Store page (/gpts).
 */
function extractGptsFromStore(): ScanItem[] {
  const items: ScanItem[] = [];
  const links = document.querySelectorAll('a[href*="/g/g-"]');
  links.forEach((el) => {
    const href = (el as HTMLAnchorElement).href;
    const match = href.match(/\/g\/(g-[a-zA-Z0-9]+)(?:-([^/?#]+))?/);
    if (match) {
      const id = match[1];
      const name =
        (el as HTMLElement).textContent?.trim() ||
        match[2]?.replace(/-/g, " ") ||
        id;
      items.push({ id, name, url: `https://chatgpt.com/g/${id}` });
    }
  });
  return items;
}

async function scanChatGptGpts(): Promise<void> {
  if (!location.hostname.includes("chatgpt.com")) return;

  const items: ScanItem[] = [];

  // Collect from sidebar
  items.push(...extractGptsFromSidebar());

  // Collect from current URL if on a GPT page
  const urlGpt = extractGptFromUrl();
  if (urlGpt) items.push(urlGpt);

  // Collect from GPT Store if on /gpts
  if (location.pathname.startsWith("/gpts")) {
    items.push(...extractGptsFromStore());
  }

  if (items.length === 0) return;

  // Merge with existing stored results
  const existing = await getExistingScan("chatgpt");
  const merged = mergeItems(existing, items);

  const result: PlatformScanResult = {
    platform: "chatgpt",
    scannedAt: Date.now(),
    items: merged,
  };

  await chrome.storage.local.set({ scan_chatgpt: JSON.stringify(result) });

  // Notify popup
  chrome.runtime
    .sendMessage({ type: "SCAN_COMPLETE", platform: "chatgpt" })
    .catch(() => {
      // Popup may not be open
    });

  chatgptScanned = true;
  console.log(`[GAL] ChatGPT scan complete: ${merged.length} GPTs cataloged`);
}

// ---- Gemini Gem Scanning ----

/**
 * Extract Gems from the gems list page (gemini.google.com/gems/view).
 * Gems appear as links with href pattern /gem/{GEM_ID}.
 */
function extractGemsFromList(): ScanItem[] {
  const items: ScanItem[] = [];
  const links = document.querySelectorAll('a[href*="/gem/"]');
  links.forEach((el) => {
    const href = (el as HTMLAnchorElement).href;
    const match = href.match(/\/gem\/([^/?#]+)/);
    if (match) {
      const id = match[1];
      // Use link text or nearest heading as name
      const name =
        (el as HTMLElement).textContent?.trim() ||
        el.querySelector("h2, h3, span")?.textContent?.trim() ||
        id;
      items.push({
        id,
        name,
        url: `https://gemini.google.com/gem/${id}`,
      });
    }
  });
  return items;
}

/**
 * Extract single Gem from individual Gem page (gemini.google.com/gem/{id}).
 */
function extractGemFromUrl(): ScanItem | null {
  const match = location.pathname.match(/\/gem\/([^/?#]+)/);
  if (!match) return null;

  const id = match[1];
  const name =
    document.querySelector("h1")?.textContent?.trim() ||
    document.title.replace(/ - Gemini$/i, "").trim() ||
    id;

  return {
    id,
    name,
    url: `https://gemini.google.com/gem/${id}`,
  };
}

async function scanGeminiGems(): Promise<void> {
  if (!location.hostname.includes("gemini.google.com")) return;

  const items: ScanItem[] = [];

  // Collect from gems list page
  if (location.pathname.startsWith("/gems")) {
    items.push(...extractGemsFromList());
  }

  // Collect from individual gem page
  const urlGem = extractGemFromUrl();
  if (urlGem) items.push(urlGem);

  if (items.length === 0) return;

  // Merge with existing stored results
  const existing = await getExistingScan("gemini");
  const merged = mergeItems(existing, items);

  const result: PlatformScanResult = {
    platform: "gemini",
    scannedAt: Date.now(),
    items: merged,
  };

  await chrome.storage.local.set({ scan_gemini: JSON.stringify(result) });

  // Notify popup
  chrome.runtime
    .sendMessage({ type: "SCAN_COMPLETE", platform: "gemini" })
    .catch(() => {
      // Popup may not be open
    });

  geminiScanned = true;
  console.log(`[GAL] Gemini scan complete: ${merged.length} Gems cataloged`);
}

// ---- Shared scan helpers ----

async function getExistingScan(
  platform: "chatgpt" | "gemini",
): Promise<ScanItem[]> {
  try {
    const key = `scan_${platform}`;
    const result = await chrome.storage.local.get(key);
    const raw = result[key] as string | undefined;
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlatformScanResult;
    return parsed.items || [];
  } catch {
    return [];
  }
}

/**
 * Check if a re-scan has been requested (e.g., user clicked "Scan Now" in popup).
 * Clears the flag after reading.
 */
async function isScanRequested(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get("scanRequested");
    if (result.scanRequested) {
      await chrome.storage.local.remove("scanRequested");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Run the platform scan appropriate for the current hostname.
 * Called on initial page load and on window focus.
 */
async function runPlatformScan(force = false): Promise<void> {
  const requested = await isScanRequested();
  const shouldForce = force || requested;

  if (location.hostname.includes("chatgpt.com")) {
    if (!chatgptScanned || shouldForce) {
      // Small delay to let DOM render (SPAs load content asynchronously)
      setTimeout(() => scanChatGptGpts(), 1500);
    }
  } else if (location.hostname.includes("gemini.google.com")) {
    if (!geminiScanned || shouldForce) {
      setTimeout(() => scanGeminiGems(), 1500);
    }
  }
}

// Run scan on initial page load
runPlatformScan();

// Run scan on window focus (user returns to the tab)
window.addEventListener("focus", () => {
  runPlatformScan();
});

// Also re-scan on SPA route changes (reuse existing observer's route detection)
const scanRouteObserver = new MutationObserver(() => {
  if (location.pathname !== lastPathname) {
    // lastPathname is updated by the existing gptRouteObserver above
    // Re-trigger scan after route change
    setTimeout(() => runPlatformScan(true), 1500);
  }
});

scanRouteObserver.observe(document.body, { childList: true, subtree: true });

// Listen for TRIGGER_SCAN messages from popup to force a re-scan
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TRIGGER_PLATFORM_SCAN") {
    chatgptScanned = false;
    geminiScanned = false;
    runPlatformScan(true);
  }
});

// ---- Agent Config Scanning (manual, user-triggered) ----
// Handles SCAN_PLATFORM_CONFIG messages from popup to read platform-specific
// agent configuration from the current page DOM.
// Supported platforms: Gemini Gems, AI Studio, Higgsfield, Kling AI
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SCAN_PLATFORM_CONFIG") {
    const result = scanPlatformConfig();
    if (result) {
      // Store the scan result for retrieval by popup
      const storageKey = `configScan_${result.platform}`;
      chrome.storage.local
        .set({ [storageKey]: JSON.stringify(result) })
        .then(() => {
          sendResponse({ success: true, result });
        })
        .catch(() => {
          sendResponse({ success: true, result }); // still return the result
        });
    } else {
      sendResponse({
        success: false,
        error: "No config scanner available for this page.",
      });
    }
    return true; // Keep channel open for async sendResponse
  }

  if (message.type === "CHECK_CONFIG_SCANNER") {
    sendResponse({ available: hasScannerForUrl() });
    return false;
  }
});

// ---- Message Bridge: TRANSFER_CLIPBOARD_ENTRY from popup ----

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "TRANSFER_CLIPBOARD_ENTRY" && message.entry) {
    transferToCurrentPlatform(message.entry as ClipboardEntry)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error("[GAL] TRANSFER_CLIPBOARD_ENTRY failed:", errorMsg);
        sendResponse({ ok: false, error: errorMsg });
      });
    return true;
  }
});

// ---- Smart Image Optimizer ----

const originalFileMap = new WeakMap<HTMLInputElement, FileList>();

function interceptFileInput(input: HTMLInputElement): void {
  if (input.dataset.galOptimizeAttached) return;
  input.dataset.galOptimizeAttached = "true";

  input.addEventListener(
    "change",
    async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;
      const file = files[0];
      if (!file.type.startsWith("image/")) return;

      const result = await optimizeImage(file, DEFAULT_OPTIMIZE_OPTIONS);
      if (!result) return;

      originalFileMap.set(input, files);

      const dt = new DataTransfer();
      dt.items.add(result.file);
      input.files = dt.files;

      showOptimizeToast(result, () => {
        const originals = originalFileMap.get(input);
        if (originals) {
          input.files = originals;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      });

      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    true,
  );
}

function observeFileInputs(): void {
  document
    .querySelectorAll<HTMLInputElement>('input[type="file"][accept*="image"]')
    .forEach(interceptFileInput);
  document
    .querySelectorAll<HTMLInputElement>('input[type="file"]')
    .forEach(interceptFileInput);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          node
            .querySelectorAll<HTMLInputElement>('input[type="file"]')
            .forEach(interceptFileInput);
          if (node instanceof HTMLInputElement && node.type === "file") {
            interceptFileInput(node);
          }
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

observeFileInputs();

// ---- Generation Guardian Integration ----

const GUARDIAN_PLATFORM_HOSTS: Array<{ fragment: string; platform: string }> = [
  { fragment: "gemini.google.com", platform: "gemini" },
  { fragment: "klingai.com", platform: "kling" },
  { fragment: "aistudio.google.com", platform: "ai-studio" },
];

function detectGuardianPlatform(): string | null {
  for (const { fragment, platform } of GUARDIAN_PLATFORM_HOSTS) {
    if (location.hostname.includes(fragment)) return platform;
  }
  return null;
}

const SUCCESS_SELECTORS: Record<string, string[]> = {
  gemini: ["model-response", ".model-response-text", "message-content"],
  kling: [".task-success", ".generation-success", '[class*="success-state"]', "video[src]"],
  "ai-studio": [".response-content", 'ms-chat-turn[role="model"]', '[data-turn-role="model"]'],
};

const SUBMIT_SELECTORS: Record<string, string[]> = {
  gemini: [
    'button[aria-label*="Send" i]',
    'button[aria-label*="send message" i]',
    'button[data-mat-icon-name="send"]',
  ],
  kling: [
    'button[class*="submit"]',
    'button[aria-label*="Generate" i]',
    'button[class*="generate"]',
  ],
  "ai-studio": [
    'button[aria-label="Run" i]',
    'button[aria-label^="Run prompt" i]',
    'button[aria-label*="Send" i]',
    'button[mat-icon-button][aria-label*="send" i]',
  ],
};

const guardianSubmitRegistry = new WeakSet<HTMLElement>();

function attachGuardianToButton(btn: HTMLElement, platform: string): void {
  if (guardianSubmitRegistry.has(btn)) return;
  guardianSubmitRegistry.add(btn);

  btn.addEventListener("click", () => {
    startGenerationMonitor(platform);

    const successSelectors = SUCCESS_SELECTORS[platform] ?? [];
    if (successSelectors.length === 0) return;

    // Snapshot existing responses so we only detect NEW ones
    const existingResponses = new Set<Element>();
    for (const sel of successSelectors) {
      document.querySelectorAll(sel).forEach((el) => existingResponses.add(el));
    }

    const successObserver = new MutationObserver(() => {
      for (const sel of successSelectors) {
        const elements = document.querySelectorAll(sel);
        for (const el of elements) {
          if (!existingResponses.has(el)) {
            successObserver.disconnect();
            stopGenerationMonitor();
            return;
          }
        }
      }
    });

    successObserver.observe(document.body, { childList: true, subtree: true });
  });
}

function scanForGuardianTargets(): void {
  const platform = detectGuardianPlatform();
  if (!platform) return;
  const selectors = SUBMIT_SELECTORS[platform] ?? [];
  for (const sel of selectors) {
    document.querySelectorAll<HTMLElement>(sel).forEach((btn) => {
      attachGuardianToButton(btn, platform);
    });
  }

  // Always run text-content fallback as a safety net (CSS selectors may match wrong buttons)
  const SUBMIT_TEXT: Record<string, RegExp> = {
    "ai-studio": /^run$|^send$/i,
    gemini: /^send$/i,
    kling: /^generate$|^create$/i,
  };
  const pattern = SUBMIT_TEXT[platform];
  if (pattern) {
    document.querySelectorAll<HTMLElement>("button").forEach((btn) => {
      const text = (btn.textContent ?? "").trim().replace(/\s+/g, " ");
      const baseText = text.split(/[⌘⏎↵←→]/)[0].trim();
      if (pattern.test(baseText)) {
        attachGuardianToButton(btn, platform);
      }
    });
  }
}

const guardianPlatform = detectGuardianPlatform();
if (guardianPlatform) {
  scanForGuardianTargets();
  const guardianScanObserver = new MutationObserver(() => {
    scanForGuardianTargets();
  });
  guardianScanObserver.observe(document.body, { childList: true, subtree: true });
}

// ---- Asset Clipboard: initialize on Gemini, AI Studio, ChatGPT, and Kling pages ----

(function initAssetClipboardForCurrentPage() {
  const hostname = location.hostname;
  if (hostname.includes("gemini.google.com")) {
    initAssetClipboard("gemini").catch(() => {});
  } else if (hostname.includes("aistudio.google.com")) {
    initAssetClipboard("ai-studio").catch(() => {});
  } else if (hostname.includes("chatgpt.com")) {
    initAssetClipboard("chatgpt").catch(() => {});
  } else if (hostname.includes("lab.klingai.com")) {
    initAssetClipboard("kling").catch(() => {});
  }
})();

// ---- Gemini Creative Mode: Generated Image Detection ----

function isImageGenerationModeActive(): boolean {
  const activeToolIndicators = [
    '[aria-label*="Create images"]',
    '[aria-label*="Image generation"]',
    '[data-tool="image-generation"]',
    'button[aria-pressed="true"][aria-label*="image" i]',
  ];
  return activeToolIndicators.some(sel => document.querySelector(sel) !== null);
}

let geminiImageObserver: MutationObserver | null = null;

if (location.hostname.includes("gemini.google.com")) {
  geminiImageObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const addedImages = Array.from(mutation.addedNodes)
        .filter((node): node is HTMLElement => node instanceof HTMLElement)
        .flatMap(el => Array.from(el.querySelectorAll<HTMLImageElement>('img[src*="googleusercontent"]')));

      if (addedImages.length > 0) {
        chrome.runtime.sendMessage({
          type: "IMAGE_GENERATED",
          platform: "gemini",
          count: addedImages.length,
          imageGenerationModeActive: isImageGenerationModeActive(),
          images: addedImages.map(img => ({ src: img.src, alt: img.alt })),
        }).catch(() => {});
      }
    }
  });

  geminiImageObserver.observe(document.body, { childList: true, subtree: true });
}

console.log("[GAL] Content script loaded");
