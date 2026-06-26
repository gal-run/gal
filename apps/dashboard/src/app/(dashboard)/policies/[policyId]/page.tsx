"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Shield,
  Loader2,
  Save,
  Trash2,
  AlertCircle,
  Check,
} from "lucide-react";
import { useSelectedWorkspace } from "@/hooks/useSelectedWorkspace";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { FeatureGate } from "@/components/FeatureGate";
import {
  getPolicy,
  updatePolicy,
  deletePolicy,
  activatePolicy,
  type Policy,
} from "@/lib/policy-api";
import { PolicyRuleEditor } from "@/components/policies/PolicyRuleEditor";

export default function PolicyDetailPage() {
  const router = useRouter();
  const params = useParams();
  const policyId = params?.policyId as string;
  const orgName = useSelectedWorkspace();
  const { user } = useAuth();
  const { isPageVisibleForUser } = useFeatureFlags();
  const userOrgs = user?.organizations ?? [];

  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");

  const fetchPolicy = useCallback(async () => {
    if (!orgName || !policyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getPolicy(orgName, policyId);
      setPolicy(data);
      setName(data.name);
      setDescription(data.description || "");
      setInstructions(data.config?.instructions || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load policy");
    } finally {
      setLoading(false);
    }
  }, [orgName, policyId]);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  const handleSave = async () => {
    if (!orgName || !policyId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updatePolicy(orgName, policyId, {
        name,
        description,
        config: {
          ...policy?.config,
          instructions,
        },
      });
      setSuccess("Policy updated successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update policy");
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!orgName || !policyId) return;

    setActivating(true);
    setError(null);

    try {
      await activatePolicy(orgName, policyId);
      setPolicy((prev) => (prev ? { ...prev, isActive: true } : prev));
      setSuccess("Policy activated successfully");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to activate policy");
    } finally {
      setActivating(false);
    }
  };

  const handleDelete = async () => {
    if (!orgName || !policyId) return;

    setDeleting(true);
    setError(null);

    try {
      await deletePolicy(orgName, policyId);
      router.push("/policies");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete policy");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Route guard (#6878): governance policies are internal-only. Block
  // non-internal/non-EE (customer-tier) users who hand-type /policies/<id> with
  // the same audience-aware FeatureGate the agents/enforcement pages use.
  if (!isPageVisibleForUser("policies", userOrgs, orgName)) {
    return <FeatureGate pageId="policies" />;
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <Loader2
            className="w-6 h-6 animate-spin mx-auto mb-2"
            style={{ color: "var(--text-muted)" }}
          />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Loading policy...
          </p>
        </div>
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <AlertCircle
            className="w-12 h-12 mx-auto mb-3"
            style={{ color: "var(--text-muted)" }}
          />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Policy not found.
          </p>
          <Link
            href="/policies"
            className="text-sm mt-4 inline-block"
            style={{ color: "var(--interactive-primary)" }}
          >
            Back to policies
          </Link>
        </div>
      </div>
    );
  }

  const isReadonly = policy.isBuiltin;

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
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5" style={{ color: "var(--accent)" }} />
            <h1
              className="text-2xl font-bold tracking-tight"
              style={{ color: "var(--text-primary)" }}
            >
              {policy.name}
            </h1>
            {policy.isActive && (
              <span
                className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{
                  backgroundColor: "var(--status-success-light)",
                  color: "var(--status-success-text)",
                }}
              >
                <Check className="w-3 h-3" />
                Active
              </span>
            )}
            {policy.isBuiltin && (
              <span
                className="text-xs px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: "var(--accent-bg)",
                  color: "var(--accent)",
                }}
              >
                Built-in
              </span>
            )}
          </div>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Created by {policy.createdBy} on{" "}
            {new Date(policy.createdAt).toLocaleDateString()}
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

      {success && (
        <div
          className="flex items-center gap-2 p-4 rounded-lg mb-6"
          style={{
            backgroundColor: "var(--status-success-light)",
            border: "1px solid var(--status-success)",
            color: "var(--status-success-text)",
          }}
        >
          <Check className="w-4 h-4" />
          <span className="text-sm">{success}</span>
        </div>
      )}

      <div className="space-y-6">
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
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isReadonly}
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-1 disabled:opacity-50"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
              />
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
                disabled={isReadonly}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-1 disabled:opacity-50"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-primary)",
                }}
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
            disabled={isReadonly}
            rows={6}
            className="w-full px-3 py-2 rounded-lg border font-mono text-sm focus:outline-none focus:ring-1 disabled:opacity-50"
            style={{
              backgroundColor: "var(--bg-primary)",
              borderColor: "var(--border-subtle)",
              color: "var(--text-primary)",
            }}
            placeholder="Enter custom instructions for agents..."
          />
        </div>

        {!isReadonly && (
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2">
              {!policy.isActive && (
                <button
                  onClick={handleActivate}
                  disabled={activating}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: "var(--status-success)",
                    color: "white",
                  }}
                >
                  {activating ? "Activating..." : "Activate Policy"}
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: "var(--interactive-secondary)",
                  color: "var(--text-on-accent)",
                }}
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors"
              style={{
                borderColor: "var(--status-danger)",
                color: "var(--status-danger)",
              }}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div
            className="rounded-xl p-6 max-w-md w-full mx-4"
            style={{ backgroundColor: "var(--surface-raised)" }}
          >
            <h3
              className="text-lg font-semibold mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Delete Policy
            </h3>
            <p
              className="text-sm mb-4"
              style={{ color: "var(--text-secondary)" }}
            >
              Are you sure you want to delete &quot;{policy.name}&quot;? This
              action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg border"
                style={{
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-secondary)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg"
                style={{
                  backgroundColor: "var(--status-danger)",
                  color: "white",
                }}
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
