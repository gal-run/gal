"use client";

/**
 * TermsGate — blocking T&C acceptance screen (#3055)
 *
 * Renders a full-screen overlay that prevents access to any dashboard page
 * until the user explicitly accepts the current Terms of Service and Privacy
 * Policy.  Acceptance is stored server-side (Firestore) via `api.acceptTerms`.
 *
 * Behaviour:
 *  - Unauthenticated users are not affected (the gate is post-login).
 *  - Users who already accepted the current version pass through.
 *  - If CURRENT_TERMS_VERSION is bumped, users are prompted again.
 *  - Demo mode bypasses the gate entirely.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileText, ExternalLink, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { isDemoMode } from "@/lib/demo-guard";
import { BRANDING } from "@/lib/branding";
import { GAL_TERMS_URL, GAL_PRIVACY_URL } from "@gal/types";

/**
 * Bump this when Terms or Privacy docs are materially updated.
 * Users whose `termsVersion` < CURRENT_TERMS_VERSION will be prompted again.
 */
export const CURRENT_TERMS_VERSION = "1.0";

export interface TermsGateProps {
  children: React.ReactNode;
}

export function TermsGate({ children }: TermsGateProps) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  // #4688: Track whether the localStorage check has completed so we can gate
  // rendering until we know the local acceptance state. Starts false so the
  // initial render (before the effect fires) never accidentally lets children
  // through for a user who needs to accept terms.
  const [localStorageChecked, setLocalStorageChecked] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  // Restore acceptance from localStorage on mount (page refresh recovery).
  // Cannot use a lazy useState initializer because SSR renders without
  // localStorage, which would cause a React hydration mismatch.
  useEffect(() => {
    try {
      if (localStorage.getItem("gal_terms_accepted") === CURRENT_TERMS_VERSION) {
        setAccepted(true);
      }
    } catch {
      // localStorage unavailable — no-op
    } finally {
      setLocalStorageChecked(true);
    }
  }, []);

  // #4688: While auth is still resolving OR before we've checked localStorage,
  // show a loading state instead of children. This prevents the dashboard from
  // briefly flashing before the T&C redirect fires.
  // Only block on initial auth load (isLoading && !user).
  // If we already have a user and checkAuth() re-runs (e.g. triggered by
  // subscribeOrganizationsUpdated), don't unmount children — that would reset
  // DashboardLayoutInner state and cause an infinite quick-sync loop (#5XXX).
  if ((isLoading && !user) || !localStorageChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--surface-base)" }}>
        <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  // Demo mode bypasses ALL gates (including auth check) — must come before !user check
  // #6513: Demo mode allows unauthenticated visitors to browse the live demo
  if (isDemoMode()) {
    return <>{children}</>;
  }

  // Unauthenticated users must go to login (post-login gate only)
  // #6513: This runs AFTER demo mode check so demo visitors aren't redirected
  if (!user) {
    router.replace('/login');
    return null;
  }

  // User already accepted current (or later) terms version.
  // #5955: Compare termsVersion (now returned by /auth/status) so bumping
  // CURRENT_TERMS_VERSION forces a re-acceptance even when termsAcceptedAt exists.
  const serverAccepted =
    !!user.termsAcceptedAt &&
    (user.termsVersion === CURRENT_TERMS_VERSION || !user.termsVersion);
  if (serverAccepted || accepted) {
    return <>{children}</>;
  }

  const handleAccept = async () => {
    setIsAccepting(true);
    setError(null);
    try {
      await api.acceptTerms(CURRENT_TERMS_VERSION);
      // Persist locally so re-renders before the auth context refreshes
      // still let the user through.
      try {
        localStorage.setItem("gal_terms_accepted", CURRENT_TERMS_VERSION);
      } catch {
        // localStorage unavailable — no-op
      }
      setAccepted(true);
    } catch {
      setError("Failed to record acceptance. Please try again.");
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--accent-bg)] mb-4">
            <img
              src="/favicon.svg"
              alt={BRANDING.logoLabel}
              className="w-10 h-10"
            />
          </div>
          <h1 className="text-2xl font-bold gradient-text mb-2">
            Review & Accept Before Continuing
          </h1>
          <p className="text-[var(--text-secondary)]">
            Please read and agree to the following before accessing{" "}
            {BRANDING.missionControlName}
          </p>
        </div>

        {/* Card */}
        <div className="card p-8">
          {/* Document links */}
          <div className="space-y-3 mb-6">
            <a
              href={GAL_TERMS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-[var(--surface-sunken)]"
              style={{ border: "1px solid var(--border-subtle)" }}
            >
              <div className="icon-container flex-shrink-0">
                <FileText className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">
                Terms of Service
              </span>
              <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
            </a>

            <a
              href={GAL_PRIVACY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-[var(--surface-sunken)]"
              style={{ border: "1px solid var(--border-subtle)" }}
            >
              <div className="icon-container flex-shrink-0">
                <FileText className="w-4 h-4 text-[var(--accent)]" />
              </div>
              <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">
                Privacy Policy
              </span>
              <ExternalLink className="w-4 h-4 text-[var(--text-muted)]" />
            </a>
          </div>

          {/* Checkbox */}
          <label className="flex items-start gap-3 mb-6 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-[var(--accent)]"
            />
            <span className="text-sm text-[var(--text-secondary)]">
              I have read and agree to the Terms of Service and Privacy Policy
            </span>
          </label>

          {/* Error */}
          {error && (
            <p className="text-sm mb-4 text-[var(--status-danger-text)]">
              {error}
            </p>
          )}

          {/* Accept button */}
          <button
            onClick={handleAccept}
            disabled={!agreed || isAccepting}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors bg-[var(--interactive-primary)] text-[var(--text-on-accent)] hover:bg-[var(--interactive-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isAccepting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Accepting...
              </>
            ) : (
              "I Agree — Continue to Platform"
            )}
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-[var(--text-tertiary)] text-xs mt-8">
          {BRANDING.fullProductName}
          <br />
          {BRANDING.footerTagline}
        </p>
      </div>
    </div>
  );
}
