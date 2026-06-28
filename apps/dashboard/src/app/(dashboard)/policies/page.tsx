"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Shield, Loader2, AlertCircle } from "lucide-react";
import { useSelectedWorkspace } from "@/hooks/useSelectedWorkspace";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { FeatureGate } from "@/components/FeatureGate";
import { listPolicies, activatePolicy, type Policy } from "@/lib/policy-api";
import { PolicyCard } from "@/components/policies/PolicyCard";

export default function PoliciesPage() {
  const orgName = useSelectedWorkspace();
  const { user } = useAuth();
  const { isPageVisibleForUser } = useFeatureFlags();
  const userOrgs = user?.organizations ?? [];
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const fetchPolicies = useCallback(async () => {
    if (!orgName) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await listPolicies(orgName);
      setPolicies(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load policies");
    } finally {
      setLoading(false);
    }
  }, [orgName]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const handleActivate = async (policyId: string) => {
    if (!orgName) return;

    setActivatingId(policyId);
    try {
      await activatePolicy(orgName, policyId);
      setPolicies((prev) =>
        prev.map((p) => ({
          ...p,
          isActive: p.id === policyId,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to activate policy");
    } finally {
      setActivatingId(null);
    }
  };

  // Route guard (#6878): governance policies are internal-only. Block
  // non-internal/non-EE (customer-tier) users who hand-type /policies with the
  // same audience-aware FeatureGate the agents/enforcement pages use.
  if (!isPageVisibleForUser("policies", userOrgs, orgName)) {
    return <FeatureGate pageId="policies" />;
  }

  if (!orgName) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <AlertCircle
            className="w-12 h-12 mx-auto mb-3"
            style={{ color: "var(--text-muted)" }}
          />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Select a workspace to manage policies.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Policies
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Manage governance policies for your organization
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/policies/check"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            Test Enforcement
          </Link>
          <Link
            href="/policies/new"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            style={{
              backgroundColor: "var(--interactive-secondary)",
              color: "var(--text-on-accent)",
            }}
          >
            <Plus className="w-4 h-4" />
            New Policy
          </Link>
        </div>
      </div>

      {error && (
        <div
          className="flex items-center gap-2 p-4 rounded-lg mb-6"
          style={{
            backgroundColor: "var(--status-danger-light)",
            border: "1px solid var(--status-danger)",
            color: "var(--status-danger-text)",
          }}
        >
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <Loader2
            className="w-6 h-6 animate-spin mx-auto mb-2"
            style={{ color: "var(--text-muted)" }}
          />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Loading policies...
          </p>
        </div>
      ) : policies.length === 0 ? (
        <div
          className="text-center py-12 rounded-xl border"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <Shield
            className="w-12 h-12 mx-auto mb-3"
            style={{ color: "var(--text-muted)" }}
          />
          <h3
            className="text-sm font-semibold mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            No policies yet
          </h3>
          <p
            className="text-sm mb-4"
            style={{ color: "var(--text-secondary)" }}
          >
            Create your first policy to start managing governance rules.
          </p>
          <Link
            href="/policies/new"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg"
            style={{
              backgroundColor: "var(--interactive-secondary)",
              color: "var(--text-on-accent)",
            }}
          >
            <Plus className="w-4 h-4" />
            Create Policy
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((policy) => (
            <div key={policy.id} className="relative">
              <Link href={`/policies/${policy.id}`} className="block">
                <PolicyCard policy={policy} />
              </Link>
              {!policy.isActive && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleActivate(policy.id);
                  }}
                  disabled={activatingId === policy.id}
                  className="absolute top-5 right-5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--status-success)",
                    color: "white",
                  }}
                >
                  {activatingId === policy.id ? "Activating..." : "Activate"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
