'use client'

/**
 * AgentSelector Component
 *
 * Dropdown selector for CLI agents in background sessions (#610).
 * Allows users to choose which coding agent to use for their session.
 */

import React from 'react'
import { SESSION_AGENTS } from '@gal/types'
import type { SessionAgent } from '@gal/types'
import { useIsInternalWorkspace } from '@/hooks/useWorkspaceAudienceTier'

// Currently supported agents (public)
const SUPPORTED_AGENTS: SessionAgent[] = ['claude', 'codex', 'gemini']

// Internal-only agents (#5139)
const INTERNAL_AGENTS: SessionAgent[] = ['gal']

interface AgentSelectorProps {
  /** Currently selected agent */
  value: SessionAgent
  /** Callback when agent selection changes */
  onChange: (agent: SessionAgent) => void
  /** Whether the selector is disabled */
  disabled?: boolean
}

/**
 * Dropdown selector for choosing a CLI agent.
 * Currently only supports Claude Code and Codex.
 */
export function AgentSelector({ value, onChange, disabled }: AgentSelectorProps) {
  const isInternal = useIsInternalWorkspace()
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value as SessionAgent)
  }

  // Filter to supported agents; include internal-only agents for internal workspaces (#5139)
  const effectiveAgents = isInternal
    ? [...SUPPORTED_AGENTS, ...INTERNAL_AGENTS]
    : SUPPORTED_AGENTS
  const availableAgents = SESSION_AGENTS.filter((agent) =>
    effectiveAgents.includes(agent.id)
  )

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={disabled}
      aria-label="Select CLI agent"
      className="w-full px-3 py-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors focus:outline-none"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-primary)',
      }}
    >
      {availableAgents.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {agent.icon} {agent.displayName}
        </option>
      ))}
    </select>
  )
}

/**
 * Display-only badge showing the agent for a session.
 */
export function AgentBadge({ agent }: { agent: SessionAgent }) {
  const agentConfig = SESSION_AGENTS.find((a) => a.id === agent)

  if (!agentConfig) {
    return null
  }

  return (
    <span className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)]">
      <span>{agentConfig.icon}</span>
      <span>{agentConfig.displayName}</span>
    </span>
  )
}

export default AgentSelector
