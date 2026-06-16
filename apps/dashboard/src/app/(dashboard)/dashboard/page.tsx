'use client'

import { Loader2, ArrowRight, Copy, Check, CheckCircle2, Clock, User, FolderCode, FileCode2, Settings2, Terminal, BarChart3, Search, ShieldCheck, FlaskConical, GitBranch } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Component, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { useUserContext } from '@/hooks/useUserContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useAuth } from '@/contexts/AuthContext'
import { useIsOnboardingComplete } from '@/hooks/useIsOnboardingComplete'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { api } from '@/lib/api'
import { VSCODE_INSTALL_GUIDE_PATH } from '@/lib/config'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_ORGANIZATION, DEMO_DEVELOPER_STATUS, DEMO_PROPOSALS } from '@/lib/demo-data'
import { useDriftStatus } from '@/hooks/useDriftStatus'
import { DriftStatusBadge } from '@/components/DriftStatusBadge'
import type { Organization } from '@/lib/api'

// Brand logos as SVG components
const GitHubLogo = () => (
  <svg viewBox="0 0 24 24" className="w-8 h-8" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
)

const VSCodeLogo = () => (
  <svg viewBox="0 0 24 24" className="w-8 h-8 text-[var(--brand-vscode)]" fill="currentColor">
    <path d="M17.583 2.603l-4.016 3.897L7.632 2.093 2.459 4.81v14.38l5.173 2.717 5.935-4.507 4.016 3.897 4.958-2.503V5.106l-4.958-2.503zM7.632 15.29V8.71L12.2 12l-4.568 3.29zm9.951.968l-3.742-2.882V10.624l3.742-2.882v8.516z"/>
  </svg>
)

// Personal stats type (US9)
interface PersonalStats {
  connected: boolean
  username: string
  totalRepos: number
  reposWithConfigs: number
  totalConfigs: number
  hasApprovedConfig: boolean
  approvedConfigRepo: string | null
  lastSyncAt: string | null
  lastScanAt: string | null
}

function Dashboard() {
  const router = useRouter()
  const { hasPersonalGitHub, personalGitHubUsername } = useWorkspace()
  const { context } = useUserContext() // Phase 1: Get user capabilities
  const { isPageVisibleForUser } = useFeatureFlags()
  const { user } = useAuth()
  const { isOnboardingComplete } = useIsOnboardingComplete()
  const selectedWorkspace = useSelectedWorkspace()
  // Drift status for org projects (#1066) - must be called unconditionally
  const { reports: driftReports, loading: driftLoading } = useDriftStatus(selectedWorkspace !== 'personal' ? selectedWorkspace : undefined)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  // Check if billing page is visible (internal feature flag) - Fix for #1227, #1274
  // Uses shared useIsOnboardingComplete hook to ensure consistency with sidebar navigation.
  const userOrgs = user?.organizations || []
  const showBillingUpgrade = isPageVisibleForUser('billing', userOrgs) && isOnboardingComplete
  const showWorkflowTesting = isPageVisibleForUser(
    'workflow-testing',
    userOrgs,
    selectedWorkspace,
  )

  // Personal workspace state (US9: Personal Dashboard Stats)
  const [personalStats, setPersonalStats] = useState<PersonalStats | null>(null)
  const [personalLoading, setPersonalLoading] = useState(false)

  const fetchOrganizations = useCallback(async () => {
    setOrgsLoading(true)
    try {
      if (isDemoMode()) {
        setOrganizations([DEMO_ORGANIZATION as unknown as Organization])
      } else {
        // CORE single-tenant path: read connected organizations through the
        // CORE api client (src/lib/api.ts) rather than the EE cross-org
        // repository layer (src/ee/contexts/CoreServicesContext).
        const orgs = await api.getOrganizations()
        setOrganizations(orgs)
      }
    } catch (error) {
      console.error('Failed to fetch organizations:', error)
    } finally {
      setOrgsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrganizations()
  }, [fetchOrganizations])

  // Re-derive org data when workspace switcher changes
  // selectedWorkspace drives the org lookup at render time (line ~362),
  // but the org list itself may need a refresh to ensure freshness.
  useEffect(() => {
    if (selectedWorkspace && selectedWorkspace !== 'personal') {
      fetchOrganizations()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkspace])

  // Derive whether selected workspace is a personal account from the org list
  const isPersonalWorkspace = useMemo(() => {
    if (!selectedWorkspace) return false
    const account = organizations.find(o => o.name === selectedWorkspace)
    return account?.accountType === 'User'
  }, [selectedWorkspace, organizations])

  // Fetch personal stats when in personal workspace (US9)
  useEffect(() => {
    if (!isPersonalWorkspace || !hasPersonalGitHub) return

    async function fetchPersonalStats() {
      setPersonalLoading(true)
      try {
        const stats = await api.getPersonalStats()
        setPersonalStats(stats)
      } catch (err) {
        console.error('Failed to fetch personal stats:', err)
      } finally {
        setPersonalLoading(false)
      }
    }

    fetchPersonalStats()
  }, [isPersonalWorkspace, hasPersonalGitHub])

  const copyCommand = () => {
    navigator.clipboard.writeText('gal sync --pull')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (orgsLoading || personalLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    )
  }

  // Personal Workspace View (US9: Personal Dashboard Stats)
  if (isPersonalWorkspace) {
    if (!hasPersonalGitHub) {
      return (
        <div className="h-full flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="icon-container green w-16 h-16 rounded-2xl mx-auto mb-6">
              <User className="w-8 h-8" style={{ color: 'var(--accent)' }} />
            </div>
            <h1 className="text-page-title text-2xl mb-3">
              Personal Workspace
            </h1>
            <p className="mb-8" style={{ color: 'var(--text-muted)' }}>
              Connect your personal GitHub to discover and sync AI coding agent configs from your repositories.
            </p>
            <button
              onClick={() => router.push('/settings?tab=github')}
              className="btn-primary px-6 py-2.5 inline-flex items-center gap-2"
            >
              <GitHubLogo />
              Connect Personal GitHub
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="h-full flex flex-col p-8 lg:p-12 relative">

        {/* Header */}
        <div className="mb-12 relative">
          <div className="flex items-center gap-3">
            <div className="icon-container green w-10 h-10 rounded-xl">
              <User className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h1 className="text-page-title text-xl">
                Personal Workspace
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                @{personalGitHubUsername || personalStats?.username || 'you'}
              </p>
            </div>
          </div>
        </div>

        {/* Stats Cards (T063) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10 relative">
          <StatCard
            icon={<FolderCode className="w-5 h-5" />}
            label="Repos with Configs"
            value={personalStats?.reposWithConfigs ?? 0}
            subtext={`of ${personalStats?.totalRepos ?? 0} total repos`}
          />
          <StatCard
            icon={<FileCode2 className="w-5 h-5" />}
            label="Total Configs"
            value={personalStats?.totalConfigs ?? 0}
            subtext="discovered configs"
          />
          <StatCard
            icon={<Settings2 className="w-5 h-5" />}
            label="Approved Config"
            value={personalStats?.hasApprovedConfig ? 'Set' : 'Not Set'}
            subtext={personalStats?.hasApprovedConfig ? (personalStats.approvedConfigRepo || 'Source repo set') : 'Set up your approved config →'}
            highlight={personalStats?.hasApprovedConfig}
            onClick={() => router.push('/approved-config')}
          />
        </div>

        {/* Main Actions */}
        <div className="flex-1 flex flex-col justify-center max-w-2xl relative">
          <div className="space-y-6">
            {/* Phase 1: Personal users can always run discovery on their own repos */}
            <ActionRow
              label="Discovery"
              description="Scan and browse configs in your personal repos"
              onClick={() => router.push('/discovery')}
            />
            {/* Phase 1: Personal users can set their own approved config */}
            <ActionRow
              label="Approved Config"
              description="Set which repo to sync configs from"
              onClick={() => router.push('/approved-config')}
              primary
            />
            <div className="pt-6">
              <p className="text-xs uppercase tracking-wider mb-3 flex items-center gap-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-neon)]" />
                Sync to local
              </p>
              <div
                className="code-block inline-flex items-center gap-3 cursor-pointer transition-all hover:opacity-80"
                onClick={copyCommand}
              >
                <span>gal sync --pull</span>
                {copied ? (
                  <Check className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                ) : (
                  <Copy className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                )}
              </div>

              {/* Last Sync Status (T064) */}
              <div className="mt-4 flex items-center gap-3 text-sm">
                {personalStats?.lastSyncAt ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Last sync: <span style={{ color: 'var(--text-muted)' }}>{new Date(personalStats.lastSyncAt).toLocaleString()}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    <span style={{ color: 'var(--text-muted)' }}>Never synced</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // No orgs and no personal GitHub - Qodo-style Home Page
  if (organizations.length === 0 && !hasPersonalGitHub) {
    return (
      <div className="min-h-full p-6 md:p-8 lg:p-12 relative">

        <div className="max-w-5xl mx-auto relative">
          {/* Header */}
          <h1 className="text-page-title text-3xl mb-12">
            Welcome to GAL
          </h1>

          {/* Main 2-column cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
            {/* Install in IDE Card */}
            <div className="feature-card">
              <div className="feature-icon bg-[var(--surface-sunken)]">
                <VSCodeLogo />
              </div>
              <h2 className="text-card-title text-lg mb-2">
                Install GAL in your IDE
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                VS Code, Cursor, Windsurf, or VSCodium
              </p>

              <button
                onClick={() => router.push(VSCODE_INSTALL_GUIDE_PATH)}
                className="link-button"
              >
                Open install guide
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Connect GitHub Card */}
            <div className="feature-card">
              <div className="feature-icon bg-[var(--surface-sunken)]">
                <GitHubLogo />
              </div>
              <h2 className="text-card-title text-lg mb-2">
                Connect to your repositories
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                GitHub integration
              </p>

              <div className="flex items-center gap-3 mb-6 text-[var(--text-primary)]">
                <span className="font-medium">GitHub</span>
              </div>

              <a
                href={`https://github.com/apps/${process.env['NEXT_PUBLIC_GITHUB_APP_SLUG'] || 'gal-by-scheduler-systems'}/installations/new`}
                className="link-button"
              >
                Connect GitHub
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* You might also want to section */}
          <div className="divider" />
          <h2 className="text-section-title mb-6 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-neon)]" />
            You might also want to
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Install CLI Card */}
            <div className="feature-card">
              <div className="feature-icon bg-[var(--surface-sunken)]">
                <Terminal className="w-8 h-8" />
              </div>
              <h3 className="text-card-title mb-1">
                Install the GAL CLI
              </h3>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                Sync configurations to your local machine
              </p>
              <button
                onClick={() => router.push('/get-started')}
                className="link-button"
              >
                Get started
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Upgrade plan Card - only visible when billing page is enabled (internal feature flag) - Fix for #1227 */}
            {showBillingUpgrade && (
              <div className="feature-card">
                <div className="feature-icon bg-[var(--surface-sunken)]">
                  <BarChart3 className="w-8 h-8" />
                </div>
                <h3 className="text-card-title mb-1">
                  Upgrade your plan
                </h3>
                <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                  Get enforcement, automation, and enterprise features
                </p>
                <button
                  onClick={() => router.push('/billing')}
                  className="link-button"
                >
                  Compare plans
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Selected workspace IS the org — no fallback, no wrong data
  const org = selectedWorkspace
    ? organizations.find(o => o.name === selectedWorkspace) || null
    : null

  // Phase 1: Get capabilities for current org
  const orgCapabilities = context?.orgs.find(o => o.name === org?.name)?.capabilities

  return (
    <div className="min-h-full p-8 lg:p-12 relative">
      <div className="max-w-4xl relative overflow-hidden">
        {/* Org Header */}
        <div className="flex items-center gap-4 border-b pb-6 mb-8" style={{ borderColor: 'var(--border-subtle)' }}>
          <div
            className="flex items-center justify-center rounded-lg text-lg font-semibold shrink-0"
            style={{
              width: 40,
              height: 40,
              backgroundColor: 'var(--surface-sunken)',
              color: 'var(--text-secondary)',
            }}
          >
            {org?.name?.charAt(0)?.toUpperCase() || 'O'}
          </div>
          <h1 className="text-2xl font-bold" style={{ letterSpacing: '-0.025em', color: 'var(--text-primary)' }}>
            {org?.name}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Centralized view of your organization&apos;s coding agent governance status
          </p>
        </div>

        {/* KPI Summary Bar (demo mode) */}
        {isDemoMode() && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="dashboard-card p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{DEMO_DEVELOPER_STATUS.totalDevelopers}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Total Developers</p>
            </div>
            <div className="dashboard-card p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {Math.round((DEMO_DEVELOPER_STATUS.syncedToLatest / DEMO_DEVELOPER_STATUS.totalDevelopers) * 100)}%
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Synced to Config</p>
            </div>
            <div className="dashboard-card p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {DEMO_PROPOSALS.filter(p => p.status === 'pending').length}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Open Proposals</p>
            </div>
            <div className="dashboard-card p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{DEMO_DEVELOPER_STATUS.cliInstalled}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>CLI Installed</p>
            </div>
          </div>
        )}

        {/* Quick Actions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 border-b pb-8" style={{ borderColor: 'var(--border-subtle)' }}>
          <ActionCard
            icon={<Search className="w-5 h-5" />}
            iconBg="neutral"
            label="Discovery"
            description="Browse AI coding tool configs in your repos"
            onClick={() => router.push('/discovery')}
          />
          <ActionCard
            icon={<ShieldCheck className="w-5 h-5" />}
            iconBg="blue"
            label="Approved Config"
            description={orgCapabilities?.canManageApprovedConfig ? 'Set the org-wide standard' : 'View the org-wide standard'}
            onClick={() => router.push('/approved-config')}
          />
          {showWorkflowTesting && (
            <ActionCard
              icon={<FlaskConical className="w-5 h-5" />}
              iconBg="purple"
              label="Workflow Testing"
              description="Test slash commands and hooks before deployment"
              onClick={() => router.push('/workflow-testing')}
            />
          )}
        </div>

        {/* Drift Status Section (#1066) */}
        {!driftLoading && driftReports.length > 0 && (
          <div className="mb-8 border-b pb-8" style={{ borderColor: 'var(--border-subtle)' }}>
            <p className="text-xs font-medium uppercase mb-3 flex items-center gap-2" style={{ letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-neon)]" />
              Drift Status
            </p>
            <div className="space-y-2">
              {driftReports.map((report) => (
                <div
                  key={report.projectId}
                  className="flex items-center justify-between rounded-lg p-3"
                  style={{ backgroundColor: 'var(--surface-sunken)' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <GitBranch className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {report.projectId}
                    </span>
                  </div>
                  <DriftStatusBadge report={report} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Developer Sync Section */}
        <div className="overflow-hidden">
          <p className="text-xs font-medium uppercase mb-3 flex items-center gap-2" style={{ letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-neon)]" />
            Developer Sync
          </p>
          <div
            className="rounded-lg p-4 flex items-center justify-between overflow-hidden"
            style={{
              backgroundColor: 'var(--surface-inverse)',
              border: '1px solid var(--border-inverse)',
            }}
          >
            <code className="text-sm" style={{ fontFamily: 'var(--font-family-mono)', color: 'var(--text-inverse)' }}>
              <span style={{ color: 'var(--text-inverse-subtle)' }}>$</span>{' '}gal sync --pull
            </code>
            <button
              onClick={copyCommand}
              className="rounded px-2 py-1 text-xs transition-colors"
              style={{
                backgroundColor: 'var(--surface-overlay)',
                color: 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-overlay-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--surface-overlay)' }}
            >
              {copied ? (
                <span className="flex items-center gap-1">
                  <Check className="w-3 h-3" /> Copied
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Copy className="w-3 h-3" /> Copy
                </span>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

const ACTION_CARD_COLORS = {
  neutral: {
    bg: 'var(--surface-sunken)',
    text: 'var(--text-secondary)',
  },
  blue: {
    bg: 'var(--badge-blue-bg)',
    text: 'var(--badge-blue-text)',
  },
  purple: {
    bg: 'var(--badge-purple-bg)',
    text: 'var(--badge-purple-text)',
  },
} as const

function ActionCard({
  icon,
  iconBg,
  label,
  description,
  onClick,
}: {
  icon: React.ReactNode
  iconBg: keyof typeof ACTION_CARD_COLORS
  label: string
  description: string
  onClick: () => void
}) {
  const colors = ACTION_CARD_COLORS[iconBg]
  return (
    <button
      onClick={onClick}
      className="dashboard-card w-full flex items-start gap-4 p-5 text-left group cursor-pointer shadow-sm hover:shadow-md transition-all duration-200 border-l-2 border-[var(--border-subtle)] hover:border-[var(--border-interactive)]"
    >
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: colors.bg, color: colors.text }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            {label}
          </h3>
          <ArrowRight
            className="w-4 h-4 transition-colors shrink-0 ml-2"
            style={{ color: 'var(--text-muted)' }}
          />
        </div>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {description}
        </p>
      </div>
    </button>
  )
}

// Legacy ActionRow kept for personal workspace view
function ActionRow({
  label,
  description,
  onClick,
  primary,
}: {
  label: string
  description: string
  onClick: () => void
  primary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`dashboard-card w-full flex items-center justify-between p-5 text-left group cursor-pointer shadow-sm hover:shadow-md transition-all duration-200${primary ? '' : ''}`}
      style={primary ? { borderColor: 'var(--accent)' } : undefined}
    >
      <div>
        <h3 className="text-card-title mb-0.5">
          {label}
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {description}
        </p>
      </div>
      <ArrowRight
        className="w-5 h-5 transition-transform group-hover:translate-x-1"
        style={{ color: primary ? 'var(--accent)' : 'var(--text-muted)' }}
      />
    </button>
  )
}

// Stats card component for personal workspace (US9)
function StatCard({
  icon,
  label,
  value,
  subtext,
  highlight,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  subtext: string
  highlight?: boolean
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`dashboard-card p-5 shadow-sm hover:shadow-md transition-all duration-200 border-l-2 border-[var(--border-subtle)] hover:border-[var(--border-interactive)]${onClick ? ' cursor-pointer w-full text-left' : ''}`}
      style={highlight ? { borderColor: 'var(--accent)' } : undefined}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: highlight ? 'var(--accent-bg)' : 'var(--bg-tertiary)' }}
        >
          <span style={{ color: highlight ? 'var(--accent)' : 'var(--text-muted)' }}>
            {icon}
          </span>
        </div>
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <p className="text-2xl mb-1 text-[var(--accent-neon)]" style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em' }}>
        {value}
      </p>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{subtext}</p>
    </Tag>
  )
}

/**
 * Error boundary that catches DOM manipulation errors (e.g., insertBefore on removed nodes)
 * caused by React reconciliation races during workspace switches (GAL-DASHBOARD-A / #2643).
 * Instead of crashing, it silently retries by resetting React's component tree.
 */
class DashboardErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; retryCount: number }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, retryCount: 0 }
  }

  static getDerivedStateFromError(): { hasError: true } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const isDomError =
      error.name === 'NotFoundError' ||
      error.message.includes('insertBefore') ||
      error.message.includes('removeChild') ||
      error.message.includes('appendChild')

    if (isDomError) {
      console.warn('[Dashboard] DOM reconciliation error caught — retrying render (GAL-DASHBOARD-A)', error.message)
    } else {
      // Re-throw non-DOM errors so they propagate to the global Sentry boundary
      throw error
    }
  }

  componentDidUpdate(_: unknown, prevState: { hasError: boolean; retryCount: number }): void {
    if (this.state.hasError && this.state.retryCount < 3) {
      // Schedule a retry on the next tick
      setTimeout(() => {
        this.setState((s) => ({ hasError: false, retryCount: s.retryCount + 1 }))
      }, 0)
    }
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.retryCount >= 3) {
      // After 3 retries, show a minimal fallback instead of crashing
      return (
        <div className="h-full flex items-center justify-center p-8">
          <div className="text-center">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Something went wrong. Please refresh the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 btn-primary px-4 py-2 text-sm"
            >
              Refresh
            </button>
          </div>
        </div>
      )
    }
    if (this.state.hasError) {
      // Show loading spinner during retry
      return (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      )
    }
    return this.props.children
  }
}

function DashboardPage() {
  return (
    <DashboardErrorBoundary>
      <Dashboard />
    </DashboardErrorBoundary>
  )
}

export default DashboardPage
