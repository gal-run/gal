"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Shield, Loader2, AlertCircle } from "lucide-react";
import { useSelectedWorkspace } from "@/hooks/useSelectedWorkspace";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { FeatureGate } from "@/components/FeatureGate";
import { createPolicy } from "@/lib/policy-api";

export default function NewPolicyPage() {
  const router = useRouter();
  const orgName = useSelectedWorkspace();
  const { user } = useAuth();
  const { isPageVisibleForUser } = useFeatureFlags();
  const userOrgs = user?.organizations ?? [];

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName) return;

    setLoading(true);
    setError(null);

    try {
      const policy = await createPolicy(orgName, {
        name,
        description: description || undefined,
        config: {
          instructions: instructions || null,
        },
      });
      router.push(`/policies/${policy.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create policy");
    } finally {
      setLoading(false);
    }
  };

  // Route guard (#6878): governance policies are internal-only. Block
  // non-internal/non-EE (customer-tier) users who hand-type /policies/new with
  // the same audience-aware FeatureGate the agents/enforcement pages use.
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
            Select a workspace to create policies.
          </p>
        </div>
      </div>
    );
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
            <Shield className="w-5 h-5" style={{ color: "var(--accent)" }} />
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              New Policy
            </h1>
          </div>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Create a new governance policy for your organization
          </p>
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

      <form onSubmit={handleSubmit} className="space-y-6">
        <div
          className="rounded-xl border p-6"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--surface-raised)",
          }}
        >
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            Basic Information
          </h2>

          <div className="space-y-4">
            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Name <span style={{ color: "var(--status-danger)" }}>*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={200}
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-1"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
                placeholder="My Policy"
              />
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                Maximum 200 characters
              </p>
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-1"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
                placeholder="Describe the purpose of this policy..."
              />
            </div>
          </div>
        </div>

        <div
          className="rounded-xl border p-6"
          style={{
            borderColor: "var(--border-subtle)",
            backgroundColor: "var(--surface-raised)",
          }}
        >
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            Instructions
          </h2>
          <p
            className="text-sm mb-4"
            style={{ color: "var(--text-secondary)" }}
          >
            Custom instructions that will be included in the approved config
            distributed to agents.
          </p>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 rounded-lg border font-mono text-sm focus:outline-none focus:ring-1"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
            }}
            placeholder="Enter custom instructions for agents..."
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/policies"
            className="px-4 py-2 text-sm rounded-lg border"
            style={{
              borderColor: "var(--border-subtle)",
              color: "var(--text-secondary)",
            }}
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--interactive-secondary)",
              color: "var(--text-on-accent)",
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Policy"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
