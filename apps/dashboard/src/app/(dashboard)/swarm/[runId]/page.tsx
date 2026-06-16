'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useParams } from 'next/navigation'
import { createGalSwarmRunApiEndpoints } from '@gal-run/swarm'
import { FeatureGate } from '@/components/FeatureGate'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { api, type GalSwarmRunStatus } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'

export default function SwarmRunDetailPage() {
  const params = useParams<{ runId: string }>()
  const runId = params?.runId ?? ''

  const selectedWorkspace = useSelectedWorkspace()
  const { user, isLoading } = useAuth()
  const { isPageVisibleForUser, loading: flagsLoading } = useFeatureFlags()

  const [data, setData] = useState<GalSwarmRunStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fetching, setFetching] = useState(true)

  const userOrgs = user?.organizations ?? []
  const workspace = selectedWorkspace ?? userOrgs[0] ?? ''

  const fetchRun = useCallback(async () => {
    if (!workspace || !runId) return
    try {
      const result = await api.getSwarmRun(workspace, runId)
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch swarm run')
    } finally {
      setFetching(false)
    }
  }, [workspace, runId])

  useEffect(() => {
    fetchRun()
  }, [fetchRun])

  useEffect(() => {
    if (!data?.plan || data.plan.status !== 'running') return
    const interval = setInterval(fetchRun, 15_000)
    return () => clearInterval(interval)
  }, [data, fetchRun])

  if (isLoading || flagsLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </div>
    )
  }

  if (!user && !isDemoMode()) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </div>
    )
  }

  if (!isPageVisibleForUser('swarm', userOrgs, selectedWorkspace)) {
    return <FeatureGate pageId="swarm" />
  }

  const plan = data?.plan
  const isRunning = plan?.status === 'running'
  const endpoints = plan ? createGalSwarmRunApiEndpoints(plan) : null

  if (fetching) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <XCircle className="h-12 w-12 text-red-500" />
        <h2 className="text-xl font-semibold">Swarm Unavailable</h2>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          {error ?? 'This swarm run could not be loaded. It may not exist or you may not have access.'}
        </p>
        <div className="flex gap-2">
          <button onClick={fetchRun} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            <RefreshCw className="-ml-0.5 mr-1.5 inline h-4 w-4" />
            Try Again
          </button>
          <button onClick={() => window.location.reload()} className="rounded-md border px-4 py-2 text-sm font-medium">
            Reload Page
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full overflow-auto" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <div className="flex flex-col gap-3 border-b pb-5" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--surface-sunken)' }}>
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Swarm Run</h1>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {runId}
              </p>
            </div>
          </div>
        </div>

        {fetching && !data && !error && (
          <div className="flex min-h-[40vh] items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin" style={{ color: 'var(--text-secondary)' }} />
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--status-danger)' }}>
              <AlertTriangle className="h-5 w-5" />
              {error}
            </div>
            <button
              onClick={fetchRun}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
              style={{ backgroundColor: 'var(--interactive-primary)', color: 'var(--text-on-accent)' }}
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        )}

        {data && plan && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-4">
              <Panel title="Run Plan" icon={Play}>
                <Metric label="Objective" value={plan.objective} />
                <Metric label="Run ID" value={plan.runId} />
                <Metric label="Status" value={plan.status} />
                <Metric label="Mode" value={plan.mode ?? '—'} />
                <Metric label="Source" value={plan.source ?? '—'} />
                <Metric label="Provider" value={formatProvider(plan)} />
                <Metric label="Predicted duration" value={`${plan.predictedDurationSeconds}s`} />
                {plan.mode && (
                  <div className="mt-2">
                    <StatusBadge status={plan.status} />
                  </div>
                )}
              </Panel>

              {plan.stratusOperations && plan.stratusOperations.length > 0 && (
                <Panel title="Stratus Operations" icon={Server}>
                  <div className="rounded-md border p-3" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-sunken)' }}>
                    {plan.stratusOperations.map((op, i) => (
                      <div key={`${op.type}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0" style={{ borderColor: 'var(--border-subtle)', borderBottomWidth: i < plan.stratusOperations.length - 1 ? 1 : 0 }}>
                        <span className="font-medium">{op.type}</span>
                        {op.workflow ? (
                          <a
                            href={buildWorkflowHref(op.workflow)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 truncate"
                            style={{ color: 'var(--interactive-primary)' }}
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span className="truncate">{extractWorkflowName(op.workflow)}</span>
                          </a>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>{op.taskType ?? '—'}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              <Panel title="Preflight Checks" icon={ShieldCheck}>
                {plan.preflightChecks && plan.preflightChecks.length > 0 ? (
                  <div className="space-y-2">
                    {plan.preflightChecks.map((check, i) => (
                      <div key={`check-${i}`} className="flex items-center gap-3 rounded-md border p-3 text-sm" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-sunken)' }}>
                        <Clock className="h-4 w-4 shrink-0" style={{ color: 'var(--status-warning)' }} />
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">{check.category}</span>
                          <p className="truncate" style={{ color: 'var(--text-secondary)' }}>{check.description}</p>
                        </div>
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            backgroundColor: 'var(--status-warning)',
                            color: '#fff',
                          }}
                        >
                          {check.status.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No preflight checks reported.</p>
                )}
              </Panel>

              <Panel title="Timestamps" icon={Clock}>
                <Metric label="Created" value={formatTimestamp(data.createdAt)} />
                <Metric label="Updated" value={formatTimestamp(data.updatedAt)} />
              </Panel>
            </section>

            <aside className="space-y-4">
              <Panel title="Status" icon={Activity}>
                <div className="flex items-center gap-3">
                  <StatusBadge status={plan.status} />
                  {isRunning && (
                    <span className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Auto-refreshing
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={fetchRun}
                    className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium"
                    style={{ backgroundColor: 'var(--surface-sunken)', color: 'var(--text-primary)', borderColor: 'var(--border-subtle)', borderWidth: 1 }}
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </button>
                </div>
              </Panel>

              <Panel title="Capacity Shape" icon={Server}>
                <Metric label="Workspace" value={workspace || 'none'} />
                <Metric label="Run ID" value={plan.runId} />
                <Metric label="Predicted" value={`${plan.predictedDurationSeconds}s`} />
              </Panel>

              {endpoints?.stratus?.preflightWorkflow && (
                <Panel title="Actions" icon={ExternalLink}>
                  <a
                    href={buildWorkflowHref(endpoints.stratus.preflightWorkflow) ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
                    style={{ backgroundColor: 'var(--interactive-primary)', color: 'var(--text-on-accent)' }}
                  >
                    <ExternalLink className="h-4 w-4" />
                    View Workflow on GitHub
                  </a>
                </Panel>
              )}

              <Panel title="Endpoints" icon={Activity}>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="block truncate font-mono">Dashboard: {endpoints?.dashboard}</span>
                  <span className="block truncate font-mono">CLI: {endpoints?.galCode}</span>
                </div>
              </Panel>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-default)' }}>
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4" />
        <h2 className="text-sm font-semibold uppercase tracking-normal" style={{ color: 'var(--text-secondary)' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t py-2 text-sm first:border-t-0" style={{ borderColor: 'var(--border-subtle)' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{value}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const isRunning = status === 'running'
  const isCompleted = status === 'completed' || status === 'succeeded'
  const isFailed = status === 'failed' || status === 'error'
  const isPending = status === 'pending' || status === 'queued' || status === 'created'

  const bgColor = isRunning
    ? 'var(--status-warning)'
    : isCompleted
      ? 'var(--status-success)'
      : isFailed
        ? 'var(--status-danger)'
        : isPending
          ? 'var(--interactive-secondary)'
          : 'var(--surface-sunken)'

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
      style={{ backgroundColor: bgColor, color: '#fff' }}
    >
      {isRunning && <RefreshCw className="h-3 w-3 animate-spin" />}
      {isCompleted && <CheckCircle2 className="h-3 w-3" />}
      {isFailed && <XCircle className="h-3 w-3" />}
      {status}
    </span>
  )
}

function extractWorkflowName(url: string): string {
  try {
    const parts = url.replace(/\/$/, '').split('/')
    const workflowIndex = parts.indexOf('actions')
    if (workflowIndex >= 0 && parts.length > workflowIndex + 1) {
      return parts[workflowIndex + 1]
    }
    return url
  } catch {
    return url
  }
}

function formatProvider(plan: GalSwarmRunStatus['plan']): string {
  const provider = plan.target.provider
  const sandboxProvider = plan.target.sandboxProvider
  if (provider && sandboxProvider && sandboxProvider !== provider) return `${provider} / ${sandboxProvider}`
  return provider ?? sandboxProvider ?? '—'
}

function buildWorkflowHref(workflow?: string): string | null {
  if (!workflow) return null
  if (/^https?:\/\//.test(workflow)) return workflow
  const workflowPath = workflow.split('/').map(encodeURIComponent).join('/')
  return `https://github.com/StratusCloudLabs/stratus/actions/workflows/${workflowPath}`
}

function formatTimestamp(ts?: string): string {
  if (!ts) return '—'
  try {
    const date = new Date(ts)
    return date.toLocaleString()
  } catch {
    return ts
  }
}
