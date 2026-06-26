'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, AlertCircle } from 'lucide-react'
import { FeatureGate } from '@/components/FeatureGate'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { BudgetEditor } from '@/components/token-spend/BudgetEditor'

type Window = '1h' | '24h' | '7d' | '30d'

interface UserRow {
  login: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number
}

interface ModelRow {
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number
}

interface TokenSpendData {
  organization: string
  window: Window
  totalPromptTokens: number
  totalCompletionTokens: number
  totalTokens: number
  totalCostUsd: number
  byUser: UserRow[]
  byModel: ModelRow[]
  rateCardVersion: string
}

const API_BASE_URL =
  process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

function fmtCost(n: number): string {
  return `$${n.toFixed(4)}`
}

const WINDOW_OPTIONS: { value: Window; label: string }[] = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

export default function TokenSpendPage() {
  const { user } = useAuth()
  const { isPageVisibleForUser, loading: flagsLoading } = useFeatureFlags()
  const selectedWorkspace = useSelectedWorkspace()
  const userOrgs = user?.organizations ?? []
  // #6285: gate on the audience-aware resolver (evaluates audienceTier + applies
  // the EE collapse), NOT the global isPageEnabled flag — otherwise a customer-tier
  // workspace could reach the full Token Spend dashboard + BudgetEditor.
  const enabled =
    flagsLoading || isPageVisibleForUser('token-spend', userOrgs, selectedWorkspace)

  const [window, setWindow] = useState<Window>('24h')
  const [data, setData] = useState<TokenSpendData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (w: Window) => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/token-spend?window=${w}`,
        { credentials: 'include' },
      )
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.message || `HTTP ${resp.status}`)
      }
      const body = await resp.json()
      if (!body.success) {
        throw new Error(body.message || 'Unknown error')
      }
      setData(body.data as TokenSpendData)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void fetchData(window)
  }, [window, fetchData, enabled])

  const stats = useMemo(
    () => [
      {
        label: 'Total tokens',
        value: data ? fmtTokens(data.totalTokens) : '—',
      },
      {
        label: 'Prompt tokens',
        value: data ? fmtTokens(data.totalPromptTokens) : '—',
      },
      {
        label: 'Completion tokens',
        value: data ? fmtTokens(data.totalCompletionTokens) : '—',
      },
      {
        label: 'Estimated cost (USD)',
        value: data ? fmtCost(data.totalCostUsd) : '—',
      },
    ],
    [data],
  )

  if (!enabled) {
    return <FeatureGate pageId="token-spend" />
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Token Spend</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            GAL Code token usage &amp; estimated cost for your organization
            {data ? (
              <>
                {' '}
                —{' '}
                <span className="font-mono text-xs">
                  {data.organization}
                </span>
              </>
            ) : null}
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={window}
            onChange={(e) => setWindow(e.target.value as Window)}
            className="text-sm rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5"
            aria-label="Time window"
          >
            {WINDOW_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => void fetchData(window)}
            className="inline-flex items-center gap-1 text-sm rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 hover:bg-[var(--surface-hover)]"
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <div className="glass-card p-4 border-l-4 border-red-500 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Failed to load token spend</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">{error}</p>
          </div>
        </div>
      ) : null}

      <section aria-label="Summary" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="glass-card p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
              {s.label}
            </p>
            <p className="text-2xl font-semibold mt-2 font-mono">{s.value}</p>
          </div>
        ))}
      </section>

      <section aria-label="Top users" className="glass-card p-4">
        <h2 className="text-lg font-semibold mb-3">Top users</h2>
        {data && data.byUser.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border)]">
                  <th className="py-2 pr-4 font-medium">User</th>
                  <th className="py-2 pr-4 font-medium text-right">Prompt</th>
                  <th className="py-2 pr-4 font-medium text-right">Completion</th>
                  <th className="py-2 pr-4 font-medium text-right">Total</th>
                  <th className="py-2 pr-0 font-medium text-right">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {data.byUser.map((u) => (
                  <tr key={u.login} className="border-b border-[var(--border-subtle)] last:border-b-0">
                    <td className="py-2 pr-4 font-mono">{u.login}</td>
                    <td className="py-2 pr-4 text-right font-mono">{fmtTokens(u.promptTokens)}</td>
                    <td className="py-2 pr-4 text-right font-mono">{fmtTokens(u.completionTokens)}</td>
                    <td className="py-2 pr-4 text-right font-mono">{fmtTokens(u.totalTokens)}</td>
                    <td className="py-2 pr-0 text-right font-mono">{fmtCost(u.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            {loading ? 'Loading…' : 'No token usage in this window yet.'}
          </p>
        )}
      </section>

      <section aria-label="By model" className="glass-card p-4">
        <h2 className="text-lg font-semibold mb-3">By model</h2>
        {data && data.byModel.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border)]">
                  <th className="py-2 pr-4 font-medium">Model</th>
                  <th className="py-2 pr-4 font-medium text-right">Prompt</th>
                  <th className="py-2 pr-4 font-medium text-right">Completion</th>
                  <th className="py-2 pr-4 font-medium text-right">Total</th>
                  <th className="py-2 pr-0 font-medium text-right">Est. cost</th>
                </tr>
              </thead>
              <tbody>
                {data.byModel.map((m) => (
                  <tr key={m.model} className="border-b border-[var(--border-subtle)] last:border-b-0">
                    <td className="py-2 pr-4 font-mono">{m.model}</td>
                    <td className="py-2 pr-4 text-right font-mono">{fmtTokens(m.promptTokens)}</td>
                    <td className="py-2 pr-4 text-right font-mono">{fmtTokens(m.completionTokens)}</td>
                    <td className="py-2 pr-4 text-right font-mono">{fmtTokens(m.totalTokens)}</td>
                    <td className="py-2 pr-0 text-right font-mono">{fmtCost(m.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            {loading ? 'Loading…' : 'No model activity in this window yet.'}
          </p>
        )}
      </section>

      {data ? (
        <p className="text-xs text-[var(--text-secondary)]">
          Rate card: {data.rateCardVersion} · Window: {data.window}
        </p>
      ) : null}

      <section aria-label="Budget Alerts">
        <BudgetEditor />
      </section>
    </div>
  )
}
