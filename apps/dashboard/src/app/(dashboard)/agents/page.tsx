'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock3,
  Cpu,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  TerminalSquare,
} from 'lucide-react'
import { api, type AgentDetection } from '@/lib/api'
import { FeatureGate } from '@/components/FeatureGate'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { DEMO_AGENTS, DEMO_ORG, DEMO_SESSIONS } from '@/lib/demo-data'
import { isDemoMode } from '@/lib/demo-guard'

type AgentCardStatus = AgentDetection['status'] | 'active' | 'idle'

interface AgentCard {
  id: string
  platform: string
  label: string
  provider: string
  status: AgentCardStatus
  configs: number
  runs: number
  activeSessions: number
  lastDetected: string | null
  version?: string
  model?: string
  source: 'demo' | 'live'
}

const PLATFORM_META: Record<
  string,
  {
    label: string
    short: string
    provider: string
    icon: typeof Bot
  }
> = {
  claude: { label: 'Claude Code', short: 'CC', provider: 'Anthropic', icon: Sparkles },
  codex: { label: 'Codex', short: 'OX', provider: 'OpenAI', icon: Cpu },
  gemini: { label: 'Gemini CLI', short: 'GM', provider: 'Google', icon: Sparkles },
  copilot: { label: 'GitHub Copilot', short: 'GH', provider: 'GitHub', icon: Bot },
  cursor: { label: 'Cursor', short: 'CU', provider: 'Cursor', icon: Bot },
  windsurf: { label: 'Windsurf', short: 'WS', provider: 'Codeium', icon: Bot },
}

const STATUS_META: Record<
  AgentCardStatus,
  {
    label: string
    color: string
    backgroundColor: string
  }
> = {
  active: {
    label: 'Active',
    color: 'var(--status-success)',
    backgroundColor: 'var(--status-success-light)',
  },
  idle: {
    label: 'Idle',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-tertiary)',
  },
  installed: {
    label: 'Installed',
    color: 'var(--status-success)',
    backgroundColor: 'var(--status-success-light)',
  },
  detected: {
    label: 'Detected',
    color: 'var(--status-info)',
    backgroundColor: 'var(--status-info-light)',
  },
  available: {
    label: 'Available',
    color: 'var(--status-warning)',
    backgroundColor: 'var(--status-warning-light)',
  },
}

const STATUS_SORT_ORDER: Record<AgentCardStatus, number> = {
  active: 0,
  installed: 1,
  detected: 2,
  idle: 3,
  available: 4,
}

function normalizePlatform(value: string | undefined): string {
  return value?.trim().toLowerCase() || 'agent'
}

function getPlatformMeta(platform: string) {
  return (
    PLATFORM_META[platform] ?? {
      label: platform.replace(/[-_]/g, ' ').replace(/\b\w/g, char => char.toUpperCase()),
      short: platform.slice(0, 2).toUpperCase(),
      provider: 'Unknown',
      icon: Bot,
    }
  )
}

function formatRelativeTime(timestamp: string | null): string {
  if (!timestamp) return 'No scan recorded'

  const time = new Date(timestamp).getTime()
  if (Number.isNaN(time)) return 'No scan recorded'

  const deltaMs = Date.now() - time
  if (deltaMs < 60_000) return 'Just now'

  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function sortAgents(items: AgentCard[]): AgentCard[] {
  return [...items].sort((left, right) => {
    const statusDelta = STATUS_SORT_ORDER[left.status] - STATUS_SORT_ORDER[right.status]
    if (statusDelta !== 0) return statusDelta

    const configDelta = right.configs - left.configs
    if (configDelta !== 0) return configDelta

    return left.label.localeCompare(right.label)
  })
}

function getDemoAgents(): AgentCard[] {
  const activeSessionsByPlatform = DEMO_SESSIONS.reduce<Record<string, number>>((acc, session) => {
    if (
      session.agent &&
      (session.status === 'ACTIVE' || session.status === 'INITIALIZING' || session.status === 'PENDING')
    ) {
      acc[session.agent] = (acc[session.agent] ?? 0) + 1
    }
    return acc
  }, {})

  const configCountsByPlatform: Record<string, number> = {
    claude: 8,
    gemini: 4,
    codex: 3,
    copilot: 5,
  }

  const nameToPlatform: Record<string, string> = {
    'Claude Code': 'claude',
    'Gemini CLI': 'gemini',
    Codex: 'codex',
    'GitHub Copilot': 'copilot',
  }

  return sortAgents(
    DEMO_AGENTS.map((agent) => {
      const platform = nameToPlatform[agent.name] ?? normalizePlatform(agent.name)
      const meta = getPlatformMeta(platform)

      return {
        id: agent.id,
        platform,
        label: meta.label,
        provider: meta.provider,
        status: agent.status,
        configs: configCountsByPlatform[platform] ?? 1,
        runs: agent.runs,
        activeSessions: activeSessionsByPlatform[platform] ?? 0,
        lastDetected: '2026-03-10T09:00:00Z',
        model: agent.model,
        source: 'demo',
      }
    }),
  )
}

function mapLiveAgent(agent: AgentDetection): AgentCard {
  const platform = normalizePlatform(agent.platform)
  const meta = getPlatformMeta(platform)
  const lastDetected =
    agent.lastDetected instanceof Date
      ? agent.lastDetected.toISOString()
      : agent.lastDetected
        ? new Date(agent.lastDetected).toISOString()
        : null

  return {
    id: agent.id,
    platform,
    label: meta.label,
    provider: meta.provider,
    status: agent.status,
    configs: agent.configs ?? 0,
    runs: 0,
    activeSessions: 0,
    lastDetected,
    version: agent.version,
    source: 'live',
  }
}

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string
  hint: string
  icon: typeof Bot
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--text-secondary)' }}>
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
      <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
        {hint}
      </p>
    </div>
  )
}

export default function AgentsPage() {
  const { user, isLoading: authLoading } = useAuth()
  const { isPageVisibleForUser, loading: flagsLoading } = useFeatureFlags()
  const selectedWorkspace = useSelectedWorkspace()
  const workspaceName = isDemoMode() ? selectedWorkspace ?? DEMO_ORG : selectedWorkspace
  const userOrgs = user?.organizations ?? []

  const [agents, setAgents] = useState<AgentCard[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadAgents = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      if (isDemoMode()) {
        setAgents(getDemoAgents())
        return
      }

      if (!workspaceName) {
        setAgents([])
        return
      }

      const detections = forceRefresh
        ? await api.detectAgents(workspaceName)
        : await api.getAgentDetections(workspaceName)

      setAgents(sortAgents(detections.map(mapLiveAgent)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents')
      setAgents([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [workspaceName])

  useEffect(() => {
    void loadAgents()
  }, [loadAgents])

  const summary = useMemo(() => {
    const configured = agents.filter((agent) => agent.configs > 0 || agent.status === 'active' || agent.status === 'installed').length
    const totalConfigs = agents.reduce((sum, agent) => sum + agent.configs, 0)
    const activeSessions = agents.reduce((sum, agent) => sum + agent.activeSessions, 0)
    const totalRuns = agents.reduce((sum, agent) => sum + agent.runs, 0)

    return {
      configured,
      totalConfigs,
      activeSessions,
      totalRuns,
    }
  }, [agents])

  // #6513: Wait for auth and feature flags to resolve
  if (authLoading || flagsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full" />
      </div>
    )
  }

  // #6513: Require authentication (TermsGate handles redirect, this is defense-in-depth)
  if (!user && !isDemoMode()) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!isPageVisibleForUser('background-agents', userOrgs, workspaceName)) {
    return <FeatureGate pageId="background-agents" />
  }

  if (loading) {
    return (
      <div className="h-full overflow-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 rounded w-48 bg-[var(--bg-tertiary)]" />
            <div className="grid gap-4 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-32 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]" />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-52 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{isDemoMode() ? 'Live demo catalog' : 'Workspace agent catalog'}</span>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Agents
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                Review which coding agents GAL has detected for{' '}
                <span style={{ color: 'var(--text-primary)' }}>{workspaceName ?? 'this workspace'}</span>,
                see their readiness, and jump directly into the live session stream.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/agents/new"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={{
                backgroundColor: 'var(--interactive-secondary)',
                color: 'var(--text-on-accent)',
              }}
            >
              <Plus className="w-4 h-4" />
              Create Agent
            </Link>
            <Link
              href="/sessions"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--surface-overlay-hover)]"
              style={{
                color: 'var(--text-primary)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <TerminalSquare className="w-4 h-4" />
              Open sessions
            </Link>
            <Link
              href="/settings?tab=agents"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--surface-overlay-hover)]"
              style={{
                color: 'var(--text-primary)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <Settings2 className="w-4 h-4" />
              Manage credentials
            </Link>
            {!isDemoMode() && (
              <button
                onClick={() => void loadAgents(true)}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
                style={{
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {refreshing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Re-scan workspace
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Catalog Size"
            value={String(agents.length)}
            hint="Distinct agent platforms visible in this workspace."
            icon={Bot}
          />
          <SummaryCard
            label="Configured"
            value={String(summary.configured)}
            hint="Agents with approved config coverage or an installed runtime."
            icon={CheckCircle2}
          />
          <SummaryCard
            label="Config Files"
            value={String(summary.totalConfigs)}
            hint="Detected configuration artifacts tied to these agents."
            icon={Cpu}
          />
          <SummaryCard
            label={isDemoMode() ? 'Active Sessions' : 'Recent Activity'}
            value={String(isDemoMode() ? summary.activeSessions : summary.totalRuns)}
            hint={
              isDemoMode()
                ? 'Read-only demo sessions currently marked active.'
                : 'Live detections do not include run counts yet, so this stays zero until the backend expands the payload.'
            }
            icon={Clock3}
          />
        </div>

        {error && (
          <div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: 'var(--status-danger-light)',
              border: '1px solid var(--status-danger)',
              color: 'var(--status-danger-text)',
            }}
          >
            <p className="text-sm font-medium">Unable to load the agent catalog</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {!workspaceName && !isDemoMode() && (
          <div
            className="rounded-2xl p-6"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Select a workspace
            </h2>
            <p className="mt-2 text-sm max-w-xl" style={{ color: 'var(--text-secondary)' }}>
              Choose an organization from the sidebar to load its detected agents and related background-session activity.
            </p>
          </div>
        )}

        {workspaceName && agents.length === 0 && !error && (
          <div
            className="rounded-2xl p-6"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              No agents detected yet
            </h2>
            <p className="mt-2 text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              GAL has not recorded any agent detections for this workspace yet. Run a detection scan after installing or syncing your preferred agents.
            </p>
            {!isDemoMode() && (
              <button
                onClick={() => void loadAgents(true)}
                disabled={refreshing}
                className="mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
                style={{
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {refreshing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Detect agents now
              </button>
            )}
          </div>
        )}

        {agents.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {agents.map((agent) => {
              const meta = getPlatformMeta(agent.platform)
              const status = STATUS_META[agent.status]
              const Icon = meta.icon

              return (
                <article
                  key={agent.id}
                  className="rounded-2xl p-5 transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {agent.label}
                          </h2>
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: status.backgroundColor,
                              color: status.color,
                            }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: status.color }} />
                            {status.label}
                          </span>
                        </div>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                          {agent.provider}
                          {agent.version ? ` • v${agent.version}` : agent.model ? ` • ${agent.model}` : ''}
                        </p>
                      </div>
                    </div>

                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {meta.short}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-5">
                    <div
                      className="rounded-xl p-3"
                      style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                    >
                      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                        Config files
                      </p>
                      <p className="text-2xl font-semibold mt-2" style={{ color: 'var(--text-primary)' }}>
                        {agent.configs}
                      </p>
                    </div>

                    <div
                      className="rounded-xl p-3"
                      style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                    >
                      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                        {isDemoMode() ? 'Runs' : 'Status'}
                      </p>
                      <p className="text-2xl font-semibold mt-2" style={{ color: 'var(--text-primary)' }}>
                        {isDemoMode() ? agent.runs : status.label}
                      </p>
                    </div>

                    <div
                      className="rounded-xl p-3"
                      style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                    >
                      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                        Active now
                      </p>
                      <p className="text-2xl font-semibold mt-2" style={{ color: 'var(--text-primary)' }}>
                        {agent.activeSessions}
                      </p>
                    </div>

                    <div
                      className="rounded-xl p-3"
                      style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                    >
                      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                        Last detected
                      </p>
                      <p className="text-sm font-medium mt-3" style={{ color: 'var(--text-primary)' }}>
                        {formatRelativeTime(agent.lastDetected)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3">
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {agent.source === 'demo'
                        ? 'Pre-seeded read-only catalog entry'
                        : 'Live detection entry from Firestore'}
                    </div>
                    <Link
                      href="/sessions"
                      className="inline-flex items-center gap-1.5 text-sm font-medium"
                      style={{ color: 'var(--interactive-primary)' }}
                    >
                      Open sessions
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
