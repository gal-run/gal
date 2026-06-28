"use client";

import Link from "next/link";
import { ArrowLeft, Play, Shield } from "lucide-react";
import { useSelectedWorkspace } from "@/hooks/useSelectedWorkspace";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { FeatureGate } from "@/components/FeatureGate";
import { PolicyCheckForm } from "@/components/policies/PolicyCheckForm";

export default function PolicyCheckPage() {
  const orgName = useSelectedWorkspace();
  const { user } = useAuth();
  const { isPageVisibleForUser } = useFeatureFlags();
  const userOrgs = user?.organizations ?? [];

  // Route guard (#6878): governance policies are internal-only. Block
  // non-internal/non-EE (customer-tier) users who hand-type /policies/check with
  // the same audience-aware FeatureGate the agents/enforcement pages use.
  if (!isPageVisibleForUser("policies", userOrgs, orgName)) {
    return <FeatureGate pageId="policies" />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/policies"
          className="p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <ArrowLeft
            className="w-5 h-5"
            style={{ color: "var(--text-secondary)" }}
          />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <Play className="w-5 h-5" style={{ color: "var(--accent)" }} />
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              Test Enforcement
            </h1>
          </div>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Test policy enforcement decisions for tool calls
          </p>
        </div>
      </div>

      <div
        className="rounded-xl border p-6"
        style={{
          borderColor: "var(--border-subtle)",
          backgroundColor: "var(--surface-raised)",
        }}
      >
        <div className="flex items-center gap-2 mb-6">
          <Shield className="w-5 h-5" style={{ color: "var(--accent)" }} />
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Policy Check
          </h2>
        </div>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
          Enter a tool name and input to see how the active policy would
          evaluate the request. This simulates what happens when an agent
          attempts to use a tool.
        </p>
        <PolicyCheckForm />
      </div>
    </div>
  );
}
