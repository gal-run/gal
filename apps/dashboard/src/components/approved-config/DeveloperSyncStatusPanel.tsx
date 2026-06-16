'use client'

import type { ReactNode } from 'react'
import { Activity, AlertCircle, CheckCircle2, Clock3, Loader2 } from 'lucide-react'
import { PlatformIcon } from '@/components/PlatformBadge'
import type { AgentPlatform, DeveloperStatusSummary } from '@/lib/api'

const PLATFORM_ORDER: AgentPlatform[] = ['claude', 'cursor', 'copilot', 'gemini', 'codex', 'windsurf']

function formatRelativeTime(value?: string | null): string {
  if (!value) return 'Never'

  const date = new Date(value)
  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.round(diffMs / 60000)

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getStatusColors(status: 'synced' | 'outdated' | 'never_synced') {
  if (status === 'synced') {
    return {
      backgroundColor: 'var(--status-success-light)',
      color: 'var(--status-success-text)',
      borderColor: 'var(--status-success-text)',
    }
  }

  if (status === 'outdated') {
    return {
      backgroundColor: 'var(--status-warning-light)',
      color: 'var(--status-warning-text)',
      borderColor: 'var(--status-warning)',
    }
  }

  return {
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-muted)',
    borderColor: 'var(--border-subtle)',
  }
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string
  value: number
  icon: ReactNode
}) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-tertiary)' }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em]" style={{ color: 'var(--text-muted)' }}>
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            {value}
          </p>
        </div>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--accent)' }}
        >
          {icon}
        </div>
      </div>
    </div>
  )
}

export function DeveloperSyncStatusPanel({
  developerStatus,
  loading,
  error,
  bundleVersion,
}: {
  developerStatus: DeveloperStatusSummary | null
  loading: boolean
  error: string | null
  bundleVersion?: string | null
}) {
  const platformCounts = PLATFORM_ORDER.map((platform) => ({
    platform,
    synced: developerStatus?.developers.filter((developer) => developer.platformSync?.[platform]?.syncStatus === 'synced').length ?? 0,
    outdated: developerStatus?.developers.filter((developer) => developer.platformSync?.[platform]?.syncStatus === 'outdated').length ?? 0,
  })).filter((entry) => entry.synced > 0 || entry.outdated > 0)

  const sortedDevelopers = [...(developerStatus?.developers ?? [])].sort((left, right) => {
    const leftActive = Object.keys(left.platformSync ?? {}).length
    const rightActive = Object.keys(right.platformSync ?? {}).length
    if (leftActive !== rightActive) return rightActive - leftActive
    return left.githubLogin.localeCompare(right.githubLogin)
  })

  return (
    <div className="dashboard-card p-6 mb-6 border border-[var(--accent-neon)]/10">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" style={{ color: 'var(--accent)' }} />
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Agent Sync Status
            </h2>
          </div>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            See which coding agents have actually pulled the approved bundle for each developer.
          </p>
        </div>
        <div
          className="rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
        >
          {bundleVersion ? `Current bundle v${bundleVersion}` : 'Bundle version unavailable'}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      ) : error ? (
        <div
          className="mt-6 flex items-center gap-3 rounded-xl border p-4"
          style={{ borderColor: 'var(--status-danger-text)', backgroundColor: 'var(--status-danger-light)', color: 'var(--status-danger-text)' }}
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      ) : !developerStatus ? null : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <StatCard label="Synced To Latest" value={developerStatus.syncedToLatest} icon={<CheckCircle2 className="h-5 w-5" />} />
            <StatCard label="Out Of Sync" value={developerStatus.outOfSync} icon={<AlertCircle className="h-5 w-5" />} />
            <StatCard label="Never Synced" value={developerStatus.neverSynced} icon={<Clock3 className="h-5 w-5" />} />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {platformCounts.length > 0 ? (
              platformCounts.map(({ platform, synced, outdated }) => (
                <div
                  key={platform}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
                  style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-tertiary)' }}
                >
                  <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
                  <span style={{ color: 'var(--text-primary)' }}>{platform}</span>
                  <span style={{ color: 'var(--status-success-text)' }}>{synced} synced</span>
                  {outdated > 0 ? <span style={{ color: 'var(--status-warning-text)' }}>{outdated} outdated</span> : null}
                </div>
              ))
            ) : (
              <div
                className="rounded-xl border px-4 py-3 text-sm"
                style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
              >
                No per-agent telemetry yet. Developers need to sync with the latest CLI to populate this view.
              </div>
            )}
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--border-subtle)' }}>
            <div
              className="grid gap-4 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.65fr)_minmax(0,1.8fr)_minmax(0,0.6fr)]"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
            >
              <span>Developer</span>
              <span>Overall</span>
              <span>Agent Sync</span>
              <span>Last Sync</span>
            </div>

            <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
              {sortedDevelopers.map((developer) => (
                <div
                  key={developer.githubLogin}
                  className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.65fr)_minmax(0,1.8fr)_minmax(0,0.6fr)]"
                  style={{ backgroundColor: 'var(--bg-secondary)' }}
                >
                  <div>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      @{developer.githubLogin}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {developer.cliInstalled ? 'CLI installed' : 'CLI not installed'}
                      {' • '}
                      {developer.authenticated ? 'authenticated' : 'not authenticated'}
                    </p>
                  </div>

                  <div>
                    <span
                      className="inline-flex rounded-full border px-2.5 py-1 text-xs font-medium"
                      style={getStatusColors(developer.syncStatus)}
                    >
                      {developer.syncStatus === 'synced'
                        ? 'Synced'
                        : developer.syncStatus === 'outdated'
                          ? 'Outdated'
                          : 'Never synced'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {PLATFORM_ORDER.filter((platform) => developer.platformSync?.[platform]).length > 0 ? (
                      PLATFORM_ORDER.filter((platform) => developer.platformSync?.[platform]).map((platform) => {
                        const status = developer.platformSync?.[platform]
                        if (!status) return null

                        return (
                          <div
                            key={`${developer.githubLogin}-${platform}`}
                            className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium"
                            style={getStatusColors(status.syncStatus)}
                          >
                            <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
                            <span>{platform}</span>
                            {status.syncedConfigVersion ? <span>v{status.syncedConfigVersion}</span> : null}
                          </div>
                        )
                      })
                    ) : (
                      <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                        No per-agent telemetry
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {formatRelativeTime(developer.lastSyncAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
