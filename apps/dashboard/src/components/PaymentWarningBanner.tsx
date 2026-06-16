"use client";

/**
 * PaymentWarningBanner (#4219)
 *
 * Non-dismissible banner shown when the workspace subscription is past_due.
 * Displayed globally in the dashboard layout (above page content) so
 * the user sees it on every page, with a CTA linking to billing settings
 * (Stripe Customer Portal) to update their payment method.
 */

import { useState, useEffect, useCallback } from "react";
import { AlertCircle, CreditCard, Loader2 } from "lucide-react";
import { api, type BillingStatus } from "@/lib/api";
import { useSelectedWorkspace } from "@/hooks/useSelectedWorkspace";
import {
  useWorkspaceAudienceTier,
} from "@/hooks/useWorkspaceAudienceTier";

const GRACE_PERIOD_DAYS = 7;

function computeGraceDaysRemaining(lastPaymentFailedAt: string | null | undefined): number | null {
  if (!lastPaymentFailedAt) return null;
  const failedMs = new Date(lastPaymentFailedAt).getTime();
  if (Number.isNaN(failedMs)) return null;
  const elapsedMs = Date.now() - failedMs;
  const remaining = Math.ceil((GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000 - elapsedMs) / (24 * 60 * 60 * 1000));
  return Math.max(0, remaining);
}

export function PaymentWarningBanner() {
  const selectedWorkspace = useSelectedWorkspace();
  const audienceTier = useWorkspaceAudienceTier();
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const orgName = selectedWorkspace || null;

  // Fetch billing status for the active workspace
  useEffect(() => {
    if (!orgName) {
      setBillingStatus(null);
      return;
    }

    let cancelled = false;
    api.getBillingStatus(orgName).then((status) => {
      if (!cancelled) setBillingStatus(status);
    }).catch(() => {
      if (!cancelled) setBillingStatus(null);
    });

    return () => { cancelled = true; };
  }, [orgName]);

  const handleUpdatePayment = useCallback(async () => {
    if (!orgName) return;
    setPortalLoading(true);
    try {
      const result = await api.createPortalSession(orgName);
      if (result.url) {
        window.location.href = result.url;
      }
    } catch {
      // Fallback: navigate to billing page
      window.location.href = `/billing`;
    } finally {
      setPortalLoading(false);
    }
  }, [orgName]);

  // Internal/partner orgs bypass billing checks entirely
  if (audienceTier === "internal" || audienceTier === "partners") {
    return null;
  }

  // Only show for past_due status
  if (!billingStatus || billingStatus.status !== "past_due") {
    return null;
  }

  const daysRemaining = computeGraceDaysRemaining(billingStatus.lastPaymentFailedAt);

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
      style={{
        background: "var(--status-danger-light, #fef2f2)",
        borderBottom: "1px solid var(--status-danger, #ef4444)",
        color: "var(--text-primary)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertCircle
          className="w-4 h-4 flex-shrink-0"
          style={{ color: "var(--status-danger, #ef4444)" }}
        />
        <span>
          <strong>Payment failed.</strong>{" "}
          {daysRemaining !== null && daysRemaining > 0
            ? `Update your payment method within ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} to keep access to paid features.`
            : "Your grace period has expired. Update your payment method to restore access to paid features."}
        </span>
      </div>
      <button
        onClick={handleUpdatePayment}
        disabled={portalLoading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors"
        style={{
          backgroundColor: "var(--status-danger, #ef4444)",
          color: "#fff",
        }}
      >
        {portalLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <CreditCard className="w-3.5 h-3.5" />
        )}
        Update Payment
      </button>
    </div>
  );
}
