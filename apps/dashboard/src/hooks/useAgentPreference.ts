'use client'

import { useState, useCallback } from 'react'

export type AgentType = 'claude' | 'codex' | 'gemini' | 'oss'

const STORAGE_KEY = 'gal-preferred-agent'
const DEFAULT_AGENT: AgentType = 'claude'

/**
 * Get initial agent preference from localStorage.
 * This runs once during initialization, not in an effect.
 */
function getInitialAgent(): AgentType {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && isValidAgent(stored)) {
      return stored
    }
  } catch {
    // localStorage may not be available (SSR, private mode)
  }
  return DEFAULT_AGENT
}

/**
 * Hook to manage user's preferred coding agent for background sessions.
 * Stored in localStorage for now, can be moved to user profile later.
 */
export function useAgentPreference() {
  // Use initializer function to avoid calling setState in effect
  const [preferredAgent, setPreferredAgentState] = useState<AgentType>(getInitialAgent)
  // isLoaded is now always true since we load synchronously in useState initializer
  const isLoaded = true

  // Save preference to localStorage
  const setPreferredAgent = useCallback((agent: AgentType) => {
    localStorage.setItem(STORAGE_KEY, agent)
    setPreferredAgentState(agent)
  }, [])

  return {
    preferredAgent,
    setPreferredAgent,
    isLoaded,
  }
}

function isValidAgent(value: string): value is AgentType {
  return ['claude', 'codex', 'gemini', 'oss'].includes(value)
}

export const AGENT_OPTIONS: { value: AgentType; label: string; description: string }[] = [
  { value: 'claude', label: 'Claude Code', description: 'Anthropic Claude (recommended)' },
  { value: 'codex', label: 'Codex CLI', description: 'OpenAI Codex' },
  { value: 'gemini', label: 'Gemini CLI', description: 'Google Gemini' },
  { value: 'oss', label: 'GAL Code', description: 'GAL Code executor lane (GLM-4.7)' },
]
