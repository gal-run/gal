'use client'

/**
 * Interactive Session Page (GAL-571)
 *
 * Interactive chat/workflow session interface for triggering slash commands
 * and viewing workflow execution results.
 *
 * Migrated from apps/dashboard/src/pages/Session.tsx to Next.js App Router.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, Bot, User, Loader2, Sparkles, CheckCircle2, Circle, GitBranch, ExternalLink, Plus } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { api, type SlashCommand, type Organization } from '@/lib/api'
import { SessionHistoryPanel } from '@/components/sessions/SessionHistoryPanel'
import { SessionDetailModal } from '@/components/sessions/SessionDetailModal'
import { CommandSelectionModal } from '@/components/sessions/CommandSelectionModal'
import { AgentSelector } from '@/components/sessions/AgentSelector'
import { DEFAULT_SESSION_AGENT } from '@gal/types'
import type { SessionAgent } from '@gal/types'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'

// localStorage key for agent preference
const AGENT_STORAGE_KEY = 'gal:session:agent'

// Default fallback commands (used if API fails or no org connected)
const DEFAULT_COMMANDS: Omit<SlashCommand, 'id' | 'enabled'>[] = [
  // SDLC commands
  { name: '/sdlc:1-specify:run', description: 'Create or update feature specification', category: 'SDLC' },
  { name: '/sdlc:2-design:run', description: 'Execute implementation planning workflow', category: 'SDLC' },
  { name: '/sdlc:3-test:run', description: 'TDD loop - generate tests from spec', category: 'SDLC' },
  { name: '/sdlc:4-implement:run', description: 'Execute implementation plan', category: 'SDLC' },
  { name: '/sdlc:5-deploy-verify:run', description: 'Test locally before creating PR', category: 'SDLC' },
  { name: '/sdlc:6-review:run', description: 'Code quality review', category: 'SDLC' },
  { name: '/sdlc:7-merge:run', description: 'Merge to main after checks', category: 'SDLC' },
  { name: '/sdlc:8-maintain:run', description: 'Bug triage and maintenance verification', category: 'SDLC' },
  // Thinking modes
  { name: '/think', description: 'Basic thinking mode for problem analysis', category: 'Thinking' },
  { name: '/think-hard', description: 'Intensive thinking for complex challenges', category: 'Thinking' },
  { name: '/think-harder', description: 'Deep analytical thinking for architecture', category: 'Thinking' },
  { name: '/ultrathink', description: 'Maximum depth for strategic challenges', category: 'Thinking' },
  // Utility commands
  { name: '/prime', description: 'Load context by analyzing codebase', category: 'Utility' },
  { name: '/capture-learnings', description: 'Capture session learnings as improvement PR', category: 'Utility' },
  { name: '/prune-branches', description: 'Systematic git branch cleanup and pruning', category: 'Git' },
  { name: '/work-prioritizer', description: 'Pick highest priority work item', category: 'Utility' },
  { name: '/report-infra-blocker', description: 'Report infrastructure blocker', category: 'Utility' },
]

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  // Workflow execution data (for assistant messages)
  workflow?: {
    command: string
    issueNumber?: string
    status: 'running' | 'completed' | 'failed'
    steps: { name: string; status: 'pending' | 'running' | 'completed' }[]
    runId?: number
    runUrl?: string
  }
}

// Parse input to extract command and args
function parseInput(input: string): { command: string | null; args: string } {
  const trimmed = input.trim()

  // Extract command (starts with /)
  const commandMatch = trimmed.match(/^(\/[\w:/-]+)/)
  const command = commandMatch ? commandMatch[1] : null

  // Everything after command is args (including #64, flags, etc.)
  let args = trimmed
  if (command) args = args.replace(command, '').trim()

  return { command, args }
}

function InteractiveSessionPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [orgsLoading, setOrgsLoading] = useState(true)
  const selectedWorkspace = useSelectedWorkspace()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showCommands, setShowCommands] = useState(false)
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([])
  const [commandsLoading, setCommandsLoading] = useState(false)
  // Agent selection state with localStorage persistence (#610)
  const [selectedAgent, setSelectedAgent] = useState<SessionAgent>(() => {
    if (typeof window === 'undefined') return DEFAULT_SESSION_AGENT
    const stored = localStorage.getItem(AGENT_STORAGE_KEY)
    return (stored as SessionAgent) || DEFAULT_SESSION_AGENT
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const commandsRef = useRef<HTMLDivElement>(null)

  // Selected workspace IS the org \u2014 no fallback, no wrong data
  const activeOrgName = selectedWorkspace || null

  // Session History Panel state
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false)
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null)
  const [showSessionDetail, setShowSessionDetail] = useState(false)
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false)
  const [showCommandModal, setShowCommandModal] = useState(false)

  // Detect mobile screen size
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      // Auto-collapse panel on mobile
      if (mobile && !isPanelCollapsed) {
        setIsPanelCollapsed(true)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isPanelCollapsed])

  // Use fetched commands or fallback to defaults
  const availableCommands = useMemo(() => {
    if (slashCommands.length > 0) {
      return slashCommands.filter((cmd) => cmd.enabled)
    }
    // Fallback to default commands
    return DEFAULT_COMMANDS.map((cmd, idx) => ({
      ...cmd,
      id: `default-${idx}`,
      enabled: true,
    }))
  }, [slashCommands])

  // Filter commands based on input
  const filteredCommands = useMemo(() => {
    if (!input.startsWith('/')) return []
    const query = input.toLowerCase()
    return availableCommands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query) ||
        cmd.category.toLowerCase().includes(query)
    )
  }, [input, availableCommands])

  // Show/hide commands dropdown based on input
  // Guard against unnecessary state updates to prevent potential infinite re-render loops (GAL-DASHBOARD-7)
  useEffect(() => {
    const shouldShow = input.startsWith('/') && filteredCommands.length > 0
    setShowCommands(prev => {
      if (prev === shouldShow) return prev
      return shouldShow
    })
    if (shouldShow) {
      setSelectedCommandIndex(0)
    }
  }, [input, filteredCommands.length])

  // Handle command selection
  const selectCommand = (command: SlashCommand) => {
    setInput(command.name + ' ')
    setShowCommands(false)
    inputRef.current?.focus()
  }

  // Handle agent selection change (#610)
  const handleAgentChange = (agent: SessionAgent) => {
    setSelectedAgent(agent)
    localStorage.setItem(AGENT_STORAGE_KEY, agent)
  }

  // Fetch organizations for the session page
  const fetchOrganizations = useCallback(async () => {
    setOrgsLoading(true)
    try {
      // CORE single-tenant path: read the current workspace's connected
      // organizations through the CORE api client (src/lib/api.ts) rather than
      // the EE cross-org repository layer (src/ee/contexts/CoreServicesContext).
      const orgs = await api.getOrganizations()
      setOrganizations(orgs)
    } catch (error) {
      // Use debug level to avoid console errors (#655)
      console.debug('Failed to fetch organizations:', error)
    } finally {
      setOrgsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchOrganizations()
  }, [fetchOrganizations])

  // Fetch slash commands from user&apos;s connected organizations
  const fetchSlashCommands = useCallback(async () => {
    if (organizations.length === 0) return

    setCommandsLoading(true)
    try {
      // Fetch commands from all connected organizations
      const allCommands: SlashCommand[] = []
      for (const org of organizations) {
        try {
          const commands = await api.getSlashCommands(org.name)
          if (Array.isArray(commands)) {
            allCommands.push(...commands)
          }
        } catch (orgError) {
          // Silently skip orgs that fail - don&apos;t break the whole fetch
          console.debug(`Skipping commands from ${org.name}:`, orgError)
        }
      }

      // Deduplicate by name (keep first occurrence)
      const uniqueCommands = allCommands.filter(
        (cmd, index, self) => self.findIndex(c => c.name === cmd.name) === index
      )

      setSlashCommands(uniqueCommands)
      if (uniqueCommands.length > 0) {
        console.debug(`Loaded ${uniqueCommands.length} commands from ${organizations.length} org(s)`)
      }
    } catch (error) {
      // Use debug level to avoid console errors (#655)
      console.debug('Failed to fetch slash commands:', error)
    } finally {
      setCommandsLoading(false)
    }
  }, [organizations])

  useEffect(() => {
    fetchSlashCommands()
  }, [fetchSlashCommands])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    const currentInput = input.trim()
    setInput('')
    setIsLoading(true)

    // Parse input for command and args
    const { command, args } = parseInput(currentInput)

    // If it&apos;s a slash command, trigger the workflow
    if (command) {
      const workflowSteps = [
        { name: 'Triggering workflow', status: 'running' as const },
        { name: 'Workflow queued', status: 'pending' as const },
        { name: 'Workflow running', status: 'pending' as const },
        { name: 'Workflow completed', status: 'pending' as const },
      ]

      const messageId = crypto.randomUUID()
      const assistantMessage: Message = {
        id: messageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        workflow: {
          command,
          issueNumber: args || undefined,
          status: 'running',
          steps: workflowSteps,
        },
      }

      setMessages((prev) => [...prev, assistantMessage])

      // Execute the workflow via API
      const executeWorkflow = async () => {
        try {
          // Target selected workspace (fallback to first connected org)
          const orgName = activeOrgName
          if (!orgName) {
            throw new Error('No organization connected')
          }

          // Trigger the workflow
          const result = await api.executeCommand(
            orgName,
            command,
            args || undefined
          )

          if (!result.success) {
            throw new Error(result.error || 'Failed to trigger workflow')
          }

          // Update: Workflow triggered successfully
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId && m.workflow
                ? {
                    ...m,
                    workflow: {
                      ...m.workflow,
                      runId: result.runId,
                      runUrl: result.runUrl,
                      steps: m.workflow.steps.map((s, i) =>
                        i === 0
                          ? { ...s, status: 'completed' as const }
                          : i === 1
                          ? { ...s, status: 'running' as const }
                          : s
                      ),
                    },
                  }
                : m
            )
          )

          // Poll for workflow status
          if (result.runId) {
            let attempts = 0
            const maxAttempts = 60

            const pollStatus = async () => {
              attempts++
              const status = await api.getWorkflowStatus(orgName, result.runId!)

              if (status) {
                if (status.status === 'queued') {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === messageId && m.workflow
                        ? {
                            ...m,
                            workflow: {
                              ...m.workflow,
                              steps: m.workflow.steps.map((s, i) =>
                                i <= 1
                                  ? { ...s, status: 'completed' as const }
                                  : i === 2
                                  ? { ...s, status: 'running' as const }
                                  : s
                              ),
                            },
                          }
                        : m
                    )
                  )
                } else if (status.status === 'in_progress') {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === messageId && m.workflow
                        ? {
                            ...m,
                            workflow: {
                              ...m.workflow,
                              steps: m.workflow.steps.map((s, i) =>
                                i <= 1
                                  ? { ...s, status: 'completed' as const }
                                  : i === 2
                                  ? { ...s, status: 'running' as const }
                                  : s
                              ),
                            },
                          }
                        : m
                    )
                  )
                } else if (status.status === 'completed') {
                  const isSuccess = status.conclusion === 'success'
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === messageId && m.workflow
                        ? {
                            ...m,
                            workflow: {
                              ...m.workflow,
                              status: isSuccess ? 'completed' : 'failed',
                              steps: m.workflow.steps.map((s) => ({
                                ...s,
                                status: 'completed' as const,
                              })),
                            },
                            content: isSuccess
                              ? `Workflow completed successfully!\n\n**Command:** \`${command}\`${args ? `\n**Args:** ${args}` : ''}`
                              : `Workflow failed (${status.conclusion})\n\n**Command:** \`${command}\`${args ? `\n**Args:** ${args}` : ''}`,
                          }
                        : m
                    )
                  )
                  setIsLoading(false)
                  return
                }
              }

              if (attempts < maxAttempts) {
                setTimeout(pollStatus, 5000)
              } else {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === messageId && m.workflow
                      ? {
                          ...m,
                          workflow: {
                            ...m.workflow,
                            status: 'completed',
                            steps: m.workflow.steps.map((s) => ({
                              ...s,
                              status: 'completed' as const,
                            })),
                          },
                          content: `Workflow triggered! Check status on GitHub.\n\n**Command:** \`${command}\`${args ? `\n**Args:** ${args}` : ''}`,
                        }
                      : m
                  )
                )
                setIsLoading(false)
              }
            }

            setTimeout(pollStatus, 3000)
          } else {
            setIsLoading(false)
          }
        } catch (error: unknown) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId && m.workflow
                ? {
                    ...m,
                    workflow: {
                      ...m.workflow,
                      status: 'failed',
                      steps: m.workflow.steps.map((s, i) =>
                        i === 0 ? { ...s, status: 'completed' as const } : s
                      ),
                    },
                    content: `Failed to trigger workflow: ${error instanceof Error ? error.message : String(error)}\n\n**Command:** \`${command}\`${args ? `\n**Args:** ${args}` : ''}`,
                  }
                : m
            )
          )
          setIsLoading(false)
        }
      }

      executeWorkflow()
    } else {
      // Regular message (no slash command)
      setTimeout(() => {
        const assistantMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `I received your message: "${currentInput}"\n\nTip: Start with a slash command (e.g., \`/sdlc:1-specify:run #64\`) to trigger a workflow.`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, assistantMessage])
        setIsLoading(false)
      }, 1000)
    }
  }

  // Handle command submission from modal
  const handleCommandModalSubmit = (command: string, args: string) => {
    const fullCommand = args ? `${command} ${args}` : command
    setInput(fullCommand)
    setShowCommandModal(false)
    // Auto-submit after a brief delay to show the input
    setTimeout(() => {
      const fakeEvent = { preventDefault: () => {} } as React.FormEvent
      handleSubmit(fakeEvent)
    }, 100)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle command dropdown navigation
    if (showCommands && filteredCommands.length > 0) {
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
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectCommand(filteredCommands[selectedCommandIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowCommands(false)
        return
      }
    }

    // Default Enter behavior
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  // Loading state
  if (orgsLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    )
  }

  // Get first organization for API calls
  const firstOrg = activeOrgName

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center gap-4 px-6 py-4 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <button
          onClick={() => router.push('/')}
          className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-bg)' }}
          >
            <Sparkles className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              AI Session
            </h1>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Chat with your AI coding assistant
            </p>
          </div>
        </div>
        {/* Agent Selector (#610) + New Session Button */}
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Agent:</span>
            <div className="w-48">
              <AgentSelector
                value={selectedAgent}
                onChange={handleAgentChange}
                disabled={isLoading}
              />
            </div>
          </div>
          <button
            onClick={() => setShowCommandModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--text-on-accent)',
            }}
          >
            <Plus className="w-4 h-4" />
            New Session
          </button>
        </div>
      </div>

      {/* Main Content: Session History Panel + Chat Interface */}
      <div className="flex-1 flex overflow-hidden">
        {/* Session History Panel */}
        {firstOrg && (
          <SessionHistoryPanel
            orgName={firstOrg}
            isCollapsed={isPanelCollapsed}
            onToggleCollapse={() => setIsPanelCollapsed(!isPanelCollapsed)}
            onSessionSelect={(sessionId) => {
              setSelectedSessionId(sessionId)
              setShowSessionDetail(true)
            }}
            selectedSessionId={selectedSessionId}
            isMobile={isMobile}
          />
        )}

        {/* Chat Interface */}
        <div className="flex-1 flex flex-col overflow-hidden">

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
              style={{ backgroundColor: 'var(--accent-bg)' }}
            >
              <Bot className="w-8 h-8" style={{ color: 'var(--accent)' }} />
            </div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              Start a new session
            </h2>
            <p className="max-w-md" style={{ color: 'var(--text-muted)' }}>
              Describe a task you&apos;d like help with. For example: &quot;Add unit tests for the auth
              module&quot; or &quot;Review this PR for security issues&quot;.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div
                    className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: 'var(--accent-bg)' }}
                  >
                    <Bot className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 ${
                    message.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'
                  }`}
                  style={{
                    backgroundColor:
                      message.role === 'user' ? 'var(--accent)' : 'var(--bg-card)',
                    color: message.role === 'user' ? 'var(--text-on-accent)' : 'var(--text-primary)',
                    border:
                      message.role === 'assistant' ? '1px solid var(--border-subtle)' : 'none',
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
                          <CheckCircle2 className="w-4 h-4 ml-auto" style={{ color: 'var(--status-success)' }} />
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
                        {message.workflow.issueNumber && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Args:</span>
                            <code
                              className="text-xs px-2 py-0.5 rounded"
                              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                            >
                              {message.workflow.issueNumber}
                            </code>
                          </div>
                        )}
                      </div>

                      {/* Workflow Steps */}
                      <div className="space-y-1.5 pt-1">
                        {message.workflow.steps.map((step, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            {step.status === 'completed' && (
                              <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--status-success)' }} />
                            )}
                            {step.status === 'running' && (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--accent)' }} />
                            )}
                            {step.status === 'pending' && (
                              <Circle className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                            )}
                            <span
                              className="text-xs"
                              style={{
                                color: step.status === 'completed' ? 'var(--text-primary)' : 'var(--text-muted)',
                              }}
                            >
                              {step.name}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Completion Message & Workflow Link */}
                      {(message.content || message.workflow?.runUrl) && (
                        <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
                          {message.content && (
                            <p className="whitespace-pre-wrap text-sm">{message.content.replace(/\[View workflow run\]\([^)]+\)/g, '')}</p>
                          )}
                          {message.workflow?.runUrl && (
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

                  {/* Regular Message Content */}
                  {!message.workflow && (
                    <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                  )}

                  <p
                    className="text-xs mt-2 opacity-60"
                    style={{
                      color: message.role === 'user' ? 'var(--text-on-accent)' : 'var(--text-muted)',
                    }}
                  >
                    {message.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
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
            {isLoading && (
              <div className="flex gap-4 justify-start">
                <div
                  className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: 'var(--accent-bg)' }}
                >
                  <Bot className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                </div>
                <div
                  className="rounded-xl rounded-bl-sm px-4 py-3"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Loader2
                      className="w-4 h-4 animate-spin"
                      style={{ color: 'var(--accent)' }}
                    />
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Thinking...
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative">
          {/* Command Suggestions Dropdown */}
          {showCommands && filteredCommands.length > 0 && (
            <div
              ref={commandsRef}
              className="absolute bottom-full left-0 right-0 mb-2 rounded-xl overflow-hidden shadow-lg z-50"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              <div className="p-2">
                <p className="text-xs px-3 py-1 mb-1" style={{ color: 'var(--text-muted)' }}>
                  Slash Commands ({filteredCommands.length} of {availableCommands.length}){commandsLoading && ' loading...'}
                </p>
                {filteredCommands.map((cmd, index) => (
                  <button
                    key={cmd.id}
                    type="button"
                    onClick={() => selectCommand(cmd)}
                    onMouseEnter={() => setSelectedCommandIndex(index)}
                    className="w-full text-left px-3 py-2 rounded-lg transition-colors flex items-start gap-3"
                    style={{
                      backgroundColor:
                        index === selectedCommandIndex
                          ? 'var(--bg-tertiary)'
                          : 'transparent',
                    }}
                  >
                    <span
                      className="font-mono text-sm font-medium shrink-0"
                      style={{ color: 'var(--accent)' }}
                    >
                      {cmd.name}
                    </span>
                    <span
                      className="text-sm truncate"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {cmd.description}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full ml-auto shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {cmd.category}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            className="flex items-end gap-3 p-3 rounded-xl"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your task..."
              rows={1}
              className="flex-1 resize-none bg-transparent outline-none text-sm"
              style={{
                color: 'var(--text-primary)',
                minHeight: '24px',
                maxHeight: '120px',
              }}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: input.trim() ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: input.trim() ? 'var(--text-on-accent)' : 'var(--text-muted)',
              }}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
            Press Enter to send, Shift+Enter for new line
          </p>
        </form>
      </div>
        </div>
        {/* End Chat Interface */}
      </div>
      {/* End Main Content */}

      {/* Session Detail Modal */}
      {showSessionDetail && selectedSessionId !== null && firstOrg && (
        <SessionDetailModal
          orgName={firstOrg}
          sessionId={selectedSessionId}
          onClose={() => {
            setShowSessionDetail(false)
            setSelectedSessionId(null)
          }}
        />
      )}

      {/* Command Selection Modal */}
      {showCommandModal && (
        <CommandSelectionModal
          commands={availableCommands}
          onClose={() => setShowCommandModal(false)}
          onSubmit={handleCommandModalSubmit}
          isSubmitting={isLoading}
        />
      )}
    </div>
  )
}

export default InteractiveSessionPage
