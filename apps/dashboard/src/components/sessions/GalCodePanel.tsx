'use client'

/**
 * GalCodePanel (#6307)
 *
 * Embeddable GAL Code chat panel. Creates a session with the caller's MCP
 * config and mounts the chat UI for that session. Used by product dashboards
 * (e.g. financial) that want a product-aware agent in-app via MCP, without
 * embedding the full BackgroundAgentsPage UI.
 *
 * The component is deliberately thin — all session behaviour is delegated to
 * `StructuredLogsView` once the session exists. The only new logic here is
 * the create-with-mcpConfig call + its loading/error states.
 */

import React, { useEffect, useRef, useState } from 'react'

// React must be imported for the classic JSX runtime used in the vitest config
// (renderToStaticMarkup path). Keep the default import even though hooks are
// destructured — stripping it breaks server rendering in tests.
void React
import type { McpConfig, Session, SessionAgent, RunnerLabel } from '@gal/types'

import { api } from '@/lib/api'
import { StructuredLogsView } from './StructuredLogsView'

export interface GalCodePanelProps {
  /** MCP servers attached to this session. The runner loads them alongside approved servers. */
  mcp: McpConfig
  /** Session display name (required — also used as the initial prompt fallback). */
  name: string
  /** Repo or project context (e.g. "scheduler-systems/financial"). */
  projectContext?: string
  /** CLI agent to run (default: claude). */
  agent?: SessionAgent
  /** ARC runner to target. */
  runnerLabel?: RunnerLabel
  /** Initial prompt sent to the agent. Defaults to `name` when absent. */
  initialPrompt?: string
  /** Invoked when the session is successfully created. Useful for linking to the full session page. */
  onSessionCreated?: (session: Session) => void
  /** Invoked when session creation fails. */
  onError?: (error: Error) => void
}

/**
 * Build the POST /api/sessions request body. Kept as a pure function so
 * unit tests can assert shape without rendering React.
 */
export function buildCreateSessionPayload(
  props: Pick<
    GalCodePanelProps,
    'mcp' | 'name' | 'projectContext' | 'agent' | 'runnerLabel' | 'initialPrompt'
  >,
): {
  name: string
  projectContext?: string
  agent?: SessionAgent
  runnerLabel?: RunnerLabel
  initialPrompt: string
  mcpConfig: McpConfig
} {
  const initialPrompt = (props.initialPrompt?.trim() || props.name).trim()
  return {
    name: props.name,
    ...(props.projectContext ? { projectContext: props.projectContext } : {}),
    ...(props.agent ? { agent: props.agent } : {}),
    ...(props.runnerLabel ? { runnerLabel: props.runnerLabel } : {}),
    initialPrompt,
    mcpConfig: props.mcp,
  }
}

export function GalCodePanel({
  mcp,
  name,
  projectContext,
  agent,
  runnerLabel,
  initialPrompt,
  onSessionCreated,
  onError,
}: GalCodePanelProps) {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)
  const createdRef = useRef(false)

  useEffect(() => {
    if (createdRef.current) return
    if (!mcp || typeof mcp !== 'object' || !('servers' in mcp)) return
    createdRef.current = true

    let cancelled = false
    ;(async () => {
      try {
        const payload = buildCreateSessionPayload({
          mcp,
          name,
          projectContext,
          agent,
          runnerLabel,
          initialPrompt,
        })
        const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.message || `Session create failed (${response.status})`)
        }

        const created = (await response.json()) as Session
        if (cancelled) return
        setSession(created)
        onSessionCreated?.(created)
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        onError?.(err instanceof Error ? err : new Error(message))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mcp, name, projectContext, agent, runnerLabel, initialPrompt, onError, onSessionCreated])

  if (!mcp || typeof mcp !== 'object' || !('servers' in mcp)) {
    return (
      <div className="p-4 text-sm" style={{ color: 'var(--status-error)' }}>
        GalCodePanel: mcp config required — pass an <code>mcp</code> prop with at least{' '}
        <code>{'{ servers: {} }'}</code>.
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-sm" style={{ color: 'var(--status-error)' }}>
        Failed to start GAL Code session: {error}
      </div>
    )
  }

  if (!session) {
    return (
      <div className="p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Starting GAL Code session…
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <StructuredLogsView
        sessionId={session.id}
        agent={session.agent}
        sessionStatus={session.status}
      />
    </div>
  )
}
