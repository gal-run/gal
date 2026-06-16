'use client'

import { type FC } from 'react'
import { Circle, Loader2, CheckCircle2, XCircle, Ban } from 'lucide-react'

interface WorkflowStatusBadgeProps {
  status: 'queued' | 'in_progress' | 'completed'
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped' | null
  size?: 'sm' | 'md'
}

export const WorkflowStatusBadge: FC<WorkflowStatusBadgeProps> = ({
  status,
  conclusion,
  size = 'md',
}) => {
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'

  // Determine final status based on status and conclusion
  if (status === 'completed') {
    if (conclusion === 'success') {
      return (
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className={`${iconSize} text-[var(--status-success)]`} />
          <span className="text-xs text-[var(--status-success)]">Completed</span>
        </div>
      )
    }
    if (conclusion === 'failure') {
      return (
        <div className="flex items-center gap-1.5">
          <XCircle className={`${iconSize} text-[var(--status-danger)]`} />
          <span className="text-xs text-[var(--status-danger)]">Failed</span>
        </div>
      )
    }
    if (conclusion === 'cancelled') {
      return (
        <div className="flex items-center gap-1.5">
          <Ban className={`${iconSize} text-[var(--text-tertiary)]`} />
          <span className="text-xs text-[var(--text-tertiary)]">Cancelled</span>
        </div>
      )
    }
  }

  if (status === 'in_progress') {
    return (
      <div className="flex items-center gap-1.5">
        <Loader2 className={`${iconSize} text-[var(--status-success)] animate-spin`} />
        <span className="text-xs text-[var(--status-success)]">Running</span>
      </div>
    )
  }

  if (status === 'queued') {
    return (
      <div className="flex items-center gap-1.5">
        <Circle className={`${iconSize} text-[var(--status-warning)]`} />
        <span className="text-xs text-[var(--status-warning)]">Queued</span>
      </div>
    )
  }

  return null
}
