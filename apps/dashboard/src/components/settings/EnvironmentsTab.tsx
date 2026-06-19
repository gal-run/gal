'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  Edit2,
  ChevronDown,
  ChevronRight,
  Loader2,
  X,
  Check,
  Eye,
  EyeOff,
  Package,
} from 'lucide-react'
import { api } from '@/lib/api'
import type {
  EnvironmentConfig,
  EnvironmentEnvVar,
  EnvironmentSecretRef,
  UpsertEnvironmentPayload,
} from '@/lib/api'

// =============================================================================
// Types / helpers
// =============================================================================

function emptyPayload(): UpsertEnvironmentPayload {
  return { name: '', description: '', envVars: [], secretRefs: [], runtime: { baseImage: '', packages: [], notes: '' } }
}

// =============================================================================
// Sub-components
// =============================================================================

function EnvVarRow({
  ev,
  showValue,
  onToggleShow,
  onDelete,
}: {
  ev: EnvironmentEnvVar
  showValue: boolean
  onToggleShow: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-[var(--border-subtle)] last:border-0">
      <span className="font-mono text-xs text-[var(--text-primary)] w-40 truncate shrink-0">{ev.key}</span>
      <span className="font-mono text-xs text-[var(--text-secondary)] flex-1 truncate">
        {showValue ? ev.value : '••••••••'}
      </span>
      {ev.description && (
        <span className="text-xs text-[var(--text-muted)] truncate max-w-[8rem]">{ev.description}</span>
      )}
      <button
        onClick={onToggleShow}
        className="p-1 rounded hover:bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        title={showValue ? 'Hide value' : 'Show value'}
      >
        {showValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button
        onClick={onDelete}
        className="p-1 rounded hover:bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:text-[var(--status-danger)] transition-colors"
        title="Remove"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function SecretRefRow({
  sr,
  onDelete,
}: {
  sr: EnvironmentSecretRef
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-[var(--border-subtle)] last:border-0">
      <span className="font-mono text-xs text-[var(--text-primary)] flex-1 truncate">{sr.key}</span>
      <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--badge-gray-bg)] text-[var(--text-muted)]">secret</span>
      {sr.description && (
        <span className="text-xs text-[var(--text-muted)] truncate max-w-[8rem]">{sr.description}</span>
      )}
      <button
        onClick={onDelete}
        className="p-1 rounded hover:bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:text-[var(--status-danger)] transition-colors"
        title="Remove"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// =============================================================================
// Environment Form (used for create + edit)
// =============================================================================

function EnvironmentForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: UpsertEnvironmentPayload
  onSave: (payload: UpsertEnvironmentPayload) => Promise<void>
  onCancel: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<UpsertEnvironmentPayload>(() => JSON.parse(JSON.stringify(initial)))

  // env var entry state
  const [evKey, setEvKey] = useState('')
  const [evValue, setEvValue] = useState('')
  const [evDesc, setEvDesc] = useState('')
  const [evError, setEvError] = useState('')

  // secret ref entry state
  const [srKey, setSrKey] = useState('')
  const [srDesc, setSrDesc] = useState('')
  const [srError, setSrError] = useState('')

  // package entry
  const [pkgInput, setPkgInput] = useState('')

  const [formError, setFormError] = useState('')

  const envVarKeyPattern = /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/

  function addEnvVar() {
    if (!evKey) { setEvError('Key is required'); return }
    if (!envVarKeyPattern.test(evKey)) { setEvError('Key must start with a letter or underscore and contain only alphanumeric characters, underscores, or hyphens'); return }
    if ((form.envVars ?? []).some(e => e.key === evKey)) { setEvError('Duplicate key'); return }
    setEvError('')
    setForm(f => ({ ...f, envVars: [...(f.envVars ?? []), { key: evKey, value: evValue, ...(evDesc ? { description: evDesc } : {}) }] }))
    setEvKey(''); setEvValue(''); setEvDesc('')
  }

  function removeEnvVar(key: string) {
    setForm(f => ({ ...f, envVars: (f.envVars ?? []).filter(e => e.key !== key) }))
  }

  function addSecretRef() {
    if (!srKey) { setSrError('Key is required'); return }
    if (!envVarKeyPattern.test(srKey)) { setSrError('Key must start with a letter or underscore'); return }
    if ((form.secretRefs ?? []).some(s => s.key === srKey)) { setSrError('Duplicate key'); return }
    setSrError('')
    setForm(f => ({ ...f, secretRefs: [...(f.secretRefs ?? []), { key: srKey, ...(srDesc ? { description: srDesc } : {}) }] }))
    setSrKey(''); setSrDesc('')
  }

  function removeSecretRef(key: string) {
    setForm(f => ({ ...f, secretRefs: (f.secretRefs ?? []).filter(s => s.key !== key) }))
  }

  function addPackage() {
    const pkg = pkgInput.trim()
    if (!pkg) return
    setForm(f => ({ ...f, runtime: { ...f.runtime, packages: [...((f.runtime?.packages) ?? []), pkg] } }))
    setPkgInput('')
  }

  function removePackage(pkg: string) {
    setForm(f => ({ ...f, runtime: { ...f.runtime, packages: (f.runtime?.packages ?? []).filter(p => p !== pkg) } }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name?.trim()) { setFormError('Name is required'); return }
    setFormError('')
    await onSave(form)
  }

  const inputCls = "w-full px-3 py-2 text-sm bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
  const smallInputCls = "px-2.5 py-1.5 text-xs bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name + Description */}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Name <span className="text-[var(--status-danger)]">*</span></label>
          <input
            className={inputCls}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. GCloud Production"
            required
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">Description</label>
          <input
            className={inputCls}
            value={form.description ?? ''}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Optional description"
          />
        </div>
      </div>

      {/* Environment Variables */}
      <div>
        <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">Environment Variables</h4>
        {(form.envVars ?? []).length > 0 && (
          <div className="mb-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-1">
            {(form.envVars ?? []).map(ev => (
              <div key={ev.key} className="flex items-center gap-2 py-1.5 border-b border-[var(--border-subtle)] last:border-0">
                <span className="font-mono text-xs text-[var(--text-primary)] w-36 truncate shrink-0">{ev.key}</span>
                <span className="font-mono text-xs text-[var(--text-muted)] flex-1 truncate">••••••••</span>
                <button type="button" onClick={() => removeEnvVar(ev.key)} className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--status-danger)]"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs text-[var(--text-muted)] mb-1">Key</label>
            <input className={smallInputCls + ' w-full'} value={evKey} onChange={e => setEvKey(e.target.value)} placeholder="MY_VAR" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEnvVar())} />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-[var(--text-muted)] mb-1">Value</label>
            <input className={smallInputCls + ' w-full'} value={evValue} onChange={e => setEvValue(e.target.value)} placeholder="value" type="password" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEnvVar())} />
          </div>
          <div className="w-28">
            <label className="block text-xs text-[var(--text-muted)] mb-1">Description</label>
            <input className={smallInputCls + ' w-full'} value={evDesc} onChange={e => setEvDesc(e.target.value)} placeholder="optional" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEnvVar())} />
          </div>
          <button
            type="button"
            onClick={addEnvVar}
            className="px-3 py-1.5 text-xs font-medium bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors whitespace-nowrap"
          >
            Add
          </button>
        </div>
        {evError && <p className="mt-1 text-xs text-[var(--status-danger)]">{evError}</p>}
      </div>

      {/* Secret References */}
      <div>
        <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">Secret References</h4>
        <p className="text-xs text-[var(--text-muted)] mb-2">Reference secrets stored in Agent Credentials. Values are masked and resolved at dispatch.</p>
        {(form.secretRefs ?? []).length > 0 && (
          <div className="mb-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-1">
            {(form.secretRefs ?? []).map(sr => (
              <div key={sr.key} className="flex items-center gap-2 py-1.5 border-b border-[var(--border-subtle)] last:border-0">
                <span className="font-mono text-xs text-[var(--text-primary)] flex-1 truncate">{sr.key}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--badge-gray-bg)] text-[var(--text-muted)]">secret</span>
                <button type="button" onClick={() => removeSecretRef(sr.key)} className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--status-danger)]"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs text-[var(--text-muted)] mb-1">Secret key name</label>
            <input className={smallInputCls + ' w-full'} value={srKey} onChange={e => setSrKey(e.target.value)} placeholder="ANTHROPIC_API_KEY" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSecretRef())} />
          </div>
          <div className="w-36">
            <label className="block text-xs text-[var(--text-muted)] mb-1">Description</label>
            <input className={smallInputCls + ' w-full'} value={srDesc} onChange={e => setSrDesc(e.target.value)} placeholder="optional" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSecretRef())} />
          </div>
          <button
            type="button"
            onClick={addSecretRef}
            className="px-3 py-1.5 text-xs font-medium bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors whitespace-nowrap"
          >
            Add
          </button>
        </div>
        {srError && <p className="mt-1 text-xs text-[var(--status-danger)]">{srError}</p>}
      </div>

      {/* Runtime */}
      <div>
        <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">Runtime / Image</h4>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Base image</label>
            <input
              className={inputCls}
              value={form.runtime?.baseImage ?? ''}
              onChange={e => setForm(f => ({ ...f, runtime: { ...f.runtime, baseImage: e.target.value } }))}
              placeholder="e.g. ubuntu-22.04 (leave blank for default)"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Extra packages</label>
            <div className="flex items-center gap-2 mb-2">
              <input
                className={smallInputCls + ' flex-1'}
                value={pkgInput}
                onChange={e => setPkgInput(e.target.value)}
                placeholder="e.g. awscli"
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addPackage())}
              />
              <button type="button" onClick={addPackage} className="px-3 py-1.5 text-xs font-medium bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors">
                Add
              </button>
            </div>
            {(form.runtime?.packages ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(form.runtime?.packages ?? []).map(pkg => (
                  <span key={pkg} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[var(--badge-gray-bg)] text-[var(--text-secondary)]">
                    <Package className="w-3 h-3" />
                    {pkg}
                    <button type="button" onClick={() => removePackage(pkg)} className="ml-0.5 hover:text-[var(--status-danger)]"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Notes</label>
            <textarea
              className={inputCls}
              rows={2}
              value={form.runtime?.notes ?? ''}
              onChange={e => setForm(f => ({ ...f, runtime: { ...f.runtime, notes: e.target.value } }))}
              placeholder="Any additional runtime requirements"
            />
          </div>
        </div>
      </div>

      {formError && <p className="text-sm text-[var(--status-danger)]">{formError}</p>}

      <div className="flex justify-end gap-3 pt-2 border-t border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--interactive-primary)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {saving ? 'Saving...' : 'Save Environment'}
        </button>
      </div>
    </form>
  )
}

// =============================================================================
// Environment Card
// =============================================================================

function EnvironmentCard({
  env,
  onEdit,
  onDelete,
}: {
  env: EnvironmentConfig
  onEdit: () => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [shownValues, setShownValues] = useState<Set<string>>(new Set())

  const toggleShow = (key: string) => {
    setShownValues(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const ChevronIcon = expanded ? ChevronDown : ChevronRight
  const totalItems = env.envVars.length + env.secretRefs.length

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center gap-3 px-5 py-4">
        <button
          onClick={() => setExpanded(e => !e)}
          className="p-1 rounded hover:bg-[var(--surface-sunken)] text-[var(--text-muted)] transition-colors"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <ChevronIcon className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{env.name}</p>
          {env.description && (
            <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{env.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {totalItems > 0 && (
            <span className="text-xs text-[var(--text-muted)]">
              {totalItems} {totalItems === 1 ? 'item' : 'items'}
            </span>
          )}
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
            title="Edit environment"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--status-danger)] hover:bg-[var(--surface-sunken)] transition-colors"
            title="Delete environment"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--border-subtle)] px-5 py-4 space-y-4">
          {/* Env Vars */}
          {env.envVars.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">Environment Variables</p>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-1">
                {env.envVars.map(ev => (
                  <EnvVarRow
                    key={ev.key}
                    ev={ev}
                    showValue={shownValues.has(ev.key)}
                    onToggleShow={() => toggleShow(ev.key)}
                    onDelete={() => {}}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Secret Refs */}
          {env.secretRefs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">Secret References</p>
              <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 py-1">
                {env.secretRefs.map(sr => (
                  <SecretRefRow key={sr.key} sr={sr} onDelete={() => {}} />
                ))}
              </div>
            </div>
          )}

          {/* Runtime */}
          {env.runtime && (env.runtime.baseImage || (env.runtime.packages?.length ?? 0) > 0 || env.runtime.notes) && (
            <div>
              <p className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">Runtime</p>
              <div className="text-xs text-[var(--text-secondary)] space-y-1">
                {env.runtime.baseImage && <p>Image: <span className="font-mono">{env.runtime.baseImage}</span></p>}
                {(env.runtime.packages?.length ?? 0) > 0 && (
                  <p>Packages: {env.runtime.packages!.join(', ')}</p>
                )}
                {env.runtime.notes && <p>{env.runtime.notes}</p>}
              </div>
            </div>
          )}

          {totalItems === 0 && !env.runtime?.baseImage && (
            <p className="text-xs text-[var(--text-muted)]">No items configured.</p>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Delete Confirmation Modal
// =============================================================================

function DeleteConfirmModal({
  name,
  onConfirm,
  onCancel,
  deleting,
}: {
  name: string
  onConfirm: () => void
  onCancel: () => void
  deleting: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm mx-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-lg p-6">
        <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">Delete environment?</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          <strong>&quot;{name}&quot;</strong> will be permanently deleted.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--status-danger)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Main EnvironmentsTab
// =============================================================================

export function EnvironmentsTab() {
  const [environments, setEnvironments] = useState<EnvironmentConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // form state
  const [showForm, setShowForm] = useState(false)
  const [editingEnv, setEditingEnv] = useState<EnvironmentConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // delete state
  const [deleteTarget, setDeleteTarget] = useState<EnvironmentConfig | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadEnvironments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const envs = await api.listEnvironments()
      setEnvironments(envs)
    } catch {
      setError('Failed to load environments')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEnvironments()
  }, [loadEnvironments])

  async function handleSave(payload: UpsertEnvironmentPayload) {
    setSaving(true)
    setSaveError(null)
    try {
      if (editingEnv) {
        const updated = await api.updateEnvironment(editingEnv.id, payload)
        if (updated) {
          setEnvironments(envs => envs.map(e => (e.id === updated.id ? updated : e)))
        }
      } else {
        const created = await api.createEnvironment(payload)
        if (created) {
          setEnvironments(envs => [...envs, created])
        }
      }
      setShowForm(false)
      setEditingEnv(null)
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save environment')
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(env: EnvironmentConfig) {
    setEditingEnv(env)
    setShowForm(true)
    setSaveError(null)
  }

  function handleCancelForm() {
    setShowForm(false)
    setEditingEnv(null)
    setSaveError(null)
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const ok = await api.deleteEnvironment(deleteTarget.id)
      if (ok) {
        setEnvironments(envs => envs.filter(e => e.id !== deleteTarget.id))
        setDeleteTarget(null)
      }
    } finally {
      setDeleting(false)
    }
  }

  const formInitial: UpsertEnvironmentPayload = editingEnv
    ? {
        name: editingEnv.name,
        description: editingEnv.description,
        envVars: editingEnv.envVars,
        secretRefs: editingEnv.secretRefs,
        runtime: editingEnv.runtime,
      }
    : emptyPayload()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Environments</h2>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              Named environment configurations for background agent sessions. Each environment bundles env vars, secret references, and runtime preferences.
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => { setShowForm(true); setEditingEnv(null); setSaveError(null) }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Environment
            </button>
          )}
        </div>

        {/* Form */}
        {showForm && (
          <div className="px-6 py-5 border-b border-[var(--border-subtle)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
              {editingEnv ? `Edit "${editingEnv.name}"` : 'New Environment'}
            </h3>
            {saveError && (
              <div className="mb-4 p-3 rounded-lg bg-[var(--status-danger-light)] border border-[var(--status-danger)] text-sm text-[var(--status-danger-text)]">
                {saveError}
              </div>
            )}
            <EnvironmentForm
              initial={formInitial}
              onSave={handleSave}
              onCancel={handleCancelForm}
              saving={saving}
            />
          </div>
        )}

        {/* List */}
        <div className="p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
            </div>
          )}
          {!loading && error && (
            <div className="text-sm text-[var(--status-danger)] text-center py-8">{error}</div>
          )}
          {!loading && !error && environments.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-[var(--text-muted)]">No environments configured yet.</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Create an environment to bundle env vars, secrets, and runtime settings for your background agents.</p>
            </div>
          )}
          {!loading && !error && environments.length > 0 && (
            <div className="space-y-3">
              {environments.map(env => (
                <EnvironmentCard
                  key={env.id}
                  env={env}
                  onEdit={() => handleEdit(env)}
                  onDelete={() => setDeleteTarget(env)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          name={deleteTarget.name}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  )
}
