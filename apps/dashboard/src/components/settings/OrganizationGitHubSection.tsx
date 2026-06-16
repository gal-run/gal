'use client'

/**
 * OrganizationGitHubSection - Admin-only GitHub App Management
 *
 * Issue #64: Workspace Separation
 * US1: Admin Manages Organization GitHub Integration
 * US2: Developer Cannot See Organization GitHub Section
 *
 * This section is ONLY visible to admins and shows:
 * - GitHub App installation status
 * - Connected organization accounts
 * - GitHub App management controls
 */

import { Github, RefreshCw, Loader2, Trash2, ExternalLink } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { api, type Organization, type GitHubInstallationStatus } from '@/lib/api'
import { notifyOrganizationsUpdated, subscribeOrganizationsUpdated } from '@/lib/organizationEvents'
import { useAuth } from '@/contexts/AuthContext'
import { AccountTypeBadge } from '../AccountTypeBadge'
import { AddWorkspaceModal } from '../AddWorkspaceModal'
import { DeleteConfirmModal } from '../DeleteConfirmModal'

interface OrganizationGitHubSectionProps {
  /** Callback when organizations list changes */
  onOrganizationsChange?: (orgs: Organization[]) => void
}

export function OrganizationGitHubSection({ onOrganizationsChange }: OrganizationGitHubSectionProps) {
  const { user, isAdmin } = useAuth()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [orgsLoadError, setOrgsLoadError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; message: string } | null>(null)
  const [githubStatus, setGithubStatus] = useState<GitHubInstallationStatus | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [removingOrg, setRemovingOrg] = useState<string | null>(null)
  const [deleteModalOrg, setDeleteModalOrg] = useState<Organization | null>(null)
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null)

  // Filter to only show organization accounts (not personal/User accounts)
  const orgAccounts = organizations.filter(org => org.accountType === 'Organization' || org.accountType === 'Enterprise')

  const fetchData = useCallback(async () => {
    setOrgsLoading(true)
    try {
      // #6234: Use throwOnError so service failures surface as an error state
      // instead of silently returning an empty array with an infinite spinner.
      const [orgsResult, statusResult] = await Promise.allSettled([
        api.getOrganizations({ throwOnError: true }),
        api.getGitHubAppStatus().catch(() => ({
          installed: false, hasInstallations: false, totalInstalled: 0, installations: [], organizations: []
        } as GitHubInstallationStatus)),
      ])

      if (orgsResult.status === 'fulfilled') {
        setOrganizations(orgsResult.value)
        setOrgsLoadError(null)
        onOrganizationsChange?.(orgsResult.value)
      } else {
        console.error('Failed to fetch organizations:', orgsResult.reason)
        setOrgsLoadError('Unable to load workspaces. Please try again later.')
      }

      if (statusResult.status === 'fulfilled') {
        setGithubStatus(statusResult.value)
      }
      // Auto-sync is handled by App.tsx - no need to duplicate here
    } catch (error) {
      console.error('Failed to fetch organizations:', error)
      setOrgsLoadError('Unable to load workspaces. Please try again later.')
    } finally {
      setOrgsLoading(false)
    }
  }, [onOrganizationsChange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Re-fetch when App.tsx background sync completes
  useEffect(() => {
    return subscribeOrganizationsUpdated(() => fetchData())
  }, [fetchData])

  const handleSync = async () => {
    setSyncing(true)
    setSyncProgress({ current: 0, total: 1, message: 'Syncing workspaces...' })

    try {
      await api.quickSyncOrganizations()
      const [orgsResult, statusResult] = await Promise.allSettled([
        api.getOrganizations({ throwOnError: true }),
        api.getGitHubAppStatus(),
      ])
      if (orgsResult.status === 'fulfilled') {
        setOrganizations(orgsResult.value)
        setOrgsLoadError(null)
        onOrganizationsChange?.(orgsResult.value)
        notifyOrganizationsUpdated()
      } else {
        setOrgsLoadError('Unable to load workspaces. Please try again later.')
      }
      if (statusResult.status === 'fulfilled') {
        setGithubStatus(statusResult.value)
      }
    } catch (error) {
      console.error('Sync failed:', error)
      // #6234: Show error state instead of leaving spinner indefinitely
      setOrgsLoadError('Unable to load workspaces. Please try again later.')
    } finally {
      setSyncing(false)
      setSyncProgress(null)
    }
  }

  const handleDeleteClick = (org: Organization) => {
    setDeleteModalError(null)
    setDeleteModalOrg(org)
  }

  const handleConfirmDelete = async () => {
    if (!deleteModalOrg) return

    const orgName = deleteModalOrg.name
    setDeleteModalError(null)
    setRemovingOrg(orgName)
    try {
      const result = await api.deleteOrganization(orgName)
      if (result.success) {
        setOrganizations(orgs => {
          const updated = orgs.filter(o => o.name !== orgName)
          onOrganizationsChange?.(updated)
          notifyOrganizationsUpdated()
          return updated
        })
        setDeleteModalError(null)
        setDeleteModalOrg(null)
      } else {
        setDeleteModalError(result.error || 'Failed to remove organization')
      }
    } catch (error) {
      console.error('Failed to remove organization:', error)
      setDeleteModalError('Failed to remove organization')
    } finally {
      setRemovingOrg(null)
    }
  }

  const canDeleteOrganization = (org: Organization) => {
    // #4102: Requires admin or owner role. Server-side also enforces this.
    if (!user || !isAdmin) return false
    return true
  }

  // Use live GitHub API status as primary source of truth, Firestore orgs as fallback
  const isGitHubConnected = githubStatus?.hasInstallations ?? orgAccounts.length > 0

  return (
    <>
      <div className="dashboard-card p-6" data-testid="org-github-section">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Organization GitHub
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Manage GitHub App installations for your organization
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
            style={{ color: 'var(--accent)' }}
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? (syncProgress ? `${syncProgress.current}/${syncProgress.total}` : 'Syncing...') : 'Sync'}
          </button>
        </div>

        {/* Sync Progress */}
        {syncProgress && (
          <div className="mb-4 p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm mb-2" style={{ color: 'var(--text-primary)' }}>{syncProgress.message}</p>
            <div className="w-full bg-[var(--surface-raised)] rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: 'var(--accent)',
                  width: `${(syncProgress.current / syncProgress.total) * 100}%`
                }}
              />
            </div>
          </div>
        )}

        {/* Connection Status */}
        <div
          className="p-4 rounded-lg mb-4"
          style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center"
                style={{
                  backgroundColor: isGitHubConnected ? 'var(--status-success-light)' : 'var(--bg-tertiary)',
                  border: `1px solid ${isGitHubConnected ? 'var(--status-success)' : 'var(--border-subtle)'}`
                }}
              >
                {orgsLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
                ) : (
                  <Github className="w-5 h-5" style={{ color: isGitHubConnected ? 'var(--status-success)' : 'var(--text-muted)' }} />
                )}
              </div>
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {orgsLoading ? 'Checking...' : isGitHubConnected ? 'GitHub App Connected' : 'Not Connected'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {orgsLoading
                    ? 'Loading organization status...'
                    : isGitHubConnected
                    ? `${orgAccounts.length || githubStatus?.totalInstalled || 1} organization${(orgAccounts.length || githubStatus?.totalInstalled || 1) !== 1 ? 's' : ''} connected`
                    : 'Install the GitHub App to connect your organization'
                  }
                </p>
              </div>
            </div>
            {!isGitHubConnected && !orgsLoading && (
              <a
                href={`https://github.com/apps/${process.env['NEXT_PUBLIC_GITHUB_APP_SLUG'] || 'gal-by-scheduler-systems'}/installations/new`}
                className="btn-primary text-sm flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Install GitHub App
              </a>
            )}
          </div>
        </div>

        {/* Organization Accounts List */}
        {orgsLoading ? (
          <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading organizations...
          </div>
        ) : orgsLoadError ? (
          <div
            role="alert"
            className="text-center py-6 px-4 rounded-lg"
            style={{ backgroundColor: 'var(--status-danger-light, #fef2f2)', border: '1px solid var(--status-danger, #ef4444)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--status-danger-text, #dc2626)' }}>
              {orgsLoadError}
            </p>
          </div>
        ) : (orgAccounts.length > 0 || syncing) ? (
          <div className="space-y-3">
            <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Connected Organizations
            </h3>
            {orgAccounts.map((org) => (
              <div
                key={org.name}
                className="p-4 rounded-lg"
                style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: 'var(--accent-bg)' }}
                    >
                      <span className="font-bold" style={{ color: 'var(--accent)' }}>
                        {org.name[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {org.name}
                        </p>
                        <AccountTypeBadge accountType={org.accountType} />
                      </div>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {(org.totalRepos || 0) > 0
                          ? `${org.totalRepos} repositories`
                          : 'Scanning repositories...'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs px-2 py-1 rounded"
                      style={{ backgroundColor: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}
                    >
                      Active
                    </span>
                    {canDeleteOrganization(org) && (
                      <button
                        onClick={() => handleDeleteClick(org)}
                        disabled={removingOrg === org.name}
                        className="p-1.5 rounded-lg transition-colors hover:bg-[var(--status-danger-light)]"
                        style={{ color: 'var(--text-muted)' }}
                        title="Remove organization"
                      >
                        {removingOrg === org.name ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4 hover:text-[var(--status-danger-text)]" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={() => setShowAddModal(true)}
              className="block w-full text-center py-3 text-sm rounded-lg transition-colors"
              style={{
                color: 'var(--accent)',
                border: '1px dashed var(--accent)',
                backgroundColor: 'transparent'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--accent-bg)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              + Add Organization
            </button>
          </div>
        ) : (
          <div className="text-center py-8">
            <Github className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>No organizations connected</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Install the GitHub App on your organization to get started
            </p>
          </div>
        )}
      </div>

      {/* Add Workspace Modal - Admin can add organizations */}
      <AddWorkspaceModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        githubAppSlug={process.env['NEXT_PUBLIC_GITHUB_APP_SLUG'] || 'gal-by-scheduler-systems'}
        isAdmin={!!isAdmin}
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
        accountType={deleteModalOrg?.accountType === 'User' ? 'User' : deleteModalOrg?.accountType === 'Enterprise' ? 'Enterprise' : 'Organization'}
        isDeleting={removingOrg === deleteModalOrg?.name}
        errorMessage={deleteModalError}
      />
    </>
  )
}
