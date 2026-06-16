'use client'

import { useState, useCallback } from 'react'
import {
  Shield,
  AlertCircle,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileWarning,
  Clock,
  Plus,
  Download,
  ChevronDown,
  ChevronUp,
  Eye,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { useIsInternalWorkspace } from '@/hooks/useWorkspaceAudienceTier'
import {
  useToolComplianceStatus,
  useToolExceptions,
  useCreateToolException,
  useToolImpactPreview,
} from '@/hooks/useToolCompliance'
import type {
  RepoToolComplianceStatus,
  ToolComplianceStatus,
  ToolException,
} from '@/lib/api'

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  ToolComplianceStatus,
  { label: string; color: string; bgColor: string; icon: typeof CheckCircle2 }
> = {
  compliant: {
    label: 'Compliant',
    color: 'var(--status-success)',
    bgColor: 'var(--status-success-bg)',
    icon: CheckCircle2,
  },
  missing_file: {
    label: 'Missing File',
    color: 'var(--status-error)',
    bgColor: 'var(--status-error-bg)',
    icon: XCircle,
  },
  missing_deny_rules: {
    label: 'Missing Rules',
    color: 'var(--status-warning)',
    bgColor: 'var(--status-warning-bg)',
    icon: AlertTriangle,
  },
  has_exceptions: {
    label: 'Has Exceptions',
    color: 'var(--status-warning)',
    bgColor: 'var(--status-warning-bg)',
    icon: FileWarning,
  },
  drifted: {
    label: 'Drifted',
    color: 'var(--status-error)',
    bgColor: 'var(--status-error-bg)',
    icon: AlertCircle,
  },
}

function StatusBadge({ status }: { status: ToolComplianceStatus }) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: config.bgColor, color: config.color }}
    >
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Summary cards
// ---------------------------------------------------------------------------

function SummaryCards({
  summary,
}: {
  summary: {
    total: number
    compliant: number
    missingFile: number
    missingDenyRules: number
    hasExceptions: number
    drifted: number
  }
}) {
  const cards = [
    { label: 'Total Repos', value: summary.total, color: 'var(--text-primary)' },
    { label: 'Compliant', value: summary.compliant, color: 'var(--status-success)' },
    { label: 'Drifted', value: summary.drifted, color: 'var(--status-error)' },
    { label: 'Missing Rules', value: summary.missingDenyRules, color: 'var(--status-warning)' },
    { label: 'Missing File', value: summary.missingFile, color: 'var(--status-error)' },
    { label: 'Exceptions', value: summary.hasExceptions, color: 'var(--status-warning)' },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl p-4"
          style={{ border: '1px solid var(--border-primary)', background: 'var(--surface-raised)' }}
        >
          <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
            {card.label}
          </p>
          <p className="text-2xl font-bold" style={{ color: card.color }}>
            {card.value}
          </p>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Repo compliance table
// ---------------------------------------------------------------------------

function RepoTable({ repos }: { repos: RepoToolComplianceStatus[] }) {
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null)

  if (repos.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 rounded-xl"
        style={{ border: '1px dashed var(--border-primary)' }}
      >
        <Shield className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
          No repos found
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Run a scan to discover repositories.
        </p>
      </div>
    )
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border-primary)' }}
    >
      <table className="w-full">
        <thead>
          <tr style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-primary)' }}>
            <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Repository
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Status
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Drift
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Exceptions
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Details
            </th>
          </tr>
        </thead>
        <tbody>
          {repos.map((repo) => {
            const isExpanded = expandedRepo === repo.repo
            return (
              <tr key={repo.repo}>
                <td colSpan={5} className="p-0">
                  <div>
                    <div
                      className="flex items-center transition-colors hover:bg-[var(--surface-hover)] cursor-pointer"
                      style={{ borderBottom: '1px solid var(--border-primary)' }}
                      onClick={() => setExpandedRepo(isExpanded ? null : repo.repo)}
                    >
                      <div className="flex-1 px-4 py-3">
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {repo.repo}
                        </span>
                      </div>
                      <div className="px-4 py-3">
                        <StatusBadge status={repo.status} />
                      </div>
                      <div className="px-4 py-3">
                        {repo.drifted ? (
                          <span className="text-xs font-medium" style={{ color: 'var(--status-error)' }}>
                            Drifted
                          </span>
                        ) : repo.lastSyncHash ? (
                          <span className="text-xs" style={{ color: 'var(--status-success)' }}>
                            In sync
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            Never synced
                          </span>
                        )}
                      </div>
                      <div className="px-4 py-3">
                        <span className="text-xs" style={{ color: repo.exceptionCount > 0 ? 'var(--status-warning)' : 'var(--text-muted)' }}>
                          {repo.exceptionCount}
                        </span>
                      </div>
                      <div className="px-4 py-3 text-right">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 inline" style={{ color: 'var(--text-muted)' }} />
                        ) : (
                          <ChevronDown className="w-4 h-4 inline" style={{ color: 'var(--text-muted)' }} />
                        )}
                      </div>
                    </div>
                    {isExpanded && (
                      <div
                        className="px-6 py-4"
                        style={{
                          background: 'var(--surface-raised)',
                          borderBottom: '1px solid var(--border-primary)',
                        }}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                              Hash Info
                            </p>
                            <div className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                              <p>Last Sync Hash: <code className="px-1 py-0.5 rounded" style={{ background: 'var(--surface-base)' }}>{repo.lastSyncHash ?? 'none'}</code></p>
                              <p>Current Hash: <code className="px-1 py-0.5 rounded" style={{ background: 'var(--surface-base)' }}>{repo.currentHash ?? 'none'}</code></p>
                            </div>
                          </div>
                          {repo.missingRules.length > 0 && (
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                                Missing Deny Rules
                              </p>
                              <ul className="space-y-1">
                                {repo.missingRules.map((rule) => (
                                  <li key={rule} className="text-xs flex items-center gap-1.5" style={{ color: 'var(--status-error)' }}>
                                    <XCircle className="w-3 h-3 flex-shrink-0" />
                                    <code>{rule}</code>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Exception registry
// ---------------------------------------------------------------------------

function ExceptionRegistry({
  exceptions,
  onAdd,
  adding,
}: {
  exceptions: ToolException[]
  onAdd: (data: { repo: string; rule: string; justification: string }) => Promise<void>
  adding: boolean
}) {
  const [showForm, setShowForm] = useState(false)
  const [repo, setRepo] = useState('')
  const [rule, setRule] = useState('')
  const [justification, setJustification] = useState('')

  const handleSubmit = async () => {
    if (!repo.trim() || !rule.trim() || !justification.trim()) return
    await onAdd({ repo: repo.trim(), rule: rule.trim(), justification: justification.trim() })
    setRepo('')
    setRule('')
    setJustification('')
    setShowForm(false)
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Exception Registry
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{
            background: 'var(--interactive-primary)',
            color: 'var(--text-on-accent)',
          }}
        >
          <Plus className="w-3 h-3" />
          Add Exception
        </button>
      </div>

      {showForm && (
        <div
          className="rounded-xl p-4 mb-4"
          style={{ border: '1px solid var(--border-primary)', background: 'var(--surface-raised)' }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                Repository
              </label>
              <input
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="org/repo-name"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'var(--surface-base)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                Rule
              </label>
              <input
                type="text"
                value={rule}
                onChange={(e) => setRule(e.target.value)}
                placeholder="Bash(curl*)"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'var(--surface-base)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                Justification
              </label>
              <input
                type="text"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Required for deployment scripts"
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{
                  background: 'var(--surface-base)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={adding || !repo.trim() || !rule.trim() || !justification.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              style={{
                background: 'var(--interactive-primary)',
                color: 'var(--text-on-accent)',
              }}
            >
              {adding ? 'Saving...' : 'Save Exception'}
            </button>
          </div>
        </div>
      )}

      {exceptions.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-10 rounded-xl"
          style={{ border: '1px dashed var(--border-primary)' }}
        >
          <FileWarning className="w-8 h-8 mb-2" style={{ color: 'var(--text-muted)' }} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            No exceptions registered.
          </p>
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--border-primary)' }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-primary)' }}>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Repo</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Rule</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Approved By</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Review Deadline</th>
                <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Justification</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((exc) => {
                const isExpired = new Date(exc.reviewDeadline) < new Date()
                return (
                  <tr
                    key={exc.id}
                    className="transition-colors hover:bg-[var(--surface-hover)]"
                    style={{ borderBottom: '1px solid var(--border-primary)' }}
                  >
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-primary)' }}>{exc.repo}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs px-1 py-0.5 rounded" style={{ background: 'var(--surface-raised)', color: 'var(--text-secondary)' }}>
                        {exc.rule}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{exc.approvedBy}</td>
                    <td className="px-4 py-3">
                      <span
                        className="flex items-center gap-1.5 text-xs"
                        style={{ color: isExpired ? 'var(--status-error)' : 'var(--text-muted)' }}
                      >
                        <Clock className="w-3 h-3" />
                        {new Date(exc.reviewDeadline).toLocaleDateString()}
                        {isExpired && ' (expired)'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs max-w-[200px] truncate" style={{ color: 'var(--text-muted)' }} title={exc.justification}>
                      {exc.justification}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Impact preview panel
// ---------------------------------------------------------------------------

function ImpactPreviewPanel({
  orgName,
}: {
  orgName: string
}) {
  const { data, loading, error, preview, reset } = useToolImpactPreview(orgName)
  const [rulesInput, setRulesInput] = useState('')
  const [expanded, setExpanded] = useState(false)

  const handlePreview = async () => {
    const rules = rulesInput
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean)
    if (rules.length === 0) return
    await preview(rules)
  }

  return (
    <div className="mb-8">
      <div
        className="flex items-center justify-between cursor-pointer mb-4"
        onClick={() => setExpanded(!expanded)}
      >
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Policy Impact Preview
        </h2>
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          {expanded ? (
            <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          )}
        </div>
      </div>

      {expanded && (
        <div
          className="rounded-xl p-4"
          style={{ border: '1px solid var(--border-primary)', background: 'var(--surface-raised)' }}
        >
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Enter deny rules (one per line) to preview which repos would be affected by a new policy baseline.
          </p>
          <textarea
            value={rulesInput}
            onChange={(e) => setRulesInput(e.target.value)}
            rows={4}
            placeholder={'Bash(npm publish*)\nBash(curl*)\nBash(docker push*)'}
            className="w-full px-3 py-2 rounded-lg text-sm font-mono mb-3"
            style={{
              background: 'var(--surface-base)',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-primary)',
              resize: 'vertical',
            }}
          />
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={handlePreview}
              disabled={loading || !rulesInput.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              style={{
                background: 'var(--interactive-primary)',
                color: 'var(--text-on-accent)',
              }}
            >
              {loading ? 'Computing...' : 'Preview Impact'}
            </button>
            {data && (
              <button
                onClick={reset}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}
              >
                Clear
              </button>
            )}
          </div>

          {error && (
            <p className="text-xs mb-3" style={{ color: 'var(--status-error)' }}>
              {error}
            </p>
          )}

          {data && (
            <div>
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                {data.total} repo{data.total !== 1 ? 's' : ''} would be affected
              </p>
              {data.affectedRepos.length > 0 && (
                <div className="space-y-2">
                  {data.affectedRepos.map((r) => (
                    <div
                      key={r.repo}
                      className="flex items-start gap-3 p-2 rounded-lg text-xs"
                      style={{ background: 'var(--surface-base)' }}
                    >
                      <span className="font-medium flex-shrink-0" style={{ color: 'var(--text-primary)' }}>
                        {r.repo}
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {r.missingRules.map((rule) => (
                          <code
                            key={rule}
                            className="px-1 py-0.5 rounded"
                            style={{ background: 'var(--status-error-bg)', color: 'var(--status-error)' }}
                          >
                            {rule}
                          </code>
                        ))}
                      </div>
                      {!r.hasSettingsFile && (
                        <span className="text-xs" style={{ color: 'var(--status-error)' }}>
                          (no settings file)
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Export button
// ---------------------------------------------------------------------------

function ExportButton({
  repos,
  exceptions,
}: {
  repos: RepoToolComplianceStatus[]
  exceptions: ToolException[]
}) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv')

  const handleExport = () => {
    if (format === 'json') {
      const data = JSON.stringify({ repos, exceptions }, null, 2)
      downloadFile(data, 'tool-compliance-report.json', 'application/json')
    } else {
      const headers = ['Repository', 'Status', 'Drifted', 'Missing Rules', 'Exception Count', 'Last Sync Hash']
      const rows = repos.map((r) => [
        r.repo,
        r.status,
        r.drifted ? 'Yes' : 'No',
        r.missingRules.join('; '),
        String(r.exceptionCount),
        r.lastSyncHash ?? '',
      ])
      const csv = [headers.join(','), ...rows.map((r) => r.map(escapeCSV).join(','))].join('\n')
      downloadFile(csv, 'tool-compliance-report.csv', 'text/csv')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={format}
        onChange={(e) => setFormat(e.target.value as 'csv' | 'json')}
        className="px-2 py-1.5 rounded-lg text-xs"
        style={{
          background: 'var(--surface-base)',
          border: '1px solid var(--border-primary)',
          color: 'var(--text-secondary)',
        }}
      >
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
      </select>
      <button
        onClick={handleExport}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{ border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}
      >
        <Download className="w-3 h-3" />
        Export
      </button>
    </div>
  )
}

function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ToolCompliancePage() {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const userOrgs = user?.organizations ?? []
  const selectedWorkspace = useSelectedWorkspace()
  const orgName = selectedWorkspace ?? userOrgs[0] ?? null

  const { data: statusData, loading: statusLoading, error: statusError, refresh: refreshStatus } =
    useToolComplianceStatus(orgName)
  const { data: exceptionsData, loading: exceptionsLoading, refresh: refreshExceptions } =
    useToolExceptions(orgName)
  const { createException, creating } = useCreateToolException(orgName)

  const isInternalWorkspace = useIsInternalWorkspace()
  const isVisible = isInternalWorkspace && isPageVisibleForUser('tool-compliance', userOrgs, selectedWorkspace)

  const handleAddException = useCallback(
    async (data: { repo: string; rule: string; justification: string }) => {
      await createException(data)
      refreshExceptions()
      refreshStatus()
    },
    [createException, refreshExceptions, refreshStatus],
  )

  if (!isVisible) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <Shield className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Internal Feature
        </h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
          Tool compliance reporting is only available to internal users.
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
          Select a workspace from the sidebar to view tool compliance status.
        </p>
      </div>
    )
  }

  const isLoading = statusLoading || exceptionsLoading

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Tool Compliance
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Track tool allowlist policy compliance across all repositories
          </p>
        </div>
        {statusData && exceptionsData && (
          <ExportButton
            repos={statusData.repos}
            exceptions={exceptionsData.exceptions}
          />
        )}
      </div>

      {/* Error */}
      {statusError && (
        <div
          className="flex items-center gap-3 p-4 rounded-lg mb-6"
          style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error)' }}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--status-error)' }} />
          <p className="text-sm" style={{ color: 'var(--status-error)' }}>{statusError}</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      )}

      {/* Content */}
      {!isLoading && statusData && (
        <>
          {/* Summary cards */}
          <SummaryCards summary={statusData.summary} />

          {/* Repo compliance table */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              Repository Compliance
            </h2>
            <RepoTable repos={statusData.repos} />
          </div>

          {/* Exception registry */}
          <ExceptionRegistry
            exceptions={exceptionsData?.exceptions ?? []}
            onAdd={handleAddException}
            adding={creating}
          />

          {/* Impact preview */}
          <ImpactPreviewPanel orgName={orgName} />
        </>
      )}
    </div>
  )
}
