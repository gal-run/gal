'use client'

/**
 * Preview Badge (#3123)
 *
 * Subtle pill shown next to page/feature names when maturity is 'preview'.
 * Visible to ALL users (not gated behind internal/dev like FlagBadge).
 *
 * Usage:
 *   <PreviewBadge pageId="workflow-testing" />
 *   <PreviewBadge featureId="orchestrator-shadow-rollout" />
 */
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import type { PageId } from '@gal/types'

interface PreviewBadgeProps {
  /** For page flags */
  pageId?: PageId
  /** For feature flags */
  featureId?: string
  className?: string
}

export function PreviewBadge({ pageId, featureId, className = '' }: PreviewBadgeProps) {
  const { pages, features } = useFeatureFlags()

  const flag = pageId ? pages?.[pageId] : featureId ? features?.[featureId] : null
  if (!flag || flag.maturity !== 'preview') {
    return null
  }

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent)] ${className}`}
      title="This feature is in research preview and may change"
    >
      Preview
    </span>
  )
}
