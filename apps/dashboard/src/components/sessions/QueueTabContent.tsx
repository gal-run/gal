'use client'

/**
 * QueueTabContent Component
 *
 * Work-item queue management panel showing queue status, consumer health,
 * load metrics, pending items, and intake panel.
 *
 * Migrated from apps/dashboard to Next.js App Router.
 */

import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, AlertCircle, Activity, Clock, Zap, Trash2, ArrowUp, ArrowDown, CheckSquare, Square, ChevronsUp, ChevronsDown, ExternalLink, ListChecks as QueueListChecks } from 'lucide-react'
import type {
  AutonomyInterventionAction,
  AutonomyInterventionCreateRequest,
  AutonomyInterventionRecord,
  AutonomyMetricsSnapshot,
  AutonomyOverviewResponse,
} from '@gal/types'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { QueueIntakePanel } from './QueueIntakePanel'
import { EffectiveDispatchState } from '@/components/settings/EffectiveDispatchState'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_QUEUE_STATUS, DEMO_QUEUE_STATS, DEMO_PENDING_WORK_ITEMS, DEMO_CONSUMER_HEALTH } from '@/lib/demo-data'

// --- Types ---

interface QueueStatus {
  pending: number
  active: number
  completed_today: number
  failed_today: number
  health: 'healthy' | 'degraded' | 'idle' | 'blocked'
  orphaned_claimed_count?: number // #2040: Claimed items with no active session
  blocked_reason?: string | null
  blocked_action?: string | null
  blocked_owners?: Array<{
    userId: string
    provider: string
    status: string
    reason: string
  }>
  systemic_failure?: {
    category: string
    count: number
    action?: string
    summary: string
  } | null
}

interface PendingWorkItem {
  id: string
  priority: number
  source: {
    type: string
    url?: string
    issueNumber?: number
    prNumber?: number
    repository?: string
  }
  command: string
  createdAt: string
}

interface FailedWorkItem {
  id: string
  priority: number
  source: {
    type: string
    url?: string
    issueNumber?: number
    prNumber?: number
    repository?: string
  }
  command: string
  createdAt: string
  updatedAt?: string
  completedAt?: string
  status: 'failed' | 'blocked'
  result?: {
    message?: string
    failureCategory?: string
    workflowRunUrl?: string
    failedStep?: string
    details?: Record<string, unknown>
  }
  dispatchReadiness?: {
    failure?: {
      type?: string
      message?: string
    }
    providerCredentials?: {
      provider?: string
      status?: string
      userId?: string
      error?: string | null
    }
  }
}

interface ConsumerHealth {
  status: string
  metrics: {
    isRunning: boolean
    hasLease: boolean
    paused: boolean
    lastHeartbeatAt: string | null
    lastDispatchAt: string | null
    dispatched: number
    dispatchFailures: number
    retries: number
    capacitySkips: number
  }
}

interface QueueStats {
  pending: number
  active: number
  maxActive: number
  completed: number
  failed: number
  consumerPaused: boolean
  lastPollAt: string | null
}

const AUTONOMY_ACTION_OPTIONS: Array<{
  value: AutonomyInterventionAction
  label: string
}> = [
  { value: 'manual_dispatch', label: 'Manual dispatch' },
  { value: 'firestore_cleanup', label: 'Firestore cleanup' },
  { value: 'auth_refresh', label: 'Auth refresh' },
  { value: 'code_fix', label: 'Code fix' },
  { value: 'config_fix', label: 'Config fix' },
  { value: 'session_retry', label: 'Session retry' },
  { value: 'queue_override', label: 'Queue override' },
  { value: 'other', label: 'Other' },
]

// --- Helpers ---

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'never'
  const ms = Date.now() - new Date(dateStr).getTime()
  if (ms < 0) return 'just now'
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatDurationMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—'
  if (minutes < 60) return `${Math.round(minutes)}m`
  const hours = minutes / 60
  if (hours < 24) return `${Math.round(hours * 10) / 10}h`
  return `${Math.round((hours / 24) * 10) / 10}d`
}

function autonomyWindowLabel(window: AutonomyMetricsSnapshot['window']): string {
  switch (window) {
    case '24h':
      return 'Last 24h'
    case '7d':
      return 'Last 7d'
    case '30d':
      return 'Last 30d'
    default:
      return 'Recent sample'
  }
}

function parseOptionalIssueNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

/** Derive human-readable consumer state from health metrics and queue activity */
function deriveConsumerState(
  health: ConsumerHealth | null,
  stats: QueueStats | null,
): string {
  if (!health) return '\u2014'
  const { isRunning, paused, hasLease } = health.metrics
  if (!isRunning) return 'stopped'
  if (paused) return 'paused'
  if (!hasLease) return 'waiting lease'
  const pending = stats?.pending ?? 0
  const active = stats?.active ?? 0
  if (active > 0 || pending > 0) return 'running (active)'
  return 'running (idle)'
}

function consumerStateColor(state: string): string {
  switch (state) {
    case 'running (active)': return 'var(--status-success)'
    case 'running (idle)': return 'var(--status-info)'
    case 'paused': return 'var(--status-warning)'
    case 'waiting lease': return 'var(--badge-purple-text)'
    case 'stopped': return 'var(--status-danger)'
    default: return 'var(--text-muted)'
  }
}

function priorityLabel(priority: number): string {
  switch (priority) {
    case 0: return 'Critical'
    case 1: return 'High'
    case 2: return 'Medium'
    case 3: return 'Low'
    default: return String(priority)
  }
}

function priorityColor(priority: number): string {
  switch (priority) {
    case 0: return 'var(--status-danger)'
    case 1: return 'var(--status-warning)'
    case 2: return 'var(--status-info)'
    case 3: return 'var(--text-muted)'
    default: return 'var(--text-muted)'
  }
}

function priorityBackground(priority: number): string {
  switch (priority) {
    case 0: return 'var(--status-danger-light)'
    case 1: return 'var(--status-warning-light)'
    case 2: return 'var(--status-info-light)'
    case 3: return 'var(--badge-gray-bg)'
    default: return 'var(--bg-tertiary)'
  }
}

function sourceLabel(item: PendingWorkItem): string {
  const { source } = item
  if (source.issueNumber && source.repository) {
    return `${source.repository}#${source.issueNumber}`
  }
  if (source.prNumber && source.repository) {
    return `${source.repository} PR#${source.prNumber}`
  }
  if (source.repository) return source.repository
  return source.type
}

function sourceUrl(item: PendingWorkItem): string | undefined {
  return item.source.url
}

function firstText(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed.length > 0) return trimmed
  }
  return null
}

function classifyFailure(item: FailedWorkItem): { category: string; reason: string; action?: string } {
  const provider = item.dispatchReadiness?.providerCredentials?.provider || 'provider'
  const failureType = item.dispatchReadiness?.failure?.type
  const details = item.result?.details ?? {}
  const structuredFailureCategory = typeof item.result?.failureCategory === 'string' ? item.result.failureCategory : null
  const failedStep = typeof item.result?.failedStep === 'string' && item.result.failedStep.trim().length > 0
    ? item.result.failedStep.trim()
    : typeof details['failedStep'] === 'string' && details['failedStep'].trim().length > 0
      ? details['failedStep'].trim()
      : null
  const blockerType = typeof details['blockerType'] === 'string' ? details['blockerType'].toLowerCase() : ''
  const reason = firstText(
    item.result?.message,
    failedStep ? `Workflow failed at step "${failedStep}"` : null,
    item.dispatchReadiness?.failure?.message,
    typeof details['blockerSummary'] === 'string' ? details['blockerSummary'] : null,
    typeof details['workflowConclusion'] === 'string' ? `Workflow concluded: ${details['workflowConclusion']}` : null,
    'Failure reason unavailable',
  ) || 'Failure reason unavailable'
  const lower = reason.toLowerCase()

  if (structuredFailureCategory === 'startup_failure') {
    return {
      category: 'Startup failure',
      reason,
      action: 'Open the workflow run and fix startup/bootstrap errors before retrying',
    }
  }

  if (structuredFailureCategory === 'timeout') {
    return {
      category: 'Timeout',
      reason,
      action: 'Inspect the workflow/session output before raising timeout limits',
    }
  }

  if (structuredFailureCategory === 'command_expansion') {
    return {
      category: 'Command not approved',
      reason,
      action: 'Approve the command in Settings > Approved Config > Commands',
    }
  }

  if (structuredFailureCategory === 'preflight_rejection') {
    return {
      category: 'Preflight rejected',
      reason,
      action: 'Resolve readiness blockers before retrying',
    }
  }

  if (structuredFailureCategory === 'manual') {
    return {
      category: 'Cancelled',
      reason,
    }
  }

  if (
    structuredFailureCategory === 'credential_error' ||
    failureType === 'credentials_expired' ||
    lower.includes('credentials expired') ||
    lower.includes('refresh token was already used') ||
    lower.includes('invalid_grant')
  ) {
    return {
      category: 'Token expired',
      reason,
      action: `Run \`gal auth ${provider}\` and retry`,
    }
  }

  if (
    failureType === 'credentials_missing' ||
    lower.includes('not configured') ||
    (lower.includes('no ') && lower.includes('credentials'))
  ) {
    return {
      category: 'Credentials missing',
      reason,
      action: `Run \`gal auth ${provider}\` and retry`,
    }
  }

  if (
    failureType === 'environment_config_missing' ||
    failureType === 'approved_config_missing' ||
    failureType === 'user_scoped_auth_required' ||
    lower.includes('missing config')
  ) {
    return {
      category: 'Missing config',
      reason,
      action: 'Open Settings and resolve required configuration',
    }
  }

  if (
    lower.includes('not found in approved organization config') ||
    lower.includes('command not found') ||
    lower.includes('command expansion')
  ) {
    return {
      category: 'Command not approved',
      reason,
      action: 'Approve the command in Settings > Approved Config > Commands',
    }
  }

  if (blockerType === 'test_failure') {
    return { category: 'Test failure', reason }
  }

  if (blockerType === 'merge_conflict') {
    return { category: 'Merge conflict', reason }
  }

  if (blockerType === 'access_credentials') {
    return {
      category: 'Credential access blocked',
      reason,
      action: `Run \`gal auth ${provider}\` and verify credential ownership`,
    }
  }

  return {
    category: 'Agent failed',
    reason,
    action: 'Open session output for details',
  }
}

function getFailedWorkflowRunUrl(item: FailedWorkItem): string | null {
  return typeof item.result?.workflowRunUrl === 'string' && item.result.workflowRunUrl.trim().length > 0
    ? item.result.workflowRunUrl.trim()
    : null
}

function getFailedStep(item: FailedWorkItem): string | null {
  if (typeof item.result?.failedStep === 'string' && item.result.failedStep.trim().length > 0) {
    return item.result.failedStep.trim()
  }
  const details = item.result?.details ?? {}
  return typeof details['failedStep'] === 'string' && details['failedStep'].trim().length > 0
    ? details['failedStep'].trim()
    : null
}

// --- Sub-components ---

interface OrphanedClaimWarningProps {
  count: number
}

/** Warning banner when queue shows active claims but no corresponding sessions (#2040) */
function OrphanedClaimWarning({ count }: OrphanedClaimWarningProps) {
  if (count === 0) return null

  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        backgroundColor: 'var(--status-warning-light)',
        borderColor: 'var(--status-warning)',
      }}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--status-warning)' }} />
        <div className="flex-1">
          <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--status-warning-text)' }}>
            Orphaned Claims Detected
          </h4>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {count} work {count === 1 ? 'item is' : 'items are'} marked as claimed/active but{' '}
            {count === 1 ? 'has' : 'have'} no corresponding active session or workflow. This typically
            happens when a workflow completes but the work item status wasn&apos;t updated.
          </p>
          <p className="text-xs leading-relaxed mt-2" style={{ color: 'var(--text-secondary)' }}>
            <strong>What this means:</strong> Queue shows &quot;Active {count}&quot; but Background tab shows
            fewer active sessions. These items may be preventing new work from starting.
          </p>
          <p className="text-xs leading-relaxed mt-2" style={{ color: 'var(--text-secondary)' }}>
            <strong>Resolution:</strong> Run reconciliation via API or wait for automatic cleanup
            (runs periodically). See{' '}
            <a
              href="https://github.com/Scheduler-Systems/gal-run-private/issues/2039"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80"
              style={{ color: 'var(--status-info)' }}
            >
              #2039
            </a>{' '}
            for details.
          </p>
        </div>
      </div>
    </div>
  )
}

function DispatchBlockedBanner({ status }: { status: QueueStatus }) {
  if (status.health !== 'blocked' || !status.blocked_reason) return null

  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        backgroundColor: 'var(--status-danger-light)',
        borderColor: 'var(--status-danger)',
      }}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--status-danger)' }} />
        <div className="flex-1">
          <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--status-danger)' }}>
            Dispatch Blocked
          </h4>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {status.blocked_reason}
          </p>
          {status.blocked_action && (
            <p className="text-xs leading-relaxed mt-2" style={{ color: 'var(--text-secondary)' }}>
              <strong>Action:</strong> {status.blocked_action}
            </p>
          )}
          {status.blocked_owners && status.blocked_owners.length > 0 && (
            <div className="mt-2 space-y-1">
              {status.blocked_owners.map((owner, idx) => (
                <p key={`${owner.userId}-${owner.provider}-${idx}`} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  - {owner.userId}: {owner.provider} ({owner.status}) {owner.reason}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SystemicFailureBanner({ summary }: { summary: QueueStatus['systemic_failure'] }) {
  if (!summary || summary.count < 3) return null

  return (
    <div
      className="rounded-xl p-4 border"
      style={{
        backgroundColor: 'var(--status-warning-light)',
        borderColor: 'var(--status-warning)',
      }}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--status-warning)' }} />
        <div className="flex-1">
          <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--status-warning-text)' }}>
            Systemic Failures Detected
          </h4>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {summary.count} item{summary.count === 1 ? '' : 's'} failed with <strong>{summary.category}</strong>. {summary.summary}
          </p>
          {summary.action && (
            <p className="text-xs leading-relaxed mt-2" style={{ color: 'var(--text-secondary)' }}>
              <strong>Action:</strong> {summary.action}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number
  color: string
  bg: string
}

function StatCard({ label, value, color, bg }: StatCardProps) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl p-6 min-w-[140px]"
      style={{
        backgroundColor: bg,
        border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
      }}
    >
      <span className="text-4xl font-bold tabular-nums" style={{ color }}>
        {value}
      </span>
      <span className="mt-2 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </span>
    </div>
  )
}

interface AutonomyPanelProps {
  overview: AutonomyOverviewResponse | null
  loading: boolean
  error: string | null
  onLogIntervention: (payload: AutonomyInterventionCreateRequest) => Promise<void>
  logging: boolean
}

function AutonomyPanel({ overview, loading, error, onLogIntervention, logging }: AutonomyPanelProps) {
  const [action, setAction] = useState<AutonomyInterventionAction>('manual_dispatch')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [preventedByIssueNumber, setPreventedByIssueNumber] = useState('')
  const [relatedIssueNumber, setRelatedIssueNumber] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!reason.trim() || logging) return

    setSubmitError(null)
    try {
      await onLogIntervention({
        action,
        reason: reason.trim(),
        notes: notes.trim() || undefined,
        preventedByIssueNumber: parseOptionalIssueNumber(preventedByIssueNumber),
        relatedIssueNumber: parseOptionalIssueNumber(relatedIssueNumber),
      })
      setReason('')
      setNotes('')
      setPreventedByIssueNumber('')
      setRelatedIssueNumber('')
      setAction('manual_dispatch')
    } catch (submitErr) {
      setSubmitError(submitErr instanceof Error ? submitErr.message : 'Failed to log intervention')
    }
  }

  return (
    <div
      className="rounded-xl p-5 space-y-5"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Queue Autonomy
          </h3>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Rolling scorecards plus manual intervention tracking for this workspace.
          </p>
        </div>
      </div>

      {loading && !overview && (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading autonomy overview&hellip;</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--status-danger)' }}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {overview.snapshots.map((snapshot) => (
            <div
              key={snapshot.window}
              className="rounded-xl p-4 space-y-3"
              style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {autonomyWindowLabel(snapshot.window)}
                </span>
                <span className="text-lg font-semibold tabular-nums" style={{ color: 'var(--status-success)' }}>
                  {snapshot.metrics.autonomyScore}%
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <dt style={{ color: 'var(--text-muted)' }}>PR rate</dt>
                  <dd className="mt-0.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {snapshot.metrics.prProductionRate}%
                  </dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--text-muted)' }}>Manual logs</dt>
                  <dd className="mt-0.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {snapshot.metrics.manualInterventionsLogged}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--text-muted)' }}>Dispatches</dt>
                  <dd className="mt-0.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {snapshot.metrics.totalDispatches}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--text-muted)' }}>Time to first PR</dt>
                  <dd className="mt-0.5 font-medium" style={{ color: 'var(--text-primary)' }}>
                    {formatDurationMinutes(snapshot.metrics.avgTimeToFirstPR)}
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-4">
        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Recent Interventions
            </h4>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {overview?.interventions.length ?? 0} logged
            </span>
          </div>

          {!overview?.interventions.length ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              No manual interventions logged yet.
            </p>
          ) : (
            <div className="space-y-3">
              {overview.interventions.map((entry: AutonomyInterventionRecord) => (
                <div
                  key={entry.id}
                  className="rounded-lg p-3"
                  style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                      {AUTONOMY_ACTION_OPTIONS.find((option) => option.value === entry.action)?.label ?? entry.action}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {formatRelativeTime(entry.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                    {entry.reason}
                  </p>
                  {(entry.preventedByIssueNumber || entry.relatedIssueNumber || entry.actorLogin) && (
                    <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                      {entry.actorLogin ? `By ${entry.actorLogin}` : 'Manual log'}
                      {entry.relatedIssueNumber ? ` · Related #${entry.relatedIssueNumber}` : ''}
                      {entry.preventedByIssueNumber ? ` · Prevent via #${entry.preventedByIssueNumber}` : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className="rounded-xl p-4 space-y-3"
          style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}
        >
          <div>
            <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Log Intervention
            </h4>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Record any manual queue rescue so the top bottlenecks are visible.
            </p>
          </div>

          <select
            value={action}
            onChange={(event) => setAction(event.target.value as AutonomyInterventionAction)}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
          >
            {AUTONOMY_ACTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why was manual intervention required?"
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={relatedIssueNumber}
              onChange={(event) => setRelatedIssueNumber(event.target.value)}
              placeholder="Related issue #"
              inputMode="numeric"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
            />
            <input
              value={preventedByIssueNumber}
              onChange={(event) => setPreventedByIssueNumber(event.target.value)}
              placeholder="Prevented by issue #"
              inputMode="numeric"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
            />
          </div>

          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional notes"
            rows={3}
            className="w-full rounded-lg px-3 py-2 text-sm resize-y"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
          />

          {submitError && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--status-danger)' }}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {submitError}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={logging || !reason.trim()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)' }}
          >
            {logging ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckSquare className="w-4 h-4" />}
            Log intervention
          </button>
        </div>
      </div>
    </div>
  )
}

interface ConsumerHealthPanelProps {
  health: ConsumerHealth | null
  stats: QueueStats | null
  loading: boolean
  error: string | null
}

function ConsumerHealthPanel({ health, stats, loading, error }: ConsumerHealthPanelProps) {
  const state = deriveConsumerState(health, stats)
  const stateColor = consumerStateColor(state)

  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Consumer Health
        </h3>
      </div>

      {loading && !health && (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading&hellip;</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--status-danger)' }}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {health && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
          <div>
            <dt style={{ color: 'var(--text-muted)' }}>State</dt>
            <dd className="mt-0.5 font-medium capitalize" style={{ color: stateColor }}>
              {state}
            </dd>
          </div>
          <div>
            <dt style={{ color: 'var(--text-muted)' }}>Lease held</dt>
            <dd
              className="mt-0.5 font-medium"
              style={{ color: health.metrics.hasLease ? 'var(--status-success)' : 'var(--text-secondary)' }}
            >
              {health.metrics.hasLease ? 'Yes' : 'No'}
            </dd>
          </div>
          <div>
            <dt style={{ color: 'var(--text-muted)' }}>Last heartbeat</dt>
            <dd className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {formatRelativeTime(health.metrics.lastHeartbeatAt)}
            </dd>
          </div>
          <div>
            <dt style={{ color: 'var(--text-muted)' }}>Last dispatch</dt>
            <dd className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {formatRelativeTime(health.metrics.lastDispatchAt)}
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}

interface LoadMetricsPanelProps {
  stats: QueueStats | null
  health: ConsumerHealth | null
  loading: boolean
  error: string | null
}

function LoadMetricsPanel({ stats, health, loading, error }: LoadMetricsPanelProps) {
  const pressure = stats && stats.maxActive > 0
    ? Math.min(1, stats.active / stats.maxActive)
    : 0
  const pressurePct = Math.round(pressure * 100)

  const dispatchTotal = health
    ? health.metrics.dispatched + health.metrics.dispatchFailures
    : null
  const successRate = dispatchTotal && dispatchTotal > 0 && health
    ? Math.round((health.metrics.dispatched / dispatchTotal) * 100)
    : null

  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Load &amp; Efficiency
        </h3>
      </div>

      {loading && !stats && (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading&hellip;</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--status-danger)' }}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {stats && (
        <div className="space-y-4">
          {/* Capacity bar */}
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: 'var(--text-muted)' }}>
                Capacity ({stats.active}/{stats.maxActive} active)
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>{pressurePct}%</span>
            </div>
            <div
              className="w-full h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pressurePct}%`,
                  backgroundColor:
                    pressurePct >= 90 ? 'var(--status-danger)' : pressurePct >= 70 ? 'var(--status-warning)' : 'var(--status-success)',
                }}
              />
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Queue pressure: {stats.pending}/{stats.maxActive} pending/max
            </div>
          </div>

          {/* Metrics grid */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
            {successRate !== null && (
              <div>
                <dt style={{ color: 'var(--text-muted)' }}>Dispatch success rate</dt>
                <dd
                  className="mt-0.5 font-medium"
                  style={{ color: successRate >= 90 ? 'var(--status-success)' : successRate >= 70 ? 'var(--status-warning)' : 'var(--status-danger)' }}
                >
                  {successRate}%
                </dd>
              </div>
            )}
            {health && (
              <>
                <div>
                  <dt style={{ color: 'var(--text-muted)' }}>Retries</dt>
                  <dd className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {health.metrics.retries}
                  </dd>
                </div>
                <div>
                  <dt style={{ color: 'var(--text-muted)' }}>Capacity skips</dt>
                  <dd className="mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {health.metrics.capacitySkips}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </div>
      )}
    </div>
  )
}

interface PendingQueueTableProps {
  orgName: string
  items: PendingWorkItem[]
  loading: boolean
  error: string | null
  onRefresh: () => void
}

function PendingQueueTable({ orgName, items, loading, error, onRefresh }: PendingQueueTableProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedIds(newSet)
  }

  const handleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(i => i.id)))
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this work item from the queue?')) return
    setActionLoading(true)
    setActionError(null)
    try {
      await api.deleteWorkItem(id)
      onRefresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove item')
    } finally {
      setActionLoading(false)
    }
  }

  const handleBulkDelete = async () => {
    const count = selectedIds.size
    if (!confirm(`Remove ${count} work item${count > 1 ? 's' : ''} from the queue?`)) return
    setActionLoading(true)
    setActionError(null)
    try {
      await api.bulkDeleteWorkItems(Array.from(selectedIds))
      setSelectedIds(new Set())
      onRefresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove items')
    } finally {
      setActionLoading(false)
    }
  }

  const handleBulkReprioritize = async (newPriority: number) => {
    const count = selectedIds.size
    if (!confirm(`Set priority to ${priorityLabel(newPriority)} for ${count} item${count > 1 ? 's' : ''}?`)) return
    setActionLoading(true)
    setActionError(null)
    try {
      await api.bulkReprioritizeWorkItems(Array.from(selectedIds), newPriority)
      setSelectedIds(new Set())
      onRefresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to reprioritize items')
    } finally {
      setActionLoading(false)
    }
  }

  const handleMove = async (id: string, position: number) => {
    setActionLoading(true)
    setActionError(null)
    try {
      await api.moveQueueWorkItem(orgName, id, position)
      onRefresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to move work item')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border-subtle)' }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <Clock className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Pending Queue
        </h3>
        {!loading && items.length > 0 && (
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Exact execution order
          </span>
        )}
        {!loading && items.length > 0 && (
          <span
            className="ml-auto text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'var(--badge-blue-bg)', color: 'var(--badge-blue-text)' }}
          >
            {items.length}
          </span>
        )}
        {selectedIds.size > 0 && (
          <div className="ml-4 flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {selectedIds.size} selected
            </span>
            <button
              onClick={handleBulkDelete}
              disabled={actionLoading}
              className="px-2 py-1 text-xs rounded hover:bg-[var(--status-danger-light)] transition-colors"
              style={{ color: 'var(--status-danger)' }}
              title="Delete selected items"
            >
              <Trash2 className="w-3 h-3" />
            </button>
            <select
              onChange={(e) => handleBulkReprioritize(Number(e.target.value))}
              disabled={actionLoading}
              className="px-2 py-1 text-xs rounded border"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
              defaultValue=""
            >
              <option value="" disabled>Set priority...</option>
              <option value="0">Critical</option>
              <option value="1">High</option>
              <option value="2">Medium</option>
              <option value="3">Low</option>
            </select>
          </div>
        )}
      </div>

      {loading && items.length === 0 && (
        <div className="flex items-center gap-2 px-4 py-6">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading&hellip;</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs px-4 py-4" style={{ color: 'var(--status-danger)' }}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="px-4 py-6 text-center">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            No pending items
          </p>
        </div>
      )}

      {actionError && (
        <div className="px-4 py-2 text-xs" style={{ backgroundColor: 'var(--status-danger-light)', color: 'var(--status-danger)' }}>
          {actionError}
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th className="px-4 py-2">
                  <button
                    onClick={handleSelectAll}
                    className="p-0.5 hover:bg-[var(--bg-tertiary)] rounded"
                    title={selectedIds.size === items.length ? 'Deselect all' : 'Select all'}
                  >
                    {selectedIds.size === items.length ? (
                      <CheckSquare className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                    ) : (
                      <Square className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                    )}
                  </button>
                </th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Position</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Priority</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Source</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Age</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Command</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>ID</th>
                <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const url = sourceUrl(item)
                const isSelected = selectedIds.has(item.id)
                return (
                  <tr
                    key={item.id}
                    style={{
                      backgroundColor: idx % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => handleToggleSelect(item.id)}
                        className="p-0.5 hover:bg-[var(--bg-tertiary)] rounded"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                        ) : (
                          <Square className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {idx + 1}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{
                          backgroundColor: priorityBackground(item.priority),
                          color: priorityColor(item.priority),
                        }}
                      >
                        {priorityLabel(item.priority)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-[180px]">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline truncate block"
                          style={{ color: 'var(--status-info)' }}
                          title={url}
                        >
                          {sourceLabel(item)}
                        </a>
                      ) : (
                        <span className="truncate block" style={{ color: 'var(--text-secondary)' }}>
                          {sourceLabel(item)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {formatRelativeTime(item.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <span
                        className="font-mono truncate block"
                        style={{ color: 'var(--text-primary)' }}
                        title={item.command}
                      >
                        {item.command.slice(0, 60)}{item.command.length > 60 ? '\u2026' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="font-mono text-[10px]"
                        style={{ color: 'var(--text-muted)' }}
                        title={item.id}
                      >
                        {item.id.slice(0, 8)}&hellip;
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {idx > 0 && (
                          <button
                            onClick={() => handleMove(item.id, 0)}
                            disabled={actionLoading}
                            className="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                            title="Move to front"
                          >
                            <ChevronsUp className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                          </button>
                        )}
                        {idx > 0 && (
                          <button
                            onClick={() => handleMove(item.id, idx - 1)}
                            disabled={actionLoading}
                            className="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                            title="Move earlier"
                          >
                            <ArrowUp className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                          </button>
                        )}
                        {idx < items.length - 1 && (
                          <button
                            onClick={() => handleMove(item.id, idx + 1)}
                            disabled={actionLoading}
                            className="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                            title="Move later"
                          >
                            <ArrowDown className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                          </button>
                        )}
                        {idx < items.length - 1 && (
                          <button
                            onClick={() => handleMove(item.id, items.length - 1)}
                            disabled={actionLoading}
                            className="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                            title="Move to back"
                          >
                            <ChevronsDown className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={actionLoading}
                          className="p-1 hover:bg-[var(--status-danger-light)] rounded transition-colors ml-1"
                          title="Remove from queue"
                        >
                          <Trash2 className="w-3 h-3" style={{ color: 'var(--status-danger)' }} />
                        </button>
                      </div>
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

interface FailedQueueTableProps {
  items: FailedWorkItem[]
  loading: boolean
  error: string | null
}

function FailedQueueTable({ items, loading, error }: FailedQueueTableProps) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border-subtle)' }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <AlertCircle className="w-4 h-4" style={{ color: 'var(--status-danger)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Failed Items
        </h3>
        {!loading && items.length > 0 && (
          <span
            className="ml-auto text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'var(--status-danger-light)', color: 'var(--status-danger)' }}
          >
            {items.length}
          </span>
        )}
      </div>

      {loading && items.length === 0 && (
        <div className="flex items-center gap-2 px-4 py-6">
          <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading&hellip;</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs px-4 py-4" style={{ color: 'var(--status-danger)' }}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="px-4 py-6 text-center">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            No failed items
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Source</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Failed</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Category</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const url = item.source.url
                const failure = classifyFailure(item)
                const failedAt = item.completedAt || item.updatedAt || item.createdAt
                const failedStep = getFailedStep(item)
                const workflowRunUrl = getFailedWorkflowRunUrl(item)
                return (
                  <tr
                    key={item.id}
                    style={{
                      backgroundColor: idx % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    <td className="px-4 py-2.5 max-w-[180px]">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline truncate block"
                          style={{ color: 'var(--status-info)' }}
                          title={url}
                        >
                          {item.source.repository && item.source.issueNumber
                            ? `${item.source.repository}#${item.source.issueNumber}`
                            : item.source.repository || item.source.type}
                        </a>
                      ) : (
                        <span className="truncate block" style={{ color: 'var(--text-secondary)' }}>
                          {item.source.repository && item.source.issueNumber
                            ? `${item.source.repository}#${item.source.issueNumber}`
                            : item.source.repository || item.source.type}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                      {formatRelativeTime(failedAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{
                          backgroundColor: 'var(--status-danger-light)',
                          color: 'var(--status-danger)',
                        }}
                      >
                        {failure.category}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 max-w-[420px]">
                      <div className="space-y-1">
                        <p className="truncate" style={{ color: 'var(--text-primary)' }} title={failure.reason}>
                          {failure.reason}
                        </p>
                        {failedStep && (
                          <p className="truncate" style={{ color: 'var(--text-secondary)' }} title={failedStep}>
                            Failed step: {failedStep}
                          </p>
                        )}
                        {workflowRunUrl && (
                          <a
                            href={workflowRunUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:underline"
                            style={{ color: 'var(--status-info)' }}
                          >
                            Workflow run
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        {failure.action && (
                          <p className="truncate" style={{ color: 'var(--text-muted)' }} title={failure.action}>
                            Action: {failure.action}
                          </p>
                        )}
                      </div>
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

// --- Main Component ---

export function QueueTabContent() {
  const { user } = useAuth()
  const selectedOrgName = useSelectedWorkspace()
  const [status, setStatus] = useState<QueueStatus | null>(null)
  const [pendingItems, setPendingItems] = useState<PendingWorkItem[]>([])
  const [failedItems, setFailedItems] = useState<FailedWorkItem[]>([])
  const [consumerHealth, setConsumerHealth] = useState<ConsumerHealth | null>(null)
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null)
  const [autonomyOverview, setAutonomyOverview] = useState<AutonomyOverviewResponse | null>(null)
  const [dispatchGlobalEnabled, setDispatchGlobalEnabled] = useState(false)
  const [dispatchAnyCategoryEnabled, setDispatchAnyCategoryEnabled] = useState(false)
  const [dispatchRulesFullData, setDispatchRulesFullData] = useState<{ enabled: boolean; rules: unknown[] } | null>(null)
  const [dispatchToggleLoading, setDispatchToggleLoading] = useState(false)
  const [dispatchToggleError, setDispatchToggleError] = useState<string | null>(null)
  const [autonomyLogLoading, setAutonomyLogLoading] = useState(false)

  const [loading, setLoading] = useState(true)
  const [pendingLoading, setPendingLoading] = useState(false)
  const [failedLoading, setFailedLoading] = useState(false)
  const [healthLoading, setHealthLoading] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  const [autonomyLoading, setAutonomyLoading] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [pendingError, setPendingError] = useState<string | null>(null)
  const [failedError, setFailedError] = useState<string | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [autonomyError, setAutonomyError] = useState<string | null>(null)

  const userOrgs = user?.organizations ?? []
  const canQueryQueue = selectedOrgName ? userOrgs.includes(selectedOrgName) : false

  const fetchAll = useCallback(async () => {
    // In demo mode, serve pre-seeded queue data without real API calls
    if (isDemoMode()) {
      setStatus(DEMO_QUEUE_STATUS)
      setPendingItems(DEMO_PENDING_WORK_ITEMS)
      setFailedItems([])
      setConsumerHealth(DEMO_CONSUMER_HEALTH)
      setQueueStats(DEMO_QUEUE_STATS)
      setAutonomyOverview({
        success: true,
        snapshots: [
          {
            window: '24h',
            metrics: {
              totalDispatches: 4,
              successfulPRs: 3,
              failedDispatches: 1,
              humanInterventions: 1,
              manualInterventionsLogged: 1,
              workItemHumanInterventions: 0,
              prProductionRate: 75,
              avgTimeToFirstPR: 18,
              autonomyScore: 70,
              failureBreakdown: { credentials_missing: 1 },
              window: {
                from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                to: new Date().toISOString(),
              },
            },
          },
          {
            window: '7d',
            metrics: {
              totalDispatches: 18,
              successfulPRs: 12,
              failedDispatches: 4,
              humanInterventions: 3,
              manualInterventionsLogged: 2,
              workItemHumanInterventions: 1,
              prProductionRate: 66.67,
              avgTimeToFirstPR: 24,
              autonomyScore: 51.67,
              failureBreakdown: { credentials_missing: 2, timeout: 2 },
              window: {
                from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                to: new Date().toISOString(),
              },
            },
          },
          {
            window: '30d',
            metrics: {
              totalDispatches: 61,
              successfulPRs: 37,
              failedDispatches: 14,
              humanInterventions: 8,
              manualInterventionsLogged: 5,
              workItemHumanInterventions: 3,
              prProductionRate: 60.66,
              avgTimeToFirstPR: 29,
              autonomyScore: 20.66,
              failureBreakdown: { credentials_missing: 5, timeout: 4, startup_failure: 5 },
              window: {
                from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                to: new Date().toISOString(),
              },
            },
          },
        ],
        interventions: [
          {
            id: 'demo-intervention-1',
            orgId: selectedOrgName ?? 'demo-org',
            action: 'auth_refresh',
            reason: 'Claude OAuth expired during queue canary',
            preventedByIssueNumber: 4554,
            actorLogin: 'karabil',
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          },
        ],
      })
      setDispatchGlobalEnabled(true)
      setDispatchAnyCategoryEnabled(true)
      setLoading(false)
      setPendingLoading(false)
      setFailedLoading(false)
      setHealthLoading(false)
      setStatsLoading(false)
      setAutonomyLoading(false)
      return
    }

    if (!canQueryQueue || !selectedOrgName) {
      setStatus(null)
      setPendingItems([])
      setFailedItems([])
      setConsumerHealth(null)
      setQueueStats(null)
      setAutonomyOverview(null)
      setLoading(false)
      setError(null)
      setPendingError(null)
      setFailedError(null)
      setHealthError(null)
      setStatsError(null)
      setAutonomyError(null)
      return
    }

    // Capture org at fetch time to detect stale responses if org changes mid-flight
    const orgAtFetchTime = selectedOrgName

    setPendingLoading(true)
    setFailedLoading(true)
    setHealthLoading(true)
    setStatsLoading(true)
    setAutonomyLoading(true)
    setLoading(true)
    setError(null)

    const orgName = selectedOrgName

    // Fan-out: fetch all 4 endpoints in parallel (including dispatch rules)
    const [statusResult, pendingResult, failedResult, healthResult, statsResult, autonomyResult, dispatchResult] = await Promise.allSettled([
      api.getQueueStatus(orgName),
      api.getPendingWorkItems(orgName),
      api.getFailedWorkItems(orgName),
      api.getQueueConsumerHealth(),
      api.getQueueStats(orgName),
      api.getAutonomyOverview(orgName, 8),
      api.fetchWithAuth(`${api.baseUrl}/organizations/${encodeURIComponent(orgName)}/dispatch-rules`)
        .then(r => r.ok ? r.json() : Promise.resolve({ enabled: false, rules: [] }))
        .catch(() => ({ enabled: false, rules: [] })),
    ])

    // Discard stale results if the selected org changed while fetches were in-flight
    if (orgAtFetchTime !== selectedOrgName) return

    // Status (summary counts)
    if (statusResult.status === 'fulfilled') {
      setStatus(statusResult.value)
      setError(null)
    } else {
      setError(statusResult.reason instanceof Error ? statusResult.reason.message : 'Failed to load queue status')
    }

    // Pending work items
    setPendingLoading(false)
    if (pendingResult.status === 'fulfilled') {
      setPendingItems(pendingResult.value)
      setPendingError(null)
    } else {
      setPendingError(pendingResult.reason instanceof Error ? pendingResult.reason.message : 'Failed to load pending items')
    }

    // Failed/blocked work items
    setFailedLoading(false)
    if (failedResult.status === 'fulfilled') {
      setFailedItems(failedResult.value)
      setFailedError(null)
    } else {
      setFailedError(failedResult.reason instanceof Error ? failedResult.reason.message : 'Failed to load failed items')
    }

    // Consumer health
    setHealthLoading(false)
    if (healthResult.status === 'fulfilled') {
      setConsumerHealth(healthResult.value)
      setHealthError(null)
    } else {
      setHealthError(healthResult.reason instanceof Error ? healthResult.reason.message : 'Failed to load consumer health')
    }

    // Queue stats
    setStatsLoading(false)
    if (statsResult.status === 'fulfilled') {
      setQueueStats(statsResult.value)
      setStatsError(null)
    } else {
      setStatsError(statsResult.reason instanceof Error ? statsResult.reason.message : 'Failed to load queue stats')
    }

    // Queue autonomy overview
    setAutonomyLoading(false)
    if (autonomyResult.status === 'fulfilled') {
      setAutonomyOverview(autonomyResult.value)
      setAutonomyError(null)
    } else {
      setAutonomyError(autonomyResult.reason instanceof Error ? autonomyResult.reason.message : 'Failed to load autonomy overview')
    }

    // Dispatch rules (for effective state display)
    if (dispatchResult.status === 'fulfilled') {
      const dispatchData = dispatchResult.value as { enabled?: boolean; rules?: Array<{ enabled?: boolean }> }
      setDispatchGlobalEnabled(dispatchData.enabled ?? false)
      setDispatchAnyCategoryEnabled(
        Array.isArray(dispatchData.rules) && dispatchData.rules.some(r => r.enabled)
      )
      setDispatchRulesFullData(dispatchData as { enabled: boolean; rules: unknown[] })
    } else {
      setDispatchGlobalEnabled(false)
      setDispatchAnyCategoryEnabled(false)
      setDispatchRulesFullData(null)
    }

    setLoading(false)
  }, [canQueryQueue, selectedOrgName])

  const handleLogAutonomyIntervention = useCallback(async (payload: AutonomyInterventionCreateRequest) => {
    if (!selectedOrgName) return
    setAutonomyLogLoading(true)
    try {
      await api.logAutonomyIntervention(selectedOrgName, payload)
      const refreshed = await api.getAutonomyOverview(selectedOrgName, 8)
      setAutonomyOverview(refreshed)
      setAutonomyError(null)
    } finally {
      setAutonomyLogLoading(false)
    }
  }, [selectedOrgName])

  const handleDispatchToggle = useCallback(async () => {
    if (!selectedOrgName || !dispatchRulesFullData || dispatchToggleLoading) return
    const newEnabled = !dispatchGlobalEnabled
    setDispatchToggleLoading(true)
    setDispatchToggleError(null)
    try {
      const response = await api.fetchWithAuth(
        `${api.baseUrl}/organizations/${encodeURIComponent(selectedOrgName)}/dispatch-rules`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...dispatchRulesFullData, enabled: newEnabled }),
        }
      )
      if (response.ok) {
        setDispatchGlobalEnabled(newEnabled)
        setDispatchRulesFullData(prev => prev ? { ...prev, enabled: newEnabled } : prev)
      } else {
        const text = await response.text().catch(() => '')
        setDispatchToggleError(
          `Failed to ${newEnabled ? 'enable' : 'disable'} dispatch (${response.status}${text ? ': ' + text : ''})`
        )
      }
    } catch (err) {
      setDispatchToggleError(
        err instanceof Error ? err.message : `Failed to ${newEnabled ? 'enable' : 'disable'} dispatch`
      )
    } finally {
      setDispatchToggleLoading(false)
    }
  }, [selectedOrgName, dispatchRulesFullData, dispatchGlobalEnabled, dispatchToggleLoading])

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      fetchAll()
    }, 0)
    const interval = setInterval(fetchAll, 15_000)
    return () => {
      clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [fetchAll])

  if (!canQueryQueue || !selectedOrgName) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24">
        <QueueListChecks className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Select an organization workspace to view the work-item queue.
        </p>
      </div>
    )
  }

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    )
  }

  if (error && !status) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-24 gap-4">
        <AlertCircle className="w-10 h-10" style={{ color: 'var(--status-danger)' }} />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{error}</p>
        <button
          onClick={fetchAll}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)' }}
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    )
  }

  const healthColor =
    status?.health === 'healthy'
      ? 'var(--status-success)'
      : status?.health === 'blocked'
      ? 'var(--status-danger)'
      : status?.health === 'degraded'
      ? 'var(--status-warning)'
      : 'var(--text-muted)'

  const orgName = selectedOrgName

  return (
    <div className="flex flex-col gap-8 p-8 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Work-Item Queue
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Live snapshot &middot; auto-refreshes every 15 s
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedOrgName && dispatchRulesFullData && (
            <button
              onClick={handleDispatchToggle}
              disabled={dispatchToggleLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60"
              style={dispatchGlobalEnabled ? {
                backgroundColor: 'color-mix(in srgb, var(--status-danger) 12%, transparent)',
                color: 'var(--status-danger)',
                border: '1px solid color-mix(in srgb, var(--status-danger) 28%, transparent)',
              } : {
                backgroundColor: 'color-mix(in srgb, var(--status-success) 12%, transparent)',
                color: 'var(--status-success)',
                border: '1px solid color-mix(in srgb, var(--status-success) 28%, transparent)',
              }}
              title={dispatchGlobalEnabled ? 'Disable auto-dispatch' : 'Enable auto-dispatch'}
            >
              {dispatchToggleLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : dispatchGlobalEnabled ? (
                <Square className="w-3.5 h-3.5" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              {dispatchGlobalEnabled ? 'Stop' : 'Start'}
            </button>
          )}
          <span
            className="px-3 py-1 rounded-full text-xs font-medium capitalize"
            style={{
              backgroundColor: `color-mix(in srgb, ${healthColor} 12%, transparent)`,
              color: healthColor,
              border: `1px solid color-mix(in srgb, ${healthColor} 28%, transparent)`,
            }}
          >
            {status?.health ?? '\u2014'}
          </span>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{ color: 'var(--text-muted)' }}
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Dispatch toggle error feedback */}
      {dispatchToggleError && (
        <div
          className="flex items-center gap-2 rounded-lg px-4 py-3 text-xs"
          style={{ backgroundColor: 'var(--status-danger-light)', color: 'var(--status-danger)' }}
        >
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {dispatchToggleError}
        </div>
      )}

      {/* Summary stat cards */}
      {status && (
        <div className="flex flex-wrap gap-4">
          <StatCard
            label="Pending"
            value={status.pending}
            color="var(--status-info)"
            bg="var(--status-info-light)"
          />
          <StatCard
            label="Active"
            value={status.active}
            color="var(--status-success)"
            bg="var(--status-success-light)"
          />
          <StatCard
            label="Completed today"
            value={status.completed_today}
            color="var(--text-secondary)"
            bg="var(--bg-secondary)"
          />
          <StatCard
            label="Failed today"
            value={status.failed_today}
            color="var(--status-danger)"
            bg="var(--status-danger-light)"
          />
        </div>
      )}

      {/* Effective Dispatch State (Issue #1999, fix #2238) */}
      {consumerHealth && (
        <EffectiveDispatchState
          globalEnabled={dispatchGlobalEnabled}
          consumerPaused={consumerHealth.metrics.paused}
          anyCategoryEnabled={dispatchAnyCategoryEnabled}
        />
      )}

      {/* Orphaned Claims Warning (Issue #2040) */}
      {status?.orphaned_claimed_count !== undefined && (
        <OrphanedClaimWarning count={status.orphaned_claimed_count} />
      )}

      {/* Dispatch-blocked warning (credential failures) */}
      {status && <DispatchBlockedBanner status={status} />}

      {/* Systemic failure warning (3+ same-category failures) */}
      {status?.systemic_failure && (
        <SystemicFailureBanner summary={status.systemic_failure} />
      )}

      {/* Consumer health + load metrics side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ConsumerHealthPanel
          health={consumerHealth}
          stats={queueStats}
          loading={healthLoading}
          error={healthError}
        />
        <LoadMetricsPanel
          stats={queueStats}
          health={consumerHealth}
          loading={statsLoading}
          error={statsError}
        />
      </div>

      <AutonomyPanel
        overview={autonomyOverview}
        loading={autonomyLoading}
        error={autonomyError}
        logging={autonomyLogLoading}
        onLogIntervention={handleLogAutonomyIntervention}
      />

      {/* Pending queue table */}
      <PendingQueueTable
        orgName={orgName}
        items={pendingItems}
        loading={pendingLoading}
        error={pendingError}
        onRefresh={fetchAll}
      />

      <FailedQueueTable
        items={failedItems}
        loading={failedLoading}
        error={failedError}
      />

      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Queue items are background tasks dispatched via the CLI or dashboard. Switch to the{' '}
        <strong>Background</strong> tab to view and manage individual sessions.
      </p>

      <QueueIntakePanel orgName={orgName} />
    </div>
  )
}
