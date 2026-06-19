'use client'

/**
 * FirebaseTerminalSession Inner Component (GAL-571)
 *
 * Real-time terminal emulator using xterm.js with Firebase Realtime Database
 * for bidirectional communication with remote Claude Code sessions.
 *
 * This is the inner component loaded via next/dynamic with ssr: false
 * because xterm.js requires browser APIs (window/document).
 *
 * Migrated from apps/dashboard to Next.js App Router.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { CanvasAddon } from '@xterm/addon-canvas'
import {
  ref,
  onValue,
  onChildAdded,
  set,
  remove,
  serverTimestamp,
  onDisconnect,
  query,
  orderByChild,
  limitToLast,
  type Unsubscribe,
} from 'firebase/database'
import { Loader2, WifiOff, Wifi, Users } from 'lucide-react'
import type { SessionStatus } from '@gal/types'
import { isDatabaseConfigured } from '@/lib/firebase'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useSessionRealtimeDatabase } from '@/lib/session-realtime'

import '@xterm/xterm/css/xterm.css'

interface FirebaseTerminalSessionProps {
  sessionId: string
  onStatusChange?: (status: SessionStatus) => void
}

interface ConnectionState {
  connected: boolean
  connecting: boolean
  error: string | null
}

interface Viewer {
  userId: string
  userName?: string
  connectedAt: number
}

// Terminal output chunk from Firebase
interface OutputChunk {
  data: string
  timestamp: number
  sequence: number
}

export function FirebaseTerminalSessionInner({
  sessionId,
  onStatusChange,
}: FirebaseTerminalSessionProps) {
  const { user } = useAuth()
  const {
    database: sessionDatabase,
    isConnecting: isRealtimeConnecting,
    error: realtimeError,
  } = useSessionRealtimeDatabase(sessionId)
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstance = useRef<Terminal | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)
  const connectionIdRef = useRef<string>(`${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const unsubscribesRef = useRef<Unsubscribe[]>([])
  const lastSequenceRef = useRef<number>(0)

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    connected: false,
    connecting: true,
    error: null,
  })
  const [viewers, setViewers] = useState<Viewer[]>([])

  // Initialize terminal - intentionally only run once on mount
  const initTerminal = useCallback(() => {
    if (!terminalRef.current || terminalInstance.current) return

    // Create terminal with cyberpunk theme and ANSI handling
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e0e0e0',
        cursor: '#ededed',
        cursorAccent: '#000000',
        selectionBackground: 'rgba(255, 255, 255, 0.18)',
        black: '#0a0a0a',
        red: '#ff5555',
        green: '#00ff41',
        yellow: '#f1fa8c',
        blue: '#6272a4',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#e0e0e0',
        brightBlack: '#4d4d4d',
        brightRed: '#ff6e67',
        brightGreen: '#5af78e',
        brightYellow: '#f4f99d',
        brightBlue: '#caa9fa',
        brightMagenta: '#ff92d0',
        brightCyan: '#9aedfe',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
      scrollback: 10000,
      // CRITICAL: Enable proper ANSI handling for PTY output
      convertEol: true, // Convert \n to \r\n for proper line breaks
      windowsMode: false, // Assume Unix-style line endings from PTY
      fastScrollModifier: 'alt', // Fast scroll with Alt key
      fastScrollSensitivity: 5,
    })

    // Add fit addon for auto-resize
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    fitAddon.current = fit

    // Add web links addon for clickable URLs
    const webLinks = new WebLinksAddon()
    terminal.loadAddon(webLinks)

    // Add WebGL renderer for better performance (fallback to Canvas if WebGL unavailable)
    try {
      const webgl = new WebglAddon()
      terminal.loadAddon(webgl)
      console.debug('[Terminal] WebGL renderer loaded')
    } catch {
      console.debug('[Terminal] WebGL not available, falling back to Canvas')
      try {
        const canvas = new CanvasAddon()
        terminal.loadAddon(canvas)
        console.debug('[Terminal] Canvas renderer loaded')
      } catch {
        console.debug('[Terminal] Canvas not available, using DOM renderer')
      }
    }

    // Open terminal in container
    terminal.open(terminalRef.current)

    // Defer fit() call to next frame
    requestAnimationFrame(() => {
      try {
        fit.fit()
      } catch (e) {
        console.debug('[Terminal] Initial fit deferred:', e)
      }
    })

    terminalInstance.current = terminal

    // Handle window resize and sync size to Firebase
    const handleResize = () => {
      if (fitAddon.current && terminalInstance.current) {
        try {
          fitAddon.current.fit()
          // Sync terminal size to Firebase so runner can match
          if (sessionDatabase) {
            const sizeRef = ref(sessionDatabase, `sessions/${sessionId}/terminalSize`)
            set(sizeRef, {
              cols: terminalInstance.current.cols,
              rows: terminalInstance.current.rows,
              updatedAt: serverTimestamp(),
            }).catch(() => {
              // Ignore errors - size sync is best effort
            })
          }
        } catch (e) {
          console.debug('[Terminal] Resize error:', e)
        }
      }
    }

    window.addEventListener('resize', handleResize)

    // Sync initial size after a short delay to ensure terminal is rendered
    setTimeout(handleResize, 200)

    // Initial welcome message
    terminal.writeln('\x1b[32m\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557\x1b[0m')
    terminal.writeln('\x1b[32m\u2551\x1b[0m  \x1b[1;32mGAL Background Agent Session\x1b[0m                                    \x1b[32m\u2551\x1b[0m')
    terminal.writeln('\x1b[32m\u2551\x1b[0m  Connecting via Firebase Realtime Database...                     \x1b[32m\u2551\x1b[0m')
    terminal.writeln('\x1b[32m\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d\x1b[0m')
    terminal.writeln('')

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally run once on mount
  }, [sessionDatabase, sessionId, user])

  // Set up Firebase listeners
  const setupFirebaseListeners = useCallback(() => {
    if (!sessionDatabase || !user) return

    const outputRef = ref(sessionDatabase, `sessions/${sessionId}/output`)
    const presenceRef = ref(sessionDatabase, `sessions/${sessionId}/presence`)
    const statusRef = ref(sessionDatabase, `sessions/${sessionId}/metadata/status`)
    const connectedRef = ref(sessionDatabase, '.info/connected')

    // Listen for connection state
    const connectedUnsub = onValue(connectedRef, (snapshot) => {
      if (snapshot.val() === true) {
        setConnectionState({ connected: true, connecting: false, error: null })

        const myPresenceRef = ref(
          sessionDatabase,
          `sessions/${sessionId}/presence/${connectionIdRef.current}`
        )

        // Set presence data
        set(myPresenceRef, {
          userId: user.githubId || user.id,
          userName: user.name || user.email,
          connectedAt: serverTimestamp(),
        })

        // Remove presence on disconnect
        onDisconnect(myPresenceRef).remove()

        if (terminalInstance.current) {
          terminalInstance.current.writeln('\x1b[32m[Connected to Firebase]\x1b[0m')
        }
      } else {
        setConnectionState((prev) => ({
          ...prev,
          connected: false,
          error: 'Disconnected from Firebase',
        }))

        if (terminalInstance.current) {
          terminalInstance.current.writeln('\x1b[33m[Disconnected from Firebase]\x1b[0m')
        }
      }
    })
    unsubscribesRef.current.push(connectedUnsub)

    // Listen for status changes with user-friendly messages
    const statusUnsub = onValue(statusRef, (snapshot) => {
      const status = snapshot.val() as SessionStatus
      if (status) {
        onStatusChange?.(status)
        if (terminalInstance.current) {
          // Clear terminal and reset when session becomes ACTIVE
          if (status === 'ACTIVE') {
            terminalInstance.current.clear()
            terminalInstance.current.reset()
            lastSequenceRef.current = 0 // Reset sequence to receive new output
          }
          const statusMessages: Record<string, { color: string; message: string }> = {
            PENDING: { color: '33', message: 'Waiting for runner to pick up session...' },
            INITIALIZING: { color: '36', message: 'Runner initializing session...' },
            ACTIVE: { color: '32', message: 'Session active - runner connected' },
            DISCONNECTED: { color: '33', message: 'Runner disconnected - attempting reconnect...' },
            TERMINATED: { color: '90', message: 'Session terminated' },
            FAILED: { color: '31', message: 'Session failed' },
          }
          const info = statusMessages[status] || { color: '90', message: status }
          terminalInstance.current.writeln(`\x1b[${info.color}m[${status}] ${info.message}\x1b[0m`)
        }
      }
    })
    unsubscribesRef.current.push(statusUnsub)

    // Listen for output (ordered by sequence, capped to last 500 entries to reduce
    // initial RTDB bandwidth — #4002). New entries still arrive via onChildAdded.
    const outputQuery = query(outputRef, orderByChild('sequence'), limitToLast(500))
    const outputUnsub = onChildAdded(outputQuery, (snapshot) => {
      const chunk = snapshot.val() as OutputChunk
      if (chunk && chunk.sequence > lastSequenceRef.current) {
        lastSequenceRef.current = chunk.sequence
        if (terminalInstance.current) {
          terminalInstance.current.write(chunk.data)
        }
      }
    })
    unsubscribesRef.current.push(outputUnsub)

    // Listen for presence changes
    const presenceUnsub = onValue(presenceRef, (snapshot) => {
      const viewerList: Viewer[] = []
      snapshot.forEach((child) => {
        viewerList.push(child.val() as Viewer)
      })
      setViewers(viewerList)
    })
    unsubscribesRef.current.push(presenceUnsub)

    console.log('[Terminal] Firebase listeners set up for session:', sessionId)
  }, [onStatusChange, sessionDatabase, sessionId, user])

  // Send terminal input through the API so the client never needs RTDB write access.
  const sendInput = useCallback(
    async (data: string) => {
      if (!user) return

      const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions/${sessionId}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send terminal input')
      }
    },
    [sessionId, user]
  )

  // Set up input handling
  const setupInputHandling = useCallback(() => {
    if (!terminalInstance.current) return

    const terminal = terminalInstance.current

    // Handle user input
    const disposable = terminal.onData((data: string) => {
      void sendInput(data).catch((error: unknown) => {
        console.error('[Terminal] Failed to send input:', error)
      })
    })

    return () => {
      disposable.dispose()
    }
  }, [sendInput])

  // Initialize everything
  useEffect(() => {
    if (realtimeError) {
      setConnectionState({
        connected: false,
        connecting: false,
        error: realtimeError,
      })
      return
    }

    if (isRealtimeConnecting || !sessionDatabase) {
      setConnectionState((prev) => ({
        connected: prev.connected,
        connecting: true,
        error: null,
      }))
    }
  }, [isRealtimeConnecting, realtimeError, sessionDatabase])

  // Initialize everything
  useEffect(() => {
    if (!sessionDatabase) return

    console.log('[Terminal] Initializing Firebase terminal for session:', sessionId)

    initTerminal()
    setupFirebaseListeners()

    // Setup input handling after a short delay
    const inputCleanup = setTimeout(() => {
      setupInputHandling()
    }, 100)

    // Capture ref value at effect setup time for cleanup
    const connId = connectionIdRef.current

    return () => {
      console.log('[Terminal] Cleanup for session:', sessionId)
      clearTimeout(inputCleanup)

      // Unsubscribe from all Firebase listeners
      for (const unsub of unsubscribesRef.current) {
        unsub()
      }
      unsubscribesRef.current = []

      // Remove presence
      if (sessionDatabase) {
        const myPresenceRef = ref(
          sessionDatabase,
          `sessions/${sessionId}/presence/${connId}`
        )
        remove(myPresenceRef).catch(() => {
          // Ignore errors during cleanup
        })
      }

      // Cleanup terminal
      terminalInstance.current?.dispose()
      terminalInstance.current = null
      fitAddon.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Only re-init when sessionId changes, not on callback recreation
  }, [sessionDatabase, sessionId])

  // Check if Firebase RTDB is configured (after all hooks)
  if (!isDatabaseConfigured || (!sessionDatabase && !isRealtimeConnecting && realtimeError)) {
    return (
      <div className="flex items-center justify-center h-full bg-[var(--terminal-bg)] text-[var(--status-danger)]">
        <div className="text-center">
          <WifiOff className="w-12 h-12 mx-auto mb-4" />
          <p>{realtimeError || 'Firebase Realtime Database not configured'}</p>
          <p className="text-sm text-[var(--text-tertiary)] mt-2">
            {realtimeError ? 'Realtime session authorization failed' : 'Set NEXT_PUBLIC_FIREBASE_DATABASE_URL in environment'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full flex flex-col" style={{ backgroundColor: 'var(--terminal-bg)' }}>
      {/* Connection status indicator */}
      <div
        className="absolute top-2 right-2 z-10 flex items-center gap-2 px-2 py-1 rounded text-xs"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: connectionState.connected ? 'var(--status-success)' : connectionState.error ? 'var(--status-danger)' : 'var(--status-warning)',
        }}
      >
        {connectionState.connecting ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            Connecting...
          </>
        ) : connectionState.connected ? (
          <>
            <Wifi className="w-3 h-3" />
            Connected
            {viewers.length > 1 && (
              <span className="flex items-center gap-1 ml-2 text-[var(--text-secondary)]">
                <Users className="w-3 h-3" />
                {viewers.length}
              </span>
            )}
          </>
        ) : (
          <>
            <WifiOff className="w-3 h-3" />
            {connectionState.error || 'Disconnected'}
          </>
        )}
      </div>

      {/* Reconnect overlay when disconnected */}
      {!connectionState.connected && !connectionState.connecting && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/50">
          <div className="text-center">
            <WifiOff className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--status-danger)' }} />
            <p className="text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
              {connectionState.error || 'Disconnected from session'}
            </p>
            <p className="text-xs text-[var(--text-tertiary)]">
              Firebase will automatically reconnect when connection is restored
            </p>
          </div>
        </div>
      )}

      {/* Viewers indicator (when multiple viewers) */}
      {viewers.length > 1 && (
        <div
          className="absolute top-2 left-2 z-10 flex items-center gap-2 px-2 py-1 rounded text-xs"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)', color: 'var(--brand-llm-analysis)' }}
        >
          <Users className="w-3 h-3" />
          <span>{viewers.length} viewers</span>
        </div>
      )}

      {/* Terminal container */}
      <div
        ref={terminalRef}
        className="flex-1 min-h-0 p-2"
        style={{
          backgroundColor: 'var(--terminal-bg)',
        }}
      />
    </div>
  )
}

export default FirebaseTerminalSessionInner
