'use client'

import { useState } from 'react'
import { Shield, Loader2, AlertCircle, FileText, Clock } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { useIsInternalWorkspace } from '@/hooks/useWorkspaceAudienceTier'
import { useAuditLogs, useAuditSummary } from '@/hooks/useEnforcement'

const SEVERITY_COLORS: Record<string, string> = {
  info: 'var(--text-muted)',
  warning: 'var(--status-warning)',
  critical: 'var(--status-error)',
}

export default function AuditPage() {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const userOrgs = user?.organizations ?? []
  const selectedWorkspace = useSelectedWorkspace()
  const orgName = selectedWorkspace ?? userOrgs[0] ?? null

  const [filters, setFilters] = useState<{ sessionType?: string; action?: string; severity?: string }>({})
  const { entries, total, loading, error } = useAuditLogs(orgName, filters)
  const { data: summary } = useAuditSummary(orgName)

  const isInternalWorkspace = useIsInternalWorkspace()
  const isVisible = isInternalWorkspace && isPageVisibleForUser('enforcement-audit', userOrgs, selectedWorkspace)

  if (!isVisible) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <Shield className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Internal Feature</h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>Audit logs are only available to internal users.</p>
      </div>
    )
  }

  if (!orgName) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <AlertCircle className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No Workspace Selected</h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select a workspace from the sidebar.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Audit Log</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Centralized audit trail of all agent activities across sessions</p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-primary)' }}>
            <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total Entries</p>
            <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{summary.totalEntries}</p>
          </div>
          {Object.entries(summary.bySeverity).map(([severity, count]) => (
            <div key={severity} className="rounded-xl p-4" style={{ border: '1px solid var(--border-primary)' }}>
              <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{severity}</p>
              <p className="text-2xl font-bold mt-1" style={{ color: SEVERITY_COLORS[severity] || 'var(--text-primary)' }}>{count}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={filters.sessionType || ''}
          onChange={(e) => setFilters((f) => ({ ...f, sessionType: e.target.value || undefined }))}
          className="px-3 py-1.5 rounded-lg text-xs"
          style={{ border: '1px solid var(--border-primary)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
        >
          <option value="">All Session Types</option>
          <option value="background-agent">Background Agent</option>
          <option value="cli">CLI</option>
          <option value="vscode">VS Code</option>
          <option value="dashboard">Dashboard</option>
        </select>
        <select
          value={filters.action || ''}
          onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value || undefined }))}
          className="px-3 py-1.5 rounded-lg text-xs"
          style={{ border: '1px solid var(--border-primary)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
        >
          <option value="">All Actions</option>
          <option value="tool_call">Tool Call</option>
          <option value="file_edit">File Edit</option>
          <option value="bash_command">Bash Command</option>
          <option value="config_change">Config Change</option>
          <option value="policy_violation">Policy Violation</option>
        </select>
        <select
          value={filters.severity || ''}
          onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value || undefined }))}
          className="px-3 py-1.5 rounded-lg text-xs"
          style={{ border: '1px solid var(--border-primary)', background: 'var(--surface-base)', color: 'var(--text-primary)' }}
        >
          <option value="">All Severities</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg mb-6" style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error)' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--status-error)' }} />
          <p className="text-sm" style={{ color: 'var(--status-error)' }}>{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl" style={{ border: '1px dashed var(--border-primary)' }}>
          <FileText className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No audit entries found</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Audit events will appear as agents run.</p>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{total} entries</p>
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-lg p-3 hover:bg-[var(--surface-hover)]" style={{ border: '1px solid var(--border-primary)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: SEVERITY_COLORS[entry.severity] || 'var(--text-muted)' }} />
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{entry.action.replace('_', ' ')}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)' }}>{entry.sessionType}</span>
                </div>
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <Clock className="w-3 h-3" />
                  {new Date(entry.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {entry.userName} {entry.projectId && `in ${entry.projectId}`}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
