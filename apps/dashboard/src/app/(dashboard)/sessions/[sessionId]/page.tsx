'use client'

/**
 * Session Detail Page
 *
 * Renders the Background Agents page with the session ID from the URL,
 * which activates the split-view with the selected session on the right panel.
 *
 * Migrated from apps/dashboard React Router to Next.js App Router.
 *
 * #6513: Route-level feature flag guard to prevent direct URL access bypass.
 */

import BackgroundAgentsPage from '@/components/sessions/BackgroundAgentsPage'
import { FeatureGate } from '@/components/FeatureGate'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { isDemoMode } from '@/lib/demo-guard'

export default function SessionDetailPage() {
  const { user, isLoading } = useAuth()
  const { isPageVisibleForUser, loading: flagsLoading } = useFeatureFlags()
  const selectedWorkspace = useSelectedWorkspace()
  const userOrgs = user?.organizations ?? []

  // #6513: Wait for auth and feature flags to resolve
  if (isLoading || flagsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full" />
      </div>
    )
  }

  // #6513: Require authentication (demo mode bypasses)
  if (!user && !isDemoMode()) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full" />
      </div>
    )
  }

  // #6513: Route-level feature flag guard
  if (!isPageVisibleForUser('background-agents', userOrgs, selectedWorkspace)) {
    return <FeatureGate pageId="background-agents" />
  }

  // BackgroundAgentsPage reads sessionId from useParams() internally
  return <BackgroundAgentsPage />
}
