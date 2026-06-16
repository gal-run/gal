'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Terminal,
  RefreshCw,
  AlertCircle,
  Loader2,
  ExternalLink,
  Network,
  Play,
  Clock,
  Pause,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import type { Session, ListSessionsResponse } from '@gal/types'
import { api } from '@/lib/api'
import { useSelectedWorkspace, useIsPersonalWorkspace } from '@/hooks/useSelectedWorkspace'
import { getUserFriendlyError } from '@/lib/errors'

function SwarmSessionCard({
  session,
  onClick,
}: {
  session: Session
  onClick: (sessionId: string) => void
}) {
  const runId = session.metadata?.runId as string | undefined
  const isActive = session.status === 'ACTIVE' || session.status === 'INITIALIZING'

  const handleRunLink = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (runId) {
      window.open(`/dashboard/swarm/${runId}`, '_blank')
    }
  }

  const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    PENDING: { icon: Clock, color: 'var(--status-warning)', label: 'Pending' },
    INITIALIZING: { icon: Loader2, color: 'var(--status-info)', label: 'Initializing' },
    ACTIVE: { icon: Play, color: 'var(--status-success)', label: 'Active' },
    DISCONNECTED: { icon: Pause, color: 'var(--status-warning)', label: 'Disconnected' },
    TERMINATED: { icon: CheckCircle, color: 'var(--text-secondary)', label: 'Terminated' },
    FAILED: { icon: XCircle, color: 'var(--status-danger)', label: 'Failed' },
  }

  const config = statusConfig[session.status] ?? { icon: Clock, color: 'var(--text-muted)', label: session.status }
  const StatusIcon = config.icon

  return (
    <div
      className="p-4 rounded-lg transition-colors cursor-pointer hover:bg-[var(--bg-tertiary)]"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
      }}
      onClick={() => onClick(session.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: 'var(--accent-bg)',
            }}
          >
            <Network className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div className="min-w-0 overflow-hidden flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3
                className="text-sm font-medium truncate min-w-0 flex-1"
                style={{ color: 'var(--text-primary)' }}
              >
                {session.name || `Swarm Session ${session.id.slice(0, 8)}`}
              </h3>
              <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full shrink-0" style={{ backgroundColor: 'var(--bg-tertiary)', color: config.color }}>
                <StatusIcon className={`w-3 h-3 ${session.status === 'INITIALIZING' ? 'animate-spin' : ''}`} />
                {config.label}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
              <span>ID: {session.id.slice(0, 8)}...</span>
              {runId && (
                <span className="truncate max-w-[200px]">
                  Run: {runId}
                </span>
              )}
              {session.projectContext && (
                <span className="truncate max-w-[120px]">
                  {session.projectContext}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {runId && (
            <button
              onClick={handleRunLink}
              className="p-1.5 rounded-lg transition-colors hover:bg-[var(--accent-bg)]"
              style={{ color: 'var(--accent)' }}
              title="View swarm run details"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {isActive && session.metadata?.workerCount != null && (
        <div
          className="mt-3 pt-3 flex items-center gap-4 text-xs"
          style={{
            borderTop: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          <span>Workers: {String(session.metadata.workerCount)}</span>
          {session.metadata?.provider != null && (
            <span>Provider: {String(session.metadata.provider)}</span>
          )}
        </div>
      )}
    </div>
  )
}

export function SwarmSessionsPage() {
  const router = useRouter()
  const selectedOrgName = useSelectedWorkspace()
  const isPersonalWorkspace = useIsPersonalWorkspace()

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSwarmSessions = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      params.set('tag', 'swarm')
      params.set('limit', '20')
      if (selectedOrgName && !isPersonalWorkspace) {
        params.set('org', selectedOrgName)
      }

      const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions?${params}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to fetch swarm sessions')
      }

      const data: ListSessionsResponse = await response.json()
      setSessions(data.sessions)
    } catch (err) {
      console.error('Failed to fetch swarm sessions:', err)
      setError(getUserFriendlyError(err, 'Failed to load swarm sessions.'))
    } finally {
      setLoading(false)
    }
  }, [selectedOrgName, isPersonalWorkspace])

  useEffect(() => {
    fetchSwarmSessions()
  }, [fetchSwarmSessions])

  const handleClick = (sessionId: string) => {
    router.push(`/sessions/${sessionId}`)
  }

  return (
    <div className="flex-1 max-w-3xl mx-auto p-6 overflow-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Swarm Sessions
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            GPU swarm run sessions created via gal swarm
          </p>
        </div>
        <button
          onClick={fetchSwarmSessions}
          disabled={loading}
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-muted)' }}
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error ? (
        <div
          className="p-6 rounded-lg text-center"
          style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
        >
          <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--status-danger)' }} />
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
            {error}
          </p>
          <button
            onClick={fetchSwarmSessions}
            className="px-4 py-2 text-sm rounded-lg"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)' }}
          >
            Try Again
          </button>
        </div>
      ) : loading && sessions.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      ) : sessions.length === 0 ? (
        <div className="py-12 text-center">
          <Terminal className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No swarm sessions in this workspace
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <SwarmSessionCard
              key={session.id}
              session={session}
              onClick={handleClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default SwarmSessionsPage
