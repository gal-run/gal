'use client'

/**
 * Flag Badge
 *
 * Contextual indicator showing feature flag status.
 * Visible in development for everyone, in production for internal users and
 * partners-tier users (design partners) so they can confirm their tier access.
 *
 * Usage:
 *   <FlagBadge pageId="background-agents" />
 *   <FlagBadge featureId="ai-code-review" />
 */
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useAuth } from '@/contexts/AuthContext'
import type { PageId } from '@gal/types'

interface FlagBadgeProps {
  /** For page flags */
  pageId?: PageId
  /** For feature flags */
  featureId?: string
  className?: string
}

export function FlagBadge({ pageId, featureId, className = '' }: FlagBadgeProps) {
  const { pages, features, environment, orgAudienceTierMap } = useFeatureFlags()
  const { user } = useAuth()

  const normalizeOrgName = (org: string) => org.trim().toLowerCase()
  const userOrgs = (user?.organizations ?? []).map(normalizeOrgName)

  // #3323: Use orgAudienceTierMap (single source of truth) to check internal membership.
  // An org is internal if its audienceTier === 'internal' in Firestore.
  const isInternalUser = userOrgs.some(
    (org) => orgAudienceTierMap[org] === 'internal' || orgAudienceTierMap[org.toLowerCase()] === 'internal'
  )

  // #3298: Partners-tier users (design partners) also see badges in production so they
  // can confirm their tier status on gated pages (e.g. billing: public, proposals: partners).
  const isPartnersUser = userOrgs.some(
    (org) => orgAudienceTierMap[org] === 'partners' || orgAudienceTierMap[org.toLowerCase()] === 'partners'
  )

  // In dev, show badges for all users (development tooling).
  // Outside dev, show for internal users and partners-tier users.
  if (environment.environment !== 'dev' && !isInternalUser && !isPartnersUser) {
    return null
  }

  // Get the flag based on type
  const flag = pageId ? pages?.[pageId] : featureId ? features?.[featureId] : null
  if (!flag) {
    return null
  }

  const parts: string[] = []

  // Enabled status
  if (!flag.enabled) {
    parts.push('disabled')
  }

  // Environment restrictions
  if (flag.environments && flag.environments.length > 0) {
    parts.push(flag.environments.join('/'))
  }

  // Audience (pages only)
  if ('audience' in flag) {
    if (flag.audience === 'internal') {
      parts.push('internal')
    } else if (flag.audience === 'partners') {
      parts.push('partners')
    }
  }

  // Required plan (features only)
  if ('requiredPlan' in flag && flag.requiredPlan) {
    parts.push(flag.requiredPlan)
  }

  // If no restrictions, don't show badge
  if (parts.length === 0) {
    return null
  }

  // Badge color based on enabled status
  let bgColor = 'bg-[var(--status-warning-light)]'
  let borderColor = 'border-[var(--status-warning)]/30'
  let textColor = 'text-[var(--status-warning-text)]'

  if (!flag.enabled) {
    bgColor = 'bg-[var(--surface-sunken)]'
    borderColor = 'border-[var(--border-default)]/30'
    textColor = 'text-[var(--text-tertiary)]'
  }

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono ${bgColor} ${borderColor} ${textColor} border ${className}`}
      title={`${flag.name}\nEnabled: ${flag.enabled}${
        'audience' in flag ? `\nAudience: ${flag.audience || 'public'}` : ''
      }${flag.environments ? `\nEnvs: ${flag.environments.join(', ')}` : ''}${
        'requiredPlan' in flag && flag.requiredPlan ? `\nPlan: ${flag.requiredPlan}` : ''
      }`}
    >
      {parts.join(' · ')}
    </span>
  )
}
