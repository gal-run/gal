'use client'

import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/hooks/useOnboarding';

/**
 * Shared hook to determine if onboarding is complete.
 *
 * This hook provides a SINGLE SOURCE OF TRUTH for onboarding completion status,
 * ensuring consistency across all components (Home, Dashboard, Sidebar, etc.).
 *
 * Bug #1274: Different components were using different checks for onboarding completion,
 * causing inconsistent UI (e.g., upgrade card visible but billing link hidden).
 *
 * The check matches the sidebar navigation logic in App.tsx (lines 264-277):
 * - hasConnectedOrgs: user.organizations.length > 0
 * - overallStatus === 'completed'
 * - githubStatus === 'completed'
 * - configStatus === 'completed'
 *
 * @returns Object containing isOnboardingComplete boolean and loading state
 */
export function useIsOnboardingComplete(): {
  isOnboardingComplete: boolean;
  isLoading: boolean;
} {
  const { user } = useAuth();
  const { status: onboardingStatus, loading: onboardingLoading } = useOnboarding();

  const userOrgs = user?.organizations || [];
  const hasConnectedOrgs = userOrgs.length > 0;
  const hasCompletedGitHubStep = onboardingStatus?.githubStatus === 'completed';
  const hasCompletedConfigStep = onboardingStatus?.configStatus === 'completed';

  const isOnboardingComplete =
    hasConnectedOrgs &&
    onboardingStatus?.overallStatus === 'completed' &&
    hasCompletedGitHubStep &&
    hasCompletedConfigStep;

  return {
    isOnboardingComplete: Boolean(isOnboardingComplete),
    isLoading: onboardingLoading,
  };
}
