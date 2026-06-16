'use client'

import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'

/**
 * Hook to determine Claude Code tab visibility based on feature flags (#1038)
 *
 * Rules:
 * - Uses audience-based `isPageVisibleForUser` check from FeatureFlagsContext
 * - Only visible in non-production environments for users whose orgs match the flag's internalOrgs
 *
 * This encapsulates the tab visibility logic for better MVVM separation.
 */
export function useClaudeTabVisibility(): {
  showClaudeTab: boolean
  isNonProduction: boolean
} {
  const { user } = useAuth()
  const { environment, isPageVisibleForUser } = useFeatureFlags()

  return useMemo(() => {
    const isNonProduction = !environment.isProduction
    const userOrgs = user?.organizations ?? []

    // Use audience-based visibility check (Issue #2637: removed INTERNAL_ORG_NAME)
    const showClaudeTab = isPageVisibleForUser('cli', userOrgs) && isNonProduction

    return {
      showClaudeTab,
      isNonProduction,
    }
  }, [user?.organizations, environment.isProduction, isPageVisibleForUser])
}
