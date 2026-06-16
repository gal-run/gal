'use client'

/**
 * TerminalSession Inner Component (GAL-571)
 *
 * Real-time terminal emulator using xterm.js with Socket.io for
 * bidirectional communication with remote Claude Code sessions.
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
import { io, Socket } from 'socket.io-client'
import { Loader2, WifiOff, Wifi } from 'lucide-react'
import type { SessionStatus, TerminalOutput, TerminalInput, SessionJoinedPayload } from '@gal/types'

import '@xterm/xterm/css/xterm.css'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

interface TerminalSessionProps {
  sessionId: string
  onStatusChange?: (status: SessionStatus) => void
}

interface ConnectionState {
  connected: boolean
  connecting: boolean
  error: string | null
}

export function TerminalSessionInner({ sessionId, onStatusChange }: TerminalSessionProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstance = useRef<Terminal | null>(null)
  const fitAddon = useRef<FitAddon | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const initializedRef = useRef(false) // GAL-571: Prevent re-initialization
  const onStatusChangeRef = useRef(onStatusChange) // GAL-571: Stable callback ref
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    connected: false,
    connecting: true,
    error: null,
  })

  // Keep callback ref up to date without causing re-renders
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange
  }, [onStatusChange])

  // Initialize terminal
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

    // Defer fit() call to next frame to ensure container has dimensions
    requestAnimationFrame(() => {
      try {
        fit.fit()
      } catch (e) {
        console.debug('[Terminal] Initial fit deferred:', e)
      }
    })

    // Store reference
    terminalInstance.current = terminal

    // Handle window resize
    const handleResize = () => {
      if (fitAddon.current && terminalInstance.current) {
        try {
          fitAddon.current.fit()
          // Notify server of new dimensions
          if (socketRef.current?.connected) {
            socketRef.current.emit('terminal:resize', {
              sessionId,
              cols: terminalInstance.current.cols,
              rows: terminalInstance.current.rows,
            })
          }
        } catch (e) {
          console.debug('[Terminal] Resize error:', e)
        }
      }
    }

    window.addEventListener('resize', handleResize)

    // Initial welcome message
    terminal.writeln('\x1b[32m\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557\x1b[0m')
    terminal.writeln('\x1b[32m\u2551\x1b[0m  \x1b[1;32mGAL Background Agent Session\x1b[0m                                    \x1b[32m\u2551\x1b[0m')
    terminal.writeln('\x1b[32m\u2551\x1b[0m  Connecting to remote background agent session...                 \x1b[32m\u2551\x1b[0m')
    terminal.writeln('\x1b[32m\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d\x1b[0m')
    terminal.writeln('')

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [sessionId])

  // Fetch WebSocket token from session cookie
  const fetchWsToken = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/ws-token`, {
        credentials: 'include', // Include httpOnly session cookie
      })

      if (!response.ok) {
        console.error('[Terminal] Failed to get ws-token:', response.status)
        return null
      }

      const data = await response.json() as { token: string }
      return data.token
    } catch (error) {
      console.error('[Terminal] Error fetching ws-token:', error)
      return null
    }
  }, [])

  // Initialize Socket.io connection
  const initSocket = useCallback(async () => {
    // Get WebSocket token from API (exchanges session cookie for ws-token)
    const token = await fetchWsToken()

    const socket = io(`${API_BASE_URL}/ws/terminal`, {
      auth: {
        token: token ? `Bearer ${token}` : undefined,
      },
      withCredentials: true,
      // Use polling first, then try to upgrade to WebSocket
      transports: ['polling', 'websocket'],
      upgrade: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    })

    socketRef.current = socket

    // Heartbeat interval to keep connection alive on Cloud Run
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null

    // Connection handlers
    socket.on('connect', () => {
      console.log('[Terminal] Connected to WebSocket')
      setConnectionState({ connected: true, connecting: false, error: null })

      // Start heartbeat to keep connection alive (every 10 seconds)
      if (heartbeatInterval) clearInterval(heartbeatInterval)
      heartbeatInterval = setInterval(() => {
        if (socket.connected) {
          socket.emit('heartbeat', { timestamp: Date.now() })
        }
      }, 10000)

      // Join the session room
      socket.emit('session:join', { sessionId })

      if (terminalInstance.current) {
        terminalInstance.current.writeln('\x1b[32m[Connected to server]\x1b[0m')
      }
    })

    socket.on('connect_error', (error) => {
      console.error('[Terminal] Connection error:', error)
      setConnectionState({
        connected: false,
        connecting: false,
        error: error.message || 'Failed to connect',
      })

      if (terminalInstance.current) {
        terminalInstance.current.writeln(`\x1b[31m[Connection error: ${error.message}]\x1b[0m`)
      }
    })

    socket.on('disconnect', (reason) => {
      console.log('[Terminal] Disconnected:', reason)

      // Stop heartbeat on disconnect
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval)
        heartbeatInterval = null
      }

      setConnectionState(prev => ({
        ...prev,
        connected: false,
        error: reason === 'io server disconnect' ? 'Server disconnected' : null,
      }))

      if (terminalInstance.current) {
        terminalInstance.current.writeln(`\x1b[33m[Disconnected: ${reason}]\x1b[0m`)
      }
    })

    // Session handlers
    socket.on('session:joined', (data: SessionJoinedPayload) => {
      console.log('[Terminal] Joined session:', data)

      if (terminalInstance.current) {
        terminalInstance.current.writeln(`\x1b[32m[Joined session: ${data.sessionId}]\x1b[0m`)
        terminalInstance.current.writeln(`\x1b[90mStatus: ${data.status}\x1b[0m`)

        // Write buffered output if available
        if (data.bufferedOutput) {
          terminalInstance.current.writeln('\x1b[90m--- Session History ---\x1b[0m')
          terminalInstance.current.write(data.bufferedOutput)
          terminalInstance.current.writeln('\x1b[90m--- End History ---\x1b[0m')
        }
      }

      onStatusChangeRef.current?.(data.status)
    })

    socket.on('session:error', (data: { message: string }) => {
      console.error('[Terminal] Session error:', data.message)
      setConnectionState(prev => ({ ...prev, error: data.message }))

      if (terminalInstance.current) {
        terminalInstance.current.writeln(`\x1b[31m[Error: ${data.message}]\x1b[0m`)
      }
    })

    socket.on('session:status', (data: { sessionId: string; status: SessionStatus }) => {
      console.log('[Terminal] Status changed:', data.status)
      onStatusChangeRef.current?.(data.status)

      if (terminalInstance.current) {
        terminalInstance.current.writeln(`\x1b[90m[Status: ${data.status}]\x1b[0m`)
      }
    })

    // Terminal output handler
    socket.on('terminal:output', (data: TerminalOutput) => {
      if (data.sessionId === sessionId && terminalInstance.current) {
        terminalInstance.current.write(data.data)
      }
    })

    return socket
  }, [sessionId, fetchWsToken]) // GAL-571: Removed onStatusChange - use ref instead

  // Setup terminal input handling
  const setupInputHandling = useCallback(() => {
    if (!terminalInstance.current || !socketRef.current) return

    const terminal = terminalInstance.current
    const socket = socketRef.current

    // Handle user input
    const disposable = terminal.onData((data: string) => {
      if (socket.connected) {
        const input: TerminalInput = {
          sessionId,
          data,
          timestamp: new Date().toISOString(),
        }
        socket.emit('terminal:input', input)
      }
    })

    return () => {
      disposable.dispose()
    }
  }, [sessionId])

  // Initialize everything (GAL-571: Fixed reconnection loop)
  useEffect(() => {
    // Prevent re-initialization on re-renders
    if (initializedRef.current) {
      console.log('[Terminal] Already initialized, skipping')
      return
    }
    initializedRef.current = true

    console.log('[Terminal] Initializing terminal and socket for session:', sessionId)
    initTerminal()

    // Track socket for cleanup (async initialization)
    let socketInstance: Socket | null = null

    // Initialize socket asynchronously
    const initializeSocket = async () => {
      socketInstance = await initSocket()
    }
    void initializeSocket()

    // Setup input handling after a short delay to ensure terminal is ready
    const inputCleanup = setTimeout(() => {
      setupInputHandling()
    }, 100)

    return () => {
      console.log('[Terminal] Cleanup triggered for session:', sessionId)
      clearTimeout(inputCleanup)

      // Leave session
      const socket = socketRef.current || socketInstance
      if (socket?.connected) {
        socket.emit('session:leave', { sessionId })
      }

      // Cleanup socket
      socket?.disconnect()
      socketRef.current = null

      // Cleanup terminal
      terminalInstance.current?.dispose()
      terminalInstance.current = null
      fitAddon.current = null

      // Reset initialized flag on cleanup (for remount)
      initializedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- GAL-571: Only re-init on sessionId change, not callback changes
  }, [sessionId])

  // Handle reconnection (GAL-571: Use socket&apos;s built-in reconnect)
  const handleReconnect = useCallback(async () => {
    setConnectionState({ connected: false, connecting: true, error: null })

    if (socketRef.current) {
      // Socket exists - just reconnect
      socketRef.current.connect()
    } else {
      // Socket was destroyed - reinitialize (async)
      await initSocket()
    }
  }, [initSocket])

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
          </>
        ) : (
          <>
            <WifiOff className="w-3 h-3" />
            {connectionState.error || 'Disconnected'}
          </>
        )}
      </div>

      {/* Reconnect button when disconnected */}
      {!connectionState.connected && !connectionState.connecting && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/50">
          <div className="text-center">
            <WifiOff className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--status-danger)' }} />
            <p className="text-sm mb-4" style={{ color: 'var(--text-primary)' }}>
              {connectionState.error || 'Disconnected from session'}
            </p>
            <button
              onClick={handleReconnect}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg mx-auto"
              style={{
                backgroundColor: 'var(--text-primary)',
                color: 'var(--text-on-accent)',
              }}
            >
              <Wifi className="w-4 h-4" />
              Reconnect
            </button>
          </div>
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

export default TerminalSessionInner
