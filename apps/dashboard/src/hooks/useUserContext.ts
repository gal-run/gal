'use client'

/**
 * useUserContext Hook - Phase 1: Unified UX
 *
 * Feature: API-First User Experience (GitHub Issue #1044)
 * Spec: docs/features/gal/convenience/unified-experience-spec.md
 *
 * Single source of truth for user capabilities across the dashboard.
 * Capabilities are DETECTED from GitHub permissions, NOT self-declared.
 */

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { UserContextResponse } from '@gal/types';
import { isDemoMode } from '@/lib/demo-guard';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const DEMO_USER_CONTEXT: UserContextResponse = {
  user: {
    id: 'demo-user-0000',
    githubLogin: 'sarah-chen',
    email: 'sarah.chen@acme.test',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah%20Chen',
  },
  orgs: [
    {
      id: 'demo-org-1',
      name: 'acme-corp',
      githubRole: 'admin',
      capabilities: {
        canManageApprovedConfig: true,
        canRunDiscovery: true,
        canManageTeam: true,
        canSyncConfig: true,
        canChangeRoles: true,
        canManageBilling: true,
      },
      approvedConfigExists: true,
      lastDiscoveryScan: '2026-03-10T09:00:00Z',
    },
  ],
  repos: [],
  onboardingStatus: {
    completed: true,
    cliInstalled: true,
    extensionInstalled: true,
    githubConnected: true,
  },
  recommendedActions: [],
};

interface UseUserContextReturn {
  /** User context with detected capabilities */
  context: UserContextResponse | null;
  /** Loading state */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Manually refresh user context */
  refresh: () => Promise<void>;
}

const UserContextValueContext = createContext<UseUserContextReturn | null>(null)

/**
 * Fetch and manage user context with detected capabilities
 *
 * Usage:
 * ```tsx
 * <UserContextProvider>
 *   <Dashboard />
 * </UserContextProvider>
 *
 * const { context, loading, error } = useUserContext();
 *
 * if (loading) return <Loading />;
 * if (error) return <Error message={error} />;
 *
 * // Show features based on capabilities
 * {context.orgs.map(org => (
 *   <OrgCard key={org.id}>
 *     {org.capabilities.canManageApprovedConfig && (
 *       <Link to={`/workspaces/${org.name}/config`}>Set Approved Config</Link>
 *     )}
 *     {org.capabilities.canRunDiscovery && (
 *       <Link to={`/workspaces/${org.name}/discovery`}>Run Discovery</Link>
 *     )}
 *   </OrgCard>
 * ))}
 * ```
 */
export function UserContextProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<UserContextResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchContext = useCallback(async () => {
    if (!mountedRef.current) return;

    setLoading(true);
    setError(null);
    try {
      if (isDemoMode()) {
        setContext(DEMO_USER_CONTEXT);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/api/user/context`, {
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Not authenticated');
        }
        throw new Error('Failed to fetch user context');
      }

      const data = await response.json();
      if (!mountedRef.current) return;
      setContext(data);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to fetch user context');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchContext();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchContext]);

  const refresh = useCallback(async () => {
    await fetchContext();
  }, [fetchContext]);

  const value = useMemo(
    () => ({
      context,
      loading,
      error,
      refresh,
    }),
    [context, loading, error, refresh],
  )

  return createElement(UserContextValueContext.Provider, { value }, children)
}

export function useUserContext(): UseUserContextReturn {
  const context = useContext(UserContextValueContext)
  if (!context) {
    throw new Error('useUserContext must be used within a UserContextProvider')
  }

  return context
}

/**
 * Helper hook to check specific capabilities
 *
 * Usage:
 * ```tsx
 * const { canManageOrgConfig } = useOrgCapabilities('acme-corp');
 *
 * if (canManageOrgConfig) {
 *   return <ApprovedConfigEditor />;
 * }
 * ```
 */
export function useOrgCapabilities(orgName: string) {
  const { context } = useUserContext();

  const org = context?.orgs.find(o => o.name === orgName);

  return {
    org,
    loading: !context,
    canManageApprovedConfig: org?.capabilities.canManageApprovedConfig || false,
    canRunDiscovery: org?.capabilities.canRunDiscovery || false,
    canManageTeam: org?.capabilities.canManageTeam || false,
    canSyncConfig: org?.capabilities.canSyncConfig || false,
  };
}

/**
 * Helper hook to get recommended actions
 *
 * Usage:
 * ```tsx
 * const { recommendedActions } = useRecommendedActions();
 *
 * return (
 *   <div>
 *     <h2>Next Steps</h2>
 *     {recommendedActions.map(action => (
 *       <ActionCard key={action.type} action={action} />
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useRecommendedActions() {
  const { context, loading } = useUserContext();

  return {
    recommendedActions: context?.recommendedActions || [],
    loading,
  };
}
