'use client'

/**
 * Developer Compliance Page (#2515)
 *
 * Displays per-developer policy compliance status:
 * - Compliance percentage widget
 * - Per-developer sync status table (last sync time, settings hash, drift status)
 * - Non-compliant developers list
 *
 * Feature Tier: Enterprise
 */

import { useEffect, useState, useCallback } from 'react'
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  RefreshCw,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { useIsInternalWorkspace } from '@/hooks/useWorkspaceAudienceTier'
import { api } from '@/lib/api'
import { formatRelativeTime } from '@/lib/time'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_DEVELOPER_COMPLIANCE } from '@/lib/demo-data'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeveloperComplianceRecord {
  developerId: string
  settingsHash: string | null
  orgHash: string | null
  lastSyncTime: string | null
  driftDetected: boolean
  lastReportedAt: string
  cliVersion: string
  hostname: string
  reportCount: number
}

interface ComplianceStatusResponse {
  organization: string
  totalDevelopers: number
  compliant: number
  nonCompliant: number
  neverSynced: number
  compliancePercent: number
  developers: DeveloperComplianceRecord[]
  lastUpdated: string
}

// ---------------------------------------------------------------------------
// Compliance percentage ring component
// ---------------------------------------------------------------------------

function ComplianceRing({ percent }: { percent: number }) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference

  const color =
    percent >= 90
      ? 'var(--status-success)'
      : percent >= 70
        ? 'var(--status-warning)'
        : 'var(--status-error)'

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="100" height="100" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--border-secondary)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <span
        className="absolute text-xl font-bold"
        style={{ color: 'var(--text-primary)' }}
      >
        {percent}%
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Shield
  label: string
  value: number
  color: string
}) {
  return (
    <div
      className="glass-card p-4 rounded-xl flex items-center gap-4"
      style={{ border: '1px solid var(--border-primary)' }}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center"
        style={{ background: `${color}15` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {value}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {label}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Developer row
// ---------------------------------------------------------------------------

function DeveloperRow({ dev }: { dev: DeveloperComplianceRecord }) {
  const statusIcon = dev.driftDetected ? (
    <XCircle className="w-4 h-4" style={{ color: 'var(--status-error)' }} />
  ) : dev.lastSyncTime ? (
    <CheckCircle className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
  ) : (
    <AlertTriangle className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />
  )

  const statusLabel = dev.driftDetected
    ? 'Drifted'
    : dev.lastSyncTime
      ? 'Compliant'
      : 'Never synced'

  return (
    <tr className="border-b" style={{ borderColor: 'var(--border-primary)' }}>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
            {dev.developerId}
          </span>
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-1.5">
          {statusIcon}
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {statusLabel}
          </span>
        </div>
      </td>
      <td className="py-3 px-4">
        <span className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>
          {dev.settingsHash ? dev.settingsHash.substring(0, 12) + '...' : '-'}
        </span>
      </td>
      <td className="py-3 px-4">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {dev.lastSyncTime ? formatRelativeTime(new Date(dev.lastSyncTime)) : 'Never'}
        </span>
      </td>
      <td className="py-3 px-4">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {dev.lastReportedAt ? formatRelativeTime(new Date(dev.lastReportedAt)) : '-'}
        </span>
      </td>
      <td className="py-3 px-4">
        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          {dev.cliVersion}
        </span>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function DeveloperCompliancePage() {
  const { user } = useAuth()
  const selectedWorkspace = useSelectedWorkspace()
  const isInternalWorkspace = useIsInternalWorkspace()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [data, setData] = useState<ComplianceStatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const orgName = selectedWorkspace || (user?.organizations ?? [])[0] || null

  const fetchData = useCallback(async () => {
    if (!orgName) return
    try {
      if (isDemoMode()) {
        setData(DEMO_DEVELOPER_COMPLIANCE as unknown as ComplianceStatusResponse)
        setError(null)
        setLoading(false)
        setRefreshing(false)
        return
      }
      const resp = await api.fetch(`/api/compliance/developer/status?org=${encodeURIComponent(orgName)}`)
      if (!resp.ok) {
        throw new Error(`Failed to fetch compliance status: ${resp.status}`)
      }
      const json = await resp.json()
      setData(json as ComplianceStatusResponse)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [orgName])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchData()
  }

  // #4029: Developer compliance is internal-only
  if (!isInternalWorkspace) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <Shield className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Internal Feature
        </h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
          Developer compliance is only available to internal users.
        </p>
      </div>
    )
  }

  // ---- Loading ----
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: 'var(--text-muted)' }}
        />
      </div>
    )
  }

  // ---- No workspace ----
  if (!orgName) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div
          className="glass-card p-8 text-center rounded-xl"
          style={{ border: '1px solid var(--border-primary)' }}
        >
          <Shield className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            No workspace selected
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Select a workspace from the sidebar to view developer compliance.
          </p>
        </div>
      </div>
    )
  }

  // ---- Error ----
  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div
          className="glass-card p-8 text-center rounded-xl"
          style={{ border: '1px solid var(--border-primary)' }}
        >
          <ShieldX className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--status-error)' }} />
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            Failed to load compliance data
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{
              background: 'var(--interactive-primary)',
              color: 'var(--text-on-accent)',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // ---- Empty state ----
  if (!data || data.totalDevelopers === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Developer Compliance
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Policy distribution and drift detection across your team
            </p>
          </div>
        </div>
        <div
          className="glass-card p-8 text-center rounded-xl"
          style={{ border: '1px solid var(--border-primary)' }}
        >
          <ShieldCheck className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            No compliance reports yet
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Developers will appear here after running{' '}
            <code className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ background: 'var(--surface-raised)' }}>
              gal sync --pull
            </code>
          </p>
        </div>
      </div>
    )
  }

  // ---- Data loaded ----
  const nonCompliantDevs = data.developers.filter((d) => d.driftDetected)

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Developer Compliance
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Policy distribution and drift detection for {data.organization}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            border: '1px solid var(--border-primary)',
            color: 'var(--text-secondary)',
          }}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div
          className="glass-card p-6 rounded-xl flex items-center gap-6"
          style={{ border: '1px solid var(--border-primary)' }}
        >
          <ComplianceRing percent={data.compliancePercent} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Overall Compliance
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {data.totalDevelopers} developer{data.totalDevelopers !== 1 ? 's' : ''} tracked
            </p>
          </div>
        </div>
        <StatCard
          icon={ShieldCheck}
          label="Compliant"
          value={data.compliant}
          color="var(--status-success)"
        />
        <StatCard
          icon={ShieldAlert}
          label="Drifted"
          value={data.nonCompliant}
          color="var(--status-error)"
        />
        <StatCard
          icon={Clock}
          label="Never Synced"
          value={data.neverSynced}
          color="var(--status-warning)"
        />
      </div>

      {/* Non-compliant callout */}
      {nonCompliantDevs.length > 0 && (
        <div
          className="mb-8 p-4 rounded-xl flex items-start gap-3"
          style={{
            background: 'var(--status-error-bg)',
            border: '1px solid var(--status-error-border)',
          }}
        >
          <ShieldX className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: 'var(--status-error)' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {nonCompliantDevs.length} developer{nonCompliantDevs.length !== 1 ? 's' : ''} out of compliance
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              The following developers have settings that differ from the org-approved baseline:{' '}
              {nonCompliantDevs.map((d) => d.developerId).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Developer table */}
      <div
        className="glass-card rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border-primary)' }}
      >
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            All Developers
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr
                className="text-xs uppercase tracking-wide"
                style={{
                  color: 'var(--text-muted)',
                  borderBottom: '1px solid var(--border-primary)',
                }}
              >
                <th className="py-2.5 px-4 font-medium">Developer</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium">Settings Hash</th>
                <th className="py-2.5 px-4 font-medium">Last Sync</th>
                <th className="py-2.5 px-4 font-medium">Last Report</th>
                <th className="py-2.5 px-4 font-medium">CLI Version</th>
              </tr>
            </thead>
            <tbody>
              {data.developers.map((dev) => (
                <DeveloperRow key={dev.developerId} dev={dev} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <p className="text-xs mt-4 text-right" style={{ color: 'var(--text-muted)' }}>
        Last updated: {data.lastUpdated ? formatRelativeTime(new Date(data.lastUpdated)) : '-'}
      </p>
    </div>
  )
}
