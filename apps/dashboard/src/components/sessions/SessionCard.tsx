'use client'

import { type FC } from 'react'
import { WorkflowStatusBadge } from './WorkflowStatusBadge'
import { formatDistanceToNow } from 'date-fns'

interface SessionCardProps {
  id: number
  status: 'queued' | 'in_progress' | 'completed'
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped' | null
  command?: string
  args?: string
  triggeredBy?: string
  createdAt: string
  isSelected?: boolean
  onClick?: () => void
}

export const SessionCard: FC<SessionCardProps> = ({
  status,
  conclusion,
  command,
  args,
  triggeredBy,
  createdAt,
  isSelected,
  onClick,
}) => {
  // Format relative time
  const timeAgo = formatDistanceToNow(new Date(createdAt), { addSuffix: true })

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
        isSelected
          ? 'bg-[var(--bg-tertiary)]'
          : 'hover:bg-[var(--bg-tertiary)]'
      }`}
    >
      <div className="space-y-1.5">
        {/* Command name */}
        <div className="flex items-start justify-between gap-2">
          <span
            className="text-sm font-medium truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {command || 'Unknown command'}
          </span>
          <WorkflowStatusBadge status={status} conclusion={conclusion} size="sm" />
        </div>

        {/* Args (if present) */}
        {args && (
          <span
            className="text-xs truncate block"
            style={{ color: 'var(--text-muted)' }}
          >
            {args}
          </span>
        )}

        {/* Time and triggered by */}
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>{timeAgo}</span>
          {triggeredBy && (
            <>
              <span>•</span>
              <span className="truncate">by {triggeredBy}</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}
