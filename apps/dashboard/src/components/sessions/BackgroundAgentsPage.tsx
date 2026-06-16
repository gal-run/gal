'use client'

/**
 * Background Agents Page (GAL-571)
 *
 * Dashboard page for managing background AI coding agent sessions.
 * Clean design inspired by Codex, Jules, and Claude web interfaces.
 * Split view: sessions list on left, selected session terminal on right.
 *
 * Migrated from apps/dashboard to Next.js App Router.
 */

import { useState, useEffect, useCallback, useMemo, useRef, type MutableRefObject } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import {
  Terminal,
  RefreshCw,
  AlertCircle,
  ArrowLeft,
  Square,
  Maximize2,
  Minimize2,
  Loader2,
  X,
  Send,
  ChevronDown,
  FolderGit2,
  ExternalLink,
  GitBranch,
  Clock,
  Play,
  Pause,
  CheckCircle,
  Pencil,
  Check,
  XCircle,
  Search,
  Layers,
} from 'lucide-react'
import { SessionList, NewSessionModal, SessionListSkeleton, AgentSelector, CommandSelectionModal, SessionView, TerminalErrorBoundary, ProviderCapacityBar, AgentSessionHeader, SessionActivityTimeline, ReviewPrompt } from '@/components/sessions'
import type { Session, ListSessionsResponse, SessionAgent } from '@gal/types'
import { DEFAULT_SESSION_AGENT } from '@gal/types'
import { api, type SlashCommand, type ApprovedConfigResponse } from '@/lib/api'
import { config as dashboardConfig } from '@/lib/config'
import { getUserFriendlyError, isNetworkError } from '@/lib/errors'
// INTERNAL_ORG_NAME removed (Issue #2637)
import { useAuth } from '@/contexts/AuthContext'
import { useSelectedWorkspace, useIsPersonalWorkspace } from '@/hooks/useSelectedWorkspace'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_SESSIONS, DEMO_ORG } from '@/lib/demo-data'
import { getSessionFailureDetails, getSessionMetadataWarning } from './background-agents-page-helpers'

// Repo type for selector (repos within current workspace)
interface Repo {
  name: string
  fullName: string
  hasConfigs?: boolean
}

// localStorage key for agent preference
const AGENT_STORAGE_KEY = 'gal:session:agent'

// Status config for session badges \u2014 mirrors SessionList STATUS_CONFIG for consistency
const SESSION_STATUS_CONFIG: Record<
  Session['status'],
  { icon: React.ElementType; color: string; bgColor: string; label: string; spin?: boolean }
> = {
  PENDING: {
    icon: Clock,
    color: 'var(--status-warning)',
    bgColor: 'var(--status-warning-light)',
    label: 'Pending',
  },
  INITIALIZING: {
    icon: Loader2,
    color: 'var(--status-info)',
    bgColor: 'var(--status-info-light)',
    label: 'Initializing',
    spin: true,
  },
  ACTIVE: {
    icon: Play,
    color: 'var(--status-success)',
    bgColor: 'var(--status-success-light)',
    label: 'Active',
  },
  DISCONNECTED: {
    icon: Pause,
    color: 'var(--status-warning)',
    bgColor: 'var(--status-warning-light)',
    label: 'Disconnected',
  },
  TERMINATED: {
    icon: CheckCircle,
    color: 'var(--badge-gray-text)',
    bgColor: 'var(--badge-gray-bg)',
    label: 'Terminated',
  },
  FAILED: {
    icon: XCircle,
    color: 'var(--status-danger)',
    bgColor: 'var(--status-danger-light)',
    label: 'Failed',
  },
}

function logBackgroundSessionFetchError(message: string, error: unknown): void {
  if (isNetworkError(error)) {
    console.debug(message, error)
    return
  }
  console.error(message, error)
}

// Session status badge component with optional workflow link
function SessionStatusBadge({ status, workflowRunId }: { status: Session['status']; workflowRunId?: number }) {
  const config = SESSION_STATUS_CONFIG[status] ?? {
    icon: Clock,
    color: 'var(--text-muted)',
    bgColor: 'var(--bg-tertiary)',
    label: status,
  }
  const Icon = config.icon

  const handleClick = (e: React.MouseEvent) => {
    if (workflowRunId && dashboardConfig.backgroundAgentGitHubRepo) {
      e.stopPropagation()
      window.open(
        `https://github.com/${dashboardConfig.backgroundAgentGitHubRepo}/actions/runs/${workflowRunId}`,
        '_blank'
      )
    }
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap shrink-0 ${
        workflowRunId && dashboardConfig.backgroundAgentGitHubRepo ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
      }`}
      style={{ backgroundColor: config.bgColor, color: config.color }}
      onClick={workflowRunId && dashboardConfig.backgroundAgentGitHubRepo ? handleClick : undefined}
      title={workflowRunId && dashboardConfig.backgroundAgentGitHubRepo ? 'View GitHub Actions workflow' : undefined}
    >
      <Icon className={`w-3 h-3 flex-shrink-0 ${config.spin ? 'animate-spin' : ''}`} />
      <span className="flex-shrink-0">{config.label}</span>
      {workflowRunId && dashboardConfig.backgroundAgentGitHubRepo && <ExternalLink className="w-3 h-3 ml-0.5 flex-shrink-0" />}
    </span>
  )
}

// Helper to extract category from command name (e.g., /sdlc:1-specify:run -> SDLC)
function getCategoryFromCommandName(name: string): string {
  if (name.startsWith('/sdlc:')) return 'SDLC'
  if (name.includes('think')) return 'Thinking'
  if (name.includes('git') || name.includes('branch') || name.includes('prune')) return 'Git'
  return 'Utility'
}

function SessionMetadataWarningBanner({ session }: { session: Session }) {
  const warning = getSessionMetadataWarning(session.metadata)
  if (!warning) return null

  return (
    <div
      className="mb-3 flex items-start gap-2 px-3 py-2 text-xs rounded-lg border"
      style={{
        backgroundColor: 'var(--status-warning-light)',
        borderColor: 'var(--status-warning)',
        color: 'var(--status-warning-text)',
      }}
    >
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
      <span>{warning}</span>
    </div>
  )
}

function SessionFailureDetailsPanel({ session }: { session: Session }) {
  const details = getSessionFailureDetails(session.metadata, session.errorMessage)
  if (!details) return null

  const workflowRunUrl =
    details.workflowRunUrl ||
    (session.workflowRunId && dashboardConfig.backgroundAgentGitHubRepo
      ? `https://github.com/${dashboardConfig.backgroundAgentGitHubRepo}/actions/runs/${session.workflowRunId}`
      : null)

  return (
    <div
      className="mb-3 rounded-xl border p-3"
      style={{
        backgroundColor: 'var(--status-danger-light)',
        borderColor: 'var(--status-danger)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--status-danger)' }}>
            Failure Details
          </h3>
          {details.reason && (
            <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {details.reason}
            </p>
          )}
        </div>
        {details.category && (
          <span
            className="px-2 py-1 rounded-full text-[11px] font-medium whitespace-nowrap"
            style={{ backgroundColor: 'var(--status-danger)', color: 'var(--text-on-accent)' }}
          >
            {details.category}
          </span>
        )}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {details.workflowConclusion && (
          <div className="text-xs">
            <div style={{ color: 'var(--text-muted)' }}>Workflow conclusion</div>
            <div style={{ color: 'var(--text-secondary)' }}>{details.workflowConclusion}</div>
          </div>
        )}
        {details.failedStep && (
          <div className="text-xs">
            <div style={{ color: 'var(--text-muted)' }}>Failed step</div>
            <div style={{ color: 'var(--text-secondary)' }}>{details.failedStep}</div>
          </div>
        )}
        {workflowRunUrl && (
          <div className="text-xs">
            <div style={{ color: 'var(--text-muted)' }}>Workflow run</div>
            <a
              href={workflowRunUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
              style={{ color: 'var(--status-info)' }}
            >
              Open workflow
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

interface SessionsState {
  sessions: Session[]
  loading: boolean
  error: string | null
  hasMore: boolean
  cursor?: string
}

function BackgroundAgentsPage() {
  const router = useRouter()
  const params = useParams<{ sessionId?: string }>()
  const searchParams = useSearchParams()
  const urlSessionId = params?.sessionId
  const { user } = useAuth()
  const selectedOrgName = useSelectedWorkspace()
  const isPersonalWorkspace = useIsPersonalWorkspace()

  const [state, setState] = useState<SessionsState>({
    sessions: [],
    loading: true,
    error: null,
    hasMore: false,
  })
  const [showNewSessionModal, setShowNewSessionModal] = useState(false)
  const [showCommandModal, setShowCommandModal] = useState(false)
  const [creatingSession, setCreatingSession] = useState(false)

  // Tab-based filtering (like Codex)
  type TabFilter = 'active' | 'completed' | 'all'
  const tabParam = searchParams?.get('tab') as TabFilter | null
  const [activeTab, setActiveTab] = useState<TabFilter>(tabParam ?? 'active')

  // Repo selector (repos within current workspace) \u2014 null means "All Repos" (#2263)
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
  const [availableRepos, setAvailableRepos] = useState<Repo[]>([])
  const [reposLoading, setReposLoading] = useState(true)
  const [showRepoDropdown, setShowRepoDropdown] = useState(false)
  const repoDropdownRef = useRef<HTMLDivElement>(null)

  // Branch selector for session
  const [branch, setBranch] = useState<string>('')
  const [availableBranches, setAvailableBranches] = useState<{ name: string; protected: boolean }[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [showBranchDropdown, setShowBranchDropdown] = useState(false)
  const [branchSearchQuery, setBranchSearchQuery] = useState('')
  const branchDropdownRef = useRef<HTMLDivElement>(null)
  const branchSearchInputRef = useRef<HTMLInputElement>(null)

  // Selected session state for split view
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(urlSessionId || null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [terminating, setTerminating] = useState(false)

  // Inline rename state (#1924)
  const [isRenamingTitle, setIsRenamingTitle] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [renaming, setRenaming] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Agent selection state with localStorage persistence
  const [selectedAgent, setSelectedAgent] = useState<SessionAgent>(() => {
    if (typeof window === 'undefined') return DEFAULT_SESSION_AGENT
    const stored = localStorage.getItem(AGENT_STORAGE_KEY)
    return (stored as SessionAgent) || DEFAULT_SESSION_AGENT
  })

  // Approved config and commands state
  const [approvedConfig, setApprovedConfig] = useState<ApprovedConfigResponse | null>(null)
  const [commandsLoading, setCommandsLoading] = useState(false)

  // Auto-refresh polling (#2159)
  const AUTO_REFRESH_INTERVAL_MS = 15_000 // 15 seconds
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const [lastRefreshedLabel, setLastRefreshedLabel] = useState<string>('')
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null) as MutableRefObject<ReturnType<typeof setInterval> | null>

  // Chat input state
  const [chatInput, setChatInput] = useState('')
  const [showCommandDropdown, setShowCommandDropdown] = useState(false)
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const [showCommandPicker, setShowCommandPicker] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const commandPickerRef = useRef<HTMLDivElement>(null)

  // Handle agent selection change
  const handleAgentChange = (agent: SessionAgent) => {
    setSelectedAgent(agent)
    localStorage.setItem(AGENT_STORAGE_KEY, agent)
  }

  // Fetch selected session details
  const fetchSelectedSession = useCallback(async (sessionId: string) => {
    try {
      setSessionLoading(true)
      setSessionError(null)

      if (isDemoMode()) {
        await new Promise((r) => setTimeout(r, 300))
        const session = DEMO_SESSIONS.find((s) => s.id === sessionId) ?? DEMO_SESSIONS[0]
        setSelectedSession(session)
        return
      }

      const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions/${sessionId}`)

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Session not found')
        }
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to fetch session')
      }

      const data: Session = await response.json()
      setSelectedSession(data)
    } catch (err) {
      logBackgroundSessionFetchError('Failed to fetch session:', err)
      setSessionError(getUserFriendlyError(err, 'Failed to load session.'))
    } finally {
      setSessionLoading(false)
    }
  }, [])

  // Handle session selection
  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId)
    router.replace(`/sessions/${sessionId}?tab=${activeTab}`)
  }

  // Close session panel
  const handleCloseSession = () => {
    setSelectedSessionId(null)
    setSelectedSession(null)
    setIsFullscreen(false)
    router.replace(`/sessions?tab=${activeTab}`)
  }

  // Handle session status changes from WebSocket/Firebase
  const handleSessionStatusChange = (newStatus: Session['status']) => {
    setSelectedSession(prev => prev ? { ...prev, status: newStatus } : null)
  }

  // Terminate selected session
  const handleTerminateSelectedSession = async () => {
    if (!selectedSession || terminating) return

    const confirmed = window.confirm(
      'Are you sure you want to terminate this session? This action cannot be undone.'
    )
    if (!confirmed) return

    setTerminating(true)
    try {
      const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions/${selectedSession.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to terminate session')
      }

      // Close the panel and refresh list
      handleCloseSession()
      fetchSessions()
    } catch (err) {
      console.error('Error terminating session:', err)
      alert(err instanceof Error ? err.message : 'Failed to terminate session')
    } finally {
      setTerminating(false)
    }
  }

  // Start inline rename for the selected session title (#1924)
  const handleStartRename = () => {
    if (!selectedSession) return
    setRenameValue(selectedSession.name || `Session ${selectedSession.id.slice(0, 8)}`)
    setIsRenamingTitle(true)
    // Focus input on next tick
    setTimeout(() => renameInputRef.current?.select(), 0)
  }

  // Cancel inline rename
  const handleCancelRename = () => {
    setIsRenamingTitle(false)
    setRenameValue('')
  }

  // Commit the rename via PATCH /api/sessions/:sessionId (#1924)
  const handleCommitRename = async () => {
    if (!selectedSession || !renameValue.trim()) {
      handleCancelRename()
      return
    }

    const trimmed = renameValue.trim()
    // No-op if name unchanged
    if (trimmed === (selectedSession.name || '')) {
      handleCancelRename()
      return
    }

    setRenaming(true)
    try {
      const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions/${selectedSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, reason: 'manual_rename' }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to rename session')
      }

      // Optimistically update local state
      const updated: Session = { ...selectedSession, name: trimmed }
      setSelectedSession(updated)

      // Also update the session in the list so the left panel shows the new name immediately
      setState(prev => ({
        ...prev,
        sessions: prev.sessions.map(s => s.id === selectedSession.id ? { ...s, name: trimmed } : s),
      }))
    } catch (err) {
      console.error('Error renaming session:', err)
      alert(err instanceof Error ? err.message : 'Failed to rename session')
    } finally {
      setRenaming(false)
      setIsRenamingTitle(false)
    }
  }

  // Fetch selected session when ID changes
  useEffect(() => {
    if (selectedSessionId) {
      fetchSelectedSession(selectedSessionId)
    } else {
      setSelectedSession(null)
    }
  }, [selectedSessionId, fetchSelectedSession])

  // Sync URL param to state (one-way: URL drives state)
  // selectedSessionId intentionally excluded from deps to prevent infinite loops
  useEffect(() => {
    setSelectedSessionId(urlSessionId || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSessionId])

  // Stable ref so polling closure always sees latest session without restarting the interval
  const selectedSessionRef = useRef(selectedSession)
  selectedSessionRef.current = selectedSession

  // Derived scalars for stable deps — only restart polling when id or status truly changes
  const pollingSessionId = selectedSession?.id
  const pollingSessionStatus = selectedSession?.status

  // Poll for status updates while session is PENDING or INITIALIZING
  useEffect(() => {
    if (!pollingSessionId) return
    if (pollingSessionStatus !== 'PENDING' && pollingSessionStatus !== 'INITIALIZING') return

    const pollInterval = setInterval(async () => {
      try {
        const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions/${pollingSessionId}`)

        if (response.ok) {
          const data: Session = await response.json()
          const current = selectedSessionRef.current
          if (current && data.status !== current.status) {
            console.log(`[BackgroundAgents] Status changed: ${current.status} -> ${data.status}`)
            setSelectedSession(data)
          }
        }
      } catch (err) {
        console.error('[BackgroundAgents] Polling error:', err)
      }
    }, 2000)

    return () => clearInterval(pollInterval)
  }, [pollingSessionId, pollingSessionStatus])

  // Use commands from approved config (only approved commands are available)
  const availableCommands = useMemo((): SlashCommand[] => {
    if (!approvedConfig?.approved || !approvedConfig.commands) {
      return []
    }
    // Convert approved config commands to SlashCommand format
    return approvedConfig.commands.map((cmd, idx) => ({
      id: `approved-${idx}`,
      name: cmd.name.startsWith('/') ? cmd.name : `/${cmd.name}`,
      description: cmd.content?.slice(0, 100) || 'Approved command',
      category: getCategoryFromCommandName(cmd.name),
      enabled: true,
    }))
  }, [approvedConfig])

  // Filter commands based on chat input
  const filteredCommands = useMemo(() => {
    if (!chatInput.startsWith('/')) return []
    const query = chatInput.toLowerCase()
    return availableCommands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query) ||
        cmd.category.toLowerCase().includes(query)
    )
  }, [chatInput, availableCommands])

  // Show/hide commands dropdown based on input
  // Guard against unnecessary state updates to prevent potential infinite re-render loops (GAL-DASHBOARD-7)
  useEffect(() => {
    const shouldShow = chatInput.startsWith('/') && filteredCommands.length > 0
    setShowCommandDropdown(prev => {
      if (prev === shouldShow) return prev
      return shouldShow
    })
    if (shouldShow) {
      setSelectedCommandIndex(0)
    }
  }, [chatInput, filteredCommands.length])

  // Handle command selection from dropdown
  const selectCommand = (command: SlashCommand) => {
    setChatInput(command.name + ' ')
    setShowCommandDropdown(false)
    inputRef.current?.focus()
  }

  // Handle chat input submission
  const handleChatSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!chatInput.trim() || creatingSession) return

    const input = chatInput.trim()

    // Extract command if present
    const commandMatch = input.match(/^(\/[\w:/-]+)/)
    const command = commandMatch ? commandMatch[1] : null

    // Create session with the command/message
    const sessionName = command
      ? `Session with ${command}`
      : `Session: ${input.slice(0, 30)}${input.length > 30 ? '...' : ''}`

    try {
      // Pass selected repo as context
      const projectContext = selectedRepo?.fullName || selectedRepo?.name
      await handleCreateSession(sessionName, projectContext, undefined, branch || undefined, selectedAgent, input)
      setChatInput('')
      setBranch('')  // Reset branch after session creation
    } catch (error) {
      console.error('Failed to create session:', error)
      setCreateError(error instanceof Error ? error.message : 'Failed to create session')
    }
  }

  // Handle keyboard navigation in chat input
  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle command dropdown navigation
    if (showCommandDropdown && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedCommandIndex((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        )
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedCommandIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        )
        return
      }
      // Tab always autocompletes
      if (e.key === 'Tab') {
        e.preventDefault()
        selectCommand(filteredCommands[selectedCommandIndex])
        return
      }
      // Enter: if input exactly matches a command, submit; otherwise autocomplete
      if (e.key === 'Enter' && !e.shiftKey) {
        const exactMatch = filteredCommands.some(
          (cmd) => cmd.name.toLowerCase() === chatInput.trim().toLowerCase()
        )
        if (exactMatch) {
          // Exact match - submit directly
          e.preventDefault()
          setShowCommandDropdown(false)
          handleChatSubmit()
          return
        } else {
          // Partial match - autocomplete
          e.preventDefault()
          selectCommand(filteredCommands[selectedCommandIndex])
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowCommandDropdown(false)
        return
      }
    }

    // Default Enter behavior (submit)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleChatSubmit()
    }
  }

  // Close repo dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (repoDropdownRef.current && !repoDropdownRef.current.contains(event.target as Node)) {
        setShowRepoDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close branch dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (branchDropdownRef.current && !branchDropdownRef.current.contains(event.target as Node)) {
        setShowBranchDropdown(false)
        setBranchSearchQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filter branches by search query
  const filteredBranches = useMemo(() => {
    if (!branchSearchQuery) return availableBranches
    const query = branchSearchQuery.toLowerCase()
    return availableBranches.filter(b => b.name.toLowerCase().includes(query))
  }, [availableBranches, branchSearchQuery])

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (showBranchDropdown && branchSearchInputRef.current) {
      branchSearchInputRef.current.focus()
    }
  }, [showBranchDropdown])

  // Close command picker dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (commandPickerRef.current && !commandPickerRef.current.contains(event.target as Node)) {
        setShowCommandPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Fetch repos from current workspace (org or personal)
  useEffect(() => {
    let cancelled = false

    const fetchRepos = async () => {
      setReposLoading(true)
      try {
        // In demo mode, serve pre-seeded repos without real API calls
        if (isDemoMode()) {
          if (!cancelled) {
            setAvailableRepos([
              { name: 'web-app', fullName: `${DEMO_ORG}/web-app`, hasConfigs: true },
              { name: 'api', fullName: `${DEMO_ORG}/api`, hasConfigs: true },
            ])
            setReposLoading(false)
          }
          return
        }

        let repos: Repo[] = []

        if (isPersonalWorkspace) {
          // Personal workspace - get personal discovered repos
          const result = await api.getPersonalDiscoveredRepos()
          if (cancelled) return
          repos = result.repos.map((repo) => ({
            name: repo.name,
            fullName: repo.fullName,
            hasConfigs: true,
          }))
        } else {
          // Organization workspace - use selected org name directly
          if (selectedOrgName) {
            const orgResult = await api.getDiscoveredRepos(selectedOrgName)
            if (cancelled) return
            repos = orgResult.repos.map((repo) => ({
              name: repo.name,
              fullName: `${selectedOrgName}/${repo.name}`,
              hasConfigs: repo.configCount > 0,
            }))
          }
        }

        if (!cancelled) {
          setAvailableRepos(repos)
          // Don&apos;t auto-select a repo \u2014 default to "All Repos" (#2263)
          // Only preserve previous selection if it still exists in the list
          setSelectedRepo((prev) =>
            prev && repos.some(r => r.fullName === prev.fullName) ? prev : null
          )
        }
      } catch (error) {
        if (cancelled) return
        console.error('Failed to fetch repos:', error)
        setAvailableRepos([])
      } finally {
        if (!cancelled) {
          setReposLoading(false)
        }
      }
    }

    fetchRepos()
    return () => { cancelled = true }
  }, [isPersonalWorkspace, selectedOrgName])

  // Fetch branches when repo is selected
  // Use stable scalar dep to prevent unnecessary re-fetches when repo object reference changes (GAL-DASHBOARD-7)
  const selectedRepoFullName = selectedRepo?.fullName ?? selectedRepo?.name ?? null
  useEffect(() => {
    async function fetchBranches() {
      // Skip if no repo selected ("All Repos" mode) (#2263)
      if (!selectedRepoFullName) {
        setAvailableBranches([])
        setBranch('')
        return
      }

      setBranchesLoading(true)

      try {
        // Use the stable scalar we already derived; fall back to constructing from org name (GAL-DASHBOARD-7)
        const repoFullName = selectedRepoFullName!.includes('/')
          ? selectedRepoFullName!
          : `${selectedOrgName}/${selectedRepoFullName}`
        const [owner, repo] = repoFullName.split('/')

        if (!owner || !repo) {
          setAvailableBranches([])
          setBranch('')
          setBranchesLoading(false)
          return
        }

        const branches = await api.getBranches(owner, repo)
        setAvailableBranches(branches)

        // Auto-select main/master as default
        if (branches.length > 0) {
          const defaultBranch = branches.find(b => b.name === 'main') ||
                               branches.find(b => b.name === 'master') ||
                               branches[0]
          if (defaultBranch) {
            setBranch(defaultBranch.name)
          }
        } else {
          setBranch('')
        }
      } catch (error) {
        console.error('Failed to fetch branches:', error)
        setAvailableBranches([])
        setBranch('')
      } finally {
        setBranchesLoading(false)
      }
    }

    fetchBranches()
  }, [selectedRepoFullName, selectedOrgName])

  // Fetch sessions (always fetch all, filter client-side for tabs)
  const fetchSessions = useCallback(async (cursor?: string) => {
    // In demo mode, return pre-seeded sessions without hitting the real API
    if (isDemoMode()) {
      setState(prev => ({
        ...prev,
        sessions: cursor ? prev.sessions : DEMO_SESSIONS,
        hasMore: false,
        loading: false,
        error: null,
      }))
      if (!cursor) setLastRefreshedAt(new Date())
      return
    }

    try {
      setState(prev => ({ ...prev, loading: true, error: null }))

      const params = new URLSearchParams()
      // Fetch all sessions, filter client-side based on tab
      params.set('limit', '20')
      // Only pass org param for organization workspaces (not personal accounts)
      if (selectedOrgName && !isPersonalWorkspace) {
        params.set('org', selectedOrgName)
      }
      if (cursor) {
        params.set('cursor', cursor)
      }

      const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions?${params}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to fetch sessions')
      }

      const data: ListSessionsResponse = await response.json()

      setState(prev => ({
        ...prev,
        sessions: cursor ? [...prev.sessions, ...data.sessions] : data.sessions,
        hasMore: data.hasMore,
        cursor: data.cursor,
        loading: false,
      }))

      // Track last refresh time (#2159)
      if (!cursor) {
        setLastRefreshedAt(new Date())
      }
    } catch (error) {
      logBackgroundSessionFetchError('Failed to fetch sessions:', error)
      setState(prev => ({
        ...prev,
        loading: false,
        error: getUserFriendlyError(error, 'Failed to load sessions.'),
      }))
    }
  }, [selectedOrgName, isPersonalWorkspace])

  // Fetch approved config with commands from current workspace
  const fetchApprovedConfig = useCallback(async () => {
    // Only fetch for organization workspaces (not personal)
    if (!selectedOrgName || isPersonalWorkspace) {
      setApprovedConfig(null)
      return
    }

    setCommandsLoading(true)
    try {
      if (isDemoMode()) {
        await new Promise((r) => setTimeout(r, 200))
        setApprovedConfig({
          approved: true,
          version: '3',
          platform: 'claude',
          approvedBy: 'sarah-chen',
          approvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          commands: [
            { name: 'commit', content: 'Stage and commit all changes with a descriptive message following conventional commits format.' },
            { name: 'review', content: 'Review the current branch diff and provide feedback on code quality, potential bugs, and improvements.' },
            { name: 'test', content: 'Run the test suite and report results. Fix any failing tests.' },
            { name: 'fix', content: 'Identify and fix the bug or issue described. Write a test to prevent regression.' },
            { name: 'pr', content: 'Create a pull request with a clear title and description summarizing the changes.' },
          ],
        })
        return
      }

      if (!selectedOrgName) {
        setApprovedConfig(null)
        return
      }

      const config = await api.getApprovedConfig(selectedOrgName, 'claude')
      setApprovedConfig(config)
    } catch (error) {
      console.debug('Failed to fetch approved config:', error)
      setApprovedConfig(null)
    } finally {
      setCommandsLoading(false)
    }
  }, [isPersonalWorkspace, selectedOrgName])

  // Initial fetch
  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // Auto-refresh sessions list every 15 seconds (#2159)
  useEffect(() => {
    autoRefreshTimerRef.current = setInterval(() => {
      fetchSessions()
    }, AUTO_REFRESH_INTERVAL_MS)

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current)
        autoRefreshTimerRef.current = null
      }
    }
  }, [fetchSessions])

  // Update "last refreshed" label every 5 seconds for relative time display (#2159)
  useEffect(() => {
    const updateLabel = () => {
      if (!lastRefreshedAt) {
        setLastRefreshedLabel('')
        return
      }
      const diffSec = Math.round((Date.now() - lastRefreshedAt.getTime()) / 1000)
      if (diffSec < 5) {
        setLastRefreshedLabel('just now')
      } else if (diffSec < 60) {
        setLastRefreshedLabel(`${diffSec}s ago`)
      } else {
        const diffMin = Math.floor(diffSec / 60)
        setLastRefreshedLabel(`${diffMin}m ago`)
      }
    }

    updateLabel()
    const ticker = setInterval(updateLabel, 5_000)
    return () => clearInterval(ticker)
  }, [lastRefreshedAt])

  // Fetch approved config when workspace changes
  useEffect(() => {
    fetchApprovedConfig()
  }, [fetchApprovedConfig])

  // Create new session
  const handleCreateSession = async (
    name: string,
    projectContext?: string,
    runnerLabel?: string,
    branchParam?: string,
    agent?: SessionAgent,
    initialCommand?: string
  ) => {
    setCreatingSession(true)
    try {
      const trimmedName = name.trim()
      const effectiveInitialPrompt = initialCommand?.trim() || trimmedName
      const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          projectContext,
          branch: branchParam,
          runnerLabel,
          agent: agent || selectedAgent,
          initialPrompt: effectiveInitialPrompt,
          ...(selectedOrgName && !isPersonalWorkspace ? { org: selectedOrgName } : {}),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))

        // Handle authentication errors
        if (errorData.code === 'CREDENTIALS_NOT_CONFIGURED' || errorData.code === 'CREDENTIALS_EXPIRED' || errorData.code === 'CREDENTIALS_REQUIRED') {
          const provider = errorData.provider || 'claude'
          throw new Error(
            `Authentication required for ${provider}. Please open your terminal and run: gal auth ${provider} --api-key <key>`
          )
        }

        // Handle capacity errors with detailed information (#2097)
        if (errorData.code === 'WORKER_POOL_CAPACITY_EXCEEDED') {
          const { blockedBy, limits, capacity } = errorData
          let detailedError = errorData.message || 'Worker pool at capacity.'

          if (limits) {
            detailedError += '\n\n'
            if (blockedBy === 'global') {
              detailedError += `Global: ${limits.global.active}/${limits.global.max} sessions active across all providers.`
            } else if (blockedBy === 'provider') {
              detailedError += `Provider ${limits.provider.name}: ${limits.provider.active}/${limits.provider.max} active sessions.`
              detailedError += `\nGlobal: ${limits.global.active}/${limits.global.max} total.`
            }
          }

          if (capacity?.fetchedAt) {
            const age = Math.round((Date.now() - new Date(capacity.fetchedAt).getTime()) / 1000)
            detailedError += `\n\n(Capacity checked ${age}s ago)`
          }

          throw new Error(detailedError)
        }

        throw new Error(errorData.message || 'Failed to create session')
      }

      const session: Session = await response.json()
      setShowNewSessionModal(false)
      setShowCommandModal(false)

      // Auto-switch to Active tab when new session is created
      setActiveTab('active')

      // Refresh sessions list to show the new session
      fetchSessions()

      // Navigate to the terminal view for the new session
      router.push(`/sessions/${session.id}`)
    } catch (error) {
      console.error('Error creating session:', error)
      throw error // Re-throw for modal to handle
    } finally {
      setCreatingSession(false)
    }
  }

  // Handle command submission from modal
  const handleCommandModalSubmit = async (command: string, args: string) => {
    const fullCommand = args ? `${command} ${args}` : command
    const sessionName = `Session with ${command}`
    await handleCreateSession(sessionName, undefined, undefined, undefined, selectedAgent, fullCommand)
  }

  const handleNewSessionModalSubmit = async (
    name: string,
    projectContext?: string,
    runnerLabel?: string,
    branchParam?: string,
    initialPrompt?: string,
  ) => {
    await handleCreateSession(
      name,
      projectContext,
      runnerLabel,
      branchParam,
      selectedAgent,
      initialPrompt,
    )
  }

  // Terminate session from list
  const handleTerminateSession = async (sessionId: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to terminate this session? This action cannot be undone.'
    )
    if (!confirmed) return

    try {
      const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions/${sessionId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || 'Failed to terminate session')
      }

      // Refresh sessions list
      fetchSessions()
    } catch (error) {
      console.error('Error terminating session:', error)
      alert(error instanceof Error ? error.message : 'Failed to terminate session')
    }
  }

  // Open terminal for session (now uses split view)
  const handleOpenTerminal = (sessionId: string) => {
    handleSelectSession(sessionId)
  }

  // Filter sessions based on active tab
  const isCapacityActive = useCallback((session: Session): boolean => {
    if (typeof session.countsTowardCapacity === 'boolean') {
      return session.countsTowardCapacity
    }
    return session.status === 'ACTIVE' || session.status === 'INITIALIZING' || session.status === 'PENDING'
  }, [])

  const filteredSessions = useMemo(() => {
    if (activeTab === 'active') {
      return state.sessions.filter(isCapacityActive)
    } else if (activeTab === 'completed') {
      return state.sessions.filter(
        s => s.status === 'TERMINATED' || s.status === 'FAILED'
      )
    }
    return state.sessions
  }, [state.sessions, activeTab, isCapacityActive])

  // Calculate tab counts for badges
  const activeCount = state.sessions.filter(isCapacityActive).length
  const completedCount = state.sessions.filter(
    s => s.status === 'TERMINATED' || s.status === 'FAILED'
  ).length

  // Fullscreen mode for session panel
  if (isFullscreen && selectedSession) {
    return (
      <div className="fixed inset-0 z-[100] bg-[var(--bg-primary)] flex flex-col">
        {/* Fullscreen Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsFullscreen(false)}
              className="flex items-center gap-2 text-sm transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Minimize2 className="w-4 h-4" />
              Exit Fullscreen
            </button>
            <div className="h-4 w-px" style={{ backgroundColor: 'var(--border-subtle)' }} />
            <div>
              {/* Inline rename for session title (#1924) */}
              {isRenamingTitle ? (
                <div className="flex items-center gap-1">
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCommitRename()
                      if (e.key === 'Escape') handleCancelRename()
                    }}
                    className="text-sm font-medium px-1 rounded border"
                    style={{
                      color: 'var(--text-primary)',
                      backgroundColor: 'var(--bg-tertiary)',
                      borderColor: 'var(--accent)',
                      outline: 'none',
                      minWidth: '12rem',
                    }}
                    autoFocus
                  />
                  <button onClick={handleCommitRename} disabled={renaming} title="Save" className="p-0.5 hover:text-[var(--text-secondary)] transition-colors" style={{ color: 'var(--text-muted)' }}>
                    {renaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={handleCancelRename} title="Cancel" className="p-0.5 hover:text-[var(--status-danger)] transition-colors" style={{ color: 'var(--text-muted)' }}>
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 group">
                  <h1 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {selectedSession.name || `Session ${selectedSession.id.slice(0, 8)}`}
                  </h1>
                  <button
                    onClick={handleStartRename}
                    title="Rename session"
                    className="p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
              )}
              <SessionStatusBadge status={selectedSession.status} workflowRunId={selectedSession.workflowRunId} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedSession.status !== 'TERMINATED' && selectedSession.status !== 'FAILED' && (
              <button
                onClick={handleTerminateSelectedSession}
                disabled={terminating}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors"
                style={{
                  backgroundColor: 'var(--status-danger-light)',
                  color: 'var(--status-danger)',
                  border: '1px solid var(--status-danger)',
                }}
              >
                {terminating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                Terminate
              </button>
            )}
          </div>
        </div>
        <SessionMetadataWarningBanner session={selectedSession} />
        <SessionFailureDetailsPanel session={selectedSession} />

        {/* Agent Session Header (GAL-2431) - Fullscreen */}
        <AgentSessionHeader
          sessionId={selectedSession.id}
          agent={selectedSession.agent}
          status={selectedSession.status}
          projectContext={selectedSession.projectContext}
          branch={selectedSession.branch}
          createdAt={selectedSession.createdAt as string}
          terminatedAt={selectedSession.terminatedAt as string | undefined}
          workflowRunId={selectedSession.workflowRunId}
          onTerminate={handleTerminateSelectedSession}
          terminating={terminating}
        />

        {/* Session Activity Timeline (GAL-2431) - Fullscreen */}
        <SessionActivityTimeline
          status={selectedSession.status}
          createdAt={selectedSession.createdAt}
          startedAt={selectedSession.startedAt}
          terminatedAt={selectedSession.terminatedAt}
          errorMessage={selectedSession.errorMessage}
        />

        <div className="flex-1 min-h-0">
          <TerminalErrorBoundary sessionId={selectedSession.id} onRetry={() => fetchSelectedSession(selectedSession.id)}>
            <SessionView sessionId={selectedSession.id} onStatusChange={handleSessionStatusChange} agent={selectedSession.agent} sessionStatus={selectedSession.status} isFullscreen />
          </TerminalErrorBoundary>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex h-full ${selectedSessionId ? 'gap-0' : ''}`}>
      {/* Left Panel - Sessions List */}
      <div className={`${selectedSessionId ? 'w-[400px] border-r border-[var(--border-subtle)]' : 'flex-1 max-w-3xl mx-auto'} flex flex-col h-full`}>

        {/* Compact Header when session selected */}
        {selectedSessionId && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Sessions</span>
              {lastRefreshedLabel && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {lastRefreshedLabel}
                </span>
              )}
            </div>
            <button
              onClick={() => fetchSessions()}
              disabled={state.loading}
              className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-muted)' }}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${state.loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        )}

        {/* Main Content Area */}
        <div className={`flex-1 overflow-y-auto ${selectedSessionId ? 'p-3' : 'p-6'}`}>

          {/* Prominent Task Input (only when no session selected) */}
          {!selectedSessionId && (
            <div className="mb-6">
              {/* Repo Selector (within current workspace) */}
              <div className="flex items-center gap-3 mb-4">
                <div className="relative" ref={repoDropdownRef}>
                  <button
                    onClick={() => setShowRepoDropdown(!showRepoDropdown)}
                    disabled={reposLoading}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors focus:outline-none"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {reposLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent)' }} />
                    ) : (
                      <FolderGit2 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    )}
                    <span className="max-w-[200px] truncate">{selectedRepo?.name || 'All Repos'}</span>
                    <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  </button>

                  {showRepoDropdown && (
                    <div
                      className="absolute top-full left-0 mt-1 w-80 rounded-lg shadow-xl z-50 overflow-hidden max-h-64 overflow-y-auto"
                      style={{
                        backgroundColor: 'var(--surface-raised)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {/* "All Repos" option at the top (#2263) */}
                      <button
                        onClick={() => {
                          setSelectedRepo(null)
                          setBranch('')
                          setShowRepoDropdown(false)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors border-b"
                        style={{
                          backgroundColor: !selectedRepo ? 'var(--accent-bg)' : undefined,
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <Layers
                          className="w-4 h-4 flex-shrink-0"
                          style={{ color: !selectedRepo ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
                        />
                        <span
                          className="font-medium"
                          style={{ color: !selectedRepo ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                        >
                          All Repos
                        </span>
                        <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>
                          Workspace-wide
                        </span>
                      </button>
                      {availableRepos.length === 0 && (
                        <div className="px-4 py-3 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                          {isPersonalWorkspace
                            ? 'Scan repos in Settings to target a specific repo'
                            : 'Install GitHub App on repos to target a specific repo'}
                        </div>
                      )}
                      {availableRepos.map((repo) => {
                        const isSelected = selectedRepo?.fullName === repo.fullName
                        return (
                          <button
                            key={repo.fullName || repo.name}
                            onClick={() => {
                              setSelectedRepo(repo)
                              setShowRepoDropdown(false)
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors"
                            style={{
                              backgroundColor: isSelected ? 'var(--accent-bg)' : undefined,
                            }}
                          >
                            <FolderGit2
                              className="w-4 h-4 flex-shrink-0"
                              style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
                            />
                            <span
                              className="font-medium truncate"
                              style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                            >
                              {repo.name}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Agent Selector */}
                <div className="w-40">
                  <AgentSelector
                    value={selectedAgent}
                    onChange={handleAgentChange}
                    disabled={creatingSession}
                  />
                </div>

                {/* Branch Selector \u2014 only visible when a specific repo is selected (#2263) */}
                {selectedRepo && (
                <div className="relative" ref={branchDropdownRef}>
                  <button
                    onClick={() => setShowBranchDropdown(!showBranchDropdown)}
                    disabled={branchesLoading || !selectedRepo || creatingSession}
                    className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors focus:outline-none"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: `1px solid ${branch ? 'var(--border-color)' : 'var(--accent)'}`,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {branchesLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent)' }} />
                    ) : (
                      <GitBranch className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    )}
                    <span className="max-w-[150px] truncate">{branch || 'Select branch'}</span>
                    <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  </button>

                  {showBranchDropdown && availableBranches.length > 0 && (
                    <div
                      className="absolute top-full left-0 mt-1 w-64 rounded-lg shadow-xl z-50 overflow-hidden"
                      style={{
                        backgroundColor: 'var(--surface-raised)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {/* Search Input */}
                      <div className="sticky top-0 p-2 border-b" style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--border-subtle)' }}>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                          <input
                            ref={branchSearchInputRef}
                            type="text"
                            value={branchSearchQuery}
                            onChange={(e) => setBranchSearchQuery(e.target.value)}
                            placeholder="Search branches..."
                            className="w-full pl-8 pr-3 py-1.5 text-sm rounded border bg-transparent outline-none"
                            style={{
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-primary)',
                            }}
                          />
                        </div>
                      </div>

                      {/* Branch List */}
                      <div className="max-h-64 overflow-y-auto">
                        {filteredBranches.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>
                            No branches found
                          </div>
                        ) : (
                          filteredBranches.map((b) => {
                            const isSelected = branch === b.name
                            return (
                              <button
                                key={b.name}
                                onClick={() => {
                                  setBranch(b.name)
                                  setShowBranchDropdown(false)
                                  setBranchSearchQuery('')
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors"
                                style={{
                                  backgroundColor: isSelected ? 'var(--accent-bg)' : undefined,
                                }}
                              >
                                <GitBranch
                                  className="w-4 h-4 flex-shrink-0"
                                  style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
                                />
                                <span
                                  className="font-medium truncate"
                                  style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                                >
                                  {b.name}
                                </span>
                                {b.protected && (
                                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--badge-amber-bg)', color: 'var(--badge-amber-text)' }}>
                                    protected
                                  </span>
                                )}
                              </button>
                            )
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
                )}
              </div>

              {/* Provider Capacity Bar (#1724) - shows active/max per provider */}
              <div className="mb-3">
                {/* #5207 — pass sessions so active count comes from session list, not capacity endpoint */}
                <ProviderCapacityBar visible={!selectedSessionId} sessions={state.sessions} />
              </div>

              {/* Task Input with Command Picker */}
              <div className="flex gap-2">
                {/* Command Picker Button */}
                <div className="relative" ref={commandPickerRef}>
                  <button
                    onClick={() => setShowCommandPicker(!showCommandPicker)}
                    disabled={commandsLoading || availableCommands.length === 0}
                    className="flex items-center justify-center w-12 h-12 rounded-lg transition-colors focus:outline-none disabled:opacity-40"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: `1px solid ${showCommandPicker ? 'var(--accent)' : 'var(--border-color)'}`,
                      color: showCommandPicker ? 'var(--accent)' : 'var(--text-primary)',
                    }}
                    title={availableCommands.length > 0 ? `${availableCommands.length} approved commands` : 'No approved commands'}
                  >
                    {commandsLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} />
                    ) : (
                      <span className="text-lg font-mono font-bold">/</span>
                    )}
                  </button>

                  {/* Command Picker Dropdown */}
                  {showCommandPicker && availableCommands.length > 0 && (
                    <div
                      className="absolute left-0 top-full mt-2 w-96 max-h-96 overflow-y-auto rounded-lg shadow-xl z-50"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div className="sticky top-0 px-3 py-2 border-b" style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border-subtle)' }}>
                        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                          Approved Commands ({availableCommands.length})
                        </span>
                      </div>
                      {availableCommands.map((cmd) => (
                        <button
                          key={cmd.id}
                          onClick={() => {
                            setChatInput(cmd.name + ' ')
                            setShowCommandPicker(false)
                            inputRef.current?.focus()
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-tertiary)]"
                          style={{ borderBottom: '1px solid var(--border-subtle)' }}
                        >
                          <span
                            className="font-mono text-xs flex-1 truncate"
                            style={{ color: 'var(--accent)' }}
                            title={cmd.name}
                          >
                            {cmd.name}
                          </span>
                          <span
                            className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                          >
                            {cmd.category}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Task Input */}
                <div className="relative flex-1">
                  <div
                    className="rounded-lg"
                    style={{
                      backgroundColor: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <textarea
                      ref={inputRef}
                      value={chatInput}
                      onChange={(e) => {
                        setChatInput(e.target.value)
                        setCreateError(null)
                      }}
                      onKeyDown={handleChatKeyDown}
                      placeholder="Describe your task or select a command..."
                      className="w-full px-4 py-4 pr-14 text-sm resize-none bg-transparent outline-none rounded-lg"
                      style={{ color: 'var(--text-primary)', minHeight: '80px' }}
                      rows={2}
                    />
                    <button
                      onClick={() => handleChatSubmit()}
                      disabled={!chatInput.trim() || creatingSession || !!(selectedRepo && !branch.trim() && availableBranches.length > 0)}
                      className="absolute right-3 bottom-3 p-2 rounded-lg transition-all disabled:opacity-30"
                      style={{
                        backgroundColor: chatInput.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
                        color: chatInput.trim() ? 'var(--text-on-accent)' : 'var(--text-muted)',
                      }}
                    >
                      {creatingSession ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  </div>

                  {/* Command Autocomplete Dropdown (when typing /) */}
                  {showCommandDropdown && filteredCommands.length > 0 && (
                    <div
                      ref={dropdownRef}
                      className="absolute left-0 right-0 top-full mt-1 max-h-64 overflow-y-auto rounded-lg shadow-lg z-50"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      {filteredCommands.slice(0, 8).map((cmd, idx) => {
                        const isSelected = idx === selectedCommandIndex
                        return (
                          <button
                            key={cmd.id}
                            onClick={() => selectCommand(cmd)}
                            className="w-full flex items-center justify-between px-4 py-3 text-sm text-left transition-colors hover:bg-[var(--bg-tertiary)]"
                            style={{
                              backgroundColor: isSelected ? 'var(--accent-bg)' : undefined,
                            }}
                          >
                            <span
                              className="font-mono text-sm"
                              style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}
                            >
                              {cmd.name}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {cmd.category}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                {commandsLoading ? (
                  'Loading approved commands...'
                ) : availableCommands.length > 0 ? (
                  <>Click <span className="font-mono">/</span> or type in chat &bull; Press Enter to start</>
                ) : selectedOrgName && !isPersonalWorkspace ? (
                  'No approved commands configured. Add commands in the Approved Config page.'
                ) : (
                  'Select an organization workspace to access approved commands.'
                )}
              </p>
              {createError && (
                <div className="flex items-center gap-2 text-sm px-2 mt-2" style={{ color: 'var(--error)' }}>
                  <span>{createError}</span>
                  <button
                    onClick={() => setCreateError(null)}
                    className="opacity-60 hover:opacity-100"
                    style={{ color: 'var(--error)' }}
                  >
                    {'\u2715'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tabs (like Codex) */}
          <div className="flex items-center gap-6 mb-4 border-b border-[var(--border-subtle)]">
            {([
              { id: 'active' as TabFilter, label: 'Active', count: activeCount },
              { id: 'completed' as TabFilter, label: 'Completed', count: completedCount },
              { id: 'all' as TabFilter, label: 'All', count: state.sessions.length },
            ]).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-1 py-3 text-sm transition-colors relative ${
                  activeTab === tab.id ? 'font-semibold' : 'font-medium'
                }`}
                style={{
                  color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                <span className="flex items-center gap-2">
                  {tab.label}
                  {tab.count > 0 && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {tab.count}
                    </span>
                  )}
                </span>
                {activeTab === tab.id && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-0.5"
                    style={{ backgroundColor: 'var(--text-primary)' }}
                  />
                )}
              </button>
            ))}

            {/* Auto-refresh indicator + manual refresh (#2159) */}
            <div className="ml-auto flex items-center gap-2 pb-3">
              {lastRefreshedLabel && (
                <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                  Updated {lastRefreshedLabel}
                </span>
              )}
              <button
                onClick={() => fetchSessions()}
                disabled={state.loading}
                className="p-1 rounded transition-colors hover:bg-[var(--bg-tertiary)]"
                style={{ color: 'var(--text-muted)' }}
                title="Refresh sessions"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${state.loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* G2 review prompt for engaged users (#6209) */}
          <ReviewPrompt sessions={state.sessions} userId={user?.id} />

          {/* Sessions List */}
          {state.error ? (
            <div
              className="p-6 rounded-lg text-center"
              style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
            >
              <AlertCircle className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--status-danger)' }} />
              <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                {state.error}
              </p>
              <button
                onClick={() => fetchSessions()}
                className="px-4 py-2 text-sm rounded-lg"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)' }}
              >
                Try Again
              </button>
            </div>
          ) : state.loading && state.sessions.length === 0 ? (
            <SessionListSkeleton count={3} />
          ) : filteredSessions.length === 0 ? (
            <div className="py-12 text-center">
              <Terminal className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {activeTab === 'active' ? 'No active sessions in this workspace' :
                 activeTab === 'completed' ? 'No completed sessions in this workspace' :
                 'No sessions yet in this workspace'}
              </p>
              {!selectedSessionId && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Type a task above to get started
                </p>
              )}
              {/* Show Load More even when this filter has no matches */}
              {state.hasMore && (
                <button
                  onClick={() => fetchSessions(state.cursor)}
                  disabled={state.loading}
                  className="mt-4 flex items-center gap-2 px-4 py-2 text-sm rounded-lg mx-auto transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {state.loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    'Load More'
                  )}
                </button>
              )}
            </div>
          ) : (
            <SessionList
              sessions={filteredSessions}
              onOpenTerminal={handleOpenTerminal}
              onTerminate={handleTerminateSession}
              loading={state.loading}
              hasMore={state.hasMore}
              onLoadMore={() => fetchSessions(state.cursor)}
              selectedSessionId={selectedSessionId}
            />
          )}
        </div>
      </div>

      {/* Right Panel - Selected Session */}
      {selectedSessionId && (
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--bg-primary)]">
          {sessionLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
            </div>
          ) : sessionError ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--status-danger)' }} />
                <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Error Loading Session
                </h2>
                <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                  {sessionError}
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => fetchSelectedSession(selectedSessionId)}
                    className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                  </button>
                  <button
                    onClick={handleCloseSession}
                    className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg"
                    style={{
                      backgroundColor: 'var(--accent)',
                      color: 'var(--text-on-accent)',
                    }}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                </div>
              </div>
            </div>
          ) : selectedSession ? (
            <>
              {/* Session Header */}
              <div
                className="flex items-center justify-between px-4 py-3 flex-shrink-0"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleCloseSession}
                    className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Close session"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div>
                    {/* Inline rename for session title (#1924) */}
                    {isRenamingTitle ? (
                      <div className="flex items-center gap-1">
                        <input
                          ref={renameInputRef}
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleCommitRename()
                            if (e.key === 'Escape') handleCancelRename()
                          }}
                          className="text-sm font-medium px-1 rounded border"
                          style={{
                            color: 'var(--text-primary)',
                            backgroundColor: 'var(--bg-tertiary)',
                            borderColor: 'var(--accent)',
                            outline: 'none',
                            minWidth: '12rem',
                          }}
                          autoFocus
                        />
                        <button onClick={handleCommitRename} disabled={renaming} title="Save" className="p-0.5 hover:text-[var(--text-secondary)] transition-colors" style={{ color: 'var(--text-muted)' }}>
                          {renaming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={handleCancelRename} title="Cancel" className="p-0.5 hover:text-[var(--status-danger)] transition-colors" style={{ color: 'var(--text-muted)' }}>
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group">
                        <h1 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {selectedSession.name || `Session ${selectedSession.id.slice(0, 8)}`}
                        </h1>
                        <button
                          onClick={handleStartRename}
                          title="Rename session"
                          className="p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <SessionStatusBadge status={selectedSession.status} workflowRunId={selectedSession.workflowRunId} />
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        ID: {selectedSession.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsFullscreen(true)}
                    className="p-2 rounded-lg transition-colors"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-secondary)',
                    }}
                    title="Enter fullscreen"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                  {selectedSession.status !== 'TERMINATED' && selectedSession.status !== 'FAILED' && (
                    <button
                      onClick={handleTerminateSelectedSession}
                      disabled={terminating}
                      className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors"
                      style={{
                        backgroundColor: 'var(--status-danger-light)',
                        color: 'var(--status-danger)',
                        border: '1px solid var(--status-danger)',
                      }}
                    >
                      {terminating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                      Terminate
                    </button>
                  )}
                </div>
              </div>

              {/* Agent Session Header (GAL-2431) */}
              <SessionMetadataWarningBanner session={selectedSession} />
              <SessionFailureDetailsPanel session={selectedSession} />

              <AgentSessionHeader
                sessionId={selectedSession.id}
                agent={selectedSession.agent}
                status={selectedSession.status}
                projectContext={selectedSession.projectContext}
                branch={selectedSession.branch}
                createdAt={selectedSession.createdAt as string}
                terminatedAt={selectedSession.terminatedAt as string | undefined}
                workflowRunId={selectedSession.workflowRunId}
                onTerminate={handleTerminateSelectedSession}
                terminating={terminating}
              />

              {/* Session Activity Timeline (GAL-2431) */}
              <SessionActivityTimeline
                status={selectedSession.status}
                createdAt={selectedSession.createdAt}
                startedAt={selectedSession.startedAt}
                terminatedAt={selectedSession.terminatedAt}
                errorMessage={selectedSession.errorMessage}
              />

              {/* Session View (Structured Logs or Terminal) */}
              <div className="flex-1 min-h-0">
                <TerminalErrorBoundary sessionId={selectedSession.id} onRetry={() => fetchSelectedSession(selectedSession.id)}>
                  <SessionView sessionId={selectedSession.id} onStatusChange={handleSessionStatusChange} agent={selectedSession.agent} sessionStatus={selectedSession.status} />
                </TerminalErrorBoundary>
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* New Session Modal (Simple) */}
      <NewSessionModal
        isOpen={showNewSessionModal}
        onClose={() => setShowNewSessionModal(false)}
        onSubmit={handleNewSessionModalSubmit}
        isSubmitting={creatingSession}
      />

      {/* Command Selection Modal (Primary flow) */}
      {showCommandModal && (
        <CommandSelectionModal
          commands={availableCommands}
          onClose={() => setShowCommandModal(false)}
          onSubmit={handleCommandModalSubmit}
          isSubmitting={creatingSession}
        />
      )}
    </div>
  )
}

export default BackgroundAgentsPage
