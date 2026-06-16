'use client'

/**
 * Consolidated Team Page
 *
 * Displays team members with their GAL roles, CLI install status,
 * authentication status, and sync state in one unified view.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Users, Shield, UserCheck, ChevronDown, Crown, AlertCircle, CheckCircle, XCircle, Clock, AlertTriangle, Terminal, Settings2, RefreshCw, Cpu } from 'lucide-react'
import { api, type TeamMember, type TeamMembersLiveResponse, type GalRole, type AgentPlatform, type DeveloperPlatformSyncStatus } from '@/lib/api'
import { formatRelativeTime } from '@/lib/time'
import { useAuth } from '@/contexts/AuthContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { PlatformIcon } from '@/components/PlatformBadge'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_TEAM_LIVE_RESPONSE, DEMO_DEVELOPER_STATUS, DEMO_PROVIDER_USAGE } from '@/lib/demo-data'

// Developer status types (from DeveloperStatus.tsx)
interface DeveloperStatus {
  githubLogin: string
  cliInstalled: boolean
  authenticated: boolean
  lastSyncAt?: string | null
  syncStatus: 'synced' | 'outdated' | 'never_synced'
  syncedPlatforms?: AgentPlatform[]
  platformSync?: Partial<Record<AgentPlatform, DeveloperPlatformSyncStatus>>
}

interface DeveloperStatusSummary {
  organization: string
  totalDevelopers: number
  cliInstalled: number
  authenticated: number
  authExpired: number
  syncedToLatest: number
  outOfSync: number
  neverSynced: number
  developers: DeveloperStatus[]
}

// Provider usage aggregate per developer (from /api/usage/providers/developers)
interface ProviderSnapshot {
  provider: string
  currentUsage: number
  limit: number | null
  usagePercent: number | null
  healthState: 'ok' | 'warning' | 'critical'
  lastUpdatedAt: string
}

interface DeveloperProviderUsage {
  userId: string
  githubLogin: string
  providers: ProviderSnapshot[]
  overallHealthState: 'ok' | 'warning' | 'critical'
}

// Combined team member with developer status
interface CombinedTeamMember extends TeamMember {
  cliInstalled?: boolean
  authenticated?: boolean
  syncStatus?: 'synced' | 'outdated' | 'never_synced'
  lastSyncAt?: string | null
  providerUsage?: ProviderSnapshot[]
  platformSync?: Partial<Record<AgentPlatform, DeveloperPlatformSyncStatus>>
}

// Merge team member data with developer status by githubLogin
function mergeTeamWithDeveloperStatus(
  members: TeamMember[],
  developerStatus: DeveloperStatus[],
  providerUsage?: DeveloperProviderUsage[]
): CombinedTeamMember[] {
  const devStatusMap = new Map(
    developerStatus.map(dev => [dev.githubLogin.toLowerCase(), dev])
  )
  const providerMap = new Map(
    (providerUsage ?? []).map(dev => [dev.githubLogin.toLowerCase(), dev])
  )

  return members.map(member => {
    const devStatus = devStatusMap.get(member.githubLogin.toLowerCase())
    const provUsage = providerMap.get(member.githubLogin.toLowerCase())
    return {
      ...member,
      cliInstalled: devStatus?.cliInstalled,
      authenticated: devStatus?.authenticated,
      syncStatus: devStatus?.syncStatus,
      lastSyncAt: devStatus?.lastSyncAt,
      providerUsage: provUsage?.providers,
      platformSync: devStatus?.platformSync,
    }
  })
}

function Team() {
  const router = useRouter()
  const { user } = useAuth()
  const selectedOrg = useSelectedWorkspace()
  const { isFeatureEnabled } = useFeatureFlags()
  const showProviderStats = isFeatureEnabled('provider-stats')
  const [liveData, setLiveData] = useState<TeamMembersLiveResponse | null>(null)
  const [developerStatus, setDeveloperStatus] = useState<DeveloperStatusSummary | null>(null)
  const [providerUsageData, setProviderUsageData] = useState<DeveloperProviderUsage[]>([])
  const [providerSummary, setProviderSummary] = useState<Record<string, number>>({})
  const [combinedMembers, setCombinedMembers] = useState<CombinedTeamMember[]>([])
  const [myRole, setMyRole] = useState<GalRole>('developer')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)
  const [loadingTimeout, setLoadingTimeout] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Check if current user can manage roles
  const canManageRoles = myRole === 'owner'

  useEffect(() => {
    if (!selectedOrg) {
      setLoading(false)
      return
    }

    const fetchTeamData = async () => {
      setLoading(true)
      setError(null)
      setLoadingTimeout(false)

      // Demo mode: serve pre-seeded team data
      if (isDemoMode()) {
        setLiveData(DEMO_TEAM_LIVE_RESPONSE)
        setDeveloperStatus(DEMO_DEVELOPER_STATUS as unknown as DeveloperStatusSummary)
        setMyRole('owner')
        const devUsageList = DEMO_PROVIDER_USAGE.developers as unknown as DeveloperProviderUsage[]
        setProviderUsageData(devUsageList)
        const summary: Record<string, number> = {}
        for (const dev of devUsageList) {
          for (const prov of dev.providers) {
            summary[prov.provider] = (summary[prov.provider] ?? 0) + 1
          }
        }
        setProviderSummary(summary)
        const merged = mergeTeamWithDeveloperStatus(
          DEMO_TEAM_LIVE_RESPONSE.members,
          DEMO_DEVELOPER_STATUS.developers as unknown as DeveloperStatus[],
          devUsageList
        )
        setCombinedMembers(merged)
        setLoading(false)
        return
      }

      // GAL-1228: Set 15-second timeout for loading state
      const timeoutId = setTimeout(() => {
        setLoadingTimeout(true)
        setLoading(false)
        setError('Request timed out. Please check your connection and try again.')
      }, 15000)

      try {
        // Fetch live team members, developer status, and my membership in parallel.
        // getLiveTeamMembers and getMyTeamMembership are caught individually so that
        // a permission error on partner orgs (#5646) shows a graceful empty state
        // rather than crashing the page.
        const [liveMembers, devStatusData, myMembership, provUsageData] = await Promise.all([
          api.getLiveTeamMembers(selectedOrg).catch(() => ({
            members: [],
            pendingMembers: [],
            totalMembers: 0,
            totalPending: 0,
            owners: 0,
            admins: 0,
            developers: 0,
            lastSyncedAt: new Date().toISOString(),
            syncedBy: 'system',
            cacheStatus: 'fresh' as const,
            limitedAccess: true,
            limitedAccessReason: 'fetch_failed',
          })),
          api.getDeveloperStatus(selectedOrg).catch(() => null),
          api.getMyTeamMembership(selectedOrg).catch(() => ({ member: null, galRole: 'developer' as const })),
          showProviderStats
            ? api.getDeveloperProviderUsage(selectedOrg).catch(() => null)
            : Promise.resolve(null),
        ])

        // Clear timeout if requests complete successfully
        clearTimeout(timeoutId)

        setLiveData(liveMembers)
        setDeveloperStatus(devStatusData)
        setMyRole(myMembership.galRole)

        // Build provider usage summary (count of active devs per provider)
        const devUsageList = provUsageData?.developers ?? []
        setProviderUsageData(devUsageList)
        const summary: Record<string, number> = {}
        for (const dev of devUsageList) {
          for (const prov of dev.providers) {
            summary[prov.provider] = (summary[prov.provider] ?? 0) + 1
          }
        }
        setProviderSummary(summary)

        // Merge team members with developer status and provider usage
        const merged = mergeTeamWithDeveloperStatus(
          liveMembers.members ?? [],
          devStatusData?.developers || [],
          devUsageList
        )
        setCombinedMembers(merged)
      } catch (err) {
        // Clear timeout on error
        clearTimeout(timeoutId)
        console.error('Failed to fetch team data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load team data')
      } finally {
        setLoading(false)
      }
    }

    fetchTeamData()
  }, [selectedOrg, showProviderStats])

  const handleRoleChange = async (githubId: number, newRole: GalRole) => {
    if (!selectedOrg || !canManageRoles) return

    setUpdatingRole(String(githubId))
    try {
      await api.updateLiveTeamMemberRole(selectedOrg, githubId, newRole)
      // Refresh live team data
      const liveMembers = await api.getLiveTeamMembers(selectedOrg)
      setLiveData(liveMembers)
      // Re-merge with existing developer status and provider usage
      const merged = mergeTeamWithDeveloperStatus(
        liveMembers.members ?? [],
        developerStatus?.developers || [],
        providerUsageData
      )
      setCombinedMembers(merged)
    } catch (err) {
      console.error('Failed to update role:', err)
      setError(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setUpdatingRole(null)
    }
  }

  const handleForceSync = async () => {
    if (!selectedOrg || syncing) return
    setSyncing(true)
    try {
      const liveMembers = await api.syncTeamMembers(selectedOrg)
      setLiveData(liveMembers)
      const merged = mergeTeamWithDeveloperStatus(
        liveMembers.members ?? [],
        developerStatus?.developers || [],
        providerUsageData
      )
      setCombinedMembers(merged)
    } catch (err) {
      console.error('Failed to sync:', err)
      setError(err instanceof Error ? err.message : 'Failed to sync team')
    } finally {
      setSyncing(false)
    }
  }

  // Show clear CTA when no workspace selected (GitHub not connected)
  if (!selectedOrg && !loading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Users className="w-16 h-16 mx-auto mb-6" style={{ color: 'var(--text-muted)' }} />
          <h1 className="text-2xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
            Connect GitHub to view team
          </h1>
          <p className="mb-8" style={{ color: 'var(--text-muted)' }}>
            Install the GitHub App to manage team members, roles, and track CLI sync status across your organization.
          </p>
          <button
            onClick={() => router.push('/settings?tab=github')}
            className="btn-primary px-6 py-2.5 inline-flex items-center gap-2"
          >
            <Settings2 className="w-5 h-5" />
            Go to Settings
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-8 lg:p-12">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {liveData?.lastSyncedAt ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Last synced {formatRelativeTime(new Date(liveData.lastSyncedAt))}
              </p>
            ) : null}
          </div>

          {selectedOrg && (
            <button
              onClick={handleForceSync}
              disabled={syncing || loading}
              className="inline-flex items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-xs sm:self-auto"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
                opacity: syncing ? 0.6 : 1,
              }}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync'}
            </button>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        )}

        {error && (
          <div className="p-4 rounded-lg mb-6" style={{ backgroundColor: 'var(--bg-error)', border: '1px solid var(--border-error)' }}>
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--text-error)' }} />
              <div className="flex-1">
                <p className="mb-3" style={{ color: 'var(--text-error)' }}>{error}</p>
                {loadingTimeout && (
                  <button
                    onClick={() => router.push('/settings?tab=github')}
                    className="text-sm px-4 py-2 rounded-lg inline-flex items-center gap-2"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    <Settings2 className="w-4 h-4" />
                    Check GitHub Connection
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {!loading && !error && liveData && liveData.limitedAccess && (
          <div className="p-4 rounded-lg mb-6" style={{ backgroundColor: 'var(--bg-warning)', border: '1px solid var(--border-warning)' }}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--text-warning)' }} />
              <div>
                <p className="font-medium" style={{ color: 'var(--text-warning)' }}>Limited access</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Team member list is unavailable because the GitHub App does not have organization member read permission for this org.
                  {selectedOrg ? (
                    <>
                      {' '}
                      <a
                        href={`https://github.com/organizations/${selectedOrg}/settings/installations`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--text-warning)', textDecoration: 'underline' }}
                      >
                        Grant the required permission
                      </a>
                      {' '}in your GitHub organization settings.
                    </>
                  ) : (
                    ' Contact your GitHub org admin to grant the required permission.'
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && liveData && (
          <TeamTabContent
            liveData={liveData}
            developerStatus={developerStatus}
            combinedMembers={combinedMembers}
            canManageRoles={canManageRoles}
            currentUserGithubId={user?.githubId}
            updatingRole={updatingRole}
            onRoleChange={handleRoleChange}
            showProviderStats={showProviderStats}
            providerSummary={providerSummary}
          />
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unified Team Content
// ---------------------------------------------------------------------------

function TeamTabContent({
  liveData,
  developerStatus,
  combinedMembers,
  canManageRoles,
  currentUserGithubId,
  updatingRole,
  onRoleChange,
  showProviderStats,
  providerSummary,
}: {
  liveData: TeamMembersLiveResponse
  developerStatus: DeveloperStatusSummary | null
  combinedMembers: CombinedTeamMember[]
  canManageRoles: boolean
  currentUserGithubId?: number
  updatingRole: string | null
  onRoleChange: (githubId: number, newRole: GalRole) => void
  showProviderStats: boolean
  providerSummary: Record<string, number>
}) {
  const pendingMembers = liveData.pendingMembers ?? []

  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-8 md:grid-cols-4 lg:grid-cols-7">
        <StatCard
          label="Total Members"
          value={liveData.totalMembers}
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          label="Owners"
          value={liveData.owners}
          icon={<Crown className="w-5 h-5" />}
          variant="owner"
        />
        <StatCard
          label="Admins"
          value={liveData.admins}
          icon={<Shield className="w-5 h-5" />}
          variant="admin"
        />
        <StatCard
          label="Developers"
          value={liveData.developers}
          icon={<UserCheck className="w-5 h-5" />}
          variant="developer"
        />
        <StatCard
          label="CLI Installed"
          value={developerStatus?.cliInstalled ?? 0}
          total={liveData.totalMembers}
          icon={<Terminal className="w-5 h-5" />}
          variant="success"
        />
        <StatCard
          label="Authenticated"
          value={developerStatus?.authenticated ?? 0}
          total={liveData.totalMembers}
          icon={<CheckCircle className="w-5 h-5" />}
          variant="success"
        />
        <StatCard
          label="Synced to Latest"
          value={developerStatus?.syncedToLatest ?? 0}
          total={liveData.totalMembers}
          icon={<CheckCircle className="w-5 h-5" />}
          variant="success"
        />
      </div>

      {/* Provider Usage Stats (Issue #2225) - behind feature flag */}
      {showProviderStats && Object.keys(providerSummary).length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold tracking-tight mb-3" style={{ color: 'var(--text-primary)' }}>
            Provider Usage
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {Object.entries(providerSummary)
              .sort(([, a], [, b]) => b - a)
              .map(([provider, count]) => (
                <StatCard
                  key={provider}
                  label={`${provider.charAt(0).toUpperCase() + provider.slice(1)} Active`}
                  value={count}
                  total={liveData.totalMembers}
                  icon={<Cpu className="w-5 h-5" />}
                  variant="success"
                />
              ))}
          </div>
        </div>
      )}

      {/* Role Legend */}
      <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
        <h3 className="text-sm font-semibold tracking-tight mb-3" style={{ color: 'var(--text-primary)' }}>
          Role Permissions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <Crown className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--badge-amber-text)' }} />
            <div>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Owner</span>
              <p style={{ color: 'var(--text-muted)' }}>Full access, can transfer ownership</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--badge-blue-text)' }} />
            <div>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Admin</span>
              <p style={{ color: 'var(--text-muted)' }}>Approve configs, manage team</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <UserCheck className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
            <div>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Developer</span>
              <p style={{ color: 'var(--text-muted)' }}>Sync approved configs</p>
            </div>
          </div>
        </div>
      </div>

      {pendingMembers.length > 0 && (
        <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: 'var(--status-warning-light)', border: '1px solid var(--status-warning)' }}>
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--status-warning-text)' }} />
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--status-warning-text)' }}>
                Pending collaborator approvals ({pendingMembers.length})
              </h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                These users were discovered as direct collaborators on private repositories and require owner approval before governance.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {pendingMembers.map((member) => (
              <div
                key={`pending-${member.githubId}`}
                className="flex flex-col gap-2 rounded-lg p-3 sm:flex-row sm:items-center sm:justify-between"
                style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={member.avatarUrl}
                    alt={member.githubLogin}
                    className="w-8 h-8 rounded-full flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {member.name || member.githubLogin}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                      @{member.githubLogin}
                    </p>
                  </div>
                </div>

                {canManageRoles ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onRoleChange(member.githubId, 'developer')}
                      disabled={updatingRole === String(member.githubId)}
                      className="px-3 py-1.5 text-xs rounded-lg"
                      style={{
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        opacity: updatingRole === String(member.githubId) ? 0.6 : 1,
                      }}
                    >
                      Approve as Developer
                    </button>
                    <button
                      onClick={() => onRoleChange(member.githubId, 'admin')}
                      disabled={updatingRole === String(member.githubId)}
                      className="px-3 py-1.5 text-xs rounded-lg"
                      style={{
                        backgroundColor: 'var(--accent)',
                        border: '1px solid var(--accent)',
                        color: 'var(--background)',
                        opacity: updatingRole === String(member.githubId) ? 0.6 : 1,
                      }}
                    >
                      Approve as Admin
                    </button>
                  </div>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Owner approval required
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team Members List */}
      {combinedMembers.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <p style={{ color: 'var(--text-muted)' }}>
            {pendingMembers.length > 0 ? 'No approved team members yet' : 'No team members recorded yet'}
          </p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            {pendingMembers.length > 0
              ? 'Approve pending collaborators above to add governed members.'
              : 'Team members will appear after they authenticate with the GAL CLI'}
          </p>
        </div>
      ) : (
        <div className="glass-card">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  Member
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  GAL Role
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  CLI
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  Auth
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  Sync
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  Last Active
                </th>
                {showProviderStats && (
                  <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                    Providers
                  </th>
                )}
                {canManageRoles && (
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {combinedMembers.map((member) => (
                <TeamMemberRow
                  key={member.userId}
                  member={member}
                  canManageRoles={canManageRoles}
                  currentUserGithubId={currentUserGithubId}
                  isUpdating={updatingRole === String(member.githubId)}
                  onRoleChange={(newRole) => onRoleChange(member.githubId, newRole)}
                  showProviderStats={showProviderStats}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// CLI Tab Content
// ---------------------------------------------------------------------------

function CLITabContent({
  liveData,
  developerStatus,
  combinedMembers,
}: {
  liveData: TeamMembersLiveResponse
  developerStatus: DeveloperStatusSummary | null
  combinedMembers: CombinedTeamMember[]
}) {
  const installed = combinedMembers.filter(m => m.cliInstalled)
  const notInstalled = combinedMembers.filter(m => !m.cliInstalled)

  return (
    <>
      {/* CLI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="CLI Installed"
          value={developerStatus?.cliInstalled ?? installed.length}
          total={liveData.totalMembers}
          icon={<Terminal className="w-5 h-5" />}
          variant="success"
        />
        <StatCard
          label="Not Installed"
          value={liveData.totalMembers - (developerStatus?.cliInstalled ?? installed.length)}
          total={liveData.totalMembers}
          icon={<XCircle className="w-5 h-5" />}
          variant="warning"
        />
        <StatCard
          label="Total Members"
          value={liveData.totalMembers}
          icon={<Users className="w-5 h-5" />}
        />
      </div>

      {combinedMembers.length === 0 ? (
        <EmptyState message="No team members recorded yet" detail="Team members will appear after they authenticate with the GAL CLI" />
      ) : (
        <div className="glass-card">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  Member
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  GAL Role
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  CLI Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  Last Active
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Show installed first, then not installed */}
              {[...installed, ...notInstalled].map((member) => (
                <tr
                  key={member.userId}
                  className="border-l-2 border-transparent hover:border-[var(--border-interactive)] hover:bg-[var(--surface-overlay-hover)] transition-colors"
                  style={{ borderBottom: '1px solid var(--border-color)' }}
                >
                  <td className="px-6 py-4">
                    <MemberCell member={member} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <RoleBadge role={member.galRole} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <StatusPill
                      active={Boolean(member.cliInstalled)}
                      activeLabel="Installed"
                      inactiveLabel="Not Installed"
                    />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <LastActiveCell member={member} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Auth Tab Content
// ---------------------------------------------------------------------------

function AuthTabContent({
  liveData,
  developerStatus,
  combinedMembers,
}: {
  liveData: TeamMembersLiveResponse
  developerStatus: DeveloperStatusSummary | null
  combinedMembers: CombinedTeamMember[]
}) {
  const authenticated = combinedMembers.filter(m => m.authenticated)
  const notAuthenticated = combinedMembers.filter(m => !m.authenticated)

  return (
    <>
      {/* Auth Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Authenticated"
          value={developerStatus?.authenticated ?? authenticated.length}
          total={liveData.totalMembers}
          icon={<CheckCircle className="w-5 h-5" />}
          variant="success"
        />
        <StatCard
          label="Not Authenticated"
          value={liveData.totalMembers - (developerStatus?.authenticated ?? authenticated.length)}
          total={liveData.totalMembers}
          icon={<XCircle className="w-5 h-5" />}
          variant="warning"
        />
        <StatCard
          label="Auth Expired"
          value={developerStatus?.authExpired ?? 0}
          total={liveData.totalMembers}
          icon={<AlertTriangle className="w-5 h-5" />}
          variant="error"
        />
      </div>

      {combinedMembers.length === 0 ? (
        <EmptyState message="No team members recorded yet" detail="Team members will appear after they authenticate with the GAL CLI" />
      ) : (
        <div className="glass-card">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  Member
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  GAL Role
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  Auth Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  Last Active
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Show authenticated first, then not authenticated */}
              {[...authenticated, ...notAuthenticated].map((member) => (
                <tr
                  key={member.userId}
                  className="border-l-2 border-transparent hover:border-[var(--border-interactive)] hover:bg-[var(--surface-overlay-hover)] transition-colors"
                  style={{ borderBottom: '1px solid var(--border-color)' }}
                >
                  <td className="px-6 py-4">
                    <MemberCell member={member} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <RoleBadge role={member.galRole} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <StatusPill
                      active={Boolean(member.authenticated)}
                      activeLabel="Authenticated"
                      inactiveLabel="Not Authenticated"
                    />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <LastActiveCell member={member} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Sync Tab Content
// ---------------------------------------------------------------------------

function SyncTabContent({
  liveData,
  developerStatus,
  combinedMembers,
}: {
  liveData: TeamMembersLiveResponse
  developerStatus: DeveloperStatusSummary | null
  combinedMembers: CombinedTeamMember[]
}) {
  const synced = combinedMembers.filter(m => m.syncStatus === 'synced')
  const outdated = combinedMembers.filter(m => m.syncStatus === 'outdated')
  const neverSynced = combinedMembers.filter(m => !m.syncStatus || m.syncStatus === 'never_synced')

  return (
    <>
      {/* Sync Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Synced to Latest"
          value={developerStatus?.syncedToLatest ?? synced.length}
          total={liveData.totalMembers}
          icon={<CheckCircle className="w-5 h-5" />}
          variant="success"
        />
        <StatCard
          label="Out of Sync"
          value={developerStatus?.outOfSync ?? outdated.length}
          total={liveData.totalMembers}
          icon={<AlertTriangle className="w-5 h-5" />}
          variant="warning"
        />
        <StatCard
          label="Never Synced"
          value={developerStatus?.neverSynced ?? neverSynced.length}
          total={liveData.totalMembers}
          icon={<Clock className="w-5 h-5" />}
          variant="error"
        />
      </div>

      {combinedMembers.length === 0 ? (
        <EmptyState message="No team members recorded yet" detail="Team members will appear after they authenticate with the GAL CLI" />
      ) : (
        <div className="glass-card">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  Member
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  GAL Role
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  Agent Sync
                </th>
                <th className="px-6 py-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--accent-neon)]">
                  Last Synced
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Show synced first, then outdated, then never synced */}
              {[...synced, ...outdated, ...neverSynced].map((member) => (
                <tr
                  key={member.userId}
                  className="border-l-2 border-transparent hover:border-[var(--border-interactive)] hover:bg-[var(--surface-overlay-hover)] transition-colors"
                  style={{ borderBottom: '1px solid var(--border-color)' }}
                >
                  <td className="px-6 py-4">
                    <MemberCell member={member} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <RoleBadge role={member.galRole} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <AgentSyncBadges member={member} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {member.lastSyncAt
                        ? formatRelativeTime(new Date(member.lastSyncAt))
                        : 'Never'}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function EmptyState({ message, detail }: { message: string; detail: string }) {
  return (
    <div className="text-center py-12">
      <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
      <p style={{ color: 'var(--text-muted)' }}>{message}</p>
      <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>{detail}</p>
    </div>
  )
}

function MemberCell({ member }: { member: CombinedTeamMember }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={member.avatarUrl}
        alt={member.githubLogin}
        className="w-8 h-8 rounded-full ring-2 ring-[var(--border-subtle)]"
      />
      <div>
        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
          {member.name || member.githubLogin}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          @{member.githubLogin}
        </p>
      </div>
    </div>
  )
}

const roleIconMap = {
  owner: <Crown className="w-4 h-4" style={{ color: 'var(--badge-amber-text)' }} />,
  admin: <Shield className="w-4 h-4" style={{ color: 'var(--badge-blue-text)' }} />,
  developer: <UserCheck className="w-4 h-4" style={{ color: 'var(--accent)' }} />,
}

const roleLabelMap = {
  owner: 'Owner',
  admin: 'Admin',
  developer: 'Developer',
}

function RoleBadge({ role }: { role: GalRole }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {roleIconMap[role]}
      <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
        role === 'owner' ? 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]' :
        role === 'admin' ? 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:bg-[var(--surface-sunken)] dark:text-[var(--text-tertiary)]' :
        'bg-[var(--badge-gray-bg)] text-[var(--badge-gray-text)]'
      }`}>
        {roleLabelMap[role]}
      </span>
    </div>
  )
}

function StatusPill({ active, activeLabel, inactiveLabel }: { active: boolean; activeLabel: string; inactiveLabel: string }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
        style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}
      >
        <CheckCircle className="w-3.5 h-3.5" />
        {activeLabel}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
      style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}
    >
      <XCircle className="w-3.5 h-3.5" />
      {inactiveLabel}
    </span>
  )
}

// Derived from platform registry (Issue #2821)
import { ALL_PLATFORM_IDS, PLATFORM_DISPLAY_MAP } from '@gal/types'
const AGENT_PLATFORM_ORDER: AgentPlatform[] = [...ALL_PLATFORM_IDS]
const AGENT_PLATFORM_LABELS: Record<AgentPlatform, string> = { ...PLATFORM_DISPLAY_MAP }

function AgentSyncBadges({ member }: { member: CombinedTeamMember }) {
  const platformSync = member.platformSync
  if (!platformSync || Object.keys(platformSync).length === 0) {
    // No per-agent telemetry: show greyed-out badges for all platforms
    return (
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {AGENT_PLATFORM_ORDER.map((platform) => (
          <span
            key={platform}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full"
            style={{ opacity: 0.3 }}
            title={`${AGENT_PLATFORM_LABELS[platform]} \u2014 never synced`}
          >
            <PlatformIcon platform={platform} className="w-4 h-4" />
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center gap-1 flex-wrap">
      {AGENT_PLATFORM_ORDER.map((platform) => {
        const status = platformSync[platform]
        const isSynced = status?.syncStatus === 'synced'
        const isOutdated = status?.syncStatus === 'outdated'
        const hasStatus = Boolean(status)

        let tooltipText = `${AGENT_PLATFORM_LABELS[platform]} \u2014 never synced`
        if (status?.lastSyncAt) {
          tooltipText = `${AGENT_PLATFORM_LABELS[platform]} \u2014 synced ${formatRelativeTime(new Date(status.lastSyncAt))}`
        } else if (hasStatus) {
          tooltipText = `${AGENT_PLATFORM_LABELS[platform]} \u2014 ${status?.syncStatus === 'outdated' ? 'outdated' : 'never synced'}`
        }

        return (
          <span
            key={platform}
            className="relative inline-flex items-center justify-center w-5 h-5 rounded-full"
            style={{ opacity: hasStatus ? 1 : 0.3 }}
            title={tooltipText}
          >
            <PlatformIcon platform={platform} className="w-4 h-4" />
            {isOutdated && (
              <span
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                style={{ backgroundColor: 'var(--color-warning, #f59e0b)' }}
              />
            )}
            {isSynced && status?.syncStatus === 'synced' && status?.syncedConfigVersion && (
              null /* full-colour badge, no indicator needed */
            )}
          </span>
        )
      })}
    </div>
  )
}

// SyncStatusBadge removed — replaced by AgentSyncBadges (#2943)

function LastActiveCell({ member }: { member: CombinedTeamMember }) {
  return (
    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
      {member.lastActiveAt
        ? formatRelativeTime(new Date(member.lastActiveAt))
        : member.lastSyncAt
          ? formatRelativeTime(new Date(member.lastSyncAt))
          : 'Never'}
    </p>
  )
}

function BooleanStatusIcon({ value }: { value: boolean | undefined }) {
  if (value) {
    return <CheckCircle className="w-5 h-5 mx-auto" style={{ color: 'var(--accent)' }} />
  }

  return <XCircle className="w-5 h-5 mx-auto" style={{ color: 'var(--text-muted)' }} />
}

// SyncStatusIcon replaced by AgentSyncBadges for per-agent logo badges (#2943)

// Combined StatCard supporting both role and CLI status variants
function StatCard({
  label,
  value,
  total,
  icon,
  variant = 'default',
}: {
  label: string
  value: number
  total?: number
  icon: React.ReactNode
  variant?: 'default' | 'owner' | 'admin' | 'developer' | 'success' | 'warning' | 'error'
}) {
  const colors = {
    default: 'var(--text-muted)',
    owner: 'var(--badge-amber-text)',
    admin: 'var(--badge-blue-text)',
    developer: 'var(--accent)',
    success: 'var(--accent)',
    warning: 'var(--color-warning)',
    error: 'var(--text-error)',
  }

  const percentage = total ? Math.round((value / total) * 100) : null

  return (
    <div className="glass-card p-4 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between mb-2">
        <div style={{ color: colors[variant] }}>
          {icon}
        </div>
        {percentage !== null && (
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            {percentage}%
          </span>
        )}
      </div>
      <p className="text-xl font-bold mb-1 text-[var(--accent-neon)]">
        {value}
        {total !== undefined && (
          <span className="text-sm font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
            / {total}
          </span>
        )}
      </p>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Team Member Row (for Team tab)
// ---------------------------------------------------------------------------

const PROVIDER_BRANDS: Record<string, { backgroundColor: string; color: string }> = {
  claude: {
    backgroundColor: 'var(--brand-claude-bg)',
    color: 'var(--brand-claude)',
  },
  codex: {
    backgroundColor: 'var(--brand-codex-bg)',
    color: 'var(--brand-codex)',
  },
  gemini: {
    backgroundColor: 'var(--brand-gemini-bg)',
    color: 'var(--brand-gemini)',
  },
  'cursor-agent': {
    backgroundColor: 'var(--brand-cursor-agent-bg)',
    color: 'var(--brand-cursor-agent)',
  },
  copilot: {
    backgroundColor: 'var(--brand-copilot-bg)',
    color: 'var(--brand-copilot)',
  },
}

const HEALTH_BORDER_COLORS: Record<string, string> = {
  ok: 'var(--status-success)',
  warning: 'var(--status-warning)',
  critical: 'var(--status-danger)',
}

function TeamMemberRow({
  member,
  canManageRoles,
  currentUserGithubId,
  isUpdating,
  onRoleChange,
  showProviderStats,
}: {
  member: CombinedTeamMember
  canManageRoles: boolean
  currentUserGithubId?: number
  isUpdating: boolean
  onRoleChange: (newRole: GalRole) => void
  showProviderStats: boolean
}) {
  const [showRoleMenu, setShowRoleMenu] = useState(false)
  const isCurrentUser = currentUserGithubId !== undefined && member.githubId === currentUserGithubId

  // Only owners can change roles
  const canChangeRole = canManageRoles && !isCurrentUser

  // Available roles: only admin and developer (owner is not assignable)
  const availableRoles: GalRole[] = ['admin', 'developer']

  return (
    <tr className="border-l-2 border-transparent hover:border-[var(--border-interactive)] hover:bg-[var(--surface-overlay-hover)] transition-colors" style={{ borderBottom: '1px solid var(--border-color)' }}>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <img
            src={member.avatarUrl}
            alt={member.githubLogin}
            className="w-8 h-8 rounded-full ring-2 ring-[var(--border-subtle)]"
          />
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {member.name || member.githubLogin}
              </p>
              {isCurrentUser && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}>
                  You
                </span>
              )}
            </div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              @{member.githubLogin}
            </p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-center">
        <RoleBadge role={member.galRole} />
      </td>
      <td className="px-6 py-4 text-center">
        <BooleanStatusIcon value={member.cliInstalled} />
      </td>
      <td className="px-6 py-4 text-center">
        <BooleanStatusIcon value={member.authenticated} />
      </td>
      <td className="px-6 py-4 text-center">
        <AgentSyncBadges member={member} />
      </td>
      <td className="px-6 py-4 text-center">
        <LastActiveCell member={member} />
      </td>
      {showProviderStats && (
        <td className="px-6 py-4 text-center">
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            {member.providerUsage && member.providerUsage.length > 0 ? (
              member.providerUsage.map((prov) => (
                <span
                  key={prov.provider}
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: PROVIDER_BRANDS[prov.provider]?.backgroundColor ?? 'var(--badge-gray-bg)',
                    color: PROVIDER_BRANDS[prov.provider]?.color ?? 'var(--badge-gray-text)',
                    border: `1px solid ${HEALTH_BORDER_COLORS[prov.healthState] ?? 'var(--border-default)'}`,
                  }}
                  title={`${prov.provider}: ${prov.usagePercent != null ? `${Math.round(prov.usagePercent)}% used` : 'usage unknown'} (${prov.healthState})`}
                >
                  {prov.provider.charAt(0).toUpperCase() + prov.provider.slice(1)}
                </span>
              ))
            ) : (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>--</span>
            )}
          </div>
        </td>
      )}
      {canManageRoles && (
        <td className="px-6 py-4 text-right">
          {canChangeRole ? (
            <div className="relative inline-block">
              <button
                onClick={() => setShowRoleMenu(!showRoleMenu)}
                disabled={isUpdating}
                className="px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  opacity: isUpdating ? 0.5 : 1,
                }}
              >
                {isUpdating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Change Role
                    <ChevronDown className="w-4 h-4" />
                  </>
                )}
              </button>
              {showRoleMenu && !isUpdating && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowRoleMenu(false)}
                  />
                  <div
                    className="absolute right-0 mt-1 w-40 rounded-lg shadow-lg z-20 py-1"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    {availableRoles.map((role) => (
                      <button
                        key={role}
                        onClick={() => {
                          onRoleChange(role)
                          setShowRoleMenu(false)
                        }}
                        className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 hover:bg-opacity-50"
                        style={{
                          color: member.galRole === role ? 'var(--accent)' : 'var(--text-primary)',
                          backgroundColor: member.galRole === role ? 'var(--bg-secondary)' : 'transparent',
                        }}
                      >
                        {roleIconMap[role]}
                        {roleLabelMap[role]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {isCurrentUser ? 'Cannot change own role' : 'No permission'}
            </span>
          )}
        </td>
      )}
    </tr>
  )
}

export default Team
