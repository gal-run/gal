'use client'

/**
 * ProviderUsageList Component (Issue #2005)
 *
 * Displays per-developer provider usage telemetry for dispatch steering.
 * Shows usage headroom, health states, and nearing-limit indicators.
 *
 * Updated #5182: Added MultiWindowUsageBar sub-component for session/week/month breakdown.
 */

import { useState, useEffect } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  User,
  Clock,
  TrendingUp,
} from 'lucide-react'
import type {
  DeveloperUsageAggregate,
  ProviderUsageSnapshot,
  UsageHealthState,
  SessionAgent,
} from '@gal/types'

// ============================================================================
// MultiWindowUsageBar Sub-Component (#5182)
// ============================================================================

/** A single usage window row for multi-window display */
interface WindowRow {
  /** Display label: "Session" | "This week" | "This month" */
  label: string
  /** Usage percent 0–100, or null if unknown */
  percent: number | null
  /** ISO timestamp when this window resets, or null */
  resetAt: string | null
  /** Absolute limit for this window */
  limit: number
}

const WARNING_THRESHOLD = 70
const DANGER_THRESHOLD = 90

/** Format an ISO reset timestamp to a human-readable relative string */
function formatWindowResetTime(resetAt: string | null): string {
  if (!resetAt) return ''
  const date = new Date(resetAt)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  if (diffMs <= 0) return 'now'
  const totalMinutes = Math.floor(diffMs / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours >= 24) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  if (hours > 0) return `resets in ${hours}h ${minutes}m`
  return `resets in ${minutes}m`
}

/**
 * MultiWindowUsageBar renders a compact table of usage rows (session / week / month).
 * Each row shows:
 *   - label (fixed width)
 *   - colored progress bar (green <70%, amber 70–89%, red >=90%)
 *   - percentage text
 *   - reset time
 *
 * Usage:
 *   <MultiWindowUsageBar rows={[
 *     { label: 'Session',    percent: 42, resetAt: '2026-04-01T12:00:00Z', limit: 18000 },
 *     { label: 'This week',  percent: 18, resetAt: '2026-04-04T00:00:00Z', limit: 126000 },
 *     { label: 'This month', percent: 27, resetAt: '2026-04-18T00:00:00Z', limit: 540000 },
 *   ]} />
 */
export function MultiWindowUsageBar({ rows }: { rows: WindowRow[] }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const pct = row.percent ?? 0
        const clampedPct = Math.min(Math.max(pct, 0), 100)

        let barColor: string
        if (clampedPct >= DANGER_THRESHOLD) {
          barColor = 'var(--status-danger)'
        } else if (clampedPct >= WARNING_THRESHOLD) {
          barColor = 'var(--status-warning)'
        } else {
          barColor = 'var(--status-success)'
        }

        const resetLabel = formatWindowResetTime(row.resetAt)

        return (
          <div key={row.label} className="flex items-center gap-2">
            <span
              className="text-xs w-20 flex-shrink-0"
              style={{ color: 'var(--text-secondary)' }}
            >
              {row.label}
            </span>
            <div
              className="flex-1 h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--border-subtle)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${clampedPct}%`, backgroundColor: barColor }}
              />
            </div>
            <span
              className="text-xs w-8 text-right flex-shrink-0 font-medium tabular-nums"
              style={{ color: 'var(--text-primary)' }}
            >
              {row.percent !== null ? `${Math.round(row.percent)}%` : 'N/A'}
            </span>
            {resetLabel && (
              <span
                className="text-xs flex-shrink-0 text-right"
                style={{ color: 'var(--text-muted)', minWidth: '7rem' }}
              >
                {resetLabel}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface ProviderUsageListProps {
  organizationId: string
  apiUrl?: string
}

interface HealthConfig {
  icon: typeof CheckCircle
  color: string
  bgColor: string
  label: string
}

const healthConfigs: Record<UsageHealthState, HealthConfig> = {
  ok: {
    icon: CheckCircle,
    color: 'text-[var(--text-secondary)]',
    bgColor: 'bg-[var(--surface-sunken)]',
    label: 'OK',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-[var(--status-warning-text)]',
    bgColor: 'bg-[var(--status-warning-light)]',
    label: 'Warning',
  },
  critical: {
    icon: XCircle,
    color: 'text-[var(--status-danger-text)]',
    bgColor: 'bg-[var(--status-danger-light)]',
    label: 'Critical',
  },
}

const agentIcons: Record<SessionAgent, string> = {
  claude: '🤖',
  codex: '🌟',
  gemini: '💎',
  'cursor-agent': '🎯',
  copilot: '🚀',
  oss: '🔓',
  gal: '🧠',
}

export function ProviderUsageList({ organizationId, apiUrl = '/api' }: ProviderUsageListProps) {
  const [developers, setDevelopers] = useState<DeveloperUsageAggregate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchUsageData() {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`${apiUrl}/usage/providers/developers`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch usage data: ${response.statusText}`)
      }

      const data = await response.json()
      setDevelopers(data.developers || [])
    } catch (err) {
      console.error('Error fetching provider usage:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch usage data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsageData()
  }, [organizationId, apiUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  function formatUsagePercent(percent: number | null): string {
    if (percent === null) return 'N/A'
    return `${Math.round(percent)}%`
  }

  function formatNextReset(resetAt: string | null): string {
    if (!resetAt) return 'Unknown'
    const date = new Date(resetAt)
    const now = new Date()
    const diff = date.getTime() - now.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  function renderProviderSnapshot(snapshot: ProviderUsageSnapshot) {
    const config = healthConfigs[snapshot.healthState]
    const Icon = config.icon
    const agentIcon = agentIcons[snapshot.provider] || '❓'

    return (
      <div
        key={snapshot.provider}
        className="border rounded-lg p-4 bg-[var(--surface-base)] hover:shadow-md transition-shadow"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{agentIcon}</span>
            <span className="font-semibold text-[var(--text-primary)] capitalize">
              {snapshot.provider}
            </span>
          </div>
          <div className={`flex items-center gap-1 px-2 py-1 rounded ${config.bgColor}`}>
            <Icon className={`h-4 w-4 ${config.color}`} />
            <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-[var(--text-secondary)] mb-1">Usage</div>
            <div className="font-semibold text-[var(--text-primary)]">
              {formatUsagePercent(snapshot.usagePercent)}
            </div>
            <div className="text-xs text-[var(--text-tertiary)]">
              {snapshot.currentUsage}
              {snapshot.limit !== null && ` / ${snapshot.limit}`}
            </div>
          </div>

          <div>
            <div className="text-[var(--text-secondary)] mb-1">Headroom</div>
            <div className="font-semibold text-[var(--text-primary)]">
              {snapshot.headroom !== null ? snapshot.headroom : 'Unlimited'}
            </div>
          </div>

          <div>
            <div className="text-[var(--text-secondary)] mb-1">Reset Window</div>
            <div className="font-semibold text-[var(--text-primary)]">{snapshot.resetWindow}</div>
          </div>

          <div>
            <div className="text-[var(--text-secondary)] mb-1">Next Reset</div>
            <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatNextReset(snapshot.nextResetAt)}
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t text-xs text-[var(--text-tertiary)]" style={{ borderColor: 'var(--border-subtle)' }}>
          Last updated: {new Date(snapshot.lastUpdatedAt).toLocaleString()}
        </div>
      </div>
    )
  }

  function renderDeveloperUsage(dev: DeveloperUsageAggregate) {
    const overallConfig = healthConfigs[dev.overallHealthState]
    const OverallIcon = overallConfig.icon

    return (
      <div
        key={dev.userId}
        className="mb-8 border-2 rounded-lg p-6 bg-[var(--surface-sunken)]"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <User className="h-6 w-6 text-[var(--text-secondary)]" />
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">{dev.githubLogin}</h3>
              <p className="text-sm text-[var(--text-secondary)]">{dev.userId}</p>
            </div>
          </div>
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg ${overallConfig.bgColor}`}
          >
            <OverallIcon className={`h-5 w-5 ${overallConfig.color}`} />
            <span className={`font-semibold ${overallConfig.color}`}>
              Overall: {overallConfig.label}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dev.providers.map((snapshot) => renderProviderSnapshot(snapshot))}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Activity className="h-6 w-6 text-[var(--status-info-text)] animate-spin mr-2" />
        <span className="text-[var(--text-secondary)]">Loading provider usage data...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="rounded-lg p-6 text-center"
        style={{ backgroundColor: 'var(--status-danger-light)', border: '1px solid var(--status-danger)' }}
      >
        <XCircle className="h-12 w-12 text-[var(--status-danger-text)] mx-auto mb-3" />
        <p className="text-[var(--status-danger-text)] font-semibold mb-2">Failed to load usage data</p>
        <p className="text-[var(--status-danger-text)] text-sm mb-4">{error}</p>
        <button
          onClick={fetchUsageData}
          className="px-4 py-2 bg-[var(--status-danger)] text-[var(--text-on-accent)] rounded-lg hover:opacity-90 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  if (developers.length === 0) {
    return (
      <div
        className="rounded-lg p-8 text-center"
        style={{ backgroundColor: 'var(--status-info-light)', border: '1px solid var(--status-info)' }}
      >
        <TrendingUp className="h-12 w-12 text-[var(--status-info-text)] mx-auto mb-3" />
        <p className="text-[var(--status-info-text)] font-semibold mb-2">No usage data available</p>
        <p className="text-[var(--status-info-text)] text-sm">
          Provider usage telemetry will appear here once developers start reporting usage.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-[var(--surface-base)] border rounded-lg p-4" style={{ borderColor: 'var(--border-subtle)' }}>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Provider Usage Telemetry</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Per-developer provider usage for dispatch steering and capacity planning.
        </p>
      </div>

      {developers.map((dev) => renderDeveloperUsage(dev))}
    </div>
  )
}
