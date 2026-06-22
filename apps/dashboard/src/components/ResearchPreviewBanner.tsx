"use client";

import { useState, useEffect } from "react";
import { X, FlaskConical } from "lucide-react";

const FEEDBACK_URL = "https://github.com/gal-run/gal/issues";
const DISMISS_KEY = "gal-research-preview-dismissed";
const DISMISS_EXPIRY_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * Non-intrusive top banner indicating GAL is in Research Preview.
 * Dismissible — re-appears after 24 hours.
 */
export function ResearchPreviewBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed) {
        const ts = parseInt(dismissed, 10);
        if (Date.now() - ts < DISMISS_EXPIRY_MS) {
          return; // Still within dismiss window
        }
      }
      setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Ignore storage errors
    }
  };

  if (!visible) return null;

  return (
    <div
      className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs"
      style={{
        background: "var(--surface-raised)",
        borderBottom: "1px solid var(--border-primary)",
        color: "var(--text-secondary)",
      }}
    >
      <FlaskConical
        className="w-3.5 h-3.5 flex-shrink-0"
        style={{ color: "var(--accent)" }}
      />
      <span>
        <strong>Research Preview</strong> — Features may change.{" "}
        <a
          href={FEEDBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:no-underline"
          style={{ color: "var(--accent)" }}
        >
          Share feedback
        </a>
      </span>
      <button
        onClick={handleDismiss}
        className="ml-2 p-0.5 rounded hover:bg-[var(--surface-base)] transition-colors"
        aria-label="Dismiss Research Preview banner"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
