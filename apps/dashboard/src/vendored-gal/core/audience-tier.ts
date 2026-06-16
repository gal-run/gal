/**
 * Hierarchical Audience Tier Evaluation
 *
 * Single source of truth for audience-tier logic used across Dashboard,
 * CLI, Chrome extension, and VS Code extension.
 *
 * Higher tiers inherit access to all lower-tier features:
 *   internal > partners > public
 *
 * Addresses:
 *   - https://github.com/Scheduler-Systems/gal-run-private/issues/3118
 *   - https://github.com/Scheduler-Systems/gal-run-private/issues/3140
 */

import type { PageAudience } from '@gal/types'

/**
 * Re-export PageAudience as AudienceTier for semantic clarity.
 * The underlying type is the same: 'public' | 'partners' | 'internal'.
 */
export type AudienceTier = PageAudience

/**
 * Numeric rank for each audience tier.
 * Higher rank means more privileged access.
 */
export const TIER_RANK: Record<AudienceTier, number> = {
  public: 0,
  partners: 1,
  internal: 2,
}

// ---------------------------------------------------------------------------
// Org-name normalisation helpers (previously duplicated in Dashboard)
// ---------------------------------------------------------------------------

/**
 * Normalise a single org name: trim + lowercase.
 */
export function normalizeOrgName(org: string): string {
  return org.trim().toLowerCase()
}

/**
 * Normalise an array of org names, dropping empty strings.
 */
export function normalizeOrgList(orgs: string[]): string[] {
  return orgs.map((o) => normalizeOrgName(o)).filter(Boolean)
}

// ---------------------------------------------------------------------------
// Audience-tier resolution
// ---------------------------------------------------------------------------

/**
 * Determine the audience tier for an organization based on its properties.
 *
 * @param org - Organization metadata with plan and audienceTier field.
 * @returns The computed audience tier for that org.
 *
 * @example
 * ```ts
 * getUserAudienceTier({ plan: 'free', audienceTier: null })          // 'public'
 * getUserAudienceTier({ plan: 'enforcement', audienceTier: null })   // 'partners'
 * getUserAudienceTier({ plan: 'free', audienceTier: 'internal' })    // 'internal'
 * getUserAudienceTier({ plan: 'free', audienceTier: 'partners' })    // 'partners'
 * ```
 */
export function getUserAudienceTier(org: {
  plan: string
  audienceTier?: string | null
}): AudienceTier {
  if (org.audienceTier === 'internal') return 'internal'
  if (org.audienceTier === 'partners') return 'partners'
  if (org.plan !== 'free') return 'partners'
  return 'public'
}

/**
 * Resolve an org's audience tier from the Firestore `audienceTier` field
 * and the org's subscription plan.
 *
 * Used by Dashboard (FeatureFlagsContext) and CLI feature-flags to avoid
 * duplicating the resolution logic.
 *
 * @param orgAudienceTier - Value of the `audienceTier` field from Firestore
 *   (e.g. 'internal', 'partners', or null/undefined for no override).
 * @param plan - The org's subscription plan string.
 * @returns The computed audience tier.
 */
export function resolveOrgTier(
  orgAudienceTier: string | null | undefined,
  plan: string,
): AudienceTier {
  if (orgAudienceTier === 'internal') return 'internal'
  if (orgAudienceTier === 'partners') return 'partners'
  if (plan && plan !== 'free') return 'partners'
  return 'public'
}

/**
 * Check whether a user's audience tier meets or exceeds the required tier.
 *
 * This enables hierarchical evaluation: an 'internal' user can access
 * features gated to 'partners' or 'public'; a 'partners' user can access
 * 'public' features but not 'internal' ones.
 *
 * @param userTier - The user's computed audience tier.
 * @param required - The minimum tier required (defaults to 'public').
 * @returns `true` if the user's tier rank >= the required tier rank.
 *
 * @example
 * ```ts
 * meetsAudience('internal', 'partners') // true
 * meetsAudience('partners', 'internal') // false
 * meetsAudience('public', 'public')     // true
 * ```
 */
export function meetsAudience(userTier: AudienceTier, required: AudienceTier = 'public'): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[required]
}
