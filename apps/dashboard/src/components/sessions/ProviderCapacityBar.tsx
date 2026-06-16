'use client'

/**
 * ProviderCapacityBar Component (#1724)
 *
 * Displays a small status bar showing worker pool capacity per provider
 * (claude/codex/gemini/GAL Code) near the session creation area.
 *
 * Active count source of truth (#5207):
 * When `sessions` prop is provided the numerator is computed by counting
 * sessions whose `agent` matches the provider AND whose status is an active
 * capacity-consuming status (ACTIVE / INITIALIZING / PENDING).  The capacity
 * endpoint's `active` field is only used as a fallback when no session list is
 * available (e.g. standalone usage outside BackgroundAgentsPage).
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'
import type { Session, SessionAgent } from '@gal/types'

// ─────────────────────────────────────────────────────────────────
// Types (mirroring server-side WorkerPool types from @gal/types)
// ─────────────────────────────────────────────────────────────────

export interface ProviderCapacity {
  provider: 'claude' | 'codex' | 'gemini' | 'oss' | 'firebase'
  active: number
  max: number
  available: boolean
  pending: number
  maxPending: number
  pendingAvailable: boolean
  blockingReason?: 'concurrency_limit' | 'pending_limit' | 'global_limit'
}

export interface CapacitySnapshot {
  providers: Record<string, ProviderCapacity>
  totalActive: number
  globalMax: number
  globalAvailable: boolean
  totalPending: number
  globalMaxPending: number
  globalPendingAvailable: boolean
  fetchedAt: string
}

// ─────────────────────────────────────────────────────────────────
// Session-list active count helpers (#5207)
// ─────────────────────────────────────────────────────────────────

/** Session statuses that consume worker pool capacity (mirrors server-side ACTIVE_STATUSES) */
const CAPACITY_ACTIVE_STATUSES = new Set<string>(['ACTIVE', 'INITIALIZING', 'PENDING'])

/** Agents that belong to each WorkerProvider bucket (#5207) */
const PROVIDER_AGENT_MAP: Record<'claude' | 'codex' | 'gemini' | 'oss', Set<SessionAgent>> = {
  claude: new Set(['claude']),
  codex: new Set(['codex']),
  gemini: new Set(['gemini']),
  oss: new Set(['oss', 'gal']),
}

/**
 * Count sessions that consume capacity for a given provider from a client-side
 * session list.  This is the authoritative active-count source when sessions
 * are passed to ProviderCapacityBar, preventing the bug where the capacity
 * endpoint's `active` field could equal `maxConcurrentAgents` for providers
 * with zero real active sessions (#5207).
 */
export function countActiveSessionsForProvider(
  sessions: Session[],
  provider: 'claude' | 'codex' | 'gemini' | 'oss',
): number {
  const agentSet = PROVIDER_AGENT_MAP[provider]
  return sessions.filter(
    (s) =>
      s.agent != null &&
      agentSet.has(s.agent as SessionAgent) &&
      CAPACITY_ACTIVE_STATUSES.has(s.status),
  ).length
}

// ─────────────────────────────────────────────────────────────────
// Provider display config
// ─────────────────────────────────────────────────────────────────

const PROVIDER_DISPLAY: Record<'claude' | 'codex' | 'gemini' | 'oss', { label: string; icon: string }> = {
  claude: { label: 'Claude', icon: '\uD83E\uDD16' },
  codex: { label: 'Codex', icon: '\uD83C\uDF1F' },
  gemini: { label: 'Gemini', icon: '\uD83D\uDC8E' },
  oss: { label: 'GAL Code', icon: '\uD83E\uDD16' },
}

const DEMO_CAPACITY_SNAPSHOT: CapacitySnapshot = {
  providers: {
    claude: { provider: 'claude', active: 2, max: 4, available: true, pending: 0, maxPending: 10, pendingAvailable: true },
    codex: { provider: 'codex', active: 1, max: 3, available: true, pending: 0, maxPending: 10, pendingAvailable: true },
    gemini: { provider: 'gemini', active: 1, max: 2, available: true, pending: 0, maxPending: 10, pendingAvailable: true },
  },
  totalActive: 4,
  globalMax: 10,
  globalAvailable: true,
  totalPending: 0,
  globalMaxPending: 30,
  globalPendingAvailable: true,
  fetchedAt: '2026-03-10T09:00:00Z',
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Sanitize capacity data from the API response (#5207).
 *
 * Ensures `active` is always a valid non-negative number and never
 * exceeds `max`. This guards against malformed responses or upstream
 * query issues where the `active` field might be set to the
 * configured max instead of the true live count.
 */
function sanitizeCapacity(raw: ProviderCapacity): ProviderCapacity {
  const max = typeof raw.max === 'number' && Number.isFinite(raw.max) ? Math.max(0, raw.max) : 0
  let active =
    typeof raw.active === 'number' && Number.isFinite(raw.active) ? Math.max(0, raw.active) : 0

  // Clamp active to max — active > max is never valid
  if (active > max) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        `[ProviderCapacityBar] active (${raw.active}) > max (${max}) for ${raw.provider} — clamping`,
      )
    }
    active = max
  }

  return { ...raw, active, max }
}

function getCapacityColor(capacity: ProviderCapacity): string {
  if (!capacity.available) return 'var(--status-danger)'
  if (capacity.active >= capacity.max - 1) return 'var(--status-warning)'
  return 'var(--status-success)'                          // green - available
}

function getCapacityBg(capacity: ProviderCapacity): string {
  if (!capacity.available) return 'var(--status-danger-light)'
  if (capacity.active >= capacity.max - 1) return 'var(--status-warning-light)'
  return 'var(--status-success-light)'
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────

interface ProviderCapacityBarProps {
  /** Refresh interval in ms (default: 30_000) */
  refreshIntervalMs?: number
  /** Only show bar when session creation area is visible */
  visible?: boolean
  /**
   * Live session list from the parent page (#5207).
   * When provided the active count for each provider is derived from this list
   * instead of from the capacity endpoint's `active` field.  This prevents the
   * display bug where the numerator equalled `maxConcurrentAgents` for
   * providers (e.g. Codex, Gemini) that had zero real active sessions.
   */
  sessions?: Session[]
}

export function ProviderCapacityBar({
  refreshIntervalMs = 30_000,
  visible = true,
  sessions,
}: ProviderCapacityBarProps) {
  const [snapshot, setSnapshot] = useState<CapacitySnapshot | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchCapacity = useCallback(async () => {
    if (isDemoMode()) {
      setSnapshot(DEMO_CAPACITY_SNAPSHOT)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions/capacity`)
      if (response.ok) {
        const data: CapacitySnapshot = await response.json()
        setSnapshot(data)
      }
    } catch {
      // Silently fail - capacity bar is informational only
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    fetchCapacity()
    const interval = setInterval(fetchCapacity, refreshIntervalMs)
    return () => clearInterval(interval)
  }, [visible, fetchCapacity, refreshIntervalMs])

  // #5207 — When a live session list is provided, compute per-provider active
  // counts from it instead of relying on the capacity endpoint's `active` field.
  // This fixes the bug where the API could return active === maxConcurrentAgents
  // for Codex / Gemini even when no real active sessions existed for those providers.
  const sessionActiveCounts = useMemo<Record<'claude' | 'codex' | 'gemini' | 'oss', number> | null>(() => {
    if (!sessions) return null
    return {
      claude: countActiveSessionsForProvider(sessions, 'claude'),
      codex: countActiveSessionsForProvider(sessions, 'codex'),
      gemini: countActiveSessionsForProvider(sessions, 'gemini'),
      oss: countActiveSessionsForProvider(sessions, 'oss'),
    }
  }, [sessions])

  if (!visible || (!loading && !snapshot)) {
    return null
  }

  const providers: Array<'claude' | 'codex' | 'gemini' | 'oss'> = ['claude', 'codex', 'gemini', 'oss']

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
      }}
      title="Workspace-wide worker pool capacity (active / max sessions)"
    >
      <span style={{ color: 'var(--text-muted)' }} className="mr-1 shrink-0">
        Workspace Pool
      </span>
      {loading && !snapshot ? (
        <span style={{ color: 'var(--text-muted)' }}>loading...</span>
      ) : (
        <div className="flex items-center gap-2">
          {providers.map((provider) => {
            const rawCap = snapshot?.providers[provider]
            if (!rawCap) return null
            const cap = sanitizeCapacity(rawCap)
            // #5207: Override active count with session-list derived value when available
            const activeCount = sessionActiveCounts != null
              ? sessionActiveCounts[provider]
              : cap.active
            const displayCap = { ...cap, active: activeCount }
            const color = getCapacityColor(displayCap)
            const bg = getCapacityBg(displayCap)
            const display = PROVIDER_DISPLAY[provider]
            return (
              <span
                key={provider}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded"
                style={{ backgroundColor: bg, color }}
                title={`${display.label}: ${activeCount}/${cap.max} active`}
              >
                <span>{display.icon}</span>
                <span className="font-mono">
                  {activeCount}/{cap.max}
                </span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ProviderCapacityBar
