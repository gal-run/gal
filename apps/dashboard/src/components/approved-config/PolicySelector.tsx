'use client'

import { useState } from 'react'
import { Plus, Trash2, Check, Copy, Loader2, Shield } from 'lucide-react'
import type { ConfigPolicyItem } from '@/lib/api'

interface PolicySelectorProps {
  policies: ConfigPolicyItem[]
  isLoading: boolean
  isAdmin: boolean
  onActivate: (policyId: string) => Promise<void>
  onCreate: (name: string, description?: string, duplicateFromId?: string) => Promise<void>
  onDelete: (policyId: string) => Promise<void>
  onSelect: (policy: ConfigPolicyItem) => void
  selectedPolicyId?: string
}

export function PolicySelector({
  policies,
  isLoading,
  isAdmin,
  onActivate,
  onCreate,
  onDelete,
  onSelect,
  selectedPolicyId,
}: PolicySelectorProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [duplicateFromId, setDuplicateFromId] = useState<string | undefined>()
  const [creating, setCreating] = useState(false)
  const [activating, setActivating] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!createName.trim()) return
    setCreating(true)
    try {
      await onCreate(createName.trim(), createDescription.trim() || undefined, duplicateFromId)
      setShowCreateDialog(false)
      setCreateName('')
      setCreateDescription('')
      setDuplicateFromId(undefined)
    } finally {
      setCreating(false)
    }
  }

  const handleActivate = async (policyId: string) => {
    setActivating(policyId)
    try {
      await onActivate(policyId)
    } finally {
      setActivating(null)
    }
  }

  const handleDelete = async (policyId: string) => {
    if (confirmDeleteId !== policyId) {
      setConfirmDeleteId(policyId)
      return
    }
    setDeleting(policyId)
    try {
      await onDelete(policyId)
    } finally {
      setDeleting(null)
      setConfirmDeleteId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3" style={{ color: 'var(--text-muted)' }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading policies...</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Config Policies
        </h3>
        {isAdmin && (
          <button
            onClick={() => setShowCreateDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: 'var(--accent)',
              color: 'white',
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            New Policy
          </button>
        )}
      </div>

      {policies.length === 0 ? (
        <div
          className="text-sm py-4 text-center rounded-lg"
          style={{ color: 'var(--text-muted)', background: 'var(--surface-raised)' }}
        >
          No policies yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {policies.map((policy) => (
            <div
              key={policy.id}
              onClick={() => onSelect(policy)}
              className="flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors"
              style={{
                background: selectedPolicyId === policy.id
                  ? 'var(--surface-active)'
                  : 'var(--surface-raised)',
                border: `1px solid ${policy.isActive ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {policy.name}
                  </span>
                  {policy.isBuiltin && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                      title="Built-in GAL template"
                    >
                      <Shield className="w-3 h-3" />
                      Built-in
                    </span>
                  )}
                  {policy.isActive && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: 'var(--badge-active-bg)', color: 'var(--badge-active-text)' }}
                    >
                      <Check className="w-3 h-3" />
                      Active
                    </span>
                  )}
                </div>
                {policy.description && (
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    {policy.description}
                  </p>
                )}
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Created by {policy.createdBy} on {new Date(policy.createdAt).toLocaleDateString()}
                </p>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-1 ml-3" onClick={(e) => e.stopPropagation()}>
                  {!policy.isActive && (
                    <>
                      <button
                        onClick={() => handleActivate(policy.id)}
                        disabled={activating === policy.id}
                        className="p-1.5 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                        title="Activate this policy"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {activating === policy.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                      </button>
                      {!policy.isBuiltin && (
                        <button
                          onClick={() => handleDelete(policy.id)}
                          disabled={deleting === policy.id}
                          className="p-1.5 rounded transition-colors hover:bg-red-50 dark:hover:bg-red-950/20"
                          title={confirmDeleteId === policy.id ? 'Click again to confirm' : 'Delete policy'}
                          style={{ color: confirmDeleteId === policy.id ? 'var(--error, #ef4444)' : 'var(--text-muted)' }}
                        >
                          {deleting === policy.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Policy Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="w-full max-w-md rounded-xl p-6 shadow-xl"
            style={{ background: 'var(--surface-raised)' }}
          >
            <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
              Create New Policy
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Policy Name *
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g., Production Safe Policy"
                  maxLength={200}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  Description
                </label>
                <input
                  type="text"
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Optional description"
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {policies.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    <Copy className="w-3.5 h-3.5 inline mr-1" />
                    Duplicate from existing
                  </label>
                  <select
                    value={duplicateFromId || ''}
                    onChange={(e) => setDuplicateFromId(e.target.value || undefined)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <option value="">Start from scratch</option>
                    {policies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.isActive ? '(active)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCreateDialog(false)
                  setCreateName('')
                  setCreateDescription('')
                  setDuplicateFromId(undefined)
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!createName.trim() || creating}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                Create Policy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
