'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  AlertCircle,
  Loader2,
  Download,
  Plus,
  Trash2,
  RefreshCw,
  Globe,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { useIsInternalWorkspace } from '@/hooks/useWorkspaceAudienceTier'
import { api } from '@/lib/api'
import type {
  DomainAccessStat,
  DomainAlert,
  DomainAnomaly,
  DomainRepoBreakdown,
  DomainExceptionItem,
} from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'
import {
  DEMO_DOMAIN_STATS,
  DEMO_DOMAIN_ALERTS,
  DEMO_DOMAIN_ANOMALIES,
  DEMO_DOMAIN_REPO_BREAKDOWN,
  DEMO_DOMAIN_EXCEPTIONS,
} from '@/lib/demo-data'

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function exportAsJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportAsCsv(rows: Record<string, unknown>[], filename: string): void {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const csvLines = [
    headers.join(','),
    ...rows.map((row) =>
      headers.map((h) => {
        const val = String(row[h] ?? '')
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val
      }).join(',')
    ),
  ]
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function DomainCompliancePage() {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const userOrgs = user?.organizations ?? []
  const selectedWorkspace = useSelectedWorkspace()
  const orgName = selectedWorkspace ?? userOrgs[0] ?? null

  // Data state
  const [stats, setStats] = useState<DomainAccessStat[]>([])
  const [alerts, setAlerts] = useState<DomainAlert[]>([])
  const [anomalies, setAnomalies] = useState<DomainAnomaly[]>([])
  const [repos, setRepos] = useState<DomainRepoBreakdown[]>([])
  const [exceptions, setExceptions] = useState<DomainExceptionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Exception form state
  const [showExceptionForm, setShowExceptionForm] = useState(false)
  const [newDomain, setNewDomain] = useState('')
  const [newJustification, setNewJustification] = useState('')
  const [newRepoName, setNewRepoName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Period
  const [days, setDays] = useState(30)

  const isInternalWorkspace = useIsInternalWorkspace()
  const isVisible = isInternalWorkspace && isPageVisibleForUser('domain-compliance', userOrgs, selectedWorkspace)

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!orgName) return
    setLoading(true)
    setError(null)
    try {
      if (isDemoMode()) {
        setStats(DEMO_DOMAIN_STATS.stats as DomainAccessStat[])
        setAlerts(DEMO_DOMAIN_ALERTS.alerts as DomainAlert[])
        setAnomalies(DEMO_DOMAIN_ANOMALIES.anomalies as DomainAnomaly[])
        setRepos(DEMO_DOMAIN_REPO_BREAKDOWN.repos as DomainRepoBreakdown[])
        setExceptions(DEMO_DOMAIN_EXCEPTIONS.exceptions as DomainExceptionItem[])
        setLoading(false)
        return
      }
      const [statsRes, alertsRes, anomaliesRes, reposRes, exceptionsRes] = await Promise.all([
        api.getDomainAccessStats(orgName, days),
        api.getDomainAccessAlerts(orgName),
        api.getDomainAccessAnomalies(orgName),
        api.getDomainRepoBreakdown(orgName, days),
        api.getDomainExceptions(orgName),
      ])
      setStats(statsRes.stats)
      setAlerts(alertsRes.alerts)
      setAnomalies(anomaliesRes.anomalies)
      setRepos(reposRes.repos)
      setExceptions(exceptionsRes.exceptions)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load domain compliance data')
    } finally {
      setLoading(false)
    }
  }, [orgName, days])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Create exception
  const handleCreateException = async () => {
    if (!orgName || !newDomain.trim() || !newJustification.trim()) return
    setCreating(true)
    try {
      await api.createDomainException(orgName, {
        domain: newDomain.trim(),
        justification: newJustification.trim(),
        repoName: newRepoName.trim() || undefined,
      })
      setShowExceptionForm(false)
      setNewDomain('')
      setNewJustification('')
      setNewRepoName('')
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create exception')
    } finally {
      setCreating(false)
    }
  }

  // Delete exception
  const handleDeleteException = async (id: string) => {
    if (!orgName) return
    await api.deleteDomainException(orgName, id)
    setDeleteConfirmId(null)
    fetchData()
  }

  // Export report
  const handleExport = (format: 'json' | 'csv') => {
    const timestamp = new Date().toISOString().slice(0, 10)
    if (format === 'json') {
      exportAsJson(
        { stats, alerts, anomalies, repos, exceptions, exportedAt: new Date().toISOString(), orgName },
        `domain-compliance-${orgName}-${timestamp}.json`
      )
    } else {
      // CSV export of stats
      exportAsCsv(
        stats.map((s) => ({
          domain: s.domain,
          totalRequests: s.totalRequests,
          blockedRequests: s.blockedRequests,
          lastAccessed: s.lastAccessed,
        })),
        `domain-stats-${orgName}-${timestamp}.csv`
      )
    }
  }

  // ----------- Gate checks -----------

  if (!isVisible) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <Shield className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Internal Feature
        </h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
          Domain compliance monitoring is only available to internal users.
        </p>
      </div>
    )
  }

  if (!orgName) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <AlertCircle className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          No Workspace Selected
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Select a workspace from the sidebar to view domain compliance data.
        </p>
      </div>
    )
  }

  // ----------- Render -----------

  const topAccessed = stats.slice(0, 10)
  const topBlocked = [...stats].filter((s) => s.blockedRequests > 0).sort((a, b) => b.blockedRequests - a.blockedRequests).slice(0, 10)

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Domain Compliance
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Domain allowlist audit trail and anomaly detection for agent web requests
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-sm px-3 py-1.5 rounded-lg"
            style={{
              background: 'var(--surface-raised)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={() => fetchData()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
            style={{ border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleExport('json')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
            style={{ border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}
            title="Export JSON"
          >
            <Download className="w-3.5 h-3.5" />
            JSON
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
            style={{ border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-3 p-4 rounded-lg mb-6"
          style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error)' }}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--status-error)' }} />
          <p className="text-sm" style={{ color: 'var(--status-error)' }}>{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      )}

      {!loading && (
        <>
          {/* Alerts & Anomalies banner */}
          {(alerts.length > 0 || anomalies.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {alerts.length > 0 && (
                <div
                  className="p-4 rounded-xl"
                  style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5" style={{ color: 'var(--status-error)' }} />
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--status-error)' }}>
                      Blocked Domain Alerts
                    </h3>
                  </div>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    {alerts.length} session{alerts.length !== 1 ? 's' : ''} with 3+ blocked domain requests
                  </p>
                  {alerts.slice(0, 3).map((a) => (
                    <div key={a.sessionId} className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      Session {a.sessionId.slice(0, 8)}... - {a.blockedCount} blocks ({a.domains.length} domains) - {a.repoName}
                    </div>
                  ))}
                </div>
              )}
              {anomalies.length > 0 && (
                <div
                  className="p-4 rounded-xl"
                  style={{ background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5" style={{ color: 'var(--status-warning)' }} />
                    <h3 className="text-sm font-semibold" style={{ color: 'var(--status-warning)' }}>
                      Anomaly Detection
                    </h3>
                  </div>
                  <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    {anomalies.length} session{anomalies.length !== 1 ? 's' : ''} contacted &gt;10 distinct domains
                  </p>
                  {anomalies.slice(0, 3).map((a) => (
                    <div key={a.sessionId} className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                      Session {a.sessionId.slice(0, 8)}... - {a.distinctDomains} domains - {a.repoName}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Top Accessed / Top Blocked grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Top Accessed Domains */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--border-primary)' }}
            >
              <div
                className="px-4 py-3 flex items-center gap-2"
                style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-primary)' }}
              >
                <Globe className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Top Accessed Domains
                </h3>
              </div>
              {topAccessed.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  No domain access data for this period.
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                      <th className="text-left px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Domain</th>
                      <th className="text-right px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Requests</th>
                      <th className="text-right px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Blocked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topAccessed.map((s) => (
                      <tr key={s.domain} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                        <td className="px-4 py-2 text-sm" style={{ color: 'var(--text-primary)' }}>{s.domain}</td>
                        <td className="px-4 py-2 text-sm text-right" style={{ color: 'var(--text-secondary)' }}>{s.totalRequests}</td>
                        <td className="px-4 py-2 text-sm text-right" style={{ color: s.blockedRequests > 0 ? 'var(--status-error)' : 'var(--text-muted)' }}>
                          {s.blockedRequests}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Top Blocked Domains */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--border-primary)' }}
            >
              <div
                className="px-4 py-3 flex items-center gap-2"
                style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-primary)' }}
              >
                <AlertTriangle className="w-4 h-4" style={{ color: 'var(--status-error)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Top Blocked Domains
                </h3>
              </div>
              {topBlocked.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  No blocked domains in this period.
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                      <th className="text-left px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Domain</th>
                      <th className="text-right px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Blocked</th>
                      <th className="text-right px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topBlocked.map((s) => (
                      <tr key={s.domain} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                        <td className="px-4 py-2 text-sm" style={{ color: 'var(--text-primary)' }}>{s.domain}</td>
                        <td className="px-4 py-2 text-sm text-right" style={{ color: 'var(--status-error)' }}>{s.blockedRequests}</td>
                        <td className="px-4 py-2 text-sm text-right" style={{ color: 'var(--text-secondary)' }}>{s.totalRequests}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Per-repo breakdown */}
          <div
            className="rounded-xl overflow-hidden mb-6"
            style={{ border: '1px solid var(--border-primary)' }}
          >
            <div
              className="px-4 py-3 flex items-center gap-2"
              style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-primary)' }}
            >
              <Shield className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                Per-Repository Breakdown
              </h3>
            </div>
            {repos.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                No per-repo data available.
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    <th className="text-left px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Repository</th>
                    <th className="text-right px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Requests</th>
                    <th className="text-right px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Blocked</th>
                    <th className="text-right px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Domains</th>
                  </tr>
                </thead>
                <tbody>
                  {repos.map((r) => (
                    <tr key={r.repoName} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                      <td className="px-4 py-2 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{r.repoName}</td>
                      <td className="px-4 py-2 text-sm text-right" style={{ color: 'var(--text-secondary)' }}>{r.totalRequests}</td>
                      <td className="px-4 py-2 text-sm text-right" style={{ color: r.blockedRequests > 0 ? 'var(--status-error)' : 'var(--text-muted)' }}>
                        {r.blockedRequests}
                      </td>
                      <td className="px-4 py-2 text-sm text-right" style={{ color: 'var(--text-secondary)' }}>{r.distinctDomains}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Domain Exceptions */}
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: '1px solid var(--border-primary)' }}
          >
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-primary)' }}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Domain Exceptions
                </h3>
              </div>
              <button
                onClick={() => setShowExceptionForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ background: 'var(--interactive-primary)', color: 'var(--text-on-accent)' }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Exception
              </button>
            </div>

            {exceptions.length === 0 && !showExceptionForm ? (
              <div
                className="flex flex-col items-center justify-center py-12"
                style={{ color: 'var(--text-muted)' }}
              >
                <Shield className="w-8 h-8 mb-2" />
                <p className="text-sm">No domain exceptions configured.</p>
                <p className="text-xs mt-1">All domains follow the organization-wide allowlist policy.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                    <th className="text-left px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Domain</th>
                    <th className="text-left px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Scope</th>
                    <th className="text-left px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Approved By</th>
                    <th className="text-left px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Expires</th>
                    <th className="text-left px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Status</th>
                    <th className="text-right px-4 py-2 text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.map((exc) => {
                    const isExpired = exc.expired || new Date(exc.expiresAt) < new Date()
                    const daysUntilExpiry = Math.ceil((new Date(exc.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    const isExpiringSoon = !isExpired && daysUntilExpiry <= 14

                    return (
                      <tr key={exc.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                        <td className="px-4 py-2">
                          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{exc.domain}</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{exc.justification}</div>
                        </td>
                        <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {exc.repoName || 'Org-wide'}
                        </td>
                        <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {exc.approvedBy}
                        </td>
                        <td className="px-4 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {new Date(exc.expiresAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              background: isExpired
                                ? 'var(--status-error-bg)'
                                : isExpiringSoon
                                  ? 'var(--status-warning-bg)'
                                  : 'var(--status-success-bg)',
                              color: isExpired
                                ? 'var(--status-error)'
                                : isExpiringSoon
                                  ? 'var(--status-warning)'
                                  : 'var(--status-success)',
                            }}
                          >
                            {isExpired ? 'Expired' : isExpiringSoon ? `${daysUntilExpiry}d left` : 'Active'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right">
                          {deleteConfirmId === exc.id ? (
                            <span className="flex items-center justify-end gap-2">
                              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Revoke?</span>
                              <button
                                onClick={() => handleDeleteException(exc.id)}
                                className="px-2 py-1 rounded text-xs font-medium"
                                style={{ background: 'var(--status-error)', color: 'var(--text-on-accent)' }}
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-2 py-1 rounded text-xs font-medium"
                                style={{ border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirmId(exc.id)}
                              className="p-1.5 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
                              title="Revoke exception"
                            >
                              <Trash2 className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {/* Add Exception Form */}
            {showExceptionForm && (
              <div
                className="p-4"
                style={{ borderTop: '1px solid var(--border-primary)', background: 'var(--surface-raised)' }}
              >
                <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                  New Domain Exception
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <input
                    type="text"
                    placeholder="Domain (e.g. api.example.com)"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-primary)',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Repository (optional, leave blank for org-wide)"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-primary)',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Justification (required)"
                    value={newJustification}
                    onChange={(e) => setNewJustification(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-primary)',
                    }}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCreateException}
                    disabled={creating || !newDomain.trim() || !newJustification.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    style={{ background: 'var(--interactive-primary)', color: 'var(--text-on-accent)' }}
                  >
                    {creating ? 'Creating...' : 'Create Exception (90-day review)'}
                  </button>
                  <button
                    onClick={() => {
                      setShowExceptionForm(false)
                      setNewDomain('')
                      setNewJustification('')
                      setNewRepoName('')
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
