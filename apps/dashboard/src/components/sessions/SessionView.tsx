'use client'

/**
 * SessionView Component (GAL-571)
 *
 * Wrapper component for session display.
 * Terminal View is disabled (feature flagged) - only Chat View available.
 */

import { MessageSquare } from 'lucide-react'
import type { SessionStatus, SessionAgent } from '@gal/types'
import { StructuredLogsView } from './StructuredLogsView'

interface SessionViewProps {
  sessionId: string
  onStatusChange?: (status: SessionStatus) => void
  /** Agent type for this session (determines assistant name display) */
  agent?: SessionAgent
  /** Current session status (for resume functionality) */
  sessionStatus?: string
  /** Whether the session is displayed in fullscreen mode (constrains max-width) */
  isFullscreen?: boolean
}

export function SessionView({
  sessionId,
  onStatusChange,
  agent,
  sessionStatus,
  isFullscreen,
}: SessionViewProps) {
  return (
    <div className="h-full flex flex-col bg-[var(--surface-base)]">
      {/* View Header - Terminal View disabled via feature flag */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{
          backgroundColor: 'var(--surface-overlay)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-2 px-3 py-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>
          <MessageSquare className="w-4 h-4 text-[var(--status-success)]" />
          <span>Chat View</span>
        </div>
      </div>

      {/* View Content */}
      <div className="flex-1 min-h-0">
        <StructuredLogsView sessionId={sessionId} agent={agent} sessionStatus={sessionStatus} onStatusChange={onStatusChange} isFullscreen={isFullscreen} />
      </div>
    </div>
  )
}

export default SessionView
