'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Plus,
  Trash2,
  Bell,
  Webhook,
  Mail,
  MessageSquare,
  Save,
  X,
  Pencil,
  Loader2,
} from 'lucide-react'

type BudgetType = 'tokens' | 'usd'
type BudgetWindow = '1h' | '24h' | '7d' | '30d'
type WebhookType = 'generic' | 'slack' | 'email'

interface Webhook {
  id: string
  type: WebhookType
  url: string
  enabled: boolean
  lastTriggeredAt?: string
  lastError?: string
}

interface Budget {
  budgetId: string
  organization: string
  userLogin: string
  type: BudgetType
  limit: number
  window: BudgetWindow
  webhooks: Webhook[]
  dedupeHours: number
  enabled: boolean
  createdAt: string
  updatedAt: string
  createdBy: string
  lastAlertAt?: string
}

interface EditableWebhook {
  id?: string
  type: WebhookType
  url: string
  enabled: boolean
}

interface BudgetFormData {
  userLogin: string
  type: BudgetType
  limit: number
  window: BudgetWindow
  dedupeHours: number
  enabled: boolean
  webhooks: EditableWebhook[]
}

const API_BASE_URL =
  process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'

const WINDOW_OPTIONS: { value: BudgetWindow; label: string }[] = [
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
]

const TYPE_OPTIONS: { value: BudgetType; label: string }[] = [
  { value: 'tokens', label: 'Tokens' },
  { value: 'usd', label: 'USD' },
]

const WEBHOOK_TYPE_OPTIONS: { value: WebhookType; label: string; icon: typeof Webhook }[] = [
  { value: 'generic', label: 'Generic HTTPS', icon: Webhook },
  { value: 'slack', label: 'Slack', icon: MessageSquare },
  { value: 'email', label: 'Email', icon: Mail },
]

interface BudgetEditorProps {
  onBudgetCreated?: () => void
}

function createEmptyFormData(): BudgetFormData {
  return {
    userLogin: '',
    type: 'tokens',
    limit: 1_000_000,
    window: '24h',
    dedupeHours: 24,
    enabled: true,
    webhooks: [],
  }
}

function budgetToFormData(budget: Budget): BudgetFormData {
  return {
    userLogin: budget.userLogin,
    type: budget.type,
    limit: budget.limit,
    window: budget.window,
    dedupeHours: budget.dedupeHours,
    enabled: budget.enabled,
    webhooks: budget.webhooks.map((webhook) => ({
      id: webhook.id,
      type: webhook.type,
      url: webhook.url,
      enabled: webhook.enabled,
    })),
  }
}

export function BudgetEditor({ onBudgetCreated }: BudgetEditorProps) {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null)
  const [formData, setFormData] = useState<BudgetFormData>(createEmptyFormData())

  const fetchBudgets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`${API_BASE_URL}/api/admin/token-budgets`, {
        credentials: 'include',
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.message || `HTTP ${resp.status}`)
      }
      const body = await resp.json()
      setBudgets(body.budgets || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchBudgets()
  }, [fetchBudgets])

  const openCreateForm = () => {
    setEditingBudgetId(null)
    setFormData(createEmptyFormData())
    setShowForm(true)
  }

  const openEditForm = (budget: Budget) => {
    setEditingBudgetId(budget.budgetId)
    setFormData(budgetToFormData(budget))
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingBudgetId(null)
    setFormData(createEmptyFormData())
  }

  const saveBudget = async () => {
    setSaving(true)
    try {
      const payload = {
        userLogin: formData.userLogin,
        type: formData.type,
        limit: formData.limit,
        window: formData.window,
        dedupeHours: formData.dedupeHours,
        enabled: formData.enabled,
        webhooks: formData.webhooks.map((webhook) => ({
          id: webhook.id,
          type: webhook.type,
          url: webhook.url,
          enabled: webhook.enabled,
        })),
      }

      const isEditing = editingBudgetId !== null
      const resp = await fetch(
        isEditing
          ? `${API_BASE_URL}/api/admin/token-budgets/${editingBudgetId}`
          : `${API_BASE_URL}/api/admin/token-budgets`,
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        },
      )
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.message || `HTTP ${resp.status}`)
      }
      closeForm()
      await fetchBudgets()
      onBudgetCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const deleteBudget = async (budgetId: string) => {
    if (!confirm('Delete this budget?')) return
    try {
      const resp = await fetch(
        `${API_BASE_URL}/api/admin/token-budgets/${budgetId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        },
      )
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.message || `HTTP ${resp.status}`)
      }
      await fetchBudgets()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const addWebhookToForm = () => {
    setFormData((prev) => ({
      ...prev,
      webhooks: [...prev.webhooks, { type: 'generic', url: '', enabled: true }],
    }))
  }

  const removeWebhookFromForm = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      webhooks: prev.webhooks.filter((_, i) => i !== index),
    }))
  }

  const updateWebhookInForm = (index: number, field: 'type' | 'url', value: string) => {
    setFormData((prev) => ({
      ...prev,
      webhooks: prev.webhooks.map((w, i) =>
        i === index ? { ...w, [field]: value } : w,
      ),
    }))
  }

  const toggleWebhookEnabledInForm = (index: number, enabled: boolean) => {
    setFormData((prev) => ({
      ...prev,
      webhooks: prev.webhooks.map((w, i) =>
        i === index ? { ...w, enabled } : w,
      ),
    }))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Budget Alerts
        </h2>
        <button
          onClick={openCreateForm}
          className="inline-flex items-center gap-1 text-sm rounded bg-[var(--accent)] text-white px-3 py-1.5 hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Add Budget
        </button>
      </div>

      {error ? (
        <div className="p-3 border border-red-300 rounded text-red-700 text-sm">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <div className="glass-card p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-medium">
                {editingBudgetId ? 'Edit Budget' : 'New Budget'}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Update the limit, alert window, and webhook targets for this budget.
              </p>
            </div>
            {editingBudgetId ? (
              <span className="text-xs rounded-full border border-[var(--border)] bg-[var(--surface-sunken)] px-2 py-1 text-[var(--text-secondary)]">
                Editing
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                User Login (or * for all users)
              </label>
              <input
                type="text"
                value={formData.userLogin}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, userLogin: e.target.value }))
                }
                placeholder="alice or *"
                className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                Budget Type
              </label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    type: e.target.value as BudgetType,
                  }))
                }
                className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm"
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                Limit
              </label>
              <input
                type="number"
                value={formData.limit}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    limit: parseInt(e.target.value, 10) || 0,
                  }))
                }
                className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                Window
              </label>
              <select
                value={formData.window}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    window: e.target.value as BudgetWindow,
                  }))
                }
                className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm"
              >
                {WINDOW_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                Dedupe Hours
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={formData.dedupeHours}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    dedupeHours: Math.max(
                      1,
                      Number.parseInt(e.target.value, 10) || 1,
                    ),
                  }))
                }
                className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm font-mono"
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, enabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-[var(--border)]"
                />
                Enabled
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[var(--text-secondary)]">
                Webhooks
              </label>
              <button
                onClick={addWebhookToForm}
                className="text-xs text-[var(--accent)] hover:underline"
              >
                + Add webhook
              </button>
            </div>
            {formData.webhooks.map((webhook, index) => (
              <div
                key={webhook.id ?? index}
                className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3 md:grid-cols-[180px_minmax(0,1fr)_auto]"
              >
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">
                    Type
                  </label>
                  <select
                    value={webhook.type}
                    onChange={(e) =>
                      updateWebhookInForm(index, 'type', e.target.value)
                    }
                    className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-1 text-sm"
                  >
                    {WEBHOOK_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">
                    Destination
                  </label>
                  <input
                    type="text"
                    value={webhook.url}
                    onChange={(e) =>
                      updateWebhookInForm(index, 'url', e.target.value)
                    }
                    placeholder="https://hooks.slack.com/..."
                    className="w-full rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1 text-sm"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={webhook.enabled}
                        onChange={(e) =>
                          toggleWebhookEnabledInForm(index, e.target.checked)
                        }
                        className="h-4 w-4 rounded border-[var(--border)]"
                      />
                      Enabled
                    </label>
                  </div>
                </div>
                <div className="flex items-start md:items-end justify-end">
                  <button
                    onClick={() => removeWebhookFromForm(index)}
                    className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={closeForm}
              className="text-sm rounded border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-1.5 hover:bg-[var(--surface-hover)]"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={() => void saveBudget()}
              disabled={saving}
              className="inline-flex items-center gap-1 text-sm rounded bg-[var(--accent)] text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingBudgetId ? 'Update Budget' : 'Save'}
            </button>
          </div>
        </div>
      ) : null}

      {budgets.length > 0 ? (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border)]">
                <th className="py-2 px-4 font-medium">User</th>
                <th className="py-2 px-4 font-medium">Limit</th>
                <th className="py-2 px-4 font-medium">Window</th>
                <th className="py-2 px-4 font-medium">Webhooks</th>
                <th className="py-2 px-4 font-medium">Status</th>
                <th className="py-2 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((budget) => (
                <tr
                  key={budget.budgetId}
                  className="border-b border-[var(--border-subtle)] last:border-b-0"
                >
                  <td className="py-2 px-4 font-mono">{budget.userLogin}</td>
                  <td className="py-2 px-4 font-mono">
                    {budget.limit.toLocaleString()} {budget.type}
                  </td>
                  <td className="py-2 px-4">{budget.window}</td>
                  <td className="py-2 px-4">
                    {budget.webhooks.length > 0
                      ? budget.webhooks.map((w) => w.type).join(', ')
                      : '—'}
                  </td>
                  <td className="py-2 px-4">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        budget.enabled
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {budget.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-right">
                    <button
                      onClick={() => openEditForm(budget)}
                      className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline text-sm mr-3"
                    >
                      <Pencil className="h-4 w-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => deleteBudget(budget.budgetId)}
                      className="text-[var(--text-secondary)] hover:text-red-500"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Loading budgets…</p>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">
          No budgets configured. Click "Add Budget" to create one.
        </p>
      )}
    </div>
  )
}
