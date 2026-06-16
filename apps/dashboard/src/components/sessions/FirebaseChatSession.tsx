'use client'

/**
 * FirebaseChatSession Component (GAL-571)
 *
 * Chat-based interface for background agent sessions using Firebase Realtime Database.
 * Displays agent output as chat bubbles instead of raw terminal output.
 *
 * Migrated from apps/dashboard to Next.js App Router.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
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
import { Loader2, WifiOff, Wifi, Users, Bot, User, Send, GitBranch, CheckCircle, CheckCircle2, Circle, XCircle, ExternalLink, Brain } from 'lucide-react'
import type { SessionStatus } from '@gal/types'
import { isDatabaseConfigured } from '@/lib/firebase'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { ToolActivityMessage } from './ToolActivityMessage'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSessionRealtimeDatabase } from '@/lib/session-realtime'

/** Connection status badge shown in the top-right corner */
function ConnectionStatusBadge({ state, viewerCount }: { state: ConnectionState; viewerCount: number }) {
  const color = state.connected ? 'var(--status-success)' : state.error ? 'var(--status-danger)' : 'var(--status-warning)'
  return (
    <div
      className="absolute top-2 right-2 z-10 flex items-center gap-2 px-2 py-1 rounded text-xs"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        color,
      }}
    >
      {state.connecting ? (
        <>
          <Loader2 className="w-3 h-3 animate-spin" />
          Connecting...
        </>
      ) : state.connected ? (
        <>
          <Wifi className="w-3 h-3" />
          Connected
          {viewerCount > 1 && (
            <span className="flex items-center gap-1 ml-2" style={{ color: 'var(--text-muted)' }}>
              <Users className="w-3 h-3" />
              {viewerCount}
            </span>
          )}
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          {state.error || 'Disconnected'}
        </>
      )}
    </div>
  )
}

/** Icon for a workflow step status */
function WorkflowStepIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
  if (status === 'running') return <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--accent)' }} />
  if (status === 'failed') return <Circle className="w-3.5 h-3.5" style={{ color: 'var(--status-danger)' }} />
  return <Circle className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
}

interface FirebaseChatSessionProps {
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

interface WorkflowStep {
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed'
}

interface WorkflowStatus {
  command: string
  args?: string
  status: 'running' | 'completed' | 'failed'
  steps: WorkflowStep[]
  runId?: number
  runUrl?: string
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  workflow?: WorkflowStatus
  toolActivity?: ToolActivity[]
}

// Terminal output chunk from Firebase (raw/clean mode)
interface OutputChunk {
  data: string
  timestamp: number
  sequence: number
}

// Chat message chunk from Firebase (session-file mode)
interface ChatChunk {
  type: 'chat'
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  sequence: number
}

// Tool activity interface for UI display
interface ToolActivity {
  id: string
  name: string
  status: 'pending' | 'success' | 'error'
  summary: string
  input?: Record<string, unknown>
  result?: unknown
  error?: string
}

// Tool activity chunk from Firebase
interface ToolActivityChunk {
  type: 'tool_activity'
  tools: ToolActivity[]
  timestamp: number
  sequence: number
}

// Input chunk from Firebase
interface InputChunk {
  data: string
  userId: string
  userName?: string
  timestamp: number
}

// Strip ANSI escape codes from terminal output
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
}

// Parse terminal output into cleaner text
function parseTerminalOutput(data: string): string {
  let cleaned = stripAnsi(data)
  // Remove carriage returns and normalize line endings
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  // Trim excessive whitespace but preserve structure
  cleaned = cleaned.trim()
  return cleaned
}

// Create a handler for Firebase output snapshots - extracted to reduce cognitive complexity
function createOutputHandler(
  processedSequencesRef: React.MutableRefObject<Set<number>>,
  lastSequenceRef: React.MutableRefObject<number>,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  outputBufferRef: React.MutableRefObject<string>,
  flushTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  flushOutputBuffer: () => void,
) {
  return (snapshot: { val: () => OutputChunk | ChatChunk | ToolActivityChunk | null }) => {
    const chunk = snapshot.val()
    if (!chunk || !chunk.sequence) return

    if (processedSequencesRef.current.has(chunk.sequence)) return

    if (chunk.sequence > lastSequenceRef.current) {
      lastSequenceRef.current = chunk.sequence
      processedSequencesRef.current.add(chunk.sequence)
      processOutputChunk(chunk, setMessages, outputBufferRef, flushTimeoutRef, flushOutputBuffer)
    }
  }
}

// Process an output chunk by type - extracted to reduce cognitive complexity
function processOutputChunk(
  chunk: OutputChunk | ChatChunk | ToolActivityChunk,
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  outputBufferRef: React.MutableRefObject<string>,
  flushTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  flushOutputBuffer: () => void,
): void {
  if ('type' in chunk && chunk.type === 'tool_activity') {
    const activityChunk = chunk as ToolActivityChunk
    setMessages((prev) => {
      const existingIndex = prev.findIndex((m) => m.toolActivity !== undefined)
      if (existingIndex >= 0) {
        const updated = [...prev]
        updated[existingIndex] = {
          ...updated[existingIndex],
          toolActivity: activityChunk.tools,
          timestamp: new Date(activityChunk.timestamp || Date.now()),
        }
        return updated
      }
      return [
        ...prev,
        {
          id: `tool-activity-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          role: 'assistant' as const,
          content: '',
          toolActivity: activityChunk.tools,
          timestamp: new Date(activityChunk.timestamp || Date.now()),
        },
      ]
    })
  } else if ('type' in chunk && chunk.type === 'chat') {
    const chatChunk = chunk as ChatChunk
    setMessages((prev) => [
      ...prev,
      {
        id: `${chatChunk.role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role: chatChunk.role,
        content: chatChunk.content,
        timestamp: new Date(chatChunk.timestamp || Date.now()),
      },
    ])
  } else if ('data' in chunk && chunk.data) {
    const outputChunk = chunk as OutputChunk
    outputBufferRef.current += outputChunk.data

    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current)
    }

    flushTimeoutRef.current = setTimeout(() => {
      flushOutputBuffer()
    }, 500)
  }
}

export function FirebaseChatSession({
  sessionId,
  onStatusChange,
}: FirebaseChatSessionProps) {
  const { user } = useAuth()
  const {
    database: sessionDatabase,
    isConnecting: isRealtimeConnecting,
    error: realtimeError,
    retry: retryRealtimeConnection,
  } = useSessionRealtimeDatabase(sessionId)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const connectionIdRef = useRef<string>(`${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const unsubscribesRef = useRef<Unsubscribe[]>([])
  const lastSequenceRef = useRef<number>(0)
  const outputBufferRef = useRef<string>('')
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const processedSequencesRef = useRef<Set<number>>(new Set())

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    connected: false,
    connecting: true,
    error: null,
  })
  const [viewers, setViewers] = useState<Viewer[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('PENDING')
  const [pendingStartTime] = useState<number>(Date.now())
  const [elapsedTime, setElapsedTime] = useState<number>(0)

  // Flush buffered output as a message
  const flushOutputBuffer = useCallback(() => {
    if (outputBufferRef.current.trim()) {
      const content = parseTerminalOutput(outputBufferRef.current)
      if (content) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            role: 'assistant',
            content,
            timestamp: new Date(),
          },
        ])
      }
      outputBufferRef.current = ''
    }
  }, [])

  // Set up Firebase listeners
  const setupFirebaseListeners = useCallback(() => {
    if (!sessionDatabase) return
    const db = sessionDatabase // capture for use in callbacks where TS can&apos;t narrow

    const outputRef = ref(db, `sessions/${sessionId}/output`)
    const inputRefPath = ref(db, `sessions/${sessionId}/input`)
    const presenceRef = ref(db, `sessions/${sessionId}/presence`)
    const statusRef = ref(db, `sessions/${sessionId}/metadata/status`)
    const connectedRef = ref(db, '.info/connected')

    // Add initial system message
    setMessages([
      {
        id: 'system-welcome',
        role: 'system',
        content: 'Connecting to background agent session...',
        timestamp: new Date(),
      },
    ])

    // Listen for connection state
    const connectedUnsub = onValue(connectedRef, (snapshot) => {
      if (snapshot.val() !== true) {
        setConnectionState((prev) => ({
          ...prev,
          connected: false,
          error: 'Disconnected from Firebase',
        }))
        return
      }

      setConnectionState({ connected: true, connecting: false, error: null })

      // Register presence (db is non-null as checked at function entry)
      const myPresenceRef = ref(
        db,
        `sessions/${sessionId}/presence/${connectionIdRef.current}`
      )

      set(myPresenceRef, {
        userId: user?.githubId || user?.id || 'anonymous',
        userName: user?.name || user?.email,
        connectedAt: serverTimestamp(),
      })

      onDisconnect(myPresenceRef).remove()

      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== 'system-welcome')
        return [
          ...filtered,
          {
            id: 'system-connected',
            role: 'system',
            content: 'Connected to Firebase. Waiting for agent output...',
            timestamp: new Date(),
          },
        ]
      })
    })
    unsubscribesRef.current.push(connectedUnsub)

    // Listen for status changes
    const statusMessages: Record<string, string> = {
      PENDING: 'Waiting for runner to pick up session...',
      INITIALIZING: 'Runner is initializing the agent...',
      ACTIVE: 'Agent is now active and ready.',
      DISCONNECTED: 'Runner disconnected - attempting reconnect...',
      TERMINATED: 'Session has been terminated.',
      FAILED: 'Session failed to start.',
    }
    const statusUnsub = onValue(statusRef, (snapshot) => {
      const status = snapshot.val() as SessionStatus
      if (!status) return

      const prevStatus = sessionStatus
      setSessionStatus(status)
      onStatusChange?.(status)

      // Only add status message if status actually changed
      const message = prevStatus !== status ? statusMessages[status] : undefined
      if (message) {
        setMessages((prev) => [
          ...prev,
          {
            id: `status-${status}-${Date.now()}`,
            role: 'system',
            content: message,
            timestamp: new Date(),
          },
        ])
      }
    })
    unsubscribesRef.current.push(statusUnsub)

    // Listen for output (ordered by sequence, capped to last 500 entries to reduce
    // initial RTDB bandwidth — #4002). New entries arriving after subscription
    // are still delivered in real-time via onChildAdded.
    const outputQuery = query(outputRef, orderByChild('sequence'), limitToLast(500))
    const handleOutputSnapshot = createOutputHandler(
      processedSequencesRef, lastSequenceRef, setMessages, outputBufferRef, flushTimeoutRef, flushOutputBuffer,
    )
    const outputUnsub = onChildAdded(outputQuery, handleOutputSnapshot)
    unsubscribesRef.current.push(outputUnsub)

    // Listen for input from other users (to show in chat)
    const inputQuery = query(inputRefPath, orderByChild('timestamp'))
    const inputUnsub = onChildAdded(inputQuery, (snapshot) => {
      const inputChunk = snapshot.val() as InputChunk
      if (inputChunk && inputChunk.userId !== (user?.githubId || user?.id || 'anonymous')) {
        // Show input from other users
        setMessages((prev) => [
          ...prev,
          {
            id: `user-other-${snapshot.key}`,
            role: 'user',
            content: `[${inputChunk.userName || 'User'}]: ${inputChunk.data}`,
            timestamp: new Date(inputChunk.timestamp),
          },
        ])
      }
    })
    unsubscribesRef.current.push(inputUnsub)

    // Listen for presence changes
    const presenceUnsub = onValue(presenceRef, (snapshot) => {
      const viewerList: Viewer[] = []
      snapshot.forEach((child) => {
        viewerList.push(child.val() as Viewer)
      })
      setViewers(viewerList)
    })
    unsubscribesRef.current.push(presenceUnsub)

    console.log('[Chat] Firebase listeners set up for session:', sessionId)
  }, [flushOutputBuffer, onStatusChange, sessionDatabase, sessionId, sessionStatus, user])

  // Resume a terminated session via API
  const resumeSession = useCallback(
    async (prompt: string) => {
      if (!user || !prompt.trim()) return

      setIsSending(true)
      try {
        // Add user message to chat immediately
        setMessages((prev) => [
          ...prev,
          {
            id: `user-${Date.now()}`,
            role: 'user',
            content: prompt.trim(),
            timestamp: new Date(),
          },
          {
            id: `system-${Date.now()}`,
            role: 'system',
            content: 'Resuming session...',
            timestamp: new Date(),
          },
        ])

        // Call resume API
        const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions/${sessionId}/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: prompt.trim() }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.message || 'Failed to resume session')
        }

        const result = await response.json()
        console.log('[Chat] Session resume initiated:', result)

        setMessages((prev) => [
          ...prev,
          {
            id: `system-${Date.now()}`,
            role: 'system',
            content: 'Session resumed. Waiting for agent to connect...',
            timestamp: new Date(),
          },
        ])
      } catch (error) {
        console.error('[Chat] Failed to resume session:', error)
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'system',
            content: `Failed to resume session: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamp: new Date(),
          },
        ])
      } finally {
        setIsSending(false)
      }
    },
    [sessionId, user]
  )

  // Send input to Firebase
  const sendInput = useCallback(
    async (data: string) => {
      if (!data.trim()) return

      setIsSending(true)
      try {
        // Add user message to chat immediately
        setMessages((prev) => [
          ...prev,
          {
            id: `user-${Date.now()}`,
            role: 'user',
            content: data.trim(),
            timestamp: new Date(),
          },
        ])

        const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions/${sessionId}/input`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: data + '\n',
          }),
        })

        if (!response.ok) {
          throw new Error('Failed to send session input')
        }
      } catch (error) {
        console.error('[Chat] Failed to send input:', error)
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'system',
            content: 'Failed to send message. Please try again.',
            timestamp: new Date(),
          },
        ])
      } finally {
        setIsSending(false)
      }
    },
    [sessionId, user]
  )

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

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || isSending) return

    // For TERMINATED or FAILED sessions, use resume flow
    if (sessionStatus === 'TERMINATED' || sessionStatus === 'FAILED') {
      resumeSession(inputValue)
      setInputValue('')
      return
    }

    sendInput(inputValue)
    setInputValue('')
  }

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  // Initialize Firebase listeners
  useEffect(() => {
    if (!sessionDatabase) return

    console.log('[Chat] Initializing Firebase chat for session:', sessionId)
    setupFirebaseListeners()

    // Capture ref values at effect setup time for cleanup
    const processedSeqs = processedSequencesRef.current
    const connId = connectionIdRef.current
    const flushTimeout = flushTimeoutRef.current

    return () => {
      console.log('[Chat] Cleanup for session:', sessionId)

      // Clear flush timeout (captured at setup time)
      if (flushTimeout) {
        clearTimeout(flushTimeout)
      }

      // Unsubscribe from all Firebase listeners
      for (const unsub of unsubscribesRef.current) {
        unsub()
      }
      unsubscribesRef.current = []

      // Clear processed sequences to allow re-subscription on remount
      processedSeqs.clear()

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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Listener lifecycle is scoped to the authorized session DB.
  }, [sessionDatabase, sessionId])

  // Track elapsed time for PENDING/INITIALIZING states
  useEffect(() => {
    if (sessionStatus !== 'PENDING' && sessionStatus !== 'INITIALIZING') {
      return
    }

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - pendingStartTime) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [sessionStatus, pendingStartTime])

  // Auto-scroll to bottom when new messages arrive
  // Only auto-scroll if user is near the bottom (within 150px)
  useEffect(() => {
    const container = messagesContainerRef.current
    const endRef = messagesEndRef.current
    if (container && endRef) {
      // Check if user is near the bottom (within 150px)
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150

      if (isNearBottom) {
        // Use requestAnimationFrame + small delay to ensure DOM has fully updated
        requestAnimationFrame(() => {
          setTimeout(() => {
            endRef.scrollIntoView({ behavior: 'smooth', block: 'end' })
          }, 50)
        })
      }
    }
  }, [messages])

  // Check if Firebase RTDB is configured (after all hooks)
  if (!isDatabaseConfigured) {
    return (
      <div className="flex items-center justify-center h-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <WifiOff className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--status-danger)' }} />
          <p style={{ color: 'var(--text-primary)' }}>Firebase Realtime Database not configured</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Set NEXT_PUBLIC_FIREBASE_DATABASE_URL in environment
          </p>
        </div>
      </div>
    )
  }

  if (!sessionDatabase) {
    return (
      <div className="flex items-center justify-center h-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          {realtimeError ? (
            <>
              <WifiOff className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--status-danger)' }} />
              <p style={{ color: 'var(--text-primary)' }}>{realtimeError}</p>
              <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
                Could not connect to session stream
              </p>
              {isRealtimeConnecting ? (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Retrying...</span>
                </div>
              ) : (
                <button
                  onClick={() => retryRealtimeConnection()}
                  className="mt-4 px-4 py-2 rounded-lg text-sm transition-colors"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--text-on-accent)',
                  }}
                >
                  Retry Connection
                </button>
              )}
            </>
          ) : (
            <>
              <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: 'var(--accent)' }} />
              <p style={{ color: 'var(--text-primary)' }}>Connecting to session stream...</p>
            </>
          )}
        </div>
      </div>
    )
  }

  // Both FAILED and TERMINATED sessions can be resumed (API allows FAILED -> PENDING since PR #2512)
  const isSessionFailed = sessionStatus === 'FAILED'
  const isSessionTerminated = sessionStatus === 'TERMINATED'

  // Format elapsed time as MM:SS
  const formatElapsedTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Determine if we should show timeout warning (>2 minutes for PENDING, >1 minute for INITIALIZING)
  const showTimeoutWarning =
    (sessionStatus === 'PENDING' && elapsedTime > 120) ||
    (sessionStatus === 'INITIALIZING' && elapsedTime > 60)

  return (
    <div className="relative h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Connection status indicator */}
      <ConnectionStatusBadge state={connectionState} viewerCount={viewers.length} />

      {/* Progress indicator for PENDING/INITIALIZING states */}
      {(sessionStatus === 'PENDING' || sessionStatus === 'INITIALIZING') && (
        <div
          className="absolute top-14 left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center gap-2 px-4 py-3 rounded-lg max-w-md"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {sessionStatus === 'PENDING' ? 'Waiting for runner...' : 'Initializing agent...'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>Elapsed: {formatElapsedTime(elapsedTime)}</span>
            {showTimeoutWarning && (
              <>
                <span>&bull;</span>
                <span style={{ color: 'var(--status-warning)' }}>Taking longer than usual...</span>
              </>
            )}
          </div>
          <div className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
            {sessionStatus === 'PENDING'
              ? 'GitHub Actions is dispatching the workflow. This usually takes 10-30 seconds.'
              : 'Setting up the agent environment. This can take up to 60 seconds.'}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Empty state for failed/terminated sessions (Issue #1917) */}
        {messages.length === 0 && (sessionStatus === 'FAILED' || sessionStatus === 'TERMINATED') && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              {sessionStatus === 'FAILED' ? (
                <XCircle className="w-8 h-8" style={{ color: 'var(--status-danger)' }} />
              ) : (
                <CheckCircle className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
              )}
            </div>
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              {sessionStatus === 'FAILED' ? 'Session Failed' : 'Session Terminated'}
            </h3>
            <p className="text-sm max-w-md" style={{ color: 'var(--text-muted)' }}>
              {sessionStatus === 'FAILED'
                ? 'This session encountered an error and could not complete. You can retry it by entering a message below.'
                : 'This session has been terminated. You can resume it by entering a new message below.'}
            </p>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {/* Assistant/System avatar */}
            {message.role !== 'user' && (
              <div
                className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                style={{
                  backgroundColor: message.role === 'system' ? 'var(--bg-tertiary)' : 'var(--accent-bg)',
                }}
              >
                <Bot
                  className="w-4 h-4"
                  style={{ color: message.role === 'system' ? 'var(--text-muted)' : 'var(--accent)' }}
                />
              </div>
            )}

            {/* Message bubble */}
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 ${
                message.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'
              }`}
              style={{
                backgroundColor:
                  message.role === 'user'
                    ? 'var(--accent)'
                    : message.role === 'system'
                    ? 'var(--bg-tertiary)'
                    : 'var(--bg-card)',
                color: message.role === 'user' ? 'var(--text-on-accent)' : 'var(--text-primary)',
                border: message.role !== 'user' ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              {/* Workflow Execution UI */}
              {message.workflow && (
                <div className="space-y-3">
                  {/* Workflow Header */}
                  <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <GitBranch className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    <span className="font-medium text-sm">Workflow Execution</span>
                    {message.workflow.status === 'running' && (
                      <Loader2 className="w-3 h-3 animate-spin ml-auto" style={{ color: 'var(--accent)' }} />
                    )}
                    {message.workflow.status === 'completed' && (
                      <CheckCircle className="w-4 h-4 ml-auto" style={{ color: 'var(--text-secondary)' }} />
                    )}
                    {message.workflow.status === 'failed' && (
                      <XCircle className="w-4 h-4 ml-auto" style={{ color: 'var(--status-danger)' }} />
                    )}
                  </div>

                  {/* Command & Args Info */}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Command:</span>
                      <code
                        className="text-xs px-2 py-0.5 rounded"
                        style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent)' }}
                      >
                        {message.workflow.command}
                      </code>
                    </div>
                    {message.workflow.args && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Args:</span>
                        <code
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                        >
                          {message.workflow.args}
                        </code>
                      </div>
                    )}
                  </div>

                  {/* Workflow Steps */}
                  {message.workflow.steps.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {message.workflow.steps.map((step, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <WorkflowStepIcon status={step.status} />
                          <span
                            className="text-xs"
                            style={{
                              color: step.status === 'completed' ? 'var(--text-primary)' :
                                     step.status === 'failed' ? 'var(--status-danger)' : 'var(--text-muted)',
                            }}
                          >
                            {step.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Completion Message & Workflow Link */}
                  {(message.content || message.workflow.runUrl) && (
                    <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
                      {message.content && (
                        <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                      )}
                      {message.workflow.runUrl && (
                        <a
                          href={message.workflow.runUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors"
                          style={{
                            backgroundColor: 'var(--bg-tertiary)',
                            color: 'var(--accent)',
                          }}
                        >
                          <ExternalLink className="w-3 h-3" />
                          View workflow on GitHub
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Tool Activity Display */}
              {message.toolActivity && message.toolActivity.length > 0 && (
                <ToolActivityMessage tools={message.toolActivity} timestamp={message.timestamp} />
              )}

              {/* Regular Message Content */}
              {!message.workflow && !message.toolActivity && message.content && (
                <div className="text-sm prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}

              <p
                className="text-xs mt-2 opacity-60"
                style={{ color: message.role === 'user' ? 'var(--text-on-accent)' : 'var(--text-muted)' }}
              >
                {message.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>

            {/* User avatar */}
            {message.role === 'user' && (
              <div
                className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                style={{ backgroundColor: 'var(--bg-tertiary)' }}
              >
                <User className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </div>
            )}
          </div>
        ))}

        {/* Thinking indicator when there are pending tools OR when sending (Issue #1914) */}
        {(messages.some((m) => m.toolActivity?.some((t) => t.status === 'pending')) || isSending) && (
          <div className="flex items-start gap-3 px-4 py-2">
            <div
              className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-bg)' }}
            >
              <Brain className="w-4 h-4 animate-pulse" style={{ color: 'var(--accent)' }} />
            </div>
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-xl rounded-bl-sm"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {isSending ? 'Sending...' : 'Working on it'}
              </span>
              <div className="flex items-center gap-0.5">
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent)', animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent)', animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent)', animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Session expired warning */}
      {!user && (
        <div className="px-4 py-2 text-xs text-[var(--status-warning)] bg-[var(--status-warning-light)] border-t border-[var(--status-warning)]/20">
          Dashboard session expired &mdash; replies still work. Refresh page to restore full access.
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <div
            className="flex-1 flex items-end gap-3 p-3 rounded-xl"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isSessionFailed
                  ? 'Type a message to retry this session...'
                  : isSessionTerminated
                  ? 'Continue the conversation...'
                  : 'Type a message...'
              }
              rows={1}
              disabled={isSending}
              className="flex-1 resize-none bg-transparent outline-none text-sm placeholder:text-[var(--text-tertiary)]"
              style={{
                color: 'var(--text-primary)',
                minHeight: '24px',
                maxHeight: '120px',
              }}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isSending}
              className="p-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: inputValue.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: inputValue.trim() ? 'var(--text-on-accent)' : 'var(--text-muted)',
              }}
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </form>
        <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

export default FirebaseChatSession
