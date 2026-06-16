'use client'

/**
 * SessionActivityTimeline (GAL-2431)
 *
 * Vertical timeline showing session lifecycle events: creation, initialization,
 * active start, disconnection, termination, or failure.
 * Renders inside a collapsible section in the session detail panel.
 */

import { useState } from 'react'
import {
  Clock,
  Pause,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Zap,
} from 'lucide-react'
import type { SessionStatus } from '@gal/types'
import {
  formatTimelineTime,
  type SessionTimelineTimestamp,
} from './session-timeline-utils'

interface TimelineEvent {
  /** Event label */
  label: string
  /** Timestamp (string, Date, or Firestore Timestamp; null if event hasn't happened) */
  timestamp: SessionTimelineTimestamp
  /** Icon component for the event */
  icon: React.ElementType
  /** Icon color */
  color: string
  /** Whether this event is the current state */
  isCurrent?: boolean
}

interface SessionActivityTimelineProps {
  /** Current session status */
  status: SessionStatus
  /** When session was created (ISO string, Date, or Firestore Timestamp) */
  createdAt?: string | Date
  /** When session started running (ISO string, Date, or Firestore Timestamp) */
  startedAt?: string | Date
  /** When session terminated (ISO string, Date, or Firestore Timestamp) */
  terminatedAt?: string | Date
  /** Error message if session failed */
  errorMessage?: string
  /** Whether the timeline starts collapsed */
  defaultCollapsed?: boolean
}

/**
 * Builds the ordered list of timeline events from session metadata.
 */
function buildTimelineEvents(
  status: SessionStatus,
  createdAt?: SessionTimelineTimestamp,
  startedAt?: SessionTimelineTimestamp,
  terminatedAt?: SessionTimelineTimestamp,
  errorMessage?: string,
): TimelineEvent[] {
  const events: TimelineEvent[] = []

  // 1. Created
  events.push({
    label: 'Session created',
    timestamp: createdAt ?? null,
    icon: Clock,
    color: 'var(--status-warning)',
    isCurrent: status === 'PENDING',
  })

  // 2. Initializing
  if (status !== 'PENDING') {
    events.push({
      label: 'Initializing',
      timestamp: createdAt ?? null, // approximation
      icon: Loader2,
      color: 'var(--status-info)',
      isCurrent: status === 'INITIALIZING',
    })
  }

  // 3. Active
  if (startedAt || status === 'ACTIVE' || status === 'DISCONNECTED' || status === 'TERMINATED' || status === 'FAILED') {
    events.push({
      label: 'Session active',
      timestamp: startedAt ?? null,
      icon: Zap,
      color: 'var(--status-success)',
      isCurrent: status === 'ACTIVE',
    })
  }

  // 4. Disconnected (if applicable)
  if (status === 'DISCONNECTED') {
    events.push({
      label: 'Disconnected',
      timestamp: null,
      icon: Pause,
      color: 'var(--status-warning)',
      isCurrent: true,
    })
  }

  // 5. Terminated
  if (status === 'TERMINATED') {
    events.push({
      label: 'Session completed',
      timestamp: terminatedAt ?? null,
      icon: CheckCircle,
      color: 'var(--text-secondary)',
      isCurrent: true,
    })
  }

  // 5. Failed
  if (status === 'FAILED') {
    events.push({
      label: errorMessage ? `Failed: ${errorMessage}` : 'Session failed',
      timestamp: terminatedAt ?? null,
      icon: XCircle,
      color: 'var(--status-danger)',
      isCurrent: true,
    })
  }

  return events
}

export function SessionActivityTimeline({
  status,
  createdAt,
  startedAt,
  terminatedAt,
  errorMessage,
  defaultCollapsed = true,
}: SessionActivityTimelineProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  const events = buildTimelineEvents(status, createdAt, startedAt, terminatedAt, errorMessage)

  const Chevron = collapsed ? ChevronRight : ChevronDown

  return (
    <div
      className="flex-shrink-0"
      style={{
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* Collapsible header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-4 py-2 text-xs transition-colors hover:bg-[var(--bg-tertiary)]"
        style={{ color: 'var(--text-secondary)' }}
      >
        <Chevron className="w-3 h-3" />
        <span className="font-medium">Activity Timeline</span>
        <span style={{ color: 'var(--text-muted)' }}>
          ({events.length} events)
        </span>
      </button>

      {/* Timeline content */}
      {!collapsed && (
        <div className="px-4 pb-3">
          <div className="relative ml-2">
            {events.map((event, index) => {
              const Icon = event.icon
              const isLast = index === events.length - 1

              return (
                <div key={index} className="flex items-start gap-3 relative">
                  {/* Vertical connector line */}
                  {!isLast && (
                    <div
                      className="absolute left-[7px] top-[18px] w-px"
                      style={{
                        backgroundColor: 'var(--border-subtle)',
                        height: 'calc(100% - 2px)',
                      }}
                    />
                  )}

                  {/* Event dot / icon */}
                  <div
                    className="relative z-10 flex items-center justify-center w-4 h-4 rounded-full flex-shrink-0 mt-0.5"
                    style={{
                      backgroundColor: event.isCurrent
                        ? event.color
                        : 'var(--bg-tertiary)',
                      border: event.isCurrent
                        ? 'none'
                        : `1px solid var(--border-subtle)`,
                    }}
                  >
                    <Icon
                      className={`w-2.5 h-2.5 ${event.isCurrent && event.icon === Loader2 ? 'animate-spin' : ''}`}
                      style={{
                        color: event.isCurrent ? 'var(--text-on-accent)' : event.color,
                      }}
                    />
                  </div>

                  {/* Event content */}
                  <div className="flex-1 min-w-0 pb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs ${event.isCurrent ? 'font-medium' : ''}`}
                        style={{
                          color: event.isCurrent
                            ? 'var(--text-primary)'
                            : 'var(--text-secondary)',
                        }}
                      >
                        {event.label}
                      </span>
                      {event.timestamp && (
                        <span
                          className="text-xs"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {formatTimelineTime(event.timestamp)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
