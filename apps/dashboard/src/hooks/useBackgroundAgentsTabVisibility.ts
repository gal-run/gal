'use client'

import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'

/**
 * Hook to determine Background Agents tab visibility based on feature flags (#1136)
 *
 * Uses the audience-based `isPageVisibleForUser` check from FeatureFlagsContext
 * instead of raw environment checks. The flag's audience field (internal/partners/public)
 * and environment restrictions control visibility.
 *
 * This replaces useClaudeTabVisibility as the credentials tab now supports
 * multiple providers (Claude, Codex, Gemini) instead of just Claude.
 */
export function useBackgroundAgentsTabVisibility(): {
  showBackgroundAgentsTab: boolean
} {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()

  return useMemo(() => {
    const userOrgs = user?.organizations ?? []

    // Use audience-based visibility check instead of raw isProduction check.
    // The flag's audience (internal/partners/public) and environments array
    // control who sees the Background Agents tab.
    const showBackgroundAgentsTab = isPageVisibleForUser('background-agents', userOrgs)

    return {
      showBackgroundAgentsTab,
    }
  }, [user?.organizations, isPageVisibleForUser])
}
