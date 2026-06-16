'use client'

/**
 * SupervisorWorkerPanel Component (#2140)
 *
 * Observability panel for supervisor/worker agent relationships.
 * Shows orchestrator health, worker pool occupancy, queue pressure,
 * dispatch metrics, and recent events.
 *
 * Auto-refreshes every 30 seconds with collapsible state persistence.
 */

import { useEffect, useState, useCallback } from 'react'
import {
  Activity,
  Gauge,
  Clock,
  AlertTriangle,
  Server,
  Zap,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_SUPERVISOR_METRICS } from '@/lib/demo-data'

// Types
export interface SupervisorMetricsResponse {
  supervisor: {
    isRunning: boolean
    isPaused: boolean
    activeSessions: number
    uptimeMs: number
    lastDecisionAt: string | null
  }
  workers: {
    totalActive: number
    totalCapacity: number
    occupancyPct: number
    byProvider: Array<{
      provider: string
      active: number
      max: number
      occupancyPct: number
      avgLatencyMs: number
      failureRate: number
    }>
  }
  queue: {
    depth: number
    pressurePct: number
    oldestItemAge: string | null
  }
  dispatch: {
    totalDispatched: number
    totalRetries: number
    totalFailures: number
    avgDispatchLatencyMs: number
    lastDispatchAt: string | null
  }
  recentEvents: Array<{
    id: string
    type: string
    message: string
    timestamp: string
    metadata?: Record<string, unknown>
  }>
  fetchedAt: string
}

// Helpers
function getOccupancyColor(pct: number): string {
  if (pct > 90) return 'var(--status-danger)'
  if (pct > 70) return 'var(--status-warning)'
  return 'var(--status-success)'
}

function getOccupancyBg(pct: number): string {
  if (pct > 90) return 'var(--status-danger-light)'
  if (pct > 70) return 'var(--status-warning-light)'
  return 'var(--status-success-light)'
}

function getFailureRateColor(rate: number): string {
  if (rate > 0.2) return 'var(--status-danger)'
  if (rate > 0.1) return 'var(--status-warning)'
  return 'var(--status-success)'
}

function getLatencyColor(ms: number): string {
  if (ms > 5000) return 'var(--status-danger)'
  if (ms > 2000) return 'var(--status-warning)'
  return 'var(--status-success)'
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Never'
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)

  if (diffSec < 60) return `${diffSec}s ago`
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  return date.toLocaleDateString()
}

// Component
const STORAGE_KEY = 'supervisor-worker-panel-open'

export function SupervisorWorkerPanel() {
  const { user } = useAuth()
  const selectedOrgName = useSelectedWorkspace()
  const [metrics, setMetrics] = useState<SupervisorMetricsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // #3990: Use SSR-safe initial value (true) to prevent React hydration mismatch.
  // The lazy initializer that read localStorage could produce a different value
  // than the server-rendered true, causing React error #418. We hydrate from
  // localStorage in a useEffect (two-pass render).
  const [isOpen, setIsOpen] = useState(true)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored !== null) {
        setIsOpen(stored === 'true')
      }
    } catch {
      // Ignore localStorage errors (e.g. private browsing)
    }
  }, [])

  const userOrgs = user?.organizations ?? []
  const canQuery = selectedOrgName ? userOrgs.includes(selectedOrgName) : false

  const fetchMetrics = useCallback(async () => {
    // In demo mode, serve pre-seeded supervisor metrics without real API calls
    if (isDemoMode()) {
      setMetrics(DEMO_SUPERVISOR_METRICS)
      setLoading(false)
      return
    }

    if (!canQuery || !selectedOrgName) return

    setLoading(true)
    setError(null)
    try {
      const data = await api.getSupervisorMetrics(selectedOrgName)
      setMetrics(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics')
    } finally {
      setLoading(false)
    }
  }, [canQuery, selectedOrgName])

  useEffect(() => {
    if (!canQuery || !selectedOrgName) return
    fetchMetrics()
    const interval = setInterval(fetchMetrics, 30_000)
    return () => clearInterval(interval)
  }, [fetchMetrics, canQuery, selectedOrgName])

  const toggleOpen = () => {
    const newState = !isOpen
    setIsOpen(newState)
    localStorage.setItem(STORAGE_KEY, String(newState))
  }

  if (!selectedOrgName) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
        <Activity className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">Select a workspace to view observability metrics</p>
      </div>
    )
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header */}
      <button
        onClick={toggleOpen}
        className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--surface-overlay-hover)]"
      >
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Supervisor/Worker Observability
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {loading && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Refreshing...</span>}
          {isOpen ? (
            <ChevronDown className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <ChevronRight className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          )}
        </div>
      </button>

      {/* Content */}
      {isOpen && (
        <div className="p-4 space-y-4">
          {error && (
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--status-danger-light)', color: 'var(--status-danger)' }}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}

          {!error && metrics && (
            <>
              {/* Top Row: Metric Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {/* Occupancy */}
                <div
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Gauge className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Occupancy
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {metrics.workers.totalActive}/{metrics.workers.totalCapacity}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
                    <div
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${Math.min(metrics.workers.occupancyPct, 100)}%`,
                        backgroundColor: getOccupancyColor(metrics.workers.occupancyPct),
                      }}
                    />
                  </div>
                  <span
                    className="text-xs mt-1 block"
                    style={{ color: getOccupancyColor(metrics.workers.occupancyPct) }}
                  >
                    {metrics.workers.occupancyPct.toFixed(1)}%
                  </span>
                </div>

                {/* Queue Pressure */}
                <div
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Queue
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {metrics.queue.depth}
                    </span>
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>items</span>
                  </div>
                  <span
                    className="text-xs mt-1 block"
                    style={{ color: getOccupancyColor(metrics.queue.pressurePct) }}
                  >
                    {metrics.queue.pressurePct.toFixed(1)}% pressure
                  </span>
                </div>

                {/* Dispatch Latency */}
                <div
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Dispatch Latency
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {metrics.dispatch.avgDispatchLatencyMs.toFixed(0)}
                    </span>
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>ms</span>
                  </div>
                  <span
                    className="text-xs mt-1 block"
                    style={{ color: getLatencyColor(metrics.dispatch.avgDispatchLatencyMs) }}
                  >
                    {formatTimestamp(metrics.dispatch.lastDispatchAt)}
                  </span>
                </div>

                {/* Failures */}
                <div
                  className="p-3 rounded-lg"
                  style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Failures
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {metrics.dispatch.totalFailures}
                    </span>
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      / {metrics.dispatch.totalDispatched}
                    </span>
                  </div>
                  <span className="text-xs mt-1 block" style={{ color: 'var(--text-muted)' }}>
                    {metrics.dispatch.totalRetries} retries
                  </span>
                </div>
              </div>

              {/* Per-Provider Table */}
              {metrics.workers.byProvider.length > 0 && (
                <div
                  className="rounded-lg overflow-hidden"
                  style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Provider Breakdown
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead style={{ backgroundColor: 'var(--bg-primary)' }}>
                        <tr>
                          <th className="px-4 py-2 text-left" style={{ color: 'var(--text-secondary)' }}>Provider</th>
                          <th className="px-4 py-2 text-center" style={{ color: 'var(--text-secondary)' }}>Active</th>
                          <th className="px-4 py-2 text-center" style={{ color: 'var(--text-secondary)' }}>Max</th>
                          <th className="px-4 py-2 text-center" style={{ color: 'var(--text-secondary)' }}>Occupancy</th>
                          <th className="px-4 py-2 text-center" style={{ color: 'var(--text-secondary)' }}>Avg Latency</th>
                          <th className="px-4 py-2 text-center" style={{ color: 'var(--text-secondary)' }}>Failure Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.workers.byProvider.map((provider) => (
                          <tr
                            key={provider.provider}
                            className="border-t"
                            style={{ borderColor: 'var(--border-subtle)' }}
                          >
                            <td className="px-4 py-2" style={{ color: 'var(--text-primary)' }}>
                              <span className="font-medium capitalize">{provider.provider}</span>
                            </td>
                            <td className="px-4 py-2 text-center" style={{ color: 'var(--text-primary)' }}>
                              {provider.active}
                            </td>
                            <td className="px-4 py-2 text-center" style={{ color: 'var(--text-primary)' }}>
                              {provider.max}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span
                                className="px-2 py-1 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: getOccupancyBg(provider.occupancyPct),
                                  color: getOccupancyColor(provider.occupancyPct),
                                }}
                              >
                                {provider.occupancyPct.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span
                                className="text-xs"
                                style={{ color: getLatencyColor(provider.avgLatencyMs) }}
                              >
                                {provider.avgLatencyMs.toFixed(0)}ms
                              </span>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span
                                className="text-xs"
                                style={{ color: getFailureRateColor(provider.failureRate) }}
                              >
                                {(provider.failureRate * 100).toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Recent Events */}
              {metrics.recentEvents.length > 0 && (
                <div
                  className="rounded-lg overflow-hidden"
                  style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="px-4 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    <h4 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                      Recent Events
                    </h4>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {metrics.recentEvents.map((event) => (
                      <div
                        key={event.id}
                        className="px-4 py-2 border-b hover:bg-[var(--surface-overlay-hover)]"
                        style={{ borderColor: 'var(--border-subtle)' }}
                      >
                        <div className="flex items-start gap-2">
                          <Zap className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className="px-2 py-0.5 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: 'var(--bg-primary)',
                                  color: 'var(--text-secondary)',
                                }}
                              >
                                {event.type}
                              </span>
                              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                {formatTimestamp(event.timestamp)}
                              </span>
                            </div>
                            <p className="text-sm mt-1" style={{ color: 'var(--text-primary)' }}>
                              {event.message}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
