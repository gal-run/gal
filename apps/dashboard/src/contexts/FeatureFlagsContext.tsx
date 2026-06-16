'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import type {
  PageId,
  PageFlagWithStatus,
  FeatureFlagWithStatus,
  EnvironmentInfo,
  PageLayer,
  FlagEnvironment,
} from '@gal/types'
import type { AudienceTier } from '@gal/core'
import { meetsAudience, resolveOrgTier, normalizeOrgName, normalizeOrgList } from '@gal/core'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { isDemoMode } from '@/lib/demo-guard'
import { isEeEnabled } from '@/ee/license.js'
// INTERNAL_ORG_NAMES removed (Issue #2637)

interface FeatureFlagsState {
  environment: EnvironmentInfo
  pages: Partial<Record<PageId, PageFlagWithStatus>>
  features: Record<string, FeatureFlagWithStatus>
  adminOrgs: string[]
  /** Org name → plan tier map for partners-tier audience evaluation (#3138) */
  orgPlanMap: Record<string, string>
  /** Org name → audienceTier map — single source of truth for internal/partners (#3323) */
  orgAudienceTierMap: Record<string, string | null>
  loading: boolean
  error: string | null
}

interface FeatureFlagsContextValue extends FeatureFlagsState {
  /** Convenience property - true in production environment */
  isProduction: boolean
  isPageEnabled: (pageId: PageId) => boolean
  isPageVisibleForUser: (pageId: PageId, userOrgs: string[], workspace?: string | null) => boolean
  isPageVisible: (pageId: PageId) => boolean
  isFeatureEnabled: (featureId: string) => boolean
  getEnabledPages: () => PageFlagWithStatus[]
  getEnabledPagesByLayer: (layer: PageLayer) => PageFlagWithStatus[]
  refresh: () => Promise<void>
}

const FeatureFlagsContext = createContext<FeatureFlagsContextValue | null>(null)

const API_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'

const FALLBACK_PUBLIC_PAGES = new Set<PageId>([
  'dashboard',
  'discovery',
  'project-scope-configs', // #2459: Approved Config is public
  'team',
  'cli',
  'vscode',
  'docs',
  'settings',
])

function normalizeWorkspace(workspace: string | null | undefined): string | null {
  if (!workspace) return null
  const normalized = normalizeOrgName(workspace)
  return normalized === 'personal' ? null : normalized
}

function isAllowedByGlobalEnvironment(
  env: FlagEnvironment,
  globalEnvironments: FlagEnvironment[] | undefined
): boolean {
  if (!globalEnvironments || globalEnvironments.length === 0) {
    return true
  }
  return globalEnvironments.includes(env)
}

function resolveOrgEnvironmentOverride(
  orgEnvironments: Record<string, FlagEnvironment[]> | undefined,
  org: string
): { found: boolean; environments: FlagEnvironment[] } {
  if (!orgEnvironments) return { found: false, environments: [] }

  const normalizedOrg = normalizeOrgName(org)
  for (const [orgName, environments] of Object.entries(orgEnvironments)) {
    if (normalizeOrgName(orgName) === normalizedOrg) {
      return { found: true, environments: environments ?? [] }
    }
  }

  return { found: false, environments: [] }
}

function isEnvironmentAllowedForContext(
  env: FlagEnvironment,
  globalEnvironments: FlagEnvironment[] | undefined,
  orgEnvironments: Record<string, FlagEnvironment[]> | undefined,
  userOrgs: string[],
  selectedWorkspace?: string | null
): boolean {
  const normalizedUserOrgs = normalizeOrgList(userOrgs)

  if (!orgEnvironments || Object.keys(orgEnvironments).length === 0) {
    return isAllowedByGlobalEnvironment(env, globalEnvironments)
  }

  const normalizedWorkspace = normalizeWorkspace(selectedWorkspace)
  if (normalizedWorkspace) {
    // Ignore forged/stale workspace selections that do not belong to this user.
    if (!normalizedUserOrgs.includes(normalizedWorkspace)) {
      return isAllowedByGlobalEnvironment(env, globalEnvironments)
    }
    const workspaceOverride = resolveOrgEnvironmentOverride(orgEnvironments, normalizedWorkspace)
    if (workspaceOverride.found) {
      return workspaceOverride.environments.includes(env)
    }
    return isAllowedByGlobalEnvironment(env, globalEnvironments)
  }

  let foundOverrideForUserOrg = false
  for (const org of normalizedUserOrgs) {
    const orgOverride = resolveOrgEnvironmentOverride(orgEnvironments, org)
    if (!orgOverride.found) continue
    foundOverrideForUserOrg = true
    if (orgOverride.environments.includes(env)) {
      return true
    }
  }

  if (foundOverrideForUserOrg) {
    return false
  }

  return isAllowedByGlobalEnvironment(env, globalEnvironments)
}

function getFallbackEnvironment(): EnvironmentInfo {
  if (typeof window === 'undefined') {
    return { environment: 'dev', isProduction: false, nodeEnv: 'development' }
  }

  const hostname = window.location.hostname
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'
  const isProduction = hostname === 'app.gal.run' || hostname.endsWith('.gal.run')

  if (isLocalhost) {
    return { environment: 'dev', isProduction: false, nodeEnv: 'development' }
  }

  if (isProduction) {
    return { environment: 'prod', isProduction: true, nodeEnv: 'production' }
  }

  // Safe default for unknown hosts (including Firebase Hosting previews)
  return { environment: 'prod', isProduction: true, nodeEnv: 'production' }
}

// SSR-safe environment default — must NOT read window/location during initial render
// to avoid React hydration mismatch (#3990). The client-side value is resolved in a
// useEffect below (two-pass render).
const SSR_SAFE_ENVIRONMENT: EnvironmentInfo = {
  environment: 'dev',
  isProduction: false,
  nodeEnv: 'development',
}

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const selectedWorkspace = useSelectedWorkspace()
  // #3990: Start with SSR-safe default so server and client initial render match.
  // The correct client-side environment is resolved in the useEffect below.
  const [state, setState] = useState<FeatureFlagsState>({
    environment: SSR_SAFE_ENVIRONMENT,
    pages: {},
    features: {},
    adminOrgs: [],
    orgPlanMap: {},
    orgAudienceTierMap: {},
    loading: true,
    error: null,
  })

  // #3990: Hydrate environment from window.location after mount (client-only).
  // This is intentionally separated from fetchFlags so the environment is set
  // even if the flags fetch fails.
  useEffect(() => {
    setState(prev => ({
      ...prev,
      environment: getFallbackEnvironment(),
    }))
  }, [])

  const fetchFlags = useCallback(async () => {
    if (isDemoMode()) {
      setState({
        environment: { environment: 'prod', isProduction: true, nodeEnv: 'production' },
        pages: {},
        features: {},
        adminOrgs: [],
        orgPlanMap: {},
        orgAudienceTierMap: {},
        loading: false,
        error: null,
      })
      return
    }

    try {
      const response = await fetch(`${API_URL}/feature-flags`, {
        cache: 'no-store',
        credentials: 'include',
      })
      if (!response.ok) {
        throw new Error('Failed to fetch feature flags')
      }
      const data = await response.json()
      if (process.env.NODE_ENV === 'development') {
        const pageCount = Object.keys(data.pages || {}).length
        const featureCount = Object.keys(data.features || {}).length
        const internalPages = Object.entries(data.pages || {})
          .filter(([, v]: [string, any]) => v?.audience === 'internal')
          .map(([k]: [string, any]) => k)
        console.log(`[FeatureFlags] Loaded ${pageCount} pages, ${featureCount} features. Internal: [${internalPages.join(', ')}]. Env: ${data.environment?.environment}`)
      }
      setState({
        environment: data.environment,
        pages: data.pages || {},
        features: data.features || {},
        adminOrgs: data.adminOrgs?.length ? data.adminOrgs : [],
        orgPlanMap: data.orgPlanMap || {},
        orgAudienceTierMap: data.orgAudienceTierMap || {},
        loading: false,
        error: null,
      })
    } catch (err) {
      console.error('Failed to load feature flags:', err)
      console.error('[FeatureFlags] API_URL was:', API_URL)
      // In case of error, default to showing all pages (dev mode behavior)
      setState(prev => ({
        ...prev,
        environment: getFallbackEnvironment(),
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }, [])

  useEffect(() => {
    fetchFlags()
  }, [fetchFlags])

  const isPageEnabled = useCallback((pageId: PageId): boolean => {
    const page = state.pages[pageId]
    if (!page) {
      // Unknown page - default to enabled in dev, safe allowlist otherwise
      if (state.environment.environment === 'dev') return true
      return FALLBACK_PUBLIC_PAGES.has(pageId)
    }
    return page.effectivelyEnabled
  }, [state.environment.environment, state.pages])

  const isPageVisibleForUser = useCallback((pageId: PageId, userOrgs: string[], workspace?: string | null): boolean => {
    // Enterprise gate (collapse to free/public tier): without a GAL Enterprise
    // license key the build is single-tenant and may ONLY surface the free
    // public pages. This collapses the entire audience-tier resolver below to
    // FALLBACK_PUBLIC_PAGES (dashboard, discovery, project-scope-configs, team,
    // cli, vscode, docs, settings) — so no key means single-tenant free, never EE.
    if (!isEeEnabled()) {
      return FALLBACK_PUBLIC_PAGES.has(pageId)
    }
    // In demo mode, all pages are visible regardless of feature flags
    if (isDemoMode()) return true
    const page = state.pages[pageId]
    if (!page) {
      // If flags failed to load, allow safe public pages (or all in dev)
      if (state.environment.environment === 'dev') return true
      return FALLBACK_PUBLIC_PAGES.has(pageId)
    }

    const env = state.environment.environment as FlagEnvironment
    const effectiveWorkspace = workspace ?? selectedWorkspace
    const forcedEnabledByOverride = !page.enabled && page.effectivelyEnabled
    const forcedDisabledByOverride =
      page.enabled &&
      !page.effectivelyEnabled &&
      isAllowedByGlobalEnvironment(env, page.environments)

    if (!page.enabled && !forcedEnabledByOverride) {
      return false
    }
    if (forcedDisabledByOverride) {
      return false
    }

    const environmentAllowed = isEnvironmentAllowedForContext(
      env,
      page.environments,
      page.orgEnvironments,
      userOrgs,
      effectiveWorkspace,
    )
    if (!forcedEnabledByOverride && !environmentAllowed) {
      return false
    }

    const normalizedWorkspace = normalizeWorkspace(effectiveWorkspace)
    const normalizedUserOrgs = normalizeOrgList(userOrgs)

    // In dev mode, bypass audience restrictions only when there's no workspace context
    // (pure local dev without auth). When a workspace IS selected, respect audience checks
    // so internal pages correctly hide for non-internal workspaces.
    if (state.environment.environment === 'dev' && !normalizedWorkspace && normalizedUserOrgs.length === 0) {
      return true
    }

    // Demo mode: all enabled pages are visible — the demo org is not in internalOrgs
    // so audience='internal' would otherwise block background-agents, proposals, etc.
    if (isDemoMode()) {
      return true
    }

    // #3118/#3140/#3323: Hierarchical audience tier evaluation via @gal/core.
    // resolveOrgTier now uses audienceTier from Firestore as single source of truth.
    const requiredAudience: AudienceTier = (page.audience as AudienceTier) ?? 'public'

    /**
     * Compute audience tier for a single org.
     * Priority: audienceTier from Firestore (#3323) > plan from orgPlanMap (#3138) > public
     */
    const getOrgTier = (org: string): AudienceTier => {
      const audienceTier = state.orgAudienceTierMap[org]
      const plan = state.orgPlanMap[org] || 'free'
      return resolveOrgTier(audienceTier, plan)
    }

    if (normalizedWorkspace) {
      if (!normalizedUserOrgs.includes(normalizedWorkspace)) {
        return false
      }
      return meetsAudience(getOrgTier(normalizedWorkspace), requiredAudience)
    }

    // No workspace selected — restrict to public features only. (#4072)
    // Checking all user orgs here would allow a user's membership in one high-tier
    // org (e.g. Scheduler-Systems/internal) to grant tier access on their personal workspace.
    return requiredAudience === 'public'
  }, [selectedWorkspace, state.environment.environment, state.orgAudienceTierMap, state.orgPlanMap, state.pages])

  const isPageVisible = useCallback((pageId: PageId): boolean => {
    const orgs = selectedWorkspace ? [selectedWorkspace] : []
    return isPageVisibleForUser(pageId, orgs, selectedWorkspace)
  }, [isPageVisibleForUser, selectedWorkspace])

  const isFeatureEnabled = useCallback((featureId: string): boolean => {
    const feature = state.features[featureId]
    if (!feature) {
      return state.environment.environment === 'dev'
    }
    return feature.effectivelyEnabled
  }, [state.environment.environment, state.features])

  const getEnabledPages = useCallback((): PageFlagWithStatus[] => {
    return Object.values(state.pages).filter((p): p is PageFlagWithStatus => !!p?.effectivelyEnabled)
  }, [state.pages])

  const getEnabledPagesByLayer = useCallback((layer: PageLayer): PageFlagWithStatus[] => {
    return Object.values(state.pages).filter(
      (p): p is PageFlagWithStatus => !!p && p.layer === layer && p.effectivelyEnabled
    )
  }, [state.pages])

  const value = useMemo<FeatureFlagsContextValue>(() => ({
    ...state,
    isProduction: state.environment.isProduction,
    isPageEnabled,
    isPageVisibleForUser,
    isPageVisible,
    isFeatureEnabled,
    getEnabledPages,
    getEnabledPagesByLayer,
    refresh: fetchFlags,
  }), [
    state,
    isPageEnabled,
    isPageVisibleForUser,
    isPageVisible,
    isFeatureEnabled,
    getEnabledPages,
    getEnabledPagesByLayer,
    fetchFlags,
  ])

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}

// Default value returned when FeatureFlagsProvider is missing (e.g., during HMR reloads).
// This prevents the "useFeatureFlags must be used within a FeatureFlagsProvider" crash (GAL-DASHBOARD-1).
// #3990: Use SSR_SAFE_ENVIRONMENT here instead of getFallbackEnvironment() to prevent
// accessing window at module-evaluation time (which would differ between server and client).
const FEATURE_FLAGS_FALLBACK: FeatureFlagsContextValue = {
  environment: SSR_SAFE_ENVIRONMENT,
  pages: {},
  features: {},
  adminOrgs: [],
  orgPlanMap: {},
  orgAudienceTierMap: {},
  loading: true,
  error: null,
  isProduction: false,
  isPageEnabled: (pageId: PageId) => FALLBACK_PUBLIC_PAGES.has(pageId),
  isPageVisibleForUser: (pageId: PageId) => FALLBACK_PUBLIC_PAGES.has(pageId),
  isPageVisible: (pageId: PageId) => FALLBACK_PUBLIC_PAGES.has(pageId),
  isFeatureEnabled: () => false,
  getEnabledPages: () => [],
  getEnabledPagesByLayer: () => [],
  refresh: async () => {},
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext)
  if (!context) {
    // During HMR, the provider tree can temporarily unmount.
    // Return safe defaults instead of throwing to avoid crashing the app (GAL-DASHBOARD-1).
    if (process.env.NODE_ENV === 'development') {
      console.warn('[FeatureFlags] useFeatureFlags called outside FeatureFlagsProvider — returning fallback defaults (HMR?)')
      return FEATURE_FLAGS_FALLBACK
    }
    throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider')
  }
  return context
}

/**
 * Hook to check if a specific page is enabled
 */
export function usePageEnabled(pageId: PageId): boolean {
  const { isPageEnabled, loading } = useFeatureFlags()
  // While loading, default to true to avoid flash
  if (loading) return true
  return isPageEnabled(pageId)
}

/**
 * Hook to check if a specific feature is enabled
 */
export function useFeatureEnabled(featureId: string): boolean {
  const { isFeatureEnabled, loading } = useFeatureFlags()
  if (loading) return true
  return isFeatureEnabled(featureId)
}
