'use client'

/**
 * Audit Logs Page (#2526)
 *
 * Centralized view of agent audit entries across background agents and
 * developer CLI sessions. Includes filters for session type, severity,
 * action, and date range, plus a critical alerts summary widget.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle,
  Filter,
  Loader2,
  RefreshCw,
  ShieldAlert,
  CheckCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  ScrollText,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { useIsInternalWorkspace } from '@/hooks/useWorkspaceAudienceTier'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_AUDIT_LOG_ENTRIES, DEMO_AUDIT_SUMMARY, DEMO_AUDIT_ALERTS } from '@/lib/demo-data'
import type {
  AuditLogEntryResponse,
  AuditLogsResponse,
  AuditSummaryResponse,
  AuditAlertResponse,
  AuditAlertsResponse,
} from '@/lib/api'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_TYPES = [
  { value: '', label: 'All Session Types' },
  { value: 'background-agent', label: 'Background Agent' },
  { value: 'cli', label: 'CLI' },
  { value: 'vscode', label: 'VS Code' },
  { value: 'dashboard', label: 'Dashboard' },
]

const SEVERITIES = [
  { value: '', label: 'All Severities' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
]

const ACTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'tool_call', label: 'Tool Call' },
  { value: 'file_edit', label: 'File Edit' },
  { value: 'bash_command', label: 'Bash Command' },
  { value: 'config_change', label: 'Config Change' },
  { value: 'policy_violation', label: 'Policy Violation' },
]

const PAGE_SIZE = 25

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    info: 'bg-[var(--badge-blue-bg)] text-[var(--badge-blue-text)]',
    warning: 'bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]',
    critical: 'bg-[var(--badge-red-bg)] text-[var(--badge-red-text)]',
  }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[severity] || styles.info}`}>
      {severity}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Session type badge
// ---------------------------------------------------------------------------

function SessionTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    'background-agent': 'BG Agent',
    cli: 'CLI',
    vscode: 'VS Code',
    dashboard: 'Dashboard',
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)]">
      {labels[type] || type}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Alert status badge
// ---------------------------------------------------------------------------

function AlertStatusBadge({ status }: { status: string }) {
  if (status === 'open') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[var(--badge-red-bg)] text-[var(--badge-red-text)]">
        <ShieldAlert className="w-3 h-3" /> Open
      </span>
    )
  }
  if (status === 'acknowledged') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[var(--badge-amber-bg)] text-[var(--badge-amber-text)]">
        <Clock className="w-3 h-3" /> Acknowledged
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-[var(--badge-green-bg)] text-[var(--badge-green-text)]">
      <CheckCircle className="w-3 h-3" /> Resolved
    </span>
  )
}

// ---------------------------------------------------------------------------
// Alerts summary widget
// ---------------------------------------------------------------------------

function AlertsSummary({
  alerts,
  onAcknowledge,
  onResolve,
}: {
  alerts: AuditAlertResponse[]
  onAcknowledge: (id: string) => void
  onResolve: (id: string) => void
}) {
  const openAlerts = alerts.filter((a) => a.status === 'open')

  if (openAlerts.length === 0) {
    return (
      <div className="glass-card p-4 mb-6">
        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
          <CheckCircle className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
          <span className="text-sm font-medium">No open critical alerts</span>
        </div>
      </div>
    )
  }

  return (
    <div className="glass-card p-4 mb-6" style={{ borderLeft: '3px solid var(--status-error)' }}>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-[var(--status-danger)]" />
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {openAlerts.length} Critical Alert{openAlerts.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {openAlerts.slice(0, 5).map((alert) => (
          <div
            key={alert.id}
            className="flex items-center justify-between p-2 rounded bg-[var(--surface-base)] text-sm"
          >
            <div className="flex-1 min-w-0 mr-3">
              <span className="font-medium text-[var(--text-primary)]">{alert.action}</span>
              <span className="text-[var(--text-muted)] mx-1">by</span>
              <span className="text-[var(--text-secondary)]">{alert.userName}</span>
              <span className="text-[var(--text-muted)] mx-1">&middot;</span>
              <SessionTypeBadge type={alert.sessionType} />
              {alert.projectId && (
                <>
                  <span className="text-[var(--text-muted)] mx-1">&middot;</span>
                  <span className="text-[var(--text-muted)] text-xs">{alert.projectId}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => onAcknowledge(alert.id)}
                className="px-2 py-1 text-xs rounded hover:bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                title="Acknowledge"
              >
                Ack
              </button>
              <button
                onClick={() => onResolve(alert.id)}
                className="px-2 py-1 text-xs rounded hover:bg-[var(--surface-raised)] text-[var(--text-secondary)]"
                title="Resolve"
              >
                Resolve
              </button>
            </div>
          </div>
        ))}
        {openAlerts.length > 5 && (
          <p className="text-xs text-[var(--text-muted)] text-center pt-1">
            + {openAlerts.length - 5} more alerts
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AuditLogsPage() {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const selectedWorkspace = useSelectedWorkspace()
  const userOrgs = user?.organizations ?? []
  const isInternalWorkspace = useIsInternalWorkspace()
  const isVisible = isInternalWorkspace && isPageVisibleForUser('audit-logs', userOrgs, selectedWorkspace)

  // Filters
  const [sessionType, setSessionType] = useState('')
  const [severity, setSeverity] = useState('')
  const [action, setAction] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Data
  const [logs, setLogs] = useState<AuditLogEntryResponse[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [summary, setSummary] = useState<AuditSummaryResponse | null>(null)
  const [alerts, setAlerts] = useState<AuditAlertResponse[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const orgName = selectedWorkspace || user?.organizations?.[0] || ''

  // Fetch audit logs
  const fetchLogs = useCallback(async () => {
    if (!isVisible) return
    if (!orgName) return
    setLoading(true)
    setError(null)
    try {
      if (isDemoMode()) {
        setLogs(DEMO_AUDIT_LOG_ENTRIES)
        setTotal(DEMO_AUDIT_LOG_ENTRIES.length)
        setSummary(DEMO_AUDIT_SUMMARY)
        setAlerts(DEMO_AUDIT_ALERTS)
        setLoading(false)
        return
      }
      const params: Record<string, string | number> = { limit: PAGE_SIZE, offset }
      if (sessionType) params.sessionType = sessionType
      if (severity) params.severity = severity
      if (action) params.action = action
      if (startDate) params.startDate = startDate
      if (endDate) params.endDate = endDate

      const [logsRes, summaryRes, alertsRes] = await Promise.all([
        api.getAuditLogs(orgName, params as Parameters<typeof api.getAuditLogs>[1]),
        api.getAuditSummary(orgName, { startDate: startDate || undefined, endDate: endDate || undefined }),
        api.getAuditAlerts(orgName, { status: 'open', limit: 20 }),
      ])

      setLogs(logsRes.entries)
      setTotal(logsRes.total)
      setSummary(summaryRes)
      setAlerts(alertsRes.alerts)
    } catch (err) {
      setError((err as Error).message || 'Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }, [isVisible, orgName, sessionType, severity, action, startDate, endDate, offset])

  useEffect(() => {
    if (!isVisible) return
    fetchLogs()
  }, [fetchLogs, isVisible])

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0)
  }, [sessionType, severity, action, startDate, endDate])

  const handleAcknowledge = async (alertId: string) => {
    try {
      await api.updateAuditAlert(orgName, alertId, 'acknowledged')
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, status: 'acknowledged' as const } : a)))
    } catch {
      // Silently fail - could show toast
    }
  }

  const handleResolve = async (alertId: string) => {
    try {
      await api.updateAuditAlert(orgName, alertId, 'resolved')
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, status: 'resolved' as const } : a)))
    } catch {
      // Silently fail
    }
  }

  if (!isVisible) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <ScrollText className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Internal Feature
        </h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
          Audit logs are only available to internal users.
        </p>
      </div>
    )
  }

  if (!orgName) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-[var(--text-muted)] text-sm">
            Select a workspace to view audit logs.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Audit Logs</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Centralized audit trail across all agent sessions
            </p>
          </div>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-overlay)] transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Alerts widget */}
        <AlertsSummary
          alerts={alerts}
          onAcknowledge={handleAcknowledge}
          onResolve={handleResolve}
        />

        {/* Summary stats */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="glass-card p-4">
              <p className="text-xs text-[var(--text-muted)] mb-1">Total Entries</p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">{summary.totalEntries}</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-[var(--text-muted)] mb-1">Critical</p>
              <p className="text-2xl font-bold text-[var(--status-danger)]">{summary.bySeverity?.critical || 0}</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-[var(--text-muted)] mb-1">Warnings</p>
              <p className="text-2xl font-bold text-[var(--status-warning)]">{summary.bySeverity?.warning || 0}</p>
            </div>
            <div className="glass-card p-4">
              <p className="text-xs text-[var(--text-muted)] mb-1">Session Types</p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                {Object.keys(summary.bySessionType || {}).length}
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="glass-card p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-[var(--text-muted)]" />
            <span className="text-sm font-medium text-[var(--text-secondary)]">Filters</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <select
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm bg-[var(--surface-base)] border border-[var(--border-default)] text-[var(--text-primary)]"
            >
              {SESSION_TYPES.map((st) => (
                <option key={st.value} value={st.value}>{st.label}</option>
              ))}
            </select>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm bg-[var(--surface-base)] border border-[var(--border-default)] text-[var(--text-primary)]"
            >
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm bg-[var(--surface-base)] border border-[var(--border-default)] text-[var(--text-primary)]"
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="Start date"
              className="px-3 py-2 rounded-lg text-sm bg-[var(--surface-base)] border border-[var(--border-default)] text-[var(--text-primary)]"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              placeholder="End date"
              className="px-3 py-2 rounded-lg text-sm bg-[var(--surface-base)] border border-[var(--border-default)] text-[var(--text-primary)]"
            />
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="glass-card p-4 mb-6" style={{ borderLeft: '3px solid var(--status-error)' }}>
            <p className="text-sm text-[var(--status-danger)]">{error}</p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
          </div>
        )}

        {/* Log entries table */}
        {!loading && logs.length > 0 && (
          <div className="glass-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-default)]">
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                      Severity
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                      Session
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                      Action
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                      User
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-b border-[var(--border-default)] hover:bg-[var(--surface-raised)] transition-colors"
                    >
                      <td className="px-4 py-3 text-[var(--text-muted)] whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <SeverityBadge severity={entry.severity} />
                      </td>
                      <td className="px-4 py-3">
                        <SessionTypeBadge type={entry.sessionType} />
                      </td>
                      <td className="px-4 py-3 text-[var(--text-primary)] font-mono text-xs">
                        {entry.action}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">
                        {entry.userName}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)] text-xs max-w-xs truncate">
                        {entry.details && Object.keys(entry.details).length > 0
                          ? JSON.stringify(entry.details).slice(0, 80)
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-default)]">
              <p className="text-xs text-[var(--text-muted)]">
                Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={offset === 0}
                  className="p-1.5 rounded hover:bg-[var(--surface-raised)] text-[var(--text-muted)] disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total}
                  className="p-1.5 rounded hover:bg-[var(--surface-raised)] text-[var(--text-muted)] disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && logs.length === 0 && !error && (
          <div className="glass-card p-12 text-center">
            <p className="text-[var(--text-muted)] text-sm">
              No audit log entries found. Entries are created when agents execute tools,
              edit files, or run commands.
            </p>
            <p className="text-[var(--text-muted)] text-xs mt-2">
              Use <code className="font-mono bg-[var(--surface-raised)] px-1 rounded">gal audit sync</code> to
              ship local agent logs to this view.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
