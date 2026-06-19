/**
 * Core audience-tier evaluation helpers for the GAL browser extension.
 *
 * Audience tiers form a strict hierarchy. A page declares the minimum tier
 * required to see it; an org resolves to the highest tier it holds. A request
 * is allowed when the org's tier is at least as privileged as the required
 * tier.
 */

import type { AudienceTier } from "@gal/types";

export type { AudienceTier };

/**
 * Rank of each audience tier. Higher numbers are more privileged and satisfy
 * any requirement at or below their rank.
 */
const TIER_RANK: Record<AudienceTier, number> = {
  public: 0,
  free: 1,
  partners: 2,
  internal: 3,
};

/**
 * Normalize an org name for comparison: trim surrounding whitespace and
 * lowercase. Returns an empty string for nullish input.
 */
export function normalizeOrgName(name: string | null | undefined): string {
  if (!name) return "";
  return name.trim().toLowerCase();
}

/**
 * Normalize a list of org names, dropping entries that normalize to empty.
 */
export function normalizeOrgList(
  names: readonly (string | null | undefined)[] | null | undefined,
): string[] {
  if (!names) return [];
  const result: string[] = [];
  for (const name of names) {
    const normalized = normalizeOrgName(name);
    if (normalized) result.push(normalized);
  }
  return result;
}

/**
 * Resolve the effective audience tier for an org.
 *
 * @param orgTier  The tier explicitly assigned to the org, or null if unknown.
 * @param fallback The tier to use when no explicit tier is known.
 */
export function resolveOrgTier(
  orgTier: AudienceTier | null | undefined,
  fallback: AudienceTier,
): AudienceTier {
  return orgTier ?? fallback;
}

/**
 * Return true when `orgTier` is privileged enough to satisfy `requiredTier`.
 */
export function meetsAudience(
  orgTier: AudienceTier,
  requiredTier: AudienceTier,
): boolean {
  return TIER_RANK[orgTier] >= TIER_RANK[requiredTier];
}
