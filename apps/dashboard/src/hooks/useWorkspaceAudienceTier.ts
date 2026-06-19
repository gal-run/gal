"use client";

import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedWorkspace } from "@/hooks/useSelectedWorkspace";
import { normalizeOrgName } from "@gal/core";

/**
 * Returns the audienceTier for the currently selected workspace.
 *
 * Uses `orgAudienceTierMap` from the feature flags API response.
 * The API populates this by extracting internal org IDs from Pilotlight
 * feature conditions and evaluating them via createRequestScope (#6344).
 *
 * @returns `'internal' | 'partners' | 'public' | null`
 *   - `null` when no workspace is selected or tier is unknown.
 */
export function useWorkspaceAudienceTier(): string | null {
  const { user } = useAuth();
  const { orgAudienceTierMap } = useFeatureFlags();
  const selectedWorkspace = useSelectedWorkspace();

  if (!selectedWorkspace) return null;

  const normalized = normalizeOrgName(selectedWorkspace);
  const tier =
    orgAudienceTierMap[normalized] ??
    orgAudienceTierMap[selectedWorkspace] ??
    null;

  if (tier) return tier;

  // Dev fallback: trust the auth token's admin org list.
  const isAdminWorkspace = (user?.adminOrganizations ?? []).some(
    (org) => normalizeOrgName(org) === normalized,
  );

  return isAdminWorkspace ? "internal" : null;
}

/**
 * Convenience hook: returns `true` when the selected workspace is internal.
 *
 * Use this to gate enforcement / enterprise features that should only be
 * visible to internal users (Issue #4029).
 */
export function useIsInternalWorkspace(): boolean {
  const tier = useWorkspaceAudienceTier();
  return tier === "internal";
}

/**
 * Convenience hook: returns `true` when the selected workspace is a partner org.
 *
 * Use this to gate billing features that should not be shown to partner orgs
 * (Issue #4203).
 */
export function useIsPartnerWorkspace(): boolean {
  const tier = useWorkspaceAudienceTier();
  return tier === "partners";
}

/**
 * Returns `true` when the current user is an admin/owner of the selected workspace.
 *
 * Compares the selected workspace against `user.adminOrganizations` (orgs where
 * the user has owner/admin role). Used for RBAC gating on billing and other
 * admin-only features (Issue #4203).
 */
export function useIsWorkspaceAdmin(): boolean {
  const { user } = useAuth();
  const selectedWorkspace = useSelectedWorkspace();

  if (!user || !selectedWorkspace) return false;

  const normalizedWorkspace = normalizeOrgName(selectedWorkspace);
  return (user.adminOrganizations ?? []).some(
    (org) => normalizeOrgName(org) === normalizedWorkspace,
  );
}
