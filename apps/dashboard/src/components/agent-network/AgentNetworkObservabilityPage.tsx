'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  GitBranch,
  Loader2,
  Network,
  RefreshCw,
  Search,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { FeatureGate } from '@/components/FeatureGate'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { api, type AgentNetworkEventsResponse, type AgentNetworkTaskEvent, type AgentNetworkTaskState } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'

const AUTO_REFRESH_MS = 30_000
const RECENT_EVENTS_LIMIT = 100
const ACTIVE_STATES = new Set<AgentNetworkTaskState>(['submitted', 'accepted', 'working', 'blocked'])

const STATE_OPTIONS: Array<'all' | AgentNetworkTaskState> = [
  'all',
  'submitted',
  'accepted',
  'working',
  'blocked',
  'completed',
  'failed',
  'canceled',
]

const STATE_STYLE: Record<AgentNetworkTaskState, { color: string; background: string; icon: LucideIcon }> = {
  submitted: {
    color: 'var(--text-secondary)',
    background: 'var(--surface-sunken)',
    icon: Clock,
  },
  accepted: {
    color: 'var(--status-info)',
    background: 'var(--status-info-light)',
    icon: GitBranch,
  },
  working: {
    color: 'var(--interactive-primary)',
    background: 'var(--surface-sunken)',
    icon: Activity,
  },
  blocked: {
    color: 'var(--status-warning)',
    background: 'var(--status-warning-light)',
    icon: AlertTriangle,
  },
  completed: {
    color: 'var(--status-success)',
    background: 'var(--status-success-light)',
    icon: CheckCircle2,
  },
  failed: {
    color: 'var(--status-danger)',
    background: 'var(--status-danger-light)',
    icon: AlertTriangle,
  },
  canceled: {
    color: 'var(--text-muted)',
    background: 'var(--bg-tertiary)',
    icon: Clock,
  },
}

function AgentNetworkObservabilityPage() {
  const { user, isLoading } = useAuth()
  const { isPageVisibleForUser, loading: flagsLoading } = useFeatureFlags()
  const selectedWorkspace = useSelectedWorkspace()
  const userOrgs = user?.organizations ?? []
  const workspace = selectedWorkspace ?? userOrgs[0] ?? ''

  const [recent, setRecent] = useState<AgentNetworkEventsResponse | null>(null)
  const [taskEvents, setTaskEvents] = useState<AgentNetworkEventsResponse | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [isLoadingEvents, setIsLoadingEvents] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingTask, setIsLoadingTask] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [stateFilter, setStateFilter] = useState<'all' | AgentNetworkTaskState>('all')
  const [agentFilter, setAgentFilter] = useState('all')
  const [taskTypeFilter, setTaskTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  const fetchRecentEvents = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!workspace) return

    if (mode === 'initial') {
      setIsLoadingEvents(true)
    } else {
      setIsRefreshing(true)
    }
    setError(null)

    try {
      const response = await api.getAgentNetworkEvents(workspace, RECENT_EVENTS_LIMIT)
      setRecent(response)
      setSelectedTaskId((current) => {
        if (current && response.events.some((event) => event.taskId === current)) {
          return current
        }
        return response.events[0]?.taskId ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch Agent Network events')
    } finally {
      setIsLoadingEvents(false)
      setIsRefreshing(false)
    }
  }, [workspace])

  useEffect(() => {
    if (!workspace || isDemoMode()) return

    void fetchRecentEvents('initial')
    const interval = setInterval(() => {
      void fetchRecentEvents('refresh')
    }, AUTO_REFRESH_MS)
    return () => clearInterval(interval)
  }, [fetchRecentEvents, workspace])

  useEffect(() => {
    if (!workspace || !selectedTaskId || isDemoMode()) {
      setTaskEvents(null)
      return
    }

    let cancelled = false
    setIsLoadingTask(true)
    setTaskError(null)

    api.getAgentNetworkTaskEvents(workspace, selectedTaskId)
      .then((response) => {
        if (!cancelled) {
          setTaskEvents(response)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTaskError(err instanceof Error ? err.message : 'Failed to fetch Agent Network task events')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingTask(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedTaskId, workspace])

  const events = recent?.events ?? []
  const summary = recent?.summary

  const agents = useMemo(() => uniqueSorted(events.map((event) => event.agentId)), [events])
  const taskTypes = useMemo(() => uniqueSorted(events.map((event) => event.taskType)), [events])

  const filteredEvents = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return events.filter((event) => {
      if (stateFilter !== 'all' && event.state !== stateFilter) return false
      if (agentFilter !== 'all' && event.agentId !== agentFilter) return false
      if (taskTypeFilter !== 'all' && event.taskType !== taskTypeFilter) return false
      if (!needle) return true

      return [
        event.taskId,
        event.parentTaskId,
        event.correlationId,
        event.requestId,
        event.traceparent,
        event.reason,
        event.agentId,
        event.taskType,
        event.runtime?.bridge,
        event.runtime?.kind,
        event.delegatedTaskId,
        event.delegatedAgentId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle))
    })
  }, [agentFilter, events, search, stateFilter, taskTypeFilter])

  const selectedEvent = useMemo(() => {
    if (!selectedTaskId) return null
    return events.find((event) => event.taskId === selectedTaskId) ?? null
  }, [events, selectedTaskId])

  const activeCount = countStates(summary?.states, ACTIVE_STATES)
  const completedCount = summary?.states.completed ?? 0
  const failureCount = summary?.failures ?? 0
  const agentCount = Object.keys(summary?.agents ?? {}).length

  if (isLoading || flagsLoading) {
    return <CenteredSpinner />
  }

  if (!user && !isDemoMode()) {
    return <CenteredSpinner />
  }

  if (!isPageVisibleForUser('background-agents', userOrgs, selectedWorkspace)) {
    return <FeatureGate pageId="background-agents" />
  }

  return (
    <div className="min-h-full overflow-auto" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="mx-auto flex max-w-[1500px] flex-col gap-5 p-5">
        <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-center lg:justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--surface-sunken)' }}>
              <Network className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold leading-tight">Agent Network</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{workspace || 'No workspace'}</span>
                <span>Event fabric observability</span>
                {summary?.latestAt && <span>Latest {formatRelativeTime(summary.latestAt)}</span>}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void fetchRecentEvents('refresh')}
            disabled={!workspace || isRefreshing || isLoadingEvents || isDemoMode()}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: 'var(--surface-default)', borderColor: 'var(--border-subtle)' }}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </header>

        {!workspace && (
          <EmptyState icon={Network} title="No workspace selected" message="Select a workspace to view Agent Network events." />
        )}

        {workspace && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <MetricCard icon={Activity} label="Events" value={summary?.count ?? 0} detail={`${events.length} loaded`} />
              <MetricCard icon={Clock} label="Active" value={activeCount} detail="Submitted, accepted, working, blocked" />
              <MetricCard icon={CheckCircle2} label="Completed" value={completedCount} detail="Terminal success events" tone="success" />
              <MetricCard icon={AlertTriangle} label="Failures" value={failureCount} detail="Failed states or error markers" tone={failureCount > 0 ? 'danger' : 'default'} />
              <MetricCard icon={ShieldCheck} label="Agents" value={agentCount} detail="Observed participants" />
            </section>

            {error && (
              <InlineAlert message={error} />
            )}

            <section className="grid min-h-[620px] gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(420px,0.7fr)]">
              <div className="min-w-0 rounded-lg border" style={{ backgroundColor: 'var(--surface-default)', borderColor: 'var(--border-subtle)' }}>
                <div className="border-b p-3" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_160px_180px_180px]">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search task, correlation, trace, reason"
                        className="h-9 w-full rounded-md border py-2 pl-9 pr-3 text-sm outline-none"
                        style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-subtle)' }}
                      />
                    </div>
                    <FilterSelect label="State" value={stateFilter} onChange={(value) => setStateFilter(value as typeof stateFilter)} options={STATE_OPTIONS} />
                    <FilterSelect label="Agent" value={agentFilter} onChange={setAgentFilter} options={['all', ...agents]} />
                    <FilterSelect label="Task Type" value={taskTypeFilter} onChange={setTaskTypeFilter} options={['all', ...taskTypes]} />
                  </div>
                </div>

                <div className="overflow-auto">
                  <table className="min-w-full table-fixed text-sm">
                    <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--surface-default)' }}>
                      <tr className="border-b text-left text-xs uppercase" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
                        <th className="w-[120px] px-3 py-2 font-medium">State</th>
                        <th className="w-[230px] px-3 py-2 font-medium">Task</th>
                        <th className="w-[190px] px-3 py-2 font-medium">Agent</th>
                        <th className="w-[230px] px-3 py-2 font-medium">Reason</th>
                        <th className="w-[170px] px-3 py-2 font-medium">Runtime</th>
                        <th className="w-[150px] px-3 py-2 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoadingEvents && events.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-16 text-center">
                            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                          </td>
                        </tr>
                      )}

                      {!isLoadingEvents && filteredEvents.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-16">
                            <EmptyState icon={Search} title="No events" message="No Agent Network events match the current filters." compact />
                          </td>
                        </tr>
                      )}

                      {filteredEvents.map((event) => {
                        const isSelected = event.taskId === selectedTaskId
                        return (
                          <tr
                            key={event.id}
                            onClick={() => setSelectedTaskId(event.taskId)}
                            className="cursor-pointer border-b transition-colors hover:bg-[var(--surface-sunken)]"
                            style={{
                              borderColor: 'var(--border-subtle)',
                              backgroundColor: isSelected ? 'var(--surface-sunken)' : undefined,
                            }}
                          >
                            <td className="px-3 py-3 align-top">
                              <StateBadge state={event.state} />
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="truncate font-mono text-xs" title={event.taskId}>{event.taskId}</div>
                              <div className="mt-1 truncate font-mono text-[11px]" style={{ color: 'var(--text-muted)' }} title={event.correlationId}>
                                {event.correlationId}
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="truncate font-medium">{event.agentId}</div>
                              <div className="mt-1 truncate text-xs" style={{ color: 'var(--text-muted)' }} title={event.taskType}>{event.taskType}</div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="line-clamp-2 text-sm" title={event.reason}>{event.reason}</div>
                              {event.error?.code && (
                                <div className="mt-1 truncate text-xs" style={{ color: 'var(--status-danger)' }}>{event.error.code}</div>
                              )}
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="truncate text-xs">{event.runtime?.bridge ?? event.runtime?.kind ?? 'direct'}</div>
                              <div className="mt-1 truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{event.runtime?.status ?? 'unknown'}</div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <div className="text-xs">{formatRelativeTime(event.at)}</div>
                              <div className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>{formatDateTime(event.at)}</div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <aside className="min-w-0 rounded-lg border" style={{ backgroundColor: 'var(--surface-default)', borderColor: 'var(--border-subtle)' }}>
                <div className="border-b p-4" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold">Task Timeline</h2>
                      <p className="mt-1 truncate font-mono text-xs" style={{ color: 'var(--text-muted)' }} title={selectedTaskId ?? undefined}>
                        {selectedTaskId ?? 'No task selected'}
                      </p>
                    </div>
                    {isLoadingTask && <Loader2 className="h-4 w-4 animate-spin" />}
                  </div>
                </div>

                <div className="space-y-4 p-4">
                  {taskError && <InlineAlert message={taskError} />}

                  {!selectedTaskId && (
                    <EmptyState icon={GitBranch} title="Select a task" message="Choose an event to inspect its state transitions." compact />
                  )}

                  {selectedTaskId && (
                    <>
                      <TaskMetadata event={selectedEvent} />
                      <Timeline events={taskEvents?.events ?? []} fallbackEvent={selectedEvent} />
                    </>
                  )}
                </div>
              </aside>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'default',
}: {
  icon: LucideIcon
  label: string
  value: number
  detail: string
  tone?: 'default' | 'success' | 'danger'
}) {
  const color = tone === 'success'
    ? 'var(--status-success)'
    : tone === 'danger'
      ? 'var(--status-danger)'
      : 'var(--text-secondary)'

  return (
    <div className="rounded-lg border p-4" style={{ backgroundColor: 'var(--surface-default)', borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        <Icon className="h-4 w-4" style={{ color }} />
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>{value}</div>
      <div className="mt-2 truncate text-xs" style={{ color: 'var(--text-muted)' }}>{detail}</div>
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange(value: string): void
  options: string[]
}) {
  return (
    <label className="flex h-9 items-center gap-2 rounded-md border px-2" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-subtle)' }}>
      <span className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option === 'all' ? 'All' : option}</option>
        ))}
      </select>
    </label>
  )
}

function StateBadge({ state }: { state: AgentNetworkTaskState }) {
  const style = STATE_STYLE[state] ?? STATE_STYLE.submitted
  const Icon = style.icon

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium"
      style={{ backgroundColor: style.background, color: style.color }}
    >
      <Icon className="h-3 w-3" />
      {state}
    </span>
  )
}

function TaskMetadata({ event }: { event: AgentNetworkTaskEvent | null }) {
  if (!event) {
    return (
      <div className="rounded-md border p-3 text-sm" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
        Loading task metadata
      </div>
    )
  }

  return (
    <div className="grid gap-2 text-sm">
      <MetadataRow label="Agent" value={event.agentId} />
      <MetadataRow label="Task type" value={event.taskType} />
      <MetadataRow label="Correlation" value={event.correlationId} mono />
      {event.requestId && <MetadataRow label="Request" value={event.requestId} mono />}
      {event.traceparent && <MetadataRow label="Trace" value={event.traceparent} mono />}
      <MetadataRow label="Runtime" value={[event.runtime?.kind, event.runtime?.bridge, event.runtime?.status].filter(Boolean).join(' / ') || 'unknown'} />
      <MetadataRow label="Authorization" value={(event.authorization?.methods ?? []).join(', ') || 'unknown'} />
      <MetadataRow label="Scopes" value={(event.authorization?.scopes ?? []).join(', ') || 'none'} />
      {event.delegatedTaskId && <MetadataRow label="Delegated task" value={event.delegatedTaskId} mono />}
      {event.delegatedAgentId && <MetadataRow label="Delegated agent" value={event.delegatedAgentId} />}
    </div>
  )
}

function MetadataRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[116px_minmax(0,1fr)] gap-3 rounded-md border px-3 py-2" style={{ borderColor: 'var(--border-subtle)' }}>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className={`truncate text-xs ${mono ? 'font-mono' : ''}`} title={value}>{value}</span>
    </div>
  )
}

function Timeline({ events, fallbackEvent }: { events: AgentNetworkTaskEvent[]; fallbackEvent: AgentNetworkTaskEvent | null }) {
  const timelineEvents = events.length > 0 ? events : fallbackEvent ? [fallbackEvent] : []

  if (timelineEvents.length === 0) {
    return <EmptyState icon={Clock} title="No timeline events" message="Timeline events are not available for this task yet." compact />
  }

  return (
    <div className="space-y-3">
      {timelineEvents.map((event, index) => {
        const style = STATE_STYLE[event.state] ?? STATE_STYLE.submitted
        const Icon = style.icon
        return (
          <div key={event.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <div className="flex flex-col items-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: style.background, color: style.color }}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              {index < timelineEvents.length - 1 && <div className="mt-2 h-full min-h-8 w-px" style={{ backgroundColor: 'var(--border-subtle)' }} />}
            </div>
            <div className="min-w-0 rounded-md border p-3" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex items-center justify-between gap-3">
                <StateBadge state={event.state} />
                <span className="shrink-0 text-xs" style={{ color: 'var(--text-muted)' }}>{formatDateTime(event.at)}</span>
              </div>
              <p className="mt-2 text-sm">{event.reason}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span>seq {event.sequence}</span>
                <span>{event.agentId}</span>
                {event.artifacts && event.artifacts.count > 0 && <span>{event.artifacts.count} artifact{event.artifacts.count === 1 ? '' : 's'}</span>}
                {event.error?.code && <span style={{ color: 'var(--status-danger)' }}>{event.error.code}</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function InlineAlert({ message }: { message: string }) {
  return (
    <div className="rounded-md border p-3" style={{ backgroundColor: 'var(--status-danger-light)', borderColor: 'var(--status-danger)', color: 'var(--status-danger)' }}>
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="h-4 w-4" />
        <span>{message}</span>
      </div>
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  message,
  compact = false,
}: {
  icon: LucideIcon
  title: string
  message: string
  compact?: boolean
}) {
  return (
    <div className={`text-center ${compact ? 'py-6' : 'rounded-lg border py-14'}`} style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
      <Icon className="mx-auto mb-3 h-8 w-8 opacity-60" />
      <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{title}</div>
      <div className="mt-1 text-sm">{message}</div>
    </div>
  )
}

function CenteredSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
    </div>
  )
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b))
}

function countStates(states: Record<string, number> | undefined, selected: Set<AgentNetworkTaskState>): number {
  if (!states) return 0
  return Object.entries(states).reduce((total, [state, count]) => {
    return selected.has(state as AgentNetworkTaskState) ? total + count : total
  }, 0)
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const diffSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (diffSeconds < 60) return `${diffSeconds}s ago`

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

export default AgentNetworkObservabilityPage
