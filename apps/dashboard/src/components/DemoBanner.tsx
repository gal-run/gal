"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { BRANDING } from "@/lib/branding";

const DISMISS_KEY = `${BRANDING.shortName.toLowerCase()}-demo-banner-dismissed`;

/**
 * Dismissible top banner shown on all pages when NEXT_PUBLIC_DEMO_MODE=true.
 * Mirrors Port's demo.port.io banner: "You're viewing a live demo — Sign up / Get a demo".
 * Dismissal is persisted to localStorage (permanent until cleared).
 */
export function DemoBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only render client-side to avoid SSR/hydration mismatch
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (!dismissed) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore storage errors (e.g. private browsing)
    }
  };

  // Only render when NEXT_PUBLIC_DEMO_MODE=true
  if (process.env["NEXT_PUBLIC_DEMO_MODE"] !== "true") return null;
  if (!visible) return null;

  return (
    <div
      className="flex min-h-10 items-center justify-center gap-2 border-b border-[var(--border-inverse)] bg-[var(--surface-inverse)] px-4 py-2 text-xs text-[var(--text-inverse)]"
    >
      <span className="flex items-center gap-2 flex-wrap justify-center">
        <span>You&apos;re viewing a live demo</span>
        <span className="text-[var(--text-inverse-subtle)]">—</span>
        <a
          href={BRANDING.signupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[var(--brand-gal)] underline transition-colors hover:no-underline"
        >
          Sign up for free
        </a>
        <a
          href={BRANDING.contactUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--text-inverse-muted)] underline transition-colors hover:no-underline"
        >
          Get a demo
        </a>
      </span>
      <button
        onClick={handleDismiss}
        className="ml-2 rounded p-0.5 text-[var(--text-inverse-subtle)] transition-colors hover:text-[var(--text-inverse-muted)]"
        aria-label="Dismiss demo banner"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
