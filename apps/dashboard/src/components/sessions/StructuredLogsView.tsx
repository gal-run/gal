'use client'

/**
 * StructuredLogsView Component (GAL-571)
 *
 * Jules-style chat interface for background agent sessions.
 * Features tool execution blocks, thinking animations, and markdown rendering.
 *
 * Features:
 * - User and assistant message bubbles with avatars
 * - Collapsible tool execution blocks (bash, Read, Write, etc.)
 * - Thinking animations with spinner
 * - Markdown rendering for Claude responses
 * - Auto-scroll to latest message
 * - Input field for sending messages
 * - Session header with repo/branch info
 * - Inline diffs for Edit/Write operations
 * - Git info display for commits
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  ref,
  onValue,
  onChildAdded,
  query,
  orderByChild,
  limitToLast,
  type Unsubscribe,
} from 'firebase/database'
import {
  Loader2,
  User,
  Bot,
  Brain,
  Send,
  ChevronDown,
  ChevronRight,
  Terminal,
  Folder,
  GitBranch,
  MonitorPlay,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import { database } from '@/lib/firebase'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'
import { useAuth } from '@/contexts/AuthContext'
import type { SessionAgent, SessionStatus } from '@gal/types'
import { SESSION_AGENTS } from '@gal/types'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ToolActivityMessage, type ToolActivity } from './ToolActivityMessage'
import { useSessionRealtimeDatabase } from '@/lib/session-realtime'
import { useSessionStream } from '@/hooks/useSessionStream'

const DEMO_SESSION_MESSAGES: Record<string, OutputMessage[]> = {
  'session-1': [
    { type: 'chat', role: 'user', content: 'Implement user authentication flow with JWT tokens and refresh token rotation.', timestamp: 1741597200000, sequence: 1 },
    { type: 'chat', role: 'assistant', content: 'I\'ll implement the user authentication flow with JWT tokens and refresh token rotation. Let me start by reviewing the existing code structure.', timestamp: 1741597205000, sequence: 2 },
    { type: 'tool_activity', tools: [{ id: 'ta-1', name: 'Glob', summary: 'src/auth/**/*.ts', status: 'success' }], timestamp: 1741597210000, sequence: 3 },
    { type: 'tool_activity', tools: [{ id: 'ta-2', name: 'Read', summary: 'src/auth/authService.ts', status: 'success' }], timestamp: 1741597215000, sequence: 4 },
    { type: 'chat', role: 'assistant', content: 'I\'ve reviewed the codebase. I\'ll implement:\n\n1. **JWT token generation** with 15-minute access tokens\n2. **Refresh token rotation** stored in httpOnly cookies\n3. **Token verification middleware**\n\nLet me implement these changes.', timestamp: 1741597220000, sequence: 5 },
    { type: 'tool_activity', tools: [{ id: 'ta-3', name: 'Write', summary: 'src/auth/tokenService.ts', status: 'success' }, { id: 'ta-4', name: 'Edit', summary: 'src/auth/authService.ts', status: 'success' }, { id: 'ta-5', name: 'Edit', summary: 'src/middleware/auth.ts', status: 'success' }], timestamp: 1741597235000, sequence: 6 },
    { type: 'chat', role: 'assistant', content: '**Authentication flow implemented successfully.**\n\n- `tokenService.ts` — JWT generation with RS256 signing\n- `authService.ts` — Login/logout with refresh token rotation\n- `auth.ts` middleware — Bearer token verification\n\nAll tests pass. The refresh token is rotated on each use to prevent replay attacks.', timestamp: 1741597240000, sequence: 7 },
  ],
  'session-2': [
    { type: 'chat', role: 'user', content: 'Fix the navigation bug where the sidebar collapses unexpectedly on mobile.', timestamp: 1741601400000, sequence: 1 },
    { type: 'chat', role: 'assistant', content: 'I\'ll investigate the sidebar collapse issue on mobile. Let me look at the navigation component.', timestamp: 1741601405000, sequence: 2 },
    { type: 'tool_activity', tools: [{ id: 'ta-1', name: 'Read', summary: 'src/components/Sidebar.tsx', status: 'success' }], timestamp: 1741601410000, sequence: 3 },
    { type: 'chat', role: 'assistant', content: 'Found the issue. The `useEffect` for window resize has a stale closure on the `isOpen` state. Let me fix it.', timestamp: 1741601415000, sequence: 4 },
    { type: 'tool_activity', tools: [{ id: 'ta-2', name: 'Edit', summary: 'src/components/Sidebar.tsx', status: 'success' }], timestamp: 1741601420000, sequence: 5 },
    { type: 'chat', role: 'assistant', content: '**Fix applied.** The `useEffect` now correctly uses `useCallback` to avoid stale closures. The sidebar will no longer collapse unexpectedly on resize.\n\n```typescript\nconst handleResize = useCallback(() => {\n  if (window.innerWidth < 768) setIsOpen(false)\n}, []) // no stale deps\n```\n\nTesting on mobile viewport now...', timestamp: 1741601425000, sequence: 6 },
  ],
  'default': [
    { type: 'chat', role: 'user', content: 'Review and improve code quality across the codebase.', timestamp: 1741590000000, sequence: 1 },
    { type: 'chat', role: 'assistant', content: 'I\'ll start with a systematic review of the codebase.', timestamp: 1741590005000, sequence: 2 },
    { type: 'tool_activity', tools: [{ id: 'ta-1', name: 'Glob', summary: 'src/**/*.ts', status: 'success' }], timestamp: 1741590010000, sequence: 3 },
    { type: 'chat', role: 'assistant', content: 'Code review complete. Found 3 areas for improvement:\n\n1. **Error handling** — Missing try/catch in async functions\n2. **Type safety** — 4 `any` types that can be narrowed\n3. **Performance** — 2 unnecessary re-renders in React components\n\nApplying fixes...', timestamp: 1741590015000, sequence: 4 },
    { type: 'chat', role: 'assistant', content: '**All fixes applied successfully.**', timestamp: 1741590020000, sequence: 5 },
  ],
}

/**
 * Get display name for a session agent.
 * Falls back to "Claude" for backwards compatibility.
 */
function getAgentDisplayName(agent?: SessionAgent): string {
  if (!agent) return 'Claude'
  const config = SESSION_AGENTS.find(a => a.id === agent)
  // Use shorter display names for chat UI
  switch (agent) {
    case 'claude': return 'Claude'
    case 'codex': return 'Codex'
    case 'gemini': return 'Gemini'
    case 'cursor-agent': return 'Cursor Agent'
    case 'copilot': return 'GitHub Copilot'
    default: return config?.displayName ?? 'Claude'
  }
}

interface StructuredLogsViewProps {
  sessionId: string
  onSwitchToTerminal?: () => void
  /** Agent type for this session (determines assistant name display) */
  agent?: SessionAgent
  /** Initial session status from parent (overridden by real-time RTDB updates) */
  sessionStatus?: string
  /** Callback when RTDB reports a status change */
  onStatusChange?: (status: SessionStatus) => void
  /** Whether the session is displayed in fullscreen mode (constrains max-width) */
  isFullscreen?: boolean
}

interface ToolExecution {
  id: string
  name: string
  input: Record<string, unknown>
  result?: string | unknown[]
}

export interface ChatMessage {
  type: 'chat'
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string | null
  tools?: ToolExecution[] | null
  timestamp: number
  sequence: number
}

export interface ToolActivityOutput {
  type: 'tool_activity'
  tools: ToolActivity[]
  timestamp: number
  sequence: number
}

/**
 * Explicit tool lifecycle start event (GAL-1867).
 *
 * Emitted by the runner when a tool call begins. Consumers can use this to
 * render an in-progress row immediately. The toolUseId links this event to the
 * corresponding tool_finish event. Existing tool_activity consumers are
 * unaffected -- both event types are emitted for compatibility.
 */
export interface ToolStartOutput {
  type: 'tool_start'
  toolUseId: string
  toolName: string
  summary: string
  input?: Record<string, unknown>
  timestamp: number
  sequence: number
}

/**
 * Explicit tool lifecycle finish event (GAL-1867).
 *
 * Emitted by the runner when a tool call completes. Consumers MUST match
 * this against the preceding tool_start by toolUseId and update the existing
 * row status rather than creating a new timeline entry (prevents duplicates).
 */
export interface ToolFinishOutput {
  type: 'tool_finish'
  toolUseId: string
  status: 'success' | 'error'
  result?: unknown
  error?: string
  timestamp: number
  sequence: number
}

export type OutputMessage = ChatMessage | ToolActivityOutput | ToolStartOutput | ToolFinishOutput

export type MessageGroup =
  | { type: 'chat'; message: ChatMessage }
  | { type: 'tool_group'; tools: ToolActivity[]; count: number; timestamp: number }

interface AgentStatus {
  status: 'thinking' | 'tool_use' | 'idle'
  detail?: string | null
  timestamp: number
}

interface SessionMetadata {
  projectContext?: string
  agentStatus?: AgentStatus
  status?: string
  repositoryUrl?: string
  branchName?: string
  commandExpansion?: {
    attempted?: boolean
    expanded?: boolean
    command?: string | null
    error?: string | null
  }
  expansionError?: string
  preflight?: {
    rejectionReason?: string
  }
  dispatchReadiness?: {
    failure?: {
      message?: string
    }
  }
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer"
               className="text-[var(--status-success)] hover:underline">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="border-collapse border border-[var(--border-subtle)] text-sm">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-[var(--border-subtle)] px-3 py-1 bg-[var(--surface-raised)]">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border border-[var(--border-subtle)] px-3 py-1">{children}</td>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = className?.includes('language-')
            if (isBlock) {
              return <code className={`${className} text-sm`} {...props}>{children}</code>
            }
            return <code className="bg-[var(--surface-raised)] px-1.5 py-0.5 rounded text-sm" {...props}>{children}</code>
          },
          pre: ({ children }) => (
            <pre className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg p-4 overflow-x-auto my-3">
              {children}
            </pre>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}


// ========================================
// Pure Functions (Exported for Testing)
// ========================================

export function groupMessages(messages: OutputMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = []

  // Track in-progress tools keyed by toolUseId for lifecycle events (GAL-1867).
  // tool_start creates an entry; tool_finish updates it in-place so no duplicate
  // row appears in the timeline.
  const liveToolsByUseId = new Map<string, ToolActivity>()
  // Index of the tool_group entry in `groups` that a live tool belongs to, so
  // we can update it without scanning the whole groups array.
  const toolGroupIndexByUseId = new Map<string, number>()

  for (const msg of messages) {
    if (msg.type === 'tool_start') {
      // Create a pending ToolActivity row for this tool call (GAL-1867).
      const activity: ToolActivity = {
        id: msg.toolUseId,
        name: msg.toolName,
        status: 'pending',
        summary: msg.summary,
        input: msg.input,
      }
      liveToolsByUseId.set(msg.toolUseId, activity)
      const groupIdx = groups.length
      toolGroupIndexByUseId.set(msg.toolUseId, groupIdx)
      groups.push({
        type: 'tool_group',
        tools: [activity],
        count: 1,
        timestamp: msg.timestamp,
      })
    } else if (msg.type === 'tool_finish') {
      // Update the existing tool_group entry in-place -- no new row (GAL-1867).
      const activity = liveToolsByUseId.get(msg.toolUseId)
      if (activity) {
        activity.status = msg.status
        activity.result = msg.result
        activity.error = msg.error
        liveToolsByUseId.delete(msg.toolUseId)
        toolGroupIndexByUseId.delete(msg.toolUseId)
      }
      // If no matching tool_start was seen (e.g. message loaded from RTDB
      // without its pair), silently ignore -- tool_activity provides the full
      // snapshot so the UI stays consistent.
    } else if (msg.type === 'tool_activity') {
      // Check if lifecycle events are already tracking these tools (GAL-1867).
      // If so, skip the tool_activity snapshot to avoid duplicate timeline rows --
      // the live tool_group row created by tool_start already reflects the state.
      const hasLifecycleEvents = msg.tools.some(
        (t) => liveToolsByUseId.has(t.id) || toolGroupIndexByUseId.has(t.id),
      )
      if (hasLifecycleEvents) {
        // Lifecycle events are present -- skip this tool_activity snapshot.
        // The live tool_group row already reflects the latest state.
      } else {
        // Legacy path: no lifecycle events for these tools.
        // Apply GAL-1865 deduplication: collapse consecutive status-only updates
        // (same tool IDs and count) to prevent duplicate timeline rows.
        const last = groups[groups.length - 1]
        if (
          last &&
          last.type === 'tool_group' &&
          last.count === msg.tools.length &&
          last.tools.length === msg.tools.length &&
          last.tools.every((t, i) => t.id === msg.tools[i]?.id)
        ) {
          // Replace the last group in-place with updated tool statuses
          groups[groups.length - 1] = {
            type: 'tool_group',
            tools: msg.tools,
            count: msg.tools.length,
            timestamp: msg.timestamp,
          }
        } else {
          groups.push({ type: 'tool_group', tools: msg.tools, count: msg.tools.length, timestamp: msg.timestamp })
        }
      }
    } else {
      groups.push({ type: 'chat', message: msg })
    }
  }
  return groups
}

export function countDiffChanges(oldStr: string, newStr: string): { added: number; removed: number } {
  if (!oldStr && !newStr) return { added: 0, removed: 0 }
  const oldLines = oldStr ? oldStr.split('\n') : []
  const newLines = newStr ? newStr.split('\n') : []

  // Simple line-level diff: compare lines
  const oldSet = new Set(oldLines)
  const newSet = new Set(newLines)

  let removed = 0
  for (const line of oldLines) {
    if (!newSet.has(line)) removed++
  }

  let added = 0
  for (const line of newLines) {
    if (!oldSet.has(line)) added++
  }

  return { added, removed }
}

export function getToolGroupLabel(tools: ToolActivity[]): string {
  const count = tools.length
  const isAllWeb = count > 0 && tools.every(t => {
    const name = t.name.toLowerCase()
    return name === 'webfetch' || name === 'websearch'
  })

  if (isAllWeb) {
    return `Fetched ${count} URL${count === 1 ? '' : 's'}`
  }
  return `Ran ${count} command${count === 1 ? '' : 's'}`
}

// ========================================
// Tool Group Block Component
// ========================================

/**
 * Collapsed/expandable tool group row in the session timeline (GAL-1459).
 *
 * Collapsed state: shows a summary line ("Ran 3 commands") with a chevron.
 * Expanded state: renders individual tools using the compact tree-line style
 *   so the user can see exactly which tools ran without a heavy card header.
 */
function ToolGroupBlock({ tools, timestamp }: { tools: ToolActivity[]; timestamp: number }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const label = getToolGroupLabel(tools)

  return (
    <div className="px-4 py-1">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors py-1"
        aria-expanded={isExpanded}
        aria-label={`${label} -- click to ${isExpanded ? 'collapse' : 'expand'}`}
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
        <span className="font-medium">{label}</span>
        <span className="text-[var(--text-tertiary)]">
          {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </button>
      {isExpanded && (
        <div className="ml-5 mt-1">
          {/* Use compact tree-line style for the expanded tool list (GAL-1459) */}
          <ToolActivityMessage
            tools={tools}
            timestamp={new Date(timestamp)}
            compact
          />
        </div>
      )}
    </div>
  )
}

// Session header with repo/branch info
function SessionHeader({ metadata }: { metadata: SessionMetadata | null }) {
  if (!metadata || !metadata.projectContext) return null

  // Extract repo name from project path
  const projectPath = metadata.projectContext
  const pathParts = projectPath.split('/')
  const repoName = pathParts[pathParts.length - 1] || 'Unknown Repository'
  const branchName = metadata.branchName || 'main'

  return (
    <div className="px-4 py-3 bg-[var(--surface-raised)] border-b border-[var(--border-subtle)]">
      <div className="flex items-center gap-4 text-sm">
        {/* Repository */}
        <div className="flex items-center gap-2">
          <Folder className="w-4 h-4 text-[var(--text-secondary)]" />
          <span className="text-[var(--text-secondary)]">Repository:</span>
          <code className="text-[var(--status-success)] font-mono">{repoName}</code>
        </div>

        {/* Branch */}
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-[var(--text-secondary)]" />
          <span className="text-[var(--text-secondary)]">Branch:</span>
          <code className="text-[var(--brand-gemini)] font-mono">{branchName}</code>
        </div>

        {/* Working Directory */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Terminal className="w-4 h-4 text-[var(--text-secondary)]" />
          <span className="text-[var(--text-secondary)]">Path:</span>
          <code className="text-[var(--text-tertiary)] font-mono text-xs truncate">{projectPath}</code>
        </div>
      </div>
    </div>
  )
}

export function StructuredLogsView({ sessionId, onSwitchToTerminal, agent, sessionStatus: initialSessionStatus, onStatusChange, isFullscreen }: StructuredLogsViewProps) {
  const { user } = useAuth()
  const { database: sessionDatabase, error: realtimeError } = useSessionRealtimeDatabase(sessionId)
  const [messages, setMessages] = useState<OutputMessage[]>([])
  const [metadata, setMetadata] = useState<SessionMetadata | null>(null)
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)
  // Track real-time session status from RTDB, falling back to parent prop
  const [liveSessionStatus, setLiveSessionStatus] = useState<SessionStatus | string | undefined>(initialSessionStatus)
  const [inputValue, setInputValue] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [isResuming, setIsResuming] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const unsubscribesRef = useRef<Unsubscribe[]>([])
  const lastSequenceRef = useRef<number>(0)
  // Ref to avoid stale closure in Firebase listener
  const onStatusChangeRef = useRef(onStatusChange)
  onStatusChangeRef.current = onStatusChange

  // Group consecutive tool_activity messages
  const groupedMessages = useMemo(() => groupMessages(messages), [messages])

  useEffect(() => {
    if (realtimeError) {
      setSendError(realtimeError)
    }
  }, [realtimeError])

  // Helper to format tool summary for ToolActivityMessage
  const formatToolSummary = (tool: ToolExecution): string => {
    if (tool.name === 'Bash') return (tool.input['command'] as string) || ''
    if (tool.name === 'Read') return (tool.input['file_path'] as string) || ''
    if (tool.name === 'Write' || tool.name === 'Edit') return (tool.input['file_path'] as string) || ''
    return JSON.stringify(tool.input, null, 2)
  }

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback((force = false) => {
    if ((isAtBottom || force) && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [isAtBottom])

  // Normalize a raw message payload (from RTDB or NATS/SSE) into a typed
  // OutputMessage. Both transports carry the same shape since the runner
  // publishes to both. Returns null if the payload is invalid or stale (#6568).
  const ingestMessage = useCallback((raw: Record<string, unknown> | null) => {
    if (!raw || typeof raw['sequence'] !== 'number') return
    if (raw['sequence'] <= lastSequenceRef.current) return
    lastSequenceRef.current = raw['sequence'] as number

    // Firebase RTDB may return arrays as sparse objects; normalize to array.
    // NATS JSON payloads are proper arrays, but running the helper on both is
    // cheap and keeps the code path identical.
    const normalizeArray = <T,>(val: unknown): T[] => {
      if (Array.isArray(val)) return val as T[]
      if (val && typeof val === 'object') return Object.values(val) as T[]
      return []
    }

    if (raw['type'] === 'tool_activity') {
      const toolMsg: ToolActivityOutput = {
        type: 'tool_activity',
        tools: normalizeArray<ToolActivity>(raw['tools']),
        timestamp: raw['timestamp'] as number,
        sequence: raw['sequence'] as number,
      }
      setMessages((prev) => [...prev, toolMsg])
    } else if (raw['type'] === 'tool_start') {
      const startMsg: ToolStartOutput = {
        type: 'tool_start',
        toolUseId: (raw['toolUseId'] as string) || '',
        toolName: (raw['toolName'] as string) || '',
        summary: (raw['summary'] as string) || '',
        input: raw['input'] as Record<string, unknown> | undefined,
        timestamp: raw['timestamp'] as number,
        sequence: raw['sequence'] as number,
      }
      setMessages((prev) => [...prev, startMsg])
    } else if (raw['type'] === 'tool_finish') {
      const finishMsg: ToolFinishOutput = {
        type: 'tool_finish',
        toolUseId: (raw['toolUseId'] as string) || '',
        status: (raw['status'] as 'success' | 'error') || 'success',
        result: raw['result'],
        error: raw['error'] as string | undefined,
        timestamp: raw['timestamp'] as number,
        sequence: raw['sequence'] as number,
      }
      setMessages((prev) => [...prev, finishMsg])
    } else {
      const rawTools = raw['tools'] != null ? normalizeArray<ToolExecution>(raw['tools']) : null
      const chatMsg: ChatMessage = {
        type: 'chat',
        role: (raw['role'] as ChatMessage['role']) || 'assistant',
        content: (raw['content'] as string) || '',
        thinking: (raw['thinking'] as string) ?? null,
        tools: rawTools,
        timestamp: raw['timestamp'] as number,
        sequence: raw['sequence'] as number,
      }
      setMessages((prev) => [...prev, chatMsg])
    }
    setTimeout(() => scrollToBottom(), 100)
  }, [scrollToBottom])

  // Ref so RTDB listener + SSE handlers reach the same ingest path without
  // re-subscribing when `ingestMessage` identity changes.
  const ingestMessageRef = useRef(ingestMessage)
  ingestMessageRef.current = ingestMessage

  // Live-tail via NATS-backed SSE (#6568). RTDB listener below remains in
  // place as a fallback; sequence-based dedup prevents duplicate renders.
  useSessionStream(isDemoMode() ? null : sessionId, {
    onConnected: ({ bufferedMessages }) => {
      for (const msg of bufferedMessages) {
        ingestMessageRef.current(msg)
      }
    },
    onMessage: ({ message }) => {
      ingestMessageRef.current(message)
    },
    onStatusChange: ({ status }) => {
      const upper = status.toUpperCase() as SessionStatus
      setLiveSessionStatus(upper)
      onStatusChangeRef.current?.(upper)
    },
  })

  // Track scroll position
  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
      const atBottom = scrollHeight - scrollTop - clientHeight < 50
      setIsAtBottom(atBottom)
    }
  }, [])

  // Demo mode: populate messages from hardcoded demo data, skip Firebase
  useEffect(() => {
    if (!isDemoMode()) return
    const demoMessages = DEMO_SESSION_MESSAGES[sessionId] ?? DEMO_SESSION_MESSAGES['default']
    setMessages(demoMessages)
    setMetadata({
      projectContext: 'acme-corp/web-app',
      branchName: 'main',
    })
    setLiveSessionStatus('completed')
  }, [sessionId])

  // Set up Firebase listeners
  useEffect(() => {
    if (isDemoMode()) return
    if (!sessionDatabase) return

    const messagesRef = ref(sessionDatabase, `sessions/${sessionId}/output`) // SDK runner writes chat messages to 'output'
    const metadataRef = ref(sessionDatabase, `sessions/${sessionId}/metadata`)
    const statusRef = ref(sessionDatabase, `sessions/${sessionId}/metadata/agentStatus`)

    // Listen for metadata updates (repo, branch, project path)
    const metadataUnsub = onValue(metadataRef, (snapshot) => {
      const meta = snapshot.val() as SessionMetadata | null
      setMetadata(meta)
    })
    unsubscribesRef.current.push(metadataUnsub)

    // Listen for new messages (ordered by sequence, capped to last 500 entries to
    // reduce initial RTDB bandwidth — #4002). New entries still stream via onChildAdded.
    //
    // SSE delivers the same messages via useSessionStream below. Both paths feed
    // through ingestMessageRef.current, which dedupes by sequence — so whichever
    // transport arrives first "wins" and the other is dropped.
    const messagesQuery = query(messagesRef, orderByChild('sequence'), limitToLast(500))
    const messagesUnsub = onChildAdded(messagesQuery, (snapshot) => {
      ingestMessageRef.current(snapshot.val() as Record<string, unknown> | null)
    })
    unsubscribesRef.current.push(messagesUnsub)

    // Listen for agent status updates
    const statusUnsub = onValue(statusRef, (snapshot) => {
      const status = snapshot.val() as AgentStatus | null
      setAgentStatus(status)
    })
    unsubscribesRef.current.push(statusUnsub)

    // Listen for session lifecycle status (PENDING/ACTIVE/TERMINATED etc.)
    // This ensures the input handler uses the real-time status instead of the
    // stale prop from the parent, which fixes #2294 (input blocked after resume).
    const sessionStatusRef = ref(sessionDatabase, `sessions/${sessionId}/metadata/status`)
    const sessionStatusUnsub = onValue(sessionStatusRef, (snapshot) => {
      const status = snapshot.val() as SessionStatus | null
      if (status) {
        setLiveSessionStatus(status)
        onStatusChangeRef.current?.(status)
      }
    })
    unsubscribesRef.current.push(sessionStatusUnsub)

    return () => {
      for (const unsub of unsubscribesRef.current) {
        unsub()
      }
      unsubscribesRef.current = []
    }
  }, [scrollToBottom, sessionDatabase, sessionId])

  // Send user input
  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || isResuming) return

    // FAILED and TERMINATED sessions both use the resume API
    // (API allows FAILED -> PENDING transition since PR #2512)

    if (!user) {
      setSendError('Not authenticated')
      return
    }

    setSendError(null)

    // If session is TERMINATED or FAILED, call resume API instead of pushing to Firebase
    if (liveSessionStatus === 'TERMINATED' || liveSessionStatus === 'FAILED') {
      setIsResuming(true)
      try {
        // Add user&apos;s message immediately for instant feedback
        const userMessage: ChatMessage = {
          type: 'chat',
          role: 'user',
          content: inputValue.trim(),
          timestamp: Date.now(),
          sequence: lastSequenceRef.current + 1,
        }
        setMessages((prev) => [...prev, userMessage])
        lastSequenceRef.current += 1

        // Call resume API
        const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions/${sessionId}/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: inputValue.trim() }),
        })

        if (!response.ok) {
          const error = await response.json().catch(() => ({}))
          throw new Error(error.message || 'Failed to resume session')
        }

        // Add system message on success
        const systemMessage: ChatMessage = {
          type: 'chat',
          role: 'system',
          content: 'Session resumed. Waiting for agent to connect...',
          timestamp: Date.now(),
          sequence: lastSequenceRef.current + 1,
        }
        setMessages((prev) => [...prev, systemMessage])
        lastSequenceRef.current += 1

        setInputValue('')
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
        }
      } catch (err) {
        setSendError(err instanceof Error ? err.message : 'Failed to resume session')
      } finally {
        setIsResuming(false)
      }
      return
    }

    // Normal flow: send input via API endpoint instead of writing directly to Firebase
    // This fixes auth expiry issues since the API uses httpOnly cookies (#1648)
    try {
      const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions/${sessionId}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: inputValue.trim() }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Failed to send message')
      }

      setInputValue('')
      // Reset textarea height after clearing value
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send message')
    }
  }, [sessionId, user, inputValue, liveSessionStatus, isResuming])

  // Handle Enter key
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }, [sendMessage])

  // Render thinking indicator
  const renderThinkingIndicator = () => {
    if (!agentStatus || agentStatus.status === 'idle') return null

    return (
      <div className="flex items-start gap-3 px-4 py-3 animate-pulse">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--status-success-light)] flex items-center justify-center">
          {agentStatus.status === 'thinking' ? (
            <Brain className="w-4 h-4 text-[var(--status-success)]" />
          ) : (
            <Loader2 className="w-4 h-4 text-[var(--status-success)] animate-spin" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-[var(--status-success-text)]/80">
            {agentStatus.status === 'thinking' ? 'Thinking...' : 'Using tool...'}
          </div>
          {agentStatus.detail && (
            <div className="text-xs text-[var(--text-tertiary)] mt-1 truncate">
              {agentStatus.detail}
            </div>
          )}
          <div className="flex gap-1 mt-2">
            <div className="w-2 h-2 rounded-full bg-[var(--status-success)] animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-[var(--status-success)] animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-[var(--status-success)] animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    )
  }

  // Render a chat message (tool_activity messages are handled via ToolGroupBlock)
  const renderMessage = (message: ChatMessage, index: number) => {
    const isUser = message.role === 'user'
    const isSystem = message.role === 'system'

    return (
      <div
        key={`${message.sequence}-${index}`}
        className={`flex items-start gap-3 px-4 py-3 ${isUser ? 'justify-end' : ''}`}
      >
        {/* Avatar - before content for assistant, after for user */}
        {!isUser && (
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              isSystem
                ? 'bg-[var(--status-warning-light)]'
                : 'bg-[var(--status-success-light)]'
            }`}
          >
            <Bot className={`w-4 h-4 ${isSystem ? 'text-[var(--status-warning-text)]' : 'text-[var(--status-success)]'}`} />
          </div>
        )}

        {/* Content */}
        <div className={isUser ? 'max-w-[80%]' : 'flex-1 min-w-0'}>
          {/* Role label */}
          <div className={`text-xs font-medium mb-1 ${
            isUser ? 'text-[var(--status-info-text)]' : isSystem ? 'text-[var(--status-warning-text)]' : 'text-[var(--status-success)]'
          }`}>
            {isUser ? 'You' : isSystem ? 'System' : getAgentDisplayName(agent)}
          </div>

          {/* Thinking (if present) */}
          {message.thinking && (
            <div className="text-xs text-[var(--text-secondary)] italic mb-2 p-2 bg-[var(--surface-raised)] rounded border-l-2 border-[var(--brand-gemini-border)]">
              <Brain className="w-3 h-3 inline mr-1" />
              {message.thinking.slice(0, 200)}
              {message.thinking.length > 200 && '...'}
            </div>
          )}

          {/* Message content with markdown */}
          {message.content && (
            <div className={`text-sm text-[var(--text-primary)] ${isUser ? 'bg-[var(--status-success-light)] rounded-2xl rounded-br-sm px-4 py-2' : ''}`}>
              <MarkdownContent content={message.content} />
            </div>
          )}

          {/* Tool execution blocks - rendered using ToolActivityMessage */}
          {message.tools && message.tools.length > 0 && (
            <div className="mt-2">
              <ToolActivityMessage
                tools={message.tools.map((tool) => ({
                  id: tool.id,
                  name: tool.name,
                  status: tool.result !== undefined ? 'success' as const : 'pending' as const,
                  summary: formatToolSummary(tool),
                  input: tool.input,
                  result: tool.result,
                }))}
                timestamp={new Date(message.timestamp || 0)}
              />
            </div>
          )}
        </div>

        {/* User avatar - after content */}
        {isUser && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--status-info-light)] flex items-center justify-center">
            <User className="w-4 h-4 text-[var(--status-info-text)]" />
          </div>
        )}
      </div>
    )
  }

  // Determine session terminal state for UI display
  const isSessionFailed = liveSessionStatus === 'FAILED'
  const isSessionTerminated = liveSessionStatus === 'TERMINATED'
  const isSessionInactive = isSessionFailed || isSessionTerminated
  const commandExpansionMeta = metadata?.commandExpansion
  const commandExpansionWarning =
    commandExpansionMeta?.attempted &&
    commandExpansionMeta?.expanded === false &&
    (commandExpansionMeta.error || commandExpansionMeta.command)
      ? {
          command: commandExpansionMeta.command || 'command',
          error: commandExpansionMeta.error || 'Command was not expanded.',
        }
      : null
  const preflightWarning =
    metadata?.expansionError ||
    metadata?.preflight?.rejectionReason ||
    metadata?.dispatchReadiness?.failure?.message ||
    null

  return (
    <div className="h-full flex flex-col bg-[var(--surface-base)]">
      {/* Session Header */}
      <SessionHeader metadata={metadata} />

      {commandExpansionWarning && (
        <div
          className="flex items-start gap-2 px-4 py-3 text-xs border-b"
          style={{
            backgroundColor: 'var(--status-warning-light)',
            borderColor: 'var(--status-warning)',
            color: 'var(--status-warning-text)',
          }}
        >
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            [GAL] Command expansion failed for {commandExpansionWarning.command}: {commandExpansionWarning.error}
          </span>
        </div>
      )}

      {!commandExpansionWarning && preflightWarning && (
        <div
          className="flex items-start gap-2 px-4 py-3 text-xs border-b"
          style={{
            backgroundColor: 'var(--status-warning-light)',
            borderColor: 'var(--status-warning)',
            color: 'var(--status-warning-text)',
          }}
        >
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{preflightWarning}</span>
        </div>
      )}

      {/* Session status banner for failed/terminated sessions with existing messages */}
      {isSessionInactive && messages.length > 0 && (
        <div
          className="flex items-center gap-2 px-4 py-2 text-xs border-b"
          style={{
            backgroundColor: isSessionFailed ? 'var(--status-danger-light)' : 'var(--status-warning-light)',
            borderColor: isSessionFailed ? 'var(--status-danger)' : 'var(--status-warning)',
            color: isSessionFailed ? 'var(--status-danger)' : 'var(--status-warning)',
          }}
        >
          {isSessionFailed ? (
            <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          )}
          <span>
            {isSessionFailed
              ? 'This session failed. Type a message below to retry.'
              : 'This session has ended. Type a message below to resume.'}
          </span>
        </div>
      )}

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[var(--text-tertiary)]">
            {liveSessionStatus === 'FAILED' ? (
              <div className={`text-center px-4 ${isFullscreen ? 'max-w-md' : 'max-w-sm'}`}>
                <XCircle className={`mx-auto mb-4 text-[var(--status-error)] ${isFullscreen ? 'w-16 h-16' : 'w-12 h-12'}`} />
                <p className={`font-medium text-[var(--text-secondary)] ${isFullscreen ? 'text-lg' : ''}`}>Session Failed</p>
                <p className={`mt-2 ${isFullscreen ? 'text-sm' : 'text-xs'}`}>
                  This session encountered an error and could not complete. Type a message below to retry.
                </p>
              </div>
            ) : liveSessionStatus === 'TERMINATED' ? (
              <div className={`text-center px-4 ${isFullscreen ? 'max-w-md' : 'max-w-sm'}`}>
                <AlertTriangle className={`mx-auto mb-4 text-[var(--status-warning)] ${isFullscreen ? 'w-16 h-16' : 'w-12 h-12'}`} />
                <p className={`font-medium text-[var(--text-secondary)] ${isFullscreen ? 'text-lg' : ''}`}>Session Ended</p>
                <p className={`mt-2 ${isFullscreen ? 'text-sm' : 'text-xs'}`}>
                  This session was terminated before any messages were recorded.
                </p>
              </div>
            ) : (
              <div className="text-center">
                <Bot className={`mx-auto mb-4 text-[var(--status-success)]/30 ${isFullscreen ? 'w-16 h-16' : 'w-12 h-12'}`} />
                <p className={isFullscreen ? 'text-lg' : ''}>Waiting for agent activity...</p>
                <p className={`mt-2 ${isFullscreen ? 'text-sm' : 'text-xs'}`}>Messages will appear here</p>
              </div>
            )}
          </div>
        ) : (
          <div className={`py-4 ${isFullscreen ? 'max-w-3xl mx-auto w-full' : ''}`}>
            {groupedMessages.map((group, index) => {
              if (group.type === 'tool_group') {
                return <ToolGroupBlock key={`group-${index}`} tools={group.tools} timestamp={group.timestamp} />
              }
              return renderMessage(group.message, index)
            })}
            {renderThinkingIndicator()}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Scroll to bottom button */}
      {!isAtBottom && messages.length > 0 && (
        <button
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-28 right-4 p-2 rounded-full bg-[var(--status-success-light)] text-[var(--status-success)] hover:bg-[var(--status-success)]/30 transition-colors shadow-lg"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      )}

      {/* Input area */}
      <div className="border-t border-[var(--border-subtle)] p-4">
        <div
          className={`flex items-end gap-3 p-3 rounded-xl bg-[var(--surface-overlay)] border border-[var(--border-subtle)] focus-within:border-[var(--status-success)]/50 ${isFullscreen ? 'max-w-3xl mx-auto w-full' : ''}`}
        >
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              if (sendError) setSendError(null)
              // Auto-grow
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              isSessionFailed
                ? 'Type a message to retry this session...'
                : isSessionTerminated
                ? 'Continue the conversation to resume this session...'
                : 'Reply...'
            }
            rows={1}
            disabled={false}
            className="flex-1 resize-none bg-transparent outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] disabled:cursor-not-allowed disabled:opacity-60"
            style={{ minHeight: '24px', maxHeight: '120px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!inputValue.trim() || isResuming}
            className="p-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: inputValue.trim() && !isResuming ? 'var(--status-success)' : 'transparent',
              color: inputValue.trim() && !isResuming ? 'var(--text-on-accent)' : 'var(--text-tertiary)',
            }}
          >
            {isResuming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
          {onSwitchToTerminal && (
            <button
              onClick={onSwitchToTerminal}
              className="p-2 rounded-lg bg-[var(--brand-gemini-bg)] text-[var(--brand-gemini)] hover:bg-[var(--brand-gemini-bg)]/50 transition-colors"
              title="Open Terminal View"
            >
              <MonitorPlay className="w-5 h-5" />
            </button>
          )}
        </div>
        {sendError && (
          <p className={`text-xs text-[var(--status-danger-text)] mt-2 ${isFullscreen ? 'max-w-3xl mx-auto w-full' : ''}`}>{sendError}</p>
        )}
        <p className={`text-xs text-[var(--text-tertiary)] mt-2 ${isFullscreen ? 'max-w-3xl mx-auto w-full' : ''}`}>
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}

export default StructuredLogsView
