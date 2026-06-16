'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Settings, Check, Loader2, Github, RefreshCw, Trash2, Link2, User, Bot, Zap, Plus, Shield, Layers, BarChart3 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useBackgroundAgentsTabVisibility } from '@/hooks/useBackgroundAgentsTabVisibility'
import { useSelectedWorkspace, useIsPersonalWorkspace } from '@/hooks/useSelectedWorkspace'
import { api, type Organization, type GitHubInstallationStatus, type ConnectedProvider, type GitHubRateLimitScope } from '@/lib/api'
import type { PersonalGitHubStatus } from '@gal/types'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_ORGANIZATION, DEMO_GITHUB_STATUS } from '@/lib/demo-data'
import { notifyOrganizationsUpdated, subscribeOrganizationsUpdated } from '@/lib/organizationEvents'
import { AccountTypeBadge } from '@/components/AccountTypeBadge'
import { AddWorkspaceModal } from '@/components/AddWorkspaceModal'
import { DeleteConfirmModal } from '@/components/DeleteConfirmModal'
import { DeleteAllConfirmModal } from '@/components/DeleteAllConfirmModal'
import ConnectGitHubButton from '@/components/auth/ConnectGitHubButton'
import { BackgroundAgentsTab } from '@/components/settings/BackgroundAgentsTab'
import { AgentCredentialsTab } from '@/components/settings/AgentCredentialsTab'
import { DispatchRulesSettings } from '@/components/settings/DispatchRulesSettings'
import { AutoApprovalTab } from '@/components/settings/AutoApprovalTab'
import { EnvironmentsTab } from '@/components/settings/EnvironmentsTab'
import { FlagBadge } from '@/components/FlagBadge'
import { resolveOrganizationsResponse } from './workspace-load'

type SettingsTab = 'github' | 'workspaces' | 'agents' | 'agent-credentials' | 'dispatch-rules' | 'auto-approval' | 'environments'

const allTabs: SettingsTab[] = ['github', 'workspaces', 'agents', 'agent-credentials', 'dispatch-rules', 'auto-approval', 'environments']

function formatRateLimitTimestamp(epochSeconds: number): string {
  if (!epochSeconds) return 'Unknown'
  return new Date(epochSeconds * 1000).toLocaleTimeString()
}

function SettingsPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { isAdmin, user, isLoading: authLoading } = useAuth()
  const { loading: featureFlagsLoading, isPageVisibleForUser } = useFeatureFlags()
  const selectedWorkspace = useSelectedWorkspace()
  const isPersonalWorkspace = useIsPersonalWorkspace()

  // Get Background Agents tab visibility from dedicated hook (#1136)
  const { showBackgroundAgentsTab } = useBackgroundAgentsTabVisibility()
  // Gate agents, agent-credentials, dispatch-rules, and environments tabs behind internal feature flag (#2429)
  const internalOnlyTabs: SettingsTab[] = ['agents', 'agent-credentials', 'dispatch-rules', 'environments']
  // #4678: Auto-approval promoted to partner tier — gate on proposals page visibility
  const userOrgs = user?.organizations ?? []
  const showAutoApprovalTab = isPageVisibleForUser('proposals', userOrgs)
  const validTabs = allTabs.filter(t => {
    if (internalOnlyTabs.includes(t)) return showBackgroundAgentsTab
    if (t === 'auto-approval') return showAutoApprovalTab
    return true
  })

  const tabParam = searchParams.get('tab')
  const requestedTab: SettingsTab = allTabs.includes(tabParam as SettingsTab) ? (tabParam as SettingsTab) : 'github'
  const internalTabResolutionPending =
    (internalOnlyTabs.includes(requestedTab) || requestedTab === 'auto-approval') && (authLoading || featureFlagsLoading)
  const [activeTab, setActiveTab] = useState<SettingsTab>(requestedTab)

  // Update URL when tab changes (Next.js: use router.push with new search params)
  const handleTabChange = useCallback((tab: SettingsTab) => {
    setActiveTab(tab)
    if (tab === 'github') {
      router.push('/settings')
    } else {
      router.push(`/settings?tab=${tab}`)
    }
  }, [router])

  useEffect(() => {
    setActiveTab(prev => (prev === requestedTab ? prev : requestedTab))
  }, [requestedTab])

  // Redirect to default tab if current tab is no longer valid
  useEffect(() => {
    if (internalTabResolutionPending) return
    if (!validTabs.includes(activeTab)) {
      handleTabChange('github')
    }
  }, [activeTab, handleTabChange, internalTabResolutionPending, validTabs])

  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; message: string } | null>(null)
  const [githubAppStatus, setGithubAppStatus] = useState<GitHubInstallationStatus | null>(null)
  // Bug #1289: Track personal GitHub OAuth status (same as Home.tsx)
  const [personalGithubStatus, setPersonalGithubStatus] = useState<PersonalGitHubStatus>({ connected: false, username: undefined })
  const [showAddModal, setShowAddModal] = useState(false)
  const [removingOrg, setRemovingOrg] = useState<string | null>(null)
  const [deleteModalOrg, setDeleteModalOrg] = useState<Organization | null>(null)
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null)
  const [postDeleteNotice, setPostDeleteNotice] = useState<{ message: string; url?: string } | null>(null)

  // Delete All Workspaces state (#3050)
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [deleteAllProgress, setDeleteAllProgress] = useState<{ current: number; total: number } | null>(null)
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null)

  // Connected Accounts state
  const [connectedProviders, setConnectedProviders] = useState<ConnectedProvider[]>([])
  const [providersLoading, setProvidersLoading] = useState(false)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [githubRateLimits, setGitHubRateLimits] = useState<GitHubRateLimitScope[]>([])
  const [githubRateLimitsLoading, setGitHubRateLimitsLoading] = useState(false)
  const [githubRateLimitsError, setGitHubRateLimitsError] = useState<string | null>(null)

  // GAL Code Session Collection (#5796)
  const [galCodeSessionCollection, setGalCodeSessionCollection] = useState<boolean>(true)
  const [galCodeSessionCollectionLoading, setGalCodeSessionCollectionLoading] = useState(true)
  const [galCodeSessionCollectionSaving, setGalCodeSessionCollectionSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadSettings() {
      try {
        const settings = await api.getUserSettings()
        if (!cancelled) {
          const galCode = (settings as Record<string, unknown>).galCode as Record<string, unknown> | undefined
          setGalCodeSessionCollection(galCode?.collectInteractiveSessions !== false)
        }
      } catch {
        // default on
      } finally {
        if (!cancelled) setGalCodeSessionCollectionLoading(false)
      }
    }
    loadSettings()
    return () => { cancelled = true }
  }, [])

  const handleGalCodeSessionCollectionToggle = async () => {
    const nextValue = !galCodeSessionCollection
    setGalCodeSessionCollectionSaving(true)
    try {
      const nextSettings = { galCode: { collectInteractiveSessions: nextValue } }
      await api.updateUserSettings(nextSettings)
      setGalCodeSessionCollection(nextValue)
    } catch {
      // revert on failure
    } finally {
      setGalCodeSessionCollectionSaving(false)
    }
  }

  const autoSyncTriggered = useRef(false)
  const autoSyncRequested = searchParams.get('sync') === '1'

  const sortedGitHubRateLimits = [...githubRateLimits].sort((left, right) => {
    const leftPct = left.limit > 0 ? left.remaining / left.limit : 1
    const rightPct = right.limit > 0 ? right.remaining / right.limit : 1
    return leftPct - rightPct
  })

  const lowestGitHubRateLimit = sortedGitHubRateLimits[0] ?? null

  const handleDeleteClick = (org: Organization) => {
    setDeleteModalError(null)
    setDeleteModalOrg(org)
  }

  const handleConfirmDelete = async () => {
    if (!deleteModalOrg) return
    if (isDemoMode()) { setDeleteModalOrg(null); return }

    const orgName = deleteModalOrg.name
    setDeleteModalError(null)
    setRemovingOrg(orgName)
    try {
      const result = await api.deleteOrganization(orgName)
      if (result.success) {
        // Remove from local state
        setOrganizations(orgs => orgs.filter(o => o.name !== orgName))
        notifyOrganizationsUpdated()
        setPostDeleteNotice(
          result.completionUrl
            ? {
                message:
                  result.completionMessage ||
                  'Workspace data was removed. Finish uninstalling the GitHub App in GitHub to complete the cleanup.',
                url: result.completionUrl,
              }
            : null
        )
        setDeleteModalError(null)
        setDeleteModalOrg(null)
      } else {
        setDeleteModalError(result.error || 'Failed to remove workspace')
      }
    } catch (error) {
      console.error('Failed to remove workspace:', error)
      setDeleteModalError('Failed to remove workspace')
    } finally {
      setRemovingOrg(null)
    }
  }

  const handleDeleteAllClick = () => {
    setDeleteAllError(null)
    setShowDeleteAllModal(true)
  }

  const handleConfirmDeleteAll = async () => {
    if (isDemoMode()) { setShowDeleteAllModal(false); return }
    if (organizations.length === 0) return

    setDeletingAll(true)
    setDeleteAllError(null)
    const total = organizations.length
    const orgsToDelete = [...organizations]
    let failedCount = 0

    for (let i = 0; i < orgsToDelete.length; i++) {
      setDeleteAllProgress({ current: i + 1, total })
      try {
        const result = await api.deleteOrganization(orgsToDelete[i].name)
        if (result.success) {
          setOrganizations(prev => prev.filter(o => o.name !== orgsToDelete[i].name))
        } else {
          failedCount++
          console.error(`Failed to delete ${orgsToDelete[i].name}:`, result.error)
        }
      } catch (error) {
        failedCount++
        console.error(`Failed to delete ${orgsToDelete[i].name}:`, error)
      }
    }

    if (failedCount > 0) {
      setDeleteAllError(`Failed to remove ${failedCount} of ${total} workspace${total !== 1 ? 's' : ''}. Please try again.`)
    } else {
      setShowDeleteAllModal(false)
      notifyOrganizationsUpdated()
    }
    setDeletingAll(false)
    setDeleteAllProgress(null)
  }

  // Fetch organizations, GitHub App status, and personal OAuth status - all in parallel
  const fetchSettingsData = useCallback(async (options?: { silent?: boolean }) => {
    if (isDemoMode()) {
      setOrganizations([DEMO_ORGANIZATION as unknown as Organization])
      setPersonalGithubStatus({ connected: true, username: 'sarah-chen' })
      setGithubAppStatus(DEMO_GITHUB_STATUS)
      setWorkspaceLoadError(null)
      setOrgsLoading(false)
      return
    }
    if (!options?.silent) setOrgsLoading(true)
    try {
      // #6234: Use throwOnError so service failures (GCP ADC missing, 500s) are
      // surfaced as rejected promises instead of silently returning empty arrays.
      const [orgsResult, personalStatus, appStatus] = await Promise.allSettled([
        api.getOrganizations({ throwOnError: true }),
        api.getPersonalGitHubStatus().catch(() => ({ connected: false, username: undefined })),
        api.getGitHubAppStatus().catch(() => ({
          installed: false, hasInstallations: false, totalInstalled: 0, installations: [], organizations: []
        } as GitHubInstallationStatus)),
      ])

      const orgsRaw = orgsResult.status === 'fulfilled' ? orgsResult.value : undefined
      const orgsError = orgsResult.status === 'rejected'
        ? (orgsResult.reason instanceof Error ? orgsResult.reason.message : String(orgsResult.reason))
        : null

      const { organizations: nextOrganizations, errorMessage } = resolveOrganizationsResponse(
        orgsRaw,
        [],
        'initial-load',
      )
      setOrganizations(nextOrganizations)
      // Show the real server error if orgs failed to load
      setWorkspaceLoadError(
        orgsError
          ? 'Unable to load workspaces. Please try again later.'
          : errorMessage,
      )
      setPersonalGithubStatus(
        personalStatus.status === 'fulfilled' ? personalStatus.value : { connected: false, username: undefined },
      )
      setGithubAppStatus(
        appStatus.status === 'fulfilled' ? appStatus.value : null,
      )
    } catch (error) {
      console.error('Failed to fetch workspaces:', error)
      setWorkspaceLoadError('Unable to load workspaces. Please try again later.')
    } finally {
      setOrgsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettingsData()
  }, [fetchSettingsData])

  // Re-fetch when App.tsx background sync completes
  useEffect(() => {
    return subscribeOrganizationsUpdated(() => fetchSettingsData({ silent: true }))
  }, [fetchSettingsData])

  const fetchGitHubRateLimits = useCallback(async () => {
    if (!isAdmin || isDemoMode()) return

    setGitHubRateLimitsLoading(true)
    setGitHubRateLimitsError(null)
    try {
      const data = await api.getAdminGitHubRateLimits()
      setGitHubRateLimits(data.scopes ?? [])
    } catch (error) {
      console.error('Failed to fetch GitHub rate limits:', error)
      setGitHubRateLimitsError('Failed to load GitHub App quota state')
    } finally {
      setGitHubRateLimitsLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    if (activeTab !== 'github' || !isAdmin) return
    void fetchGitHubRateLimits()
  }, [activeTab, isAdmin, fetchGitHubRateLimits])

  const handleSync = useCallback(async () => {
    if (syncing) return
    if (isDemoMode()) return
    setSyncing(true)
    setSyncProgress({ current: 0, total: 1, message: 'Syncing workspaces...' })

    try {
      // Use the POST endpoint with cookie auth (EventSource doesn't support cookies)
      const result = await api.quickSyncOrganizations()
      console.log('Sync complete:', result)

      // #2917: Refresh JWT session so newly-installed workspaces are in the org list.
      // Without this, the stale JWT filters out new installations from API responses.
      await api.refreshSession()

      // Refresh organizations list
      // BUG-007: Handle undefined API response
      const [orgsRaw, appStatus, personalStatus] = await Promise.all([
        api.getOrganizations(),
        api.getGitHubAppStatus({ refresh: true }),
        api.getPersonalGitHubStatus(),
      ])
      const { organizations: nextOrganizations, errorMessage } = resolveOrganizationsResponse(
        orgsRaw,
        organizations,
        'sync-refresh',
      )
      setOrganizations(nextOrganizations)
      setWorkspaceLoadError(errorMessage)
      setGithubAppStatus(appStatus)
      setPersonalGithubStatus(personalStatus)
      notifyOrganizationsUpdated()
    } catch (error) {
      console.error('Sync failed:', error)
      // #6234: Show actionable message for timeout/service errors
      setWorkspaceLoadError('Unable to load workspaces. Please try again later.')
    } finally {
      setSyncing(false)
      setSyncProgress(null)
    }
  }, [organizations, syncing])

  useEffect(() => {
    if (!autoSyncRequested || autoSyncTriggered.current) return
    autoSyncTriggered.current = true
    // In Next.js, clear the sync param from URL
    router.replace('/settings?tab=github')
    void handleSync()
  }, [autoSyncRequested, handleSync, router])

  // Fetch connected providers when workspaces tab is active
  useEffect(() => {
    async function fetchProviders() {
      if (activeTab !== 'workspaces') return
      if (isDemoMode()) { setConnectedProviders([]); return }

      setProvidersLoading(true)
      try {
        const providers = await api.getConnectedProviders()
        setConnectedProviders(providers)
      } catch (error) {
        console.error('Failed to fetch providers:', error)
      } finally {
        setProvidersLoading(false)
      }
    }
    fetchProviders()
  }, [activeTab])

  // Handle provider disconnect
  const handleDisconnectProvider = async (providerType: string) => {
    if (isDemoMode()) return
    setDisconnecting(providerType)
    try {
      const result = await api.disconnectProvider(providerType)
      if (result.success) {
        // Refresh providers list
        const providers = await api.getConnectedProviders()
        setConnectedProviders(providers)
      } else {
        alert(result.error || 'Failed to disconnect provider')
      }
    } catch (error) {
      console.error('Failed to disconnect provider:', error)
      alert('Failed to disconnect provider')
    } finally {
      setDisconnecting(null)
    }
  }



  const canDeleteWorkspace = (org: Organization) => {
    // If the API explicitly returns canDelete, respect it
    if (typeof org.canDelete === 'boolean') {
      return org.canDelete
    }

    // #4102: Deletion requires admin or owner role.
    // Server-side also enforces this; the UI check prevents confusion for developers.
    if (!user || !isAdmin) return false
    return true
  }

  // #1620: Use live GitHub API as primary source of truth for connection status.
  // Firestore may be empty on fresh dev startup (emulator has no persistence).
  // githubAppStatus queries the live GitHub API via /github/installation-status.
  const totalWorkspaceCount = organizations.length
  const hasWorkspaces = totalWorkspaceCount > 0
  const isGitHubConnected = githubAppStatus?.hasInstallations ?? (personalGithubStatus.connected && hasWorkspaces)

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Settings</h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Configure workspace settings, GitHub integration, and preferences
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left Tab Navigation */}
        <div className="w-full lg:w-56 flex-shrink-0">
          <nav className="flex flex-col gap-0.5 p-2">
            <SettingsNavItem
              icon={Github}
              label="GitHub"
              active={activeTab === 'github'}
              onClick={() => handleTabChange('github')}
            />
            <SettingsNavItem
              icon={Link2}
              label="Auth Providers"
              active={activeTab === 'workspaces'}
              onClick={() => handleTabChange('workspaces')}
            />
            {validTabs.includes('agents') && (
              <SettingsNavItem
                icon={Bot}
                label="Background Agents"
                active={activeTab === 'agents'}
                onClick={() => handleTabChange('agents')}
                badge={<FlagBadge pageId="background-agents" />}
              />
            )}
            {validTabs.includes('agent-credentials') && (
              <SettingsNavItem
                icon={Shield}
                label="Agent Credentials"
                active={activeTab === 'agent-credentials'}
                onClick={() => handleTabChange('agent-credentials')}
                badge={<FlagBadge pageId="background-agents" />}
              />
            )}
            {validTabs.includes('dispatch-rules') && (
              <SettingsNavItem
                icon={Zap}
                label="Dispatch Rules"
                active={activeTab === 'dispatch-rules'}
                onClick={() => handleTabChange('dispatch-rules')}
                badge={<FlagBadge pageId="background-agents" />}
              />
            )}
            {validTabs.includes('environments') && (
              <SettingsNavItem
                icon={Layers}
                label="Environments"
                active={activeTab === 'environments'}
                onClick={() => handleTabChange('environments')}
                badge={<FlagBadge pageId="background-agents" />}
              />
            )}
            {validTabs.includes('auto-approval') && (
              <SettingsNavItem
                icon={Shield}
                label="Auto-Approval"
                active={activeTab === 'auto-approval'}
                onClick={() => handleTabChange('auto-approval')}
                badge={<FlagBadge pageId="background-agents" />}
              />
            )}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0 space-y-6">
          {internalTabResolutionPending && (
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm">
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin mx-auto mb-4" />
                  <p className="text-[var(--text-muted)] text-sm">Loading settings...</p>
                </div>
              </div>
            </div>
          )}

          {!internalTabResolutionPending && workspaceLoadError && (
            <div
              role="alert"
              className="rounded-xl border border-[var(--status-warning)] bg-[var(--status-warning-light)] p-4 shadow-sm"
            >
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Workspace data unavailable
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {workspaceLoadError}
              </p>
            </div>
          )}

          {/* GitHub Tab */}
          {!internalTabResolutionPending && activeTab === 'github' && (
            <>
              {/* GitHub Integration Card */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm hover:shadow-md transition-shadow duration-200">
                <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-subtle)]">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">GitHub Integration</h2>
                    <p className="mt-0.5 text-sm text-[var(--text-secondary)]">Connect your GitHub workspaces to GAL</p>
                  </div>
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? (syncProgress ? `${syncProgress.current}/${syncProgress.total}` : 'Syncing...') : 'Sync'}
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  {/* Sync Progress */}
                  {syncProgress && (
                    <div className="p-3 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)]">
                      <p className="text-sm text-[var(--text-primary)] mb-2">{syncProgress.message}</p>
                      <div className="w-full bg-[var(--border-default)] rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-[var(--interactive-secondary)] transition-all duration-300"
                          style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {postDeleteNotice && (
                    <div className="rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-light)] p-4">
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        Workspace removed
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {postDeleteNotice.message}
                      </p>
                      {postDeleteNotice.url && (
                        <a
                          href={postDeleteNotice.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[var(--interactive-primary)] hover:underline"
                        >
                          Complete uninstall on GitHub
                        </a>
                      )}
                    </div>
                  )}

                  {/* Connection Status */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)]">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        isGitHubConnected
                          ? 'bg-[var(--status-success-light)] border border-[var(--status-success)]'
                          : 'bg-[var(--surface-base)] border border-[var(--border-default)]'
                      }`}>
                        {orgsLoading ? (
                          <Loader2 className="w-5 h-5 animate-spin text-[var(--text-muted)]" />
                        ) : (
                          <Github className={`w-5 h-5 ${isGitHubConnected ? 'text-[var(--status-success)]' : 'text-[var(--text-muted)]'}`} />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          {!orgsLoading && isGitHubConnected && (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-[var(--status-success)]" />
                              <span className="text-sm font-medium text-[var(--status-success-text)]">Connected</span>
                            </span>
                          )}
                          {!orgsLoading && !isGitHubConnected && (
                            <span className="text-sm font-medium text-[var(--text-secondary)]">Not Connected</span>
                          )}
                          {orgsLoading && (
                            <span className="text-sm font-medium text-[var(--text-muted)]">Checking...</span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                          {orgsLoading
                            ? 'Loading workspace status...'
                            : isGitHubConnected
                            ? `${totalWorkspaceCount || githubAppStatus?.totalInstalled || 1} workspace${(totalWorkspaceCount || githubAppStatus?.totalInstalled || 1) !== 1 ? 's' : ''} connected`
                            : 'Connect your GitHub workspace to get started'
                          }
                        </p>
                      </div>
                    </div>
                    {/* GAL-134: Only show Install button when not connected - connected users use Add Workspace or the empty state CTA */}
                    {!isGitHubConnected && !orgsLoading && (
                      <a
                        href={`https://github.com/apps/${process.env['NEXT_PUBLIC_GITHUB_APP_SLUG'] || 'gal-by-scheduler-systems'}/installations/new`}
                        className="inline-flex items-center gap-2 bg-[var(--interactive-secondary)] text-[var(--text-on-accent)] rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-colors"
                      >
                        <Github className="w-4 h-4" />
                        Install GAL App
                      </a>
                    )}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Link
                      href="/settings/rate-cards"
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4 hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                            Governance
                          </p>
                          <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
                            Rate Cards
                          </h3>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            Edit model prices used for token spend calculations.
                          </p>
                        </div>
                        <BarChart3 className="h-5 w-5 text-[var(--interactive-primary)]" />
                      </div>
                    </Link>

                    <Link
                      href="/governance/token-spend"
                      className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4 hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
                            Governance
                          </p>
                          <h3 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
                            Token Spend
                          </h3>
                          <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            Review usage and manage budget alerts with webhooks.
                          </p>
                        </div>
                        <BarChart3 className="h-5 w-5 text-[var(--interactive-primary)]" />
                      </div>
                    </Link>
                  </div>

                  {/* Connected Workspaces */}
                  {orgsLoading ? (
                    <div className="text-center py-8">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--text-muted)]" />
                      <p className="text-sm text-[var(--text-muted)]">Loading workspaces...</p>
                    </div>
                  ) : (organizations.length > 0 || (isGitHubConnected && !hasWorkspaces)) ? (
                    <div className="space-y-2">
                      <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Connected Workspaces</h3>
                      {organizations.length === 0 && isGitHubConnected && (
                        <div className="text-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2 text-[var(--text-muted)]" />
                          <p className="text-sm text-[var(--text-secondary)]">Syncing workspace details...</p>
                        </div>
                      )}
                      <div className="divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                        {organizations.map((org) => {
                          const isActive = org.name === selectedWorkspace
                          const canDelete = canDeleteWorkspace(org)
                          return (
                            <div
                              key={org.name}
                              className={`flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-sunken)] transition-all duration-200 border-l-2 ${isActive ? 'border-[var(--interactive-primary)] bg-[var(--interactive-primary)]/5' : 'border-transparent'} hover:border-[var(--border-interactive)]`}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-[var(--surface-sunken)] flex items-center justify-center">
                                  <span className="text-sm font-semibold text-[var(--text-secondary)]">{(org.name?.[0] || '?').toUpperCase()}</span>
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-[var(--text-primary)]">{org.name || 'Unnamed Organization'}</span>
                                    <AccountTypeBadge accountType={org.accountType} />
                                  </div>
                                  <p className="text-sm text-[var(--text-secondary)]">
                                    {(org.totalRepos || 0) > 0
                                      ? `${org.totalRepos} repositories`
                                      : 'Scanning repositories...'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`text-xs font-medium ${isActive ? 'text-[var(--interactive-primary)]' : 'text-[var(--status-success-text)]'}`}>
                                  {isActive ? 'Selected' : 'Active'}
                                </span>
                                <button
                                  onClick={() => {
                                    if (canDelete) {
                                      handleDeleteClick(org)
                                    }
                                  }}
                                  disabled={removingOrg === org.name}
                                  aria-disabled={!canDelete}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    canDelete
                                      ? 'text-[var(--text-tertiary)] hover:text-[var(--status-danger)] hover:bg-[var(--status-danger-light)]'
                                      : 'text-[var(--text-muted)] opacity-50 cursor-not-allowed'
                                  }`}
                                  title={
                                    canDelete
                                      ? 'Remove workspace'
                                      : 'Only workspace admins or the installer can remove this workspace. Re-sync or re-login if permissions changed.'
                                  }
                                >
                                  {removingOrg === org.name ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {/* Workspace action buttons */}
                      <div className="flex gap-2">
                        {/* GAL-134: All users can add workspaces (admins: org or personal, non-admins: personal only) */}
                        <button
                          onClick={() => setShowAddModal(true)}
                          className="flex-1 border border-dashed border-[var(--border-default)] rounded-xl p-3 text-center text-sm text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:text-[var(--text-primary)] transition-colors"
                        >
                          <Plus className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
                          Add Workspace
                        </button>
                        {/* #3050: Delete All Workspaces button (only shown when 2+ workspaces and admin) */}
                        {organizations.length > 1 && isAdmin && (
                          <button
                            onClick={handleDeleteAllClick}
                            className="border border-dashed border-[var(--status-danger)]/30 rounded-xl p-3 text-center text-sm text-[var(--text-muted)] hover:border-[var(--status-danger)] hover:text-[var(--status-danger)] hover:bg-[var(--status-danger-light)] transition-colors"
                          >
                            <Trash2 className="w-4 h-4 inline-block mr-1.5 -mt-0.5" />
                            Delete All
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* #3050: Empty state when no workspaces remain */
                    <div className="text-center py-12">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-[var(--surface-sunken)]">
                        <Github className="w-8 h-8 text-[var(--text-muted)]" />
                      </div>
                      <h3 className="text-base font-semibold text-[var(--text-primary)] mb-1">No workspaces</h3>
                      <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-sm mx-auto">
                        You don&apos;t have any connected workspaces yet. Install the GAL GitHub App on an organization or personal account to get started.
                      </p>
                      <a
                        href={`https://github.com/apps/${process.env['NEXT_PUBLIC_GITHUB_APP_SLUG'] || 'gal-by-scheduler-systems'}/installations/new`}
                        className="inline-flex items-center gap-2 bg-[var(--interactive-secondary)] text-[var(--text-on-accent)] rounded-lg px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-colors"
                      >
                        <Github className="w-4 h-4" />
                        Install GAL App
                      </a>
                      <p className="text-xs text-[var(--text-muted)] mt-4">
                        Or click &quot;Add Workspace&quot; below to connect an existing installation.
                      </p>
                      <button
                        onClick={() => setShowAddModal(true)}
                        className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--interactive-primary)] hover:underline"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Workspace
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Permissions Card */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm hover:shadow-md transition-shadow duration-200">
                <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[var(--text-secondary)]" />
                    <h3 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Permissions</h3>
                  </div>
                </div>
                <div className="px-6 py-4 space-y-3">
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors duration-150">
                      <Check className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" />
                      <span className="text-sm text-[var(--text-secondary)]">Read access to repository contents</span>
                    </div>
                    <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors duration-150">
                      <Check className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" />
                      <span className="text-sm text-[var(--text-secondary)]">Read access to organization members</span>
                    </div>
                    <div className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors duration-150">
                      <Check className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" />
                      <span className="text-sm text-[var(--text-secondary)]">Scan for AI coding tool configuration files</span>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] pt-1">
                    GAL only reads AI coding tool configurations and never modifies your code.
                  </p>
                </div>
              </div>

              {isAdmin && (
                <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm hover:shadow-md transition-shadow duration-200">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
                    <div>
                      <h3 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">GitHub API Quota</h3>
                      <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                        Live GitHub App rate-limit snapshots gathered by the API.
                      </p>
                    </div>
                    <button
                      onClick={() => void fetchGitHubRateLimits()}
                      disabled={githubRateLimitsLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${githubRateLimitsLoading ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  <div className="p-6 space-y-4">
                    {githubRateLimitsError && (
                      <div className="rounded-lg border border-[var(--status-danger)] bg-[var(--status-danger-light)] p-3 text-sm text-[var(--status-danger)]">
                        {githubRateLimitsError}
                      </div>
                    )}

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Tracked Scopes</p>
                        <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{githubRateLimits.length}</p>
                      </div>
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Lowest Remaining</p>
                        <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                          {lowestGitHubRateLimit ? `${lowestGitHubRateLimit.remaining}/${lowestGitHubRateLimit.limit}` : 'No data'}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {lowestGitHubRateLimit?.scope ?? 'Wait for GitHub API traffic'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4">
                        <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Next Reset</p>
                        <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
                          {lowestGitHubRateLimit ? formatRateLimitTimestamp(lowestGitHubRateLimit.reset) : 'Unknown'}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          Based on the most constrained scope
                        </p>
                      </div>
                    </div>

                    {githubRateLimitsLoading ? (
                      <div className="text-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--text-muted)]" />
                        <p className="text-sm text-[var(--text-muted)]">Loading GitHub App quota state...</p>
                      </div>
                    ) : sortedGitHubRateLimits.length > 0 ? (
                      <div className="overflow-hidden rounded-lg border border-[var(--border-subtle)]">
                        <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1fr)] gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                          <span>Scope</span>
                          <span>Remaining</span>
                          <span>Resource</span>
                          <span>Reset</span>
                          <span>Last Call</span>
                        </div>
                        <div className="divide-y divide-[var(--border-subtle)]">
                          {sortedGitHubRateLimits.map((scope) => {
                            const remainingPct = scope.limit > 0 ? Math.round((scope.remaining / scope.limit) * 100) : 0
                            const quotaTone =
                              remainingPct <= 10
                                ? 'text-[var(--status-danger)]'
                                : remainingPct <= 25
                                  ? 'text-[var(--status-warning)]'
                                  : 'text-[var(--status-success-text)]'

                            return (
                              <div
                                key={scope.scope}
                                className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1fr)] gap-3 px-4 py-3 text-sm"
                              >
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-[var(--text-primary)]">{scope.scope}</p>
                                  <p className="truncate text-xs text-[var(--text-secondary)]">
                                    Updated {new Date(scope.updatedAt).toLocaleTimeString()}
                                  </p>
                                </div>
                                <div>
                                  <p className={`font-medium ${quotaTone}`}>{scope.remaining}/{scope.limit}</p>
                                  <p className="text-xs text-[var(--text-secondary)]">{remainingPct}% left</p>
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-[var(--text-primary)]">{scope.resource ?? 'core'}</p>
                                  {scope.retryAfter ? (
                                    <p className="text-xs text-[var(--text-secondary)]">Retry after {scope.retryAfter}s</p>
                                  ) : (
                                    <p className="text-xs text-[var(--text-secondary)]">No backoff</p>
                                  )}
                                </div>
                                <div className="text-[var(--text-primary)]">{formatRateLimitTimestamp(scope.reset)}</div>
                                <div className="min-w-0">
                                  <p className="truncate text-[var(--text-primary)]">{scope.lastLabel}</p>
                                  {typeof scope.used === 'number' && (
                                    <p className="text-xs text-[var(--text-secondary)]">{scope.used} used</p>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-4 text-sm text-[var(--text-secondary)]">
                        No GitHub API quota snapshots yet. They appear after the API makes GitHub App requests through the shared rate-aware client.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* GAL Code Session Collection (#5796) */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm hover:shadow-md transition-shadow duration-200">
                <div className="px-6 py-5 border-b border-[var(--border-subtle)]">
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">GAL Code Session Collection</h2>
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                    Control whether interactive GAL Code sessions are collected for analytics
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">Collect interactive sessions</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        When enabled, prompts, model responses, tool calls, and metadata from <code className="px-1 py-0.5 bg-[var(--surface-sunken)] rounded text-xs">gal code</code> sessions are uploaded for analysis.
                      </p>
                    </div>
                    <button
                      onClick={handleGalCodeSessionCollectionToggle}
                      disabled={galCodeSessionCollectionLoading || galCodeSessionCollectionSaving}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        galCodeSessionCollection ? 'bg-[var(--interactive-secondary)]' : 'bg-[var(--border-default)]'
                      } ${(galCodeSessionCollectionLoading || galCodeSessionCollectionSaving) ? 'opacity-50' : ''}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${galCodeSessionCollection ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    You can also opt out via CLI: <code className="px-1 py-0.5 bg-[var(--surface-sunken)] rounded text-xs">gal config set galCodeSessionCollection false</code>
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Authentication Providers Tab */}
          {!internalTabResolutionPending && activeTab === 'workspaces' && (
            <>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm hover:shadow-md transition-shadow duration-200">
                <div className="px-6 py-5 border-b border-[var(--border-subtle)]">
                  <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Authentication Providers</h2>
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                    Manage the authentication providers linked to your GAL account. You can sign in using any connected provider.
                  </p>
                </div>

                <div className="p-6 space-y-6">
                  {/* Current User Info */}
                  {user && (
                    <div className="flex items-center gap-4 p-4 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-subtle)]">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden bg-[var(--surface-base)]">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={user.login} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-6 h-6 text-[var(--text-muted)]" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">
                          {user.name || user.login}
                        </p>
                        <p className="text-sm text-[var(--text-secondary)]">
                          {user.email || `@${user.login}`}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Connected Providers */}
                  <div>
                    <h3 className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-3">Connected Providers</h3>

                    {providersLoading ? (
                      <div className="text-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--text-muted)]" />
                        <p className="text-sm text-[var(--text-muted)]">Loading providers...</p>
                      </div>
                    ) : connectedProviders.length > 0 ? (
                      <div className="space-y-2">
                        {connectedProviders.map((provider) => (
                          <div
                            key={provider.type}
                            className="flex items-center justify-between px-4 py-3 rounded-lg border border-[var(--border-subtle)] hover:bg-[var(--surface-sunken)] transition-all duration-200 shadow-sm hover:shadow-md border-l-2 hover:border-l-[var(--border-default)]"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--status-success-light)] border border-[var(--status-success)]">
                                {provider.type === 'github' && <Github className="w-5 h-5 text-[var(--status-success)]" />}
                                {provider.type === 'google' && (
                                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                  </svg>
                                )}
                                {provider.type === 'email' && <User className="w-5 h-5 text-[var(--status-success)]" />}
                              </div>
                              <div>
                                <p className="text-sm font-medium capitalize text-[var(--text-primary)]">
                                  {provider.type}
                                </p>
                                <p className="text-xs text-[var(--text-secondary)]">
                                  {provider.identifier}
                                  {provider.type === 'github' && totalWorkspaceCount > 0 && (
                                    <span>{` · ${totalWorkspaceCount} workspace${totalWorkspaceCount !== 1 ? 's' : ''}`}</span>
                                  )}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-[var(--status-success)]" />
                                <span className="text-xs font-medium text-[var(--status-success-text)]">Connected</span>
                              </span>
                              {connectedProviders.length > 1 && (
                                <button
                                  onClick={() => handleDisconnectProvider(provider.type)}
                                  disabled={disconnecting === provider.type}
                                  className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--status-danger)] hover:bg-[var(--status-danger-light)] transition-colors"
                                  title="Disconnect provider"
                                >
                                  {disconnecting === provider.type ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Add Provider Section */}
                        {!connectedProviders.some(p => p.type === 'github') && (
                          <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-dashed border-[var(--border-default)]">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--surface-sunken)] border border-[var(--border-default)]">
                                <Github className="w-5 h-5 text-[var(--text-muted)]" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-[var(--text-primary)]">
                                  GitHub
                                </p>
                                <p className="text-xs text-[var(--text-secondary)]">
                                  Connect to access organization features
                                </p>
                              </div>
                            </div>
                            <ConnectGitHubButton
                              redirectPath="/settings?tab=workspaces"
                              size="sm"
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Link2 className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" />
                        <p className="text-sm text-[var(--text-secondary)] mb-4">
                          No providers connected yet
                        </p>
                        <ConnectGitHubButton
                          redirectPath="/settings?tab=workspaces"
                          size="md"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Provider Info Card */}
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm hover:shadow-md transition-shadow duration-200">
                <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[var(--text-secondary)]" />
                    <h3 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">About Authentication Providers</h3>
                  </div>
                </div>
                <div className="px-6 py-4 space-y-3">
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors duration-150">
                      <Check className="w-4 h-4 text-[var(--text-secondary)] mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-[var(--text-secondary)]">Sign in with any connected provider</span>
                    </div>
                    <div className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors duration-150">
                      <Check className="w-4 h-4 text-[var(--text-secondary)] mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-[var(--text-secondary)]">GitHub connection enables organization features</span>
                    </div>
                    <div className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors duration-150">
                      <Check className="w-4 h-4 text-[var(--text-secondary)] mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-[var(--text-secondary)]">Must keep at least one provider connected</span>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] pt-1">
                    Connecting multiple providers gives you flexible sign-in options and enables more features.
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Background Agents Tab (#1136) */}
          {!internalTabResolutionPending && activeTab === 'agents' && <BackgroundAgentsTab />}

          {/* Agent Credentials Tab (#1663) */}
          {!internalTabResolutionPending && activeTab === 'agent-credentials' && <AgentCredentialsTab />}

          {/* Dispatch Rules Tab (#1832) */}
          {!internalTabResolutionPending && activeTab === 'dispatch-rules' && <DispatchRulesSettings />}

          {/* Environments Tab (#4462) */}
          {!internalTabResolutionPending && activeTab === 'environments' && <EnvironmentsTab />}

          {/* Auto-Approval Tab (#3296) */}
          {!internalTabResolutionPending && activeTab === 'auto-approval' && <AutoApprovalTab />}
        </div>
      </div>

      {/* Add Workspace Modal */}
      <AddWorkspaceModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        githubAppSlug={process.env['NEXT_PUBLIC_GITHUB_APP_SLUG'] || 'gal-by-scheduler-systems'}
        isAdmin={isAdmin}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={!!deleteModalOrg}
        onClose={() => {
          setDeleteModalError(null)
          setDeleteModalOrg(null)
        }}
        onConfirm={handleConfirmDelete}
        accountName={deleteModalOrg?.name || ''}
        accountType={deleteModalOrg?.accountType || 'Organization'}
        isDeleting={removingOrg === deleteModalOrg?.name}
        errorMessage={deleteModalError}
      />

      {/* Delete All Confirmation Modal (#3050) */}
      <DeleteAllConfirmModal
        isOpen={showDeleteAllModal}
        onClose={() => {
          if (!deletingAll) {
            setDeleteAllError(null)
            setShowDeleteAllModal(false)
          }
        }}
        onConfirm={handleConfirmDeleteAll}
        workspaceCount={organizations.length}
        isDeleting={deletingAll}
        deletionProgress={deleteAllProgress}
        errorMessage={deleteAllError}
      />
    </div>
  )
}

function SettingsNavItem({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: typeof Settings
  label: string
  active?: boolean
  onClick?: () => void
  badge?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm rounded-lg transition-all duration-200 ${
        active
          ? 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-tertiary)] font-medium border-l-2 border-[var(--border-default)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] border-l-2 border-transparent'
      }`}
    >
      <Icon className={`w-4 h-4 ${active ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)]'}`} />
      <span>{label}</span>
      {badge && <span className="ml-auto">{badge}</span>}
    </button>
  )
}

// Wrap in Suspense because useSearchParams() requires it in Next.js App Router
export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-[var(--surface-sunken)] rounded w-32 mb-2" />
          <div className="h-4 bg-[var(--surface-sunken)] rounded w-64 mb-8" />
        </div>
      </div>
    }>
      <SettingsPageContent />
    </Suspense>
  )
}
