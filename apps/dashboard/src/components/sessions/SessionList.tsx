'use client'

/**
 * SessionList Component (GAL-571)
 *
 * Displays a list of background agent sessions with status indicators
 * and action buttons for connecting to terminals or terminating sessions.
 */

import { formatDistanceToNow } from 'date-fns'
import { useState } from 'react'
import {
  Terminal,
  Play,
  Pause,
  Clock,
  Loader2,
  Trash2,
  AlertCircle,
  CheckCircle,
  XCircle,
  ExternalLink,
  Download,
} from 'lucide-react'
import { ref, query, orderByChild, limitToLast, get } from 'firebase/database'
import type { Session, SessionStatus } from '@gal/types'
import { acquireSessionRealtimeDatabase } from '@/lib/session-realtime'
import { config as dashboardConfig } from '@/lib/config'

interface SessionListProps {
  sessions: Session[]
  onOpenTerminal: (sessionId: string) => void
  onTerminate: (sessionId: string) => void
  loading?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  selectedSessionId?: string | null
}

interface StatusConfig {
  icon: typeof Play
  color: string
  bgColor: string
  label: string
}

/**
 * Strip ANSI escape codes from terminal output.
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
}

/**
 * Trigger a download of a text/JSON blob as a file in the browser.
 */
function triggerBlobDownload(content: BlobPart, filename: string, mime: string): void {
  const blob = new Blob([Array.isArray(content) ? content.join('') : content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Attempt to download the permanent GCS archive of a session (#6566).
 *
 * Returns true if the archive was downloaded successfully. Returns false
 * when the archive doesn't exist yet (session still running or predates
 * the archival pipeline) so the caller can fall back to the RTDB path.
 */
async function downloadSessionArchiveFromApi(
  sessionId: string,
  sessionName?: string,
): Promise<boolean> {
  const apiBase = process.env['NEXT_PUBLIC_API_URL'] || ''
  try {
    const response = await fetch(`${apiBase}/api/sessions/${sessionId}/archive`, {
      credentials: 'include',
    })
    if (response.status === 404) {
      // Archive doesn't exist yet — caller falls back to RTDB
      return false
    }
    if (!response.ok) {
      console.warn(
        `[SessionDownload] Archive endpoint returned ${response.status}; falling back to RTDB`,
      )
      return false
    }

    const content = await response.text()
    if (!content) {
      return false
    }

    triggerBlobDownload(
      content,
      `session-${sessionName || sessionId.slice(0, 8)}-archive.jsonl`,
      'application/x-ndjson',
    )
    return true
  } catch (error) {
    console.warn('[SessionDownload] Archive fetch failed, falling back to RTDB:', error)
    return false
  }
}

/**
 * Download session output as a text file.
 *
 * Tries the permanent GCS archive first (#6566) for the complete event stream,
 * then falls back to RTDB for sessions that haven't been archived yet (still
 * active or predate the archival pipeline). RTDB is capped at 2000 entries.
 */
async function downloadSessionOutput(sessionId: string, sessionName?: string): Promise<void> {
  // Fast path: permanent archive via API (complete data, no truncation)
  if (await downloadSessionArchiveFromApi(sessionId, sessionName)) {
    return
  }

  // Fallback: RTDB last-2000-entries (ephemeral, may be truncated)
  let release: (() => Promise<void>) | undefined

  try {
    const realtimeClient = await acquireSessionRealtimeDatabase(sessionId)
    release = realtimeClient.release

    const outputRef = ref(realtimeClient.database, `sessions/${sessionId}/output`)
    // Cap download to last 2000 entries to avoid pulling massive session trees (#4002)
    const outputQuery = query(outputRef, orderByChild('sequence'), limitToLast(2000))
    const snapshot = await get(outputQuery)

    if (!snapshot.exists()) {
      alert('No output data available for this session')
      return
    }

    // Collect and sort output by sequence
    const outputs: { sequence: number; data: string; timestamp: string }[] = []
    snapshot.forEach((child) => {
      const val = child.val()
      if (val && val.data) {
        outputs.push({
          sequence: val.sequence || 0,
          data: val.data,
          timestamp: val.timestamp || '',
        })
      }
    })

    outputs.sort((a, b) => a.sequence - b.sequence)

    // Combine output and strip ANSI codes
    const content = outputs.map((o) => stripAnsi(o.data)).join('')
    triggerBlobDownload(
      content,
      `session-${sessionName || sessionId.slice(0, 8)}-output.txt`,
      'text/plain',
    )
  } catch (error) {
    console.error('Failed to download session output:', error)
    alert('Failed to download session output. Please try again.')
  } finally {
    if (release) {
      await release()
    }
  }
}

const STATUS_CONFIG: Record<SessionStatus, StatusConfig> = {
  PENDING: {
    icon: Clock,
    color: 'var(--status-warning)',
    bgColor: 'var(--status-warning-light)',
    label: 'Pending',
  },
  INITIALIZING: {
    icon: Loader2,
    color: 'var(--status-info)',
    bgColor: 'var(--status-info-light)',
    label: 'Initializing',
  },
  ACTIVE: {
    icon: Play,
    color: 'var(--status-success)',
    bgColor: 'var(--status-success-light)',
    label: 'Active',
  },
  DISCONNECTED: {
    icon: Pause,
    color: 'var(--status-warning)',
    bgColor: 'var(--status-warning-light)',
    label: 'Disconnected',
  },
  TERMINATED: {
    icon: CheckCircle,
    color: 'var(--text-secondary)',
    bgColor: 'var(--badge-gray-bg)',
    label: 'Terminated',
  },
  FAILED: {
    icon: XCircle,
    color: 'var(--status-danger)',
    bgColor: 'var(--status-danger-light)',
    label: 'Failed',
  },
}

function SessionStatusBadge({
  status,
  workflowRunId,
}: {
  status: SessionStatus
  workflowRunId?: number
}) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon

  const handleClick = (e: React.MouseEvent) => {
    if (workflowRunId && dashboardConfig.backgroundAgentGitHubRepo) {
      e.stopPropagation()
      window.open(
        `https://github.com/${dashboardConfig.backgroundAgentGitHubRepo}/actions/runs/${workflowRunId}`,
        '_blank'
      )
    }
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap shrink-0 ${
        workflowRunId && dashboardConfig.backgroundAgentGitHubRepo ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
      }`}
      style={{ backgroundColor: config.bgColor, color: config.color }}
      onClick={workflowRunId && dashboardConfig.backgroundAgentGitHubRepo ? handleClick : undefined}
      title={workflowRunId && dashboardConfig.backgroundAgentGitHubRepo ? 'View GitHub Actions workflow' : undefined}
    >
      <Icon
        className={`w-3 h-3 flex-shrink-0 ${status === 'INITIALIZING' ? 'animate-spin' : ''}`}
      />
      <span className="flex-shrink-0">{config.label}</span>
      {workflowRunId && dashboardConfig.backgroundAgentGitHubRepo && <ExternalLink className="w-3 h-3 ml-0.5 flex-shrink-0" />}
    </span>
  )
}

function SessionCardItem({
  session,
  onOpenTerminal,
  onTerminate,
  isSelected,
}: {
  session: Session
  onOpenTerminal: (sessionId: string) => void
  onTerminate: (sessionId: string) => void
  isSelected?: boolean
}) {
  const [downloading, setDownloading] = useState(false)
  const isActive = session.status === 'ACTIVE' || session.status === 'INITIALIZING'
  const canTerminate =
    session.status !== 'TERMINATED' && session.status !== 'FAILED'

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setDownloading(true)
    try {
      await downloadSessionOutput(session.id, session.name)
    } finally {
      setDownloading(false)
    }
  }

  const createdAt = new Date(session.createdAt)
  const timeAgo = formatDistanceToNow(createdAt, { addSuffix: true })

  return (
    <div
      className={`p-4 rounded-lg transition-colors cursor-pointer hover:bg-[var(--bg-tertiary)] ${isSelected ? 'ring-2 ring-[var(--accent)]' : ''}`}
      style={{
        backgroundColor: isSelected ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
      }}
      onClick={() => onOpenTerminal(session.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: isActive ? 'var(--accent-bg)' : 'var(--bg-tertiary)',
            }}
          >
            <Terminal
              className="w-5 h-5"
              style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}
            />
          </div>
          <div className="min-w-0 overflow-hidden flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3
                className="text-sm font-medium truncate min-w-0 flex-1"
                style={{ color: 'var(--text-primary)' }}
              >
                {session.name || `Session ${session.id.slice(0, 8)}`}
              </h3>
              <span className="shrink-0">
                <SessionStatusBadge status={session.status} workflowRunId={session.workflowRunId} />
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs flex-wrap" style={{ color: 'var(--text-muted)' }}>
              <span>ID: {session.id.slice(0, 8)}...</span>
              <span>Created {timeAgo}</span>
              {session.projectContext && (
                <span className="truncate max-w-[150px]">
                  Project: {session.projectContext}
                </span>
              )}
            </div>
            {session.status === 'FAILED' && session.errorMessage && (
              <div
                className="mt-2 flex items-center gap-1.5 text-xs"
                style={{ color: 'var(--status-danger)' }}
              >
                <AlertCircle className="w-3 h-3" />
                {session.errorMessage}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="p-1.5 rounded-lg transition-colors hover:bg-[var(--accent-bg)]"
            style={{ color: 'var(--text-muted)' }}
            title="Download session output"
          >
            {downloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4 hover:text-[var(--accent)]" />
            )}
          </button>
          {canTerminate && (
            <button
              onClick={(e) => { e.stopPropagation(); onTerminate(session.id) }}
              className="p-1.5 rounded-lg transition-colors hover:bg-[var(--status-danger-light)]"
              style={{ color: 'var(--text-muted)' }}
              title="Terminate session"
            >
              <Trash2 className="w-4 h-4 hover:text-[var(--status-danger-text)]" />
            </button>
          )}
        </div>
      </div>

      {/* Duration info for active sessions */}
      {isActive && session.connectedAt && (
        <div
          className="mt-3 pt-3 flex items-center gap-4 text-xs"
          style={{
            borderTop: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)',
          }}
        >
          <span className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Connected {formatDistanceToNow(new Date(session.connectedAt), { addSuffix: true })}
          </span>
          {session.runnerId && (
            <span>Runner: {session.runnerId.slice(0, 12)}</span>
          )}
        </div>
      )}
    </div>
  )
}

export function SessionList({
  sessions,
  onOpenTerminal,
  onTerminate,
  loading,
  hasMore,
  onLoadMore,
  selectedSessionId,
}: SessionListProps) {
  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <SessionCardItem
          key={session.id}
          session={session}
          onOpenTerminal={onOpenTerminal}
          onTerminate={onTerminate}
          isSelected={session.id === selectedSessionId}
        />
      ))}

      {hasMore && (
        <div className="flex justify-center pt-4">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-colors"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading...
              </>
            ) : (
              'Load More'
            )}
          </button>
        </div>
      )}
    </div>
  )
}

export default SessionList
