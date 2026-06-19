'use client'

/**
 * TerminalSession Component (GAL-571)
 *
 * Dynamic wrapper that loads the Socket.io-based xterm.js terminal component
 * with SSR disabled since xterm.js requires browser APIs (window/document).
 *
 * Migrated from apps/dashboard to Next.js App Router.
 */

import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import type { SessionStatus } from '@gal/types'

const TerminalSessionInner = dynamic(
  () => import('./TerminalSessionInner'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full" style={{ backgroundColor: 'var(--terminal-bg)' }}>
        <div className="flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading terminal...</span>
        </div>
      </div>
    ),
  }
)

interface TerminalSessionProps {
  sessionId: string
  onStatusChange?: (status: SessionStatus) => void
}

export function TerminalSession(props: TerminalSessionProps) {
  return <TerminalSessionInner {...props} />
}

export default TerminalSession
