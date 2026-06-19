/**
 * WorkflowPalette — 1Password-quality workflow injection palette.
 *
 * Renders an accessible, keyboard-navigable search palette anchored above
 * the active chat input field. Supports fuzzy search via Fuse.js, frecency
 * ranking, bold match highlighting, template variable selection, and
 * platform-specific text injection.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Search,
  X,
  FileText,
  Plus,
  LogIn,
  RefreshCw,
  WifiOff,
  AlertTriangle,
} from "lucide-react";
import type { Command } from "../lib/api";
import type { SyncMetadata } from "../lib/storage";
import type { FuseSearchResult, HighlightSegment } from "./workflow-search";
import {
  createFuseIndex,
  searchWorkflows,
  buildHighlightSegments,
  loadUsageData,
  recordUsage,
  sortByFrecency,
} from "./workflow-search";
import { trackEvent } from "../lib/telemetry";
import { getGalShadowHost } from "./shadow-host";

// ---- Helpers ----

/**
 * Returns true if the given element is a native page input that the user can
 * type into (input, textarea, or contenteditable), AND is NOT contained within
 * the GAL shadow host element.
 *
 * Used to detect when the user has focused a page input while the palette is
 * open, so we can release keyboard control back to the page.
 */
function isPageInputFocused(el: Element | null): boolean {
  if (!el) return false;
  const shadowHost = getGalShadowHost();
  // If the element is inside the GAL shadow host, it belongs to the palette UI
  if (shadowHost.contains(el)) return false;
  // Check for native input/textarea elements
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
  // Check for contenteditable elements
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

// ---- Types ----

export interface WorkflowPaletteProps {
  /** All available workflows/commands */
  commands: Command[];
  /** Whether the palette is open */
  isOpen: boolean;
  /** Close the palette */
  onClose: () => void;
  /** The chat input element to inject text into */
  anchorElement: HTMLElement | null;
  /** Text that triggered the palette (e.g. "//query") — stripped before injection */
  triggerText?: string;
  /** True while commands are being fetched (cold-start pre-population in progress) */
  isFetching?: boolean;
  /** Name of the currently selected organization (shown in footer) */
  orgName?: string;
  /** Sync metadata for the current org */
  syncMetadata?: SyncMetadata | null;
  /** Callback to trigger a manual retry/refresh */
  onRetry?: () => void;
  /**
   * When true, the palette was opened via the // text trigger (not the button).
   * In this mode the palette runs "passively": it does NOT steal focus from the
   * page input, it syncs its search query from triggerText as the user types,
   * and it only closes on Escape (not on any other keystroke from the page input).
   */
  triggeredByText?: boolean;
}

// ---- Injection helpers ----

/**
 * Find the first [PLACEHOLDER] in text and return its start/end indices.
 */
function findFirstPlaceholder(
  text: string,
): { start: number; end: number } | null {
  const match = /\[[A-Z_]+\]/.exec(text);
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length };
}

/**
 * Inject text into a target element using a tiered strategy:
 * Tier 1: execCommand('insertText') — ChatGPT, Gemini, Jules (contentEditable)
 * Tier 2: Native value setter + input event — AI Studio (React textarea)
 * Tier 3: Clipboard fallback
 */
function injectText(
  element: HTMLElement,
  text: string,
  triggerText?: string,
): void {
  // Strip the trigger text (// + query) from the input before injection
  if (triggerText) {
    stripTriggerText(element, triggerText);
  }

  const hostname = window.location.hostname;

  // Tier 2: AI Studio — native value setter for React-controlled textareas
  if (hostname === "aistudio.google.com") {
    const ta = (
      element.tagName === "TEXTAREA"
        ? element
        : document.querySelector('textarea[aria-label="Enter a prompt"]')
    ) as HTMLTextAreaElement | null;
    if (ta) {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;

      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? start;
      const before = ta.value.substring(0, start);
      const after = ta.value.substring(end);
      const newValue = before + text + after;
      nativeSetter.call(ta, newValue);
      ta.dispatchEvent(new Event("input", { bubbles: true }));

      // Select first placeholder if present
      const placeholder = findFirstPlaceholder(newValue);
      if (placeholder) {
        ta.setSelectionRange(placeholder.start, placeholder.end);
      } else {
        const cursorPos = start + text.length;
        ta.setSelectionRange(cursorPos, cursorPos);
      }
      ta.focus();
      return;
    }
  }

  // Tier 1: contentEditable elements (ChatGPT, Gemini, Claude, Jules)
  if (element.contentEditable === "true") {
    element.focus();
    document.execCommand("insertText", false, text);

    // Select first placeholder
    const fullText = element.textContent ?? "";
    const placeholder = findFirstPlaceholder(fullText);
    if (placeholder) {
      const sel = window.getSelection();
      if (sel) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let charCount = 0;
        let node: Text | null = null;
        while (walker.nextNode()) {
          node = walker.currentNode as Text;
          if (charCount + node.length >= placeholder.start) {
            const startOffset = placeholder.start - charCount;
            const endOffset = Math.min(
              startOffset + (placeholder.end - placeholder.start),
              node.length,
            );
            const range = document.createRange();
            range.setStart(node, startOffset);
            range.setEnd(node, endOffset);
            sel.removeAllRanges();
            sel.addRange(range);
            break;
          }
          charCount += node.length;
        }
      }
    }
    return;
  }

  // Tier 1 / Tier 2: input / textarea elements
  if ("value" in element) {
    const input = element as HTMLInputElement | HTMLTextAreaElement;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const before = input.value.substring(0, start);
    const after = input.value.substring(end);
    const newValue = before + text + after;

    // Try execCommand first (works for non-React inputs)
    input.focus();
    const inserted = document.execCommand("insertText", false, text);
    if (!inserted) {
      // Fallback: native setter
      const nativeSetter =
        element.tagName === "TEXTAREA"
          ? Object.getOwnPropertyDescriptor(
              HTMLTextAreaElement.prototype,
              "value",
            )!.set!
          : Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              "value",
            )!.set!;
      nativeSetter.call(input, newValue);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // Select first placeholder
    const placeholder = findFirstPlaceholder(input.value);
    if (placeholder) {
      input.setSelectionRange(placeholder.start, placeholder.end);
    } else {
      const cursorPos = start + text.length;
      input.setSelectionRange(cursorPos, cursorPos);
    }
    return;
  }

  // Tier 3: Clipboard fallback
  navigator.clipboard.writeText(text).catch(() => {
    // Silently fail — user can paste manually
  });
}

/**
 * Strip the trigger text (e.g. "//search query") from the input element.
 */
export function stripTriggerText(
  element: HTMLElement,
  triggerText: string,
): void {
  if (element.contentEditable === "true") {
    const current = element.textContent ?? "";
    const idx = current.lastIndexOf(triggerText);
    if (idx >= 0) {
      // Select and delete the trigger text
      const sel = window.getSelection();
      if (sel) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        let charCount = 0;
        while (walker.nextNode()) {
          const node = walker.currentNode as Text;
          if (charCount + node.length >= idx) {
            const startOffset = idx - charCount;
            const endLen = triggerText.length;
            const range = document.createRange();
            range.setStart(node, startOffset);
            range.setEnd(node, Math.min(startOffset + endLen, node.length));
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand("delete");
            break;
          }
          charCount += node.length;
        }
      }
    }
  } else if ("value" in element) {
    const input = element as HTMLInputElement | HTMLTextAreaElement;
    const idx = input.value.lastIndexOf(triggerText);
    if (idx >= 0) {
      const before = input.value.substring(0, idx);
      const after = input.value.substring(idx + triggerText.length);
      const nativeSetter =
        element.tagName === "TEXTAREA"
          ? Object.getOwnPropertyDescriptor(
              HTMLTextAreaElement.prototype,
              "value",
            )!.set!
          : Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              "value",
            )!.set!;
      nativeSetter.call(input, before + after);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.setSelectionRange(idx, idx);
    }
  }
}

// ---- Highlight component ----

function HighlightedText({ segments }: { segments: HighlightSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.highlighted ? (
          <strong
            key={i}
            style={{ color: "var(--gal-accent)", fontWeight: 700 }}
          >
            {seg.text}
          </strong>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </>
  );
}

// ---- Sync status helpers ----

/** Format a timestamp as a human-readable relative time string. */
function formatRelativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

/** Inline sync status indicator shown in the palette footer. */
function SyncStatusIndicator({
  syncMetadata,
  onRetry,
}: {
  syncMetadata?: SyncMetadata | null;
  onRetry?: () => void;
}) {
  if (!syncMetadata) return null;

  const { syncState, lastSuccessAt, lastError } = syncMetadata;

  const indicatorStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "11px",
    marginRight: "6px",
  };

  const retryBtnStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "0 2px",
    color: "var(--gal-accent)",
    fontSize: "11px",
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
    gap: "2px",
  };

  switch (syncState) {
    case "fresh":
      return (
        <span style={{ ...indicatorStyle, color: "var(--gal-text-muted)" }}>
          Updated{" "}
          {lastSuccessAt ? formatRelativeTime(lastSuccessAt) : "just now"}
        </span>
      );
    case "stale":
      return (
        <span style={{ ...indicatorStyle, color: "var(--gal-text-secondary)" }}>
          <AlertTriangle style={{ width: 11, height: 11, opacity: 0.7 }} />
          Updated{" "}
          {lastSuccessAt ? formatRelativeTime(lastSuccessAt) : "unknown"}
        </span>
      );
    case "offline":
      return (
        <span style={{ ...indicatorStyle, color: "var(--gal-text-secondary)" }}>
          <WifiOff style={{ width: 11, height: 11 }} />
          Offline{" "}
          {lastSuccessAt
            ? `(cached ${formatRelativeTime(lastSuccessAt)})`
            : "(cached)"}
        </span>
      );
    case "error":
      return (
        <span style={{ ...indicatorStyle, color: "#f59e42" }}>
          <AlertTriangle style={{ width: 11, height: 11 }} />
          {lastError === "auth_expired" ? "Re-login required" : "Sync failed"}
          {onRetry && lastError !== "auth_expired" && (
            <button onClick={onRetry} style={retryBtnStyle} title="Retry sync">
              <RefreshCw style={{ width: 10, height: 10 }} /> retry
            </button>
          )}
        </span>
      );
    case "empty":
      // Handled by the empty-state display in the palette body, no footer indicator needed
      return null;
    default:
      return null;
  }
}

// ---- WorkflowPalette Component ----

export function WorkflowPalette({
  commands,
  isOpen,
  onClose,
  anchorElement,
  triggerText,
  isFetching = false,
  orgName,
  syncMetadata,
  onRetry,
  triggeredByText = false,
}: WorkflowPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [usageData, setUsageData] = useState<
    Record<string, import("./workflow-search").WorkflowUsageEntry>
  >({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  // Track whether close was from injection (to distinguish dismiss vs inject)
  const injectedRef = useRef(false);

  // Load usage data on mount
  useEffect(() => {
    if (isOpen) {
      loadUsageData().then(setUsageData);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery("");
      setSelectedIndex(0);
      injectedRef.current = false;
    }
  }, [isOpen]);

  // Global Escape key handler — closes the palette even when it doesn't have
  // focus. Uses capture phase so it fires before any host-page listener can
  // consume the event.
  //
  // Guard: if the currently focused element is a native page input (input,
  // textarea, contenteditable) that is NOT inside the GAL shadow host, the
  // user has clicked back into the page. In that case, close the palette and
  // let ALL keystrokes pass through to the page unmodified (no preventDefault,
  // no stopImmediatePropagation). This prevents the palette from hijacking
  // keyboard input on sites like ChatGPT.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If a native page input outside the palette has focus…
      if (isPageInputFocused(document.activeElement)) {
        if (triggeredByText) {
          // Passive mode: page input has focus intentionally.
          // Only Escape should close the palette; all other keys pass through.
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopImmediatePropagation();
            onClose();
          }
          // For non-Escape keys: do nothing — let them reach the page input.
          return;
        }
        // Button-triggered mode: release control and close on any keystroke.
        onClose();
        // Do NOT call preventDefault or stopImmediatePropagation — let the
        // keystroke reach the page input as-is.
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [isOpen, onClose, triggeredByText]);

  // Auto-close the palette when focus moves to a native page input outside
  // the GAL shadow host. This handles the case where the user clicks a page
  // input via a path that bypasses the backdrop (e.g. the click lands on a
  // non-backdrop area, or focus is moved programmatically).
  useEffect(() => {
    if (!isOpen) return;

    const handleFocusIn = (e: FocusEvent) => {
      if (isPageInputFocused(e.target as Element | null)) {
        // In text-trigger (passive) mode, focus is intentionally staying in the
        // page input — do NOT close the palette when focus arrives there.
        if (triggeredByText) return;
        onClose();
      }
    };

    document.addEventListener("focusin", handleFocusIn, { capture: true });
    return () =>
      document.removeEventListener("focusin", handleFocusIn, { capture: true });
  }, [isOpen, onClose, triggeredByText]);

  // Focus search input when opened — but only in button-triggered mode.
  // When triggeredByText=true the user is actively typing in the page input;
  // stealing focus would break their typing flow.
  useEffect(() => {
    if (isOpen && !triggeredByText && searchInputRef.current) {
      // requestAnimationFrame ensures the element is rendered and visible
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen, triggeredByText]);

  // Sync the palette search query from triggerText while in text-trigger mode.
  // As the user continues typing after //, triggerText updates (e.g. "//foo"),
  // and we strip the "//" prefix to use the remainder as the live search query.
  // Also reset query to "" when the palette closes.
  useEffect(() => {
    if (!triggeredByText) return;
    if (isOpen) {
      // triggerText is "//query" — slice off the leading "//"
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery(triggerText ? triggerText.slice(2) : "");
    } else {
      setQuery("");
    }
  }, [triggeredByText, isOpen, triggerText]);

  // Build Fuse index
  const fuseIndex = useMemo(() => createFuseIndex(commands), [commands]);

  // Compute display items
  const displayItems = useMemo((): {
    items: Command[];
    searchResults: FuseSearchResult[];
    isSearching: boolean;
  } => {
    if (query.trim()) {
      const results = searchWorkflows(fuseIndex, query);
      return {
        items: results.map((r) => r.item),
        searchResults: results,
        isSearching: true,
      };
    }
    // No query — sort by frecency
    return {
      items: sortByFrecency(commands, usageData),
      searchResults: [],
      isSearching: false,
    };
  }, [query, fuseIndex, commands, usageData]);

  // Reset selection when results change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIndex(0);
  }, [displayItems.items.length, query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`,
      );
      selected?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Handle injection
  const handleInject = useCallback(
    async (command: Command) => {
      injectedRef.current = true;
      await recordUsage(command.id);
      trackEvent("extension.workflow_selected", { workflow_id: command.id });
      if (anchorElement) {
        injectText(anchorElement, command.content, triggerText);
        trackEvent("extension.workflow_injected", {
          workflow_id: command.id,
          platform: window.location.hostname,
        });
        anchorElement.focus();
      }
      onClose();
    },
    [anchorElement, triggerText, onClose],
  );

  // Dismiss handler — tracks telemetry only when palette was closed without injecting
  const handleDismiss = useCallback(() => {
    if (!injectedRef.current) {
      trackEvent("extension.workflow_dismissed");
    }
    onClose();
  }, [onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const itemCount = displayItems.items.length;
      if (itemCount === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % itemCount);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + itemCount) % itemCount);
          break;
        case "Enter":
          e.preventDefault();
          if (displayItems.items[selectedIndex]) {
            handleInject(displayItems.items[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          handleDismiss();
          break;
        case "Tab":
          // Tab advances to next placeholder — handled after injection
          // Don't prevent default so natural Tab behavior works when not in palette
          break;
      }
    },
    [displayItems.items, selectedIndex, handleInject, handleDismiss],
  );

  // Get match data for a specific item
  const getMatchesForItem = useCallback(
    (
      itemId: string,
      field: string,
    ): readonly [number, number][] | undefined => {
      if (!displayItems.isSearching) return undefined;
      const result = displayItems.searchResults.find(
        (r) => r.item.id === itemId,
      );
      if (!result) return undefined;
      const match = result.matches.find((m) => m.key === field);
      return match?.indices;
    },
    [displayItems],
  );

  if (!isOpen) return null;

  // Named constants for positioning
  const PALETTE_WIDTH = 480;
  const PALETTE_MAX_HEIGHT = 420;
  const GAP = 8;
  const EDGE_MARGIN = 8;

  // Position: anchor above the target element, right-aligned
  const paletteStyle: React.CSSProperties = {
    position: "fixed",
    width: `${PALETTE_WIDTH}px`,
    maxHeight: `${PALETTE_MAX_HEIGHT}px`,
    zIndex: 2147483647,
    display: "flex",
    flexDirection: "column",
    background: "var(--gal-surface-overlay)",
    border: "1px solid var(--gal-border-subtle)",
    borderRadius: "12px",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    animation: "galPaletteOpen 150ms ease-out",
  };

  // Compute position based on anchor element
  if (anchorElement) {
    const rect = anchorElement.getBoundingClientRect();
    // Use CSS-viewport dimensions (excludes scrollbar gutter) so that
    // position:fixed coordinates and getBoundingClientRect() are consistent.
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;

    const spaceAbove = rect.top;
    const spaceBelow = vh - rect.bottom;

    if (spaceAbove >= PALETTE_MAX_HEIGHT || spaceAbove > spaceBelow) {
      // Position above the input
      paletteStyle.bottom = `${vh - rect.top + GAP}px`;
    } else {
      // Position below the input
      paletteStyle.top = `${rect.bottom + GAP}px`;
    }
    // Right-align with the input, but clamp so the palette never overflows
    // the left edge on narrow viewports.
    const rawRight = vw - rect.right;
    const minRight = Math.max(EDGE_MARGIN, vw - PALETTE_WIDTH - EDGE_MARGIN);
    paletteStyle.right = `${Math.min(rawRight, minRight)}px`;
  } else {
    // Fallback: center of screen
    paletteStyle.top = "50%";
    paletteStyle.left = "50%";
    paletteStyle.transform = "translate(-50%, -50%)";
  }

  return (
    <>
      {/* Backdrop — closes palette on click */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2147483646,
          pointerEvents: "auto",
        }}
        onClick={handleDismiss}
      />

      {/* Palette */}
      <div
        ref={paletteRef}
        role="dialog"
        aria-label="Workflow injection palette"
        aria-modal="true"
        style={paletteStyle}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--gal-border-subtle)",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <Search
            style={{
              width: 18,
              height: 18,
              color: "var(--gal-text-secondary)",
              flexShrink: 0,
            }}
          />
          <input
            ref={searchInputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="gal-workflow-listbox"
            aria-activedescendant={
              displayItems.items[selectedIndex]
                ? `gal-workflow-item-${selectedIndex}`
                : undefined
            }
            aria-autocomplete="list"
            placeholder="Search workflows..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--gal-text-primary)",
              fontSize: "14px",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={handleDismiss}
            aria-label="Close palette"
            style={{
              padding: "4px",
              borderRadius: "6px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--gal-text-secondary)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--gal-border-subtle)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "transparent";
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          id="gal-workflow-listbox"
          role="listbox"
          aria-label="Workflow results"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px",
          }}
        >
          {displayItems.items.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "32px 16px",
                color: "var(--gal-text-muted)",
              }}
            >
              {isFetching && !query ? (
                <p style={{ margin: "0 0 12px", fontSize: "14px" }}>
                  Loading workflows&hellip;
                </p>
              ) : syncMetadata?.syncState === "error" &&
                syncMetadata?.lastError === "auth_expired" ? (
                <>
                  <p style={{ margin: "0 0 12px", fontSize: "14px" }}>
                    Session expired
                  </p>
                  <button
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1px solid var(--gal-border-subtle)",
                      background: "transparent",
                      color: "var(--gal-accent)",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontFamily: "inherit",
                    }}
                    onClick={() => {
                      chrome.runtime.sendMessage({ type: "OPEN_POPUP" });
                      onClose();
                    }}
                  >
                    <LogIn style={{ width: 14, height: 14 }} />
                    Sign in again
                  </button>
                </>
              ) : syncMetadata?.syncState === "error" ? (
                <>
                  <p style={{ margin: "0 0 12px", fontSize: "14px" }}>
                    Failed to load workflows
                  </p>
                  {onRetry && (
                    <button
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 16px",
                        borderRadius: "8px",
                        border: "1px solid var(--gal-border-subtle)",
                        background: "transparent",
                        color: "var(--gal-accent)",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontFamily: "inherit",
                      }}
                      onClick={onRetry}
                    >
                      <RefreshCw style={{ width: 14, height: 14 }} />
                      Retry
                    </button>
                  )}
                </>
              ) : syncMetadata?.syncState === "empty" ||
                (!query && !syncMetadata?.syncState) ? (
                <>
                  <p style={{ margin: "0 0 12px", fontSize: "14px" }}>
                    No workflows configured
                  </p>
                  <button
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1px solid var(--gal-border-subtle)",
                      background: "transparent",
                      color: "var(--gal-accent)",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontFamily: "inherit",
                    }}
                    onClick={() => {
                      window.open("https://app.gal.run", "_blank");
                      onClose();
                    }}
                  >
                    <Plus style={{ width: 14, height: 14 }} />
                    Create a new workflow
                  </button>
                </>
              ) : (
                <>
                  <p style={{ margin: "0 0 12px", fontSize: "14px" }}>
                    {query ? (
                      <>No workflows match &ldquo;{query}&rdquo;</>
                    ) : (
                      "No workflows found"
                    )}
                  </p>
                  <button
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 16px",
                      borderRadius: "8px",
                      border: "1px solid var(--gal-border-subtle)",
                      background: "transparent",
                      color: "var(--gal-accent)",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontFamily: "inherit",
                    }}
                    onClick={() => {
                      // Open GAL dashboard to create a new workflow
                      window.open("https://app.gal.run", "_blank");
                      onClose();
                    }}
                  >
                    <Plus style={{ width: 14, height: 14 }} />
                    Create a new workflow
                  </button>
                </>
              )}
            </div>
          ) : (
            displayItems.items.map((cmd, index) => {
              const isSelected = index === selectedIndex;
              const nameIndices = getMatchesForItem(cmd.id, "name");
              const descIndices = getMatchesForItem(cmd.id, "description");
              const nameSegments = buildHighlightSegments(
                cmd.name,
                nameIndices,
              );
              const descSegments = cmd.description
                ? buildHighlightSegments(cmd.description, descIndices)
                : null;

              return (
                <div
                  key={cmd.id}
                  id={`gal-workflow-item-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleInject(cmd)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "8px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    background: isSelected
                      ? "var(--gal-accent-bg)"
                      : "transparent",
                    transition: "background 60ms ease",
                  }}
                >
                  <FileText
                    style={{
                      width: 16,
                      height: 16,
                      color: isSelected
                        ? "var(--gal-accent)"
                        : "var(--gal-text-muted)",
                      marginTop: "2px",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 500,
                        color: "var(--gal-text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <HighlightedText segments={nameSegments} />
                    </div>
                    {descSegments && (
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--gal-text-secondary)",
                          marginTop: "2px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <HighlightedText segments={descSegments} />
                      </div>
                    )}
                    {cmd.tags && cmd.tags.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          gap: "4px",
                          marginTop: "6px",
                          flexWrap: "wrap",
                        }}
                      >
                        {cmd.tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              fontSize: "11px",
                              padding: "1px 6px",
                              borderRadius: "4px",
                              background: "var(--gal-accent-bg)",
                              color: "var(--gal-accent)",
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--gal-border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "12px",
            color: "var(--gal-text-muted)",
          }}
        >
          <span>
            <kbd
              style={{
                padding: "2px 6px",
                background: "var(--gal-border-subtle)",
                borderRadius: "4px",
                fontSize: "11px",
              }}
            >
              &uarr;&darr;
            </kbd>{" "}
            navigate{" "}
            <kbd
              style={{
                padding: "2px 6px",
                background: "var(--gal-border-subtle)",
                borderRadius: "4px",
                fontSize: "11px",
                marginLeft: "4px",
              }}
            >
              &crarr;
            </kbd>{" "}
            inject{" "}
            <kbd
              style={{
                padding: "2px 6px",
                background: "var(--gal-border-subtle)",
                borderRadius: "4px",
                fontSize: "11px",
                marginLeft: "4px",
              }}
            >
              esc
            </kbd>{" "}
            close
          </span>
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            <SyncStatusIndicator
              syncMetadata={syncMetadata}
              onRetry={onRetry}
            />
            {orgName && (
              <span
                style={{
                  marginRight: "6px",
                  padding: "1px 6px",
                  borderRadius: "4px",
                  background: "var(--gal-accent-bg)",
                  color: "var(--gal-accent)",
                  fontSize: "11px",
                }}
              >
                {orgName}
              </span>
            )}
            {displayItems.items.length} workflow
            {displayItems.items.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Keyframe animations injected inline */}
      <style>{`
        @keyframes galPaletteOpen {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}

// ---- LoginPrompt Component ----

export interface LoginPromptProps {
  /** Whether the login prompt is visible */
  isOpen: boolean;
  /** Close the login prompt */
  onClose: () => void;
}

/**
 * LoginPrompt — instructional overlay shown when an unauthenticated user
 * triggers the workflow palette. Instead of a non-functional sign-in button,
 * it displays a visual toolbar guide directing the user to click the GAL
 * extension icon in their browser toolbar.
 *
 * Uses the same dismiss behavior as the full palette (Escape, click outside).
 */
export function LoginPrompt({ isOpen, onClose }: LoginPromptProps) {
  const promptRef = useRef<HTMLDivElement>(null);

  // Global Escape key handler — uses capture phase like the full palette
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleEscape, { capture: true });
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop — closes prompt on click */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2147483646,
          pointerEvents: "auto",
        }}
        onClick={onClose}
      />

      {/* Prompt card — centered */}
      <div
        ref={promptRef}
        role="dialog"
        aria-label="Sign in instructions"
        aria-modal="true"
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "360px",
          zIndex: 2147483647,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "20px",
          padding: "32px 28px",
          background: "var(--gal-surface-overlay)",
          border: "1px solid var(--gal-border-subtle)",
          borderRadius: "16px",
          boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
          fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          animation: "galLoginPromptOpen 150ms ease-out",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: "12px",
            right: "12px",
            padding: "4px",
            borderRadius: "6px",
            border: "none",
            background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--gal-text-secondary)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "var(--gal-border-subtle)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              "transparent";
          }}
        >
          <X style={{ width: 16, height: 16 }} />
        </button>

        {/* GAL Logo — layered chevrons */}
        <svg
          viewBox="0 0 36 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: 48, height: 48 }}
          aria-hidden="true"
        >
          <path d="M8 12L18 6L28 12V18L18 12L8 18V12Z" fill="#00FF2A" />
          <path
            d="M8 18L18 12L28 18V24L18 18L8 24V18Z"
            fill="#00FF2A"
            fillOpacity={0.6}
          />
          <path
            d="M8 24L18 18L28 24V30L18 24L8 30V24Z"
            fill="#00FF2A"
            fillOpacity={0.3}
          />
        </svg>

        {/* Heading */}
        <p
          style={{
            margin: 0,
            fontSize: "15px",
            fontWeight: 500,
            color: "var(--gal-text-primary)",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Sign in to unlock workflows
        </p>

        {/* Toolbar illustration card */}
        <div
          aria-hidden="true"
          style={{
            width: "100%",
            padding: "20px 16px 16px",
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "14px",
          }}
        >
          {/* Stylized browser toolbar */}
          <div
            style={{
              width: "100%",
              maxWidth: "260px",
              background: "rgba(255, 255, 255, 0.06)",
              borderRadius: "8px",
              padding: "8px 10px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            {/* Hamburger icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              style={{ flexShrink: 0, opacity: 0.4 }}
            >
              <rect
                y="2"
                width="14"
                height="1.5"
                rx="0.75"
                fill="currentColor"
              />
              <rect
                y="6"
                width="14"
                height="1.5"
                rx="0.75"
                fill="currentColor"
              />
              <rect
                y="10"
                width="14"
                height="1.5"
                rx="0.75"
                fill="currentColor"
              />
            </svg>

            {/* Navigation arrows */}
            <svg
              width="20"
              height="14"
              viewBox="0 0 20 14"
              fill="none"
              style={{ flexShrink: 0, opacity: 0.3 }}
            >
              <path
                d="M6 1L1 7L6 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M14 1L19 7L14 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            {/* Address bar */}
            <div
              style={{
                flex: 1,
                height: "22px",
                background: "rgba(255, 255, 255, 0.06)",
                borderRadius: "4px",
                display: "flex",
                alignItems: "center",
                padding: "0 6px",
                gap: "4px",
                overflow: "hidden",
              }}
            >
              {/* Lock icon */}
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                style={{ flexShrink: 0, opacity: 0.3 }}
              >
                <rect
                  x="1.5"
                  y="4.5"
                  width="7"
                  height="5"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1"
                />
                <path
                  d="M3 4.5V3C3 1.9 3.9 1 5 1C6.1 1 7 1.9 7 3V4.5"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
              </svg>
              <span
                style={{
                  fontSize: "10px",
                  color: "var(--gal-text-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                gemini.go...
              </span>
            </div>

            {/* Puzzle piece (extensions) icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              style={{ flexShrink: 0, opacity: 0.35 }}
            >
              <path
                d="M9 3.5C9 2.67 8.33 2 7.5 2S6 2.67 6 3.5V5H3.5C2.67 5 2 5.67 2 6.5S2.67 8 3.5 8H6v2.5c0 .83.67 1.5 1.5 1.5S9 11.33 9 10.5V8h2.5c.83 0 1.5-.67 1.5-1.5S12.33 5 11.5 5H9V3.5z"
                fill="currentColor"
              />
            </svg>

            {/* GAL icon with pulse ring */}
            <div
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "4px",
                background: "rgba(0, 255, 42, 0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                animation: "galIconPulse 2s ease-in-out infinite",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 36 36" fill="none">
                <path d="M8 12L18 6L28 12V18L18 12L8 18V12Z" fill="#00FF2A" />
                <path
                  d="M8 18L18 12L28 18V24L18 18L8 24V18Z"
                  fill="#00FF2A"
                  fillOpacity="0.6"
                />
                <path
                  d="M8 24L18 18L28 24V30L18 24L8 30V24Z"
                  fill="#00FF2A"
                  fillOpacity="0.3"
                />
              </svg>
            </div>
          </div>

          {/* Arrow and instruction */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
            }}
          >
            {/* Upward arrow pointing at the GAL icon */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style={{ opacity: 0.5 }}
            >
              <path
                d="M8 14V3M8 3L3 8M8 3L13 8"
                stroke="var(--gal-text-secondary)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "var(--gal-text-secondary)",
                textAlign: "center",
                lineHeight: 1.4,
              }}
            >
              Click the{" "}
              <strong
                style={{ color: "var(--gal-text-primary)", fontWeight: 600 }}
              >
                GAL icon
              </strong>{" "}
              in your toolbar
            </p>
          </div>
        </div>

        {/* Secondary instructions */}
        <p
          style={{
            margin: 0,
            fontSize: "12px",
            color: "var(--gal-text-muted)",
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          Then sign in with GitHub.
          <br />
          Type{" "}
          <kbd
            style={{
              padding: "1px 5px",
              background: "var(--gal-border-subtle)",
              borderRadius: "3px",
              fontSize: "11px",
              fontFamily: "inherit",
            }}
          >
            //
          </kbd>{" "}
          again to open workflows.
        </p>

        {/* Keyboard hint */}
        <span
          style={{
            fontSize: "12px",
            color: "var(--gal-text-muted)",
          }}
        >
          <kbd
            style={{
              padding: "2px 6px",
              background: "var(--gal-border-subtle)",
              borderRadius: "4px",
              fontSize: "11px",
            }}
          >
            esc
          </kbd>{" "}
          to dismiss
        </span>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes galLoginPromptOpen {
          from {
            opacity: 0;
            transform: translate(-50%, -50%) translateY(8px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) translateY(0);
          }
        }
        @keyframes galIconPulse {
          0%   { box-shadow: 0 0 0 0 rgba(0, 255, 42, 0.4); }
          70%  { box-shadow: 0 0 0 8px rgba(0, 255, 42, 0); }
          100% { box-shadow: 0 0 0 0 rgba(0, 255, 42, 0); }
        }
      `}</style>
    </>
  );
}
