'use client'

/**
 * AgentSessionHeader (GAL-2431)
 *
 * Displays agent identity, repository/branch info, session status,
 * duration elapsed, and action buttons for a selected session.
 * Follows the project design token system (Linear dark / Vercel light).
 */

import { useState, useEffect } from 'react'
import {
  FolderGit2,
  GitBranch,
  Clock,
  Square,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { SESSION_AGENTS } from '@gal/types'
import type { SessionAgent, SessionStatus } from '@gal/types'
import { config } from '@/lib/config'

// Status display configuration
const STATUS_CONFIG: Record<
  SessionStatus,
  { color: string; bgColor: string; label: string; pulse?: boolean }
> = {
  PENDING: {
    color: 'var(--status-warning)',
    bgColor: 'var(--status-warning-light)',
    label: 'Pending',
  },
  INITIALIZING: {
    color: 'var(--status-info)',
    bgColor: 'var(--status-info-light)',
    label: 'Initializing',
    pulse: true,
  },
  ACTIVE: {
    color: 'var(--status-success)',
    bgColor: 'var(--status-success-light)',
    label: 'Active',
    pulse: true,
  },
  DISCONNECTED: {
    color: 'var(--status-warning)',
    bgColor: 'var(--status-warning-light)',
    label: 'Disconnected',
  },
  TERMINATED: {
    color: 'var(--text-secondary)',
    bgColor: 'var(--badge-gray-bg)',
    label: 'Terminated',
  },
  FAILED: {
    color: 'var(--status-danger)',
    bgColor: 'var(--status-danger-light)',
    label: 'Failed',
  },
}

interface AgentSessionHeaderProps {
  /** Session ID */
  sessionId: string
  /** Agent type for this session */
  agent?: SessionAgent
  /** Current session status */
  status: SessionStatus
  /** Repository context (e.g. "Scheduler-Systems/gal-run-private") */
  projectContext?: string
  /** Branch name */
  branch?: string
  /** ISO timestamp when the session was created */
  createdAt?: string
  /** ISO timestamp when the session terminated (if applicable) */
  terminatedAt?: string
  /** GitHub Actions workflow run ID for linking */
  workflowRunId?: number
  /** Handler for the terminate/stop action */
  onTerminate?: () => void
  /** Whether termination is in progress */
  terminating?: boolean
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

export function AgentSessionHeader({
  sessionId,
  agent,
  status,
  projectContext,
  branch,
  createdAt,
  terminatedAt,
  workflowRunId,
  onTerminate,
  terminating = false,
}: AgentSessionHeaderProps) {
  const [elapsed, setElapsed] = useState('')

  // Update elapsed duration every second for active sessions
  useEffect(() => {
    if (!createdAt) return

    const update = () => {
      const start = new Date(createdAt).getTime()
      if (isNaN(start)) return
      const end = terminatedAt ? new Date(terminatedAt).getTime() : Date.now()
      if (isNaN(end)) return
      setElapsed(formatDuration(end - start))
    }

    update()

    // Only tick for non-terminal states
    if (!terminatedAt && status !== 'TERMINATED' && status !== 'FAILED') {
      const interval = setInterval(update, 1000)
      return () => clearInterval(interval)
    }
  }, [createdAt, terminatedAt, status])

  // Agent display info
  const agentConfig = agent ? SESSION_AGENTS.find(a => a.id === agent) : null
  const agentName = agentConfig?.displayName ?? 'Agent'
  const agentIcon = agentConfig?.icon ?? '🤖'

  // Parse repository info
  const repoName = projectContext
    ? projectContext.split('/').pop() || projectContext
    : null
  const branchName = branch || 'main'

  // Status display
  const statusConfig = STATUS_CONFIG[status] ?? {
    color: 'var(--text-muted)',
    bgColor: 'var(--bg-tertiary)',
    label: status,
  }

  const isTerminal = status === 'TERMINATED' || status === 'FAILED'

  return (
    <div
      className="px-4 py-3 flex-shrink-0"
      style={{
        backgroundColor: 'var(--surface-raised)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* Top row: Agent + Status + Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Agent icon and name */}
          <div className="flex items-center gap-2">
            <span className="text-base" role="img" aria-label={agentName}>
              {agentIcon}
            </span>
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              {agentName}
            </span>
          </div>

          {/* Separator */}
          <div
            className="h-4 w-px"
            style={{ backgroundColor: 'var(--border-subtle)' }}
          />

          {/* Status badge */}
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: statusConfig.bgColor,
              color: statusConfig.color,
            }}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${statusConfig.pulse ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: statusConfig.color }}
            />
            {statusConfig.label}
          </div>

          {/* Duration */}
          {elapsed && (
            <>
              <div
                className="h-4 w-px"
                style={{ backgroundColor: 'var(--border-subtle)' }}
              />
              <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <Clock className="w-3 h-3" />
                <span>{elapsed}</span>
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Open in GitHub */}
          {workflowRunId && config.backgroundAgentGitHubRepo && (
            <a
              href={`https://github.com/${config.backgroundAgentGitHubRepo}/actions/runs/${workflowRunId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors hover:bg-[var(--bg-tertiary)]"
              style={{
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <ExternalLink className="w-3 h-3" />
              GitHub
            </a>
          )}

          {/* Terminate button */}
          {!isTerminal && onTerminate && (
            <button
              onClick={onTerminate}
              disabled={terminating}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors"
              style={{
                backgroundColor: 'var(--status-danger-light)',
                color: 'var(--status-danger)',
                border: '1px solid var(--status-danger)',
              }}
            >
              {terminating ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Square className="w-3 h-3" />
              )}
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Bottom row: Repo + Branch info */}
      {(repoName || branch) && (
        <div className="flex items-center gap-4 mt-2">
          {repoName && (
            <div className="flex items-center gap-1.5 text-xs">
              <FolderGit2
                className="w-3.5 h-3.5"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>
                {repoName}
              </span>
            </div>
          )}
          {branch && (
            <div className="flex items-center gap-1.5 text-xs">
              <GitBranch
                className="w-3.5 h-3.5"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <code
                className="font-mono px-1.5 py-0.5 rounded"
                style={{
                  color: 'var(--brand-gemini)',
                  backgroundColor: 'var(--bg-tertiary)',
                }}
              >
                {branchName}
              </code>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
