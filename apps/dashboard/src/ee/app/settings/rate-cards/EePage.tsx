'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Save, DollarSign } from 'lucide-react'

interface RateCardModel {
  model: string
  promptUsdPerMtok: number
  completionUsdPerMtok: number
  version: string
  updatedAt: string
  updatedBy: string
}

interface RateCard {
  version: string
  rates: Record<string, { promptUsdPerMtok: number; completionUsdPerMtok: number }>
  fallback: { promptUsdPerMtok: number; completionUsdPerMtok: number }
}

interface ListResponse {
  rateCard: RateCard
  models: RateCardModel[]
}

const API_BASE_URL =
  process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'

function fmtPrice(n: number): string {
  return `$${n.toFixed(2)}/Mtok`
}

export default function RateCardsPage() {
  const [models, setModels] = useState<RateCardModel[]>([])
  const [rateCard, setRateCard] = useState<RateCard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingModel, setEditingModel] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ prompt: 0, completion: 0 })

  const fetchRateCards = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`${API_BASE_URL}/api/admin/rate-cards`, {
        credentials: 'include',
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.message || `HTTP ${resp.status}`)
      }
      const body: ListResponse = await resp.json()
      setModels(body.models)
      setRateCard(body.rateCard)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchRateCards()
  }, [fetchRateCards])

  const startEdit = (model: RateCardModel) => {
    setEditingModel(model.model)
    setEditForm({
      prompt: model.promptUsdPerMtok,
      completion: model.completionUsdPerMtok,
    })
  }

  const cancelEdit = () => {
    setEditingModel(null)
    setEditForm({ prompt: 0, completion: 0 })
  }

  const saveEdit = async (model: string) => {
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/admin/rate-cards/${encodeURIComponent(model)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            promptUsdPerMtok: editForm.prompt,
            completionUsdPerMtok: editForm.completion,
          }),
        },
      )
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.message || `HTTP ${resp.status}`)
      }
      setEditingModel(null)
      await fetchRateCards()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const seedDefaults = async () => {
    if (!confirm('Seed default rate cards to Firestore?')) return
    try {
      const resp = await fetch(`${API_BASE_URL}/api/admin/rate-cards/seed`, {
        method: 'POST',
        credentials: 'include',
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.message || `HTTP ${resp.status}`)
      }
      await fetchRateCards()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            Rate Cards
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Manage model pricing for GAL Code token usage. Changes take effect within 5 minutes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void seedDefaults()}
            className="text-sm rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 hover:bg-[var(--surface-hover)]"
          >
            Seed Defaults
          </button>
          <button
            onClick={() => void fetchRateCards()}
            className="inline-flex items-center gap-1 text-sm rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 hover:bg-[var(--surface-hover)]"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <div className="p-4 border-l-4 border-red-500 bg-red-50 text-red-700">
          {error}
        </div>
      ) : null}

      {rateCard ? (
        <div className="glass-card p-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Rate card version: <span className="font-mono">{rateCard.version}</span>
          </p>
        </div>
      ) : null}

      <section className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border)]">
              <th className="py-3 px-4 font-medium">Model</th>
              <th className="py-3 px-4 font-medium text-right">Prompt Price</th>
              <th className="py-3 px-4 font-medium text-right">Completion Price</th>
              <th className="py-3 px-4 font-medium">Updated</th>
              <th className="py-3 px-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr
                key={m.model}
                className="border-b border-[var(--border-subtle)] last:border-b-0"
              >
                <td className="py-3 px-4 font-mono">{m.model}</td>
                {editingModel === m.model ? (
                  <>
                    <td className="py-3 px-4 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.prompt}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            prompt: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-24 rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-right"
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.completion}
                        onChange={(e) =>
                          setEditForm((prev) => ({
                            ...prev,
                            completion: parseFloat(e.target.value) || 0,
                          }))
                        }
                        className="w-24 rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-right"
                      />
                    </td>
                    <td className="py-3 px-4" />
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => void saveEdit(m.model)}
                        className="text-green-600 hover:text-green-700 mr-2"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      >
                        Cancel
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-3 px-4 text-right font-mono">
                      {fmtPrice(m.promptUsdPerMtok)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {fmtPrice(m.completionUsdPerMtok)}
                    </td>
                    <td className="py-3 px-4 text-sm text-[var(--text-secondary)]">
                      {m.updatedAt ? new Date(m.updatedAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => startEdit(m)}
                        className="text-[var(--accent)] hover:underline text-sm"
                      >
                        Edit
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {models.length === 0 && !loading ? (
          <div className="p-8 text-center text-[var(--text-secondary)]">
            No rate cards found. Click "Seed Defaults" to populate from default rates.
          </div>
        ) : null}

        {loading ? (
          <div className="p-8 text-center text-[var(--text-secondary)]">
            Loading...
          </div>
        ) : null}
      </section>

      <div className="text-xs text-[var(--text-secondary)]">
        <p>
          <strong>Note:</strong> Changes are cached for 5 minutes. Token spend calculations
          will reflect new prices within 5 minutes of updating.
        </p>
        <p className="mt-1">
          If Firestore is unavailable, the system falls back to the default rate card.
        </p>
      </div>
    </div>
  )
}
