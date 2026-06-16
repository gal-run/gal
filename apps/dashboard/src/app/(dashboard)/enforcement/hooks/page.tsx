'use client'

import { useState, useCallback } from 'react'
import { Shield, Webhook, Loader2, AlertCircle, Trash2, Clock, ToggleLeft, ToggleRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { useIsInternalWorkspace } from '@/hooks/useWorkspaceAudienceTier'
import { useEnforcementHooks } from '@/hooks/useEnforcement'
import { api } from '@/lib/api'

const HOOK_TYPE_LABELS: Record<string, string> = {
  'pre-commit': 'Pre-Commit',
  'pre-push': 'Pre-Push',
  'ci-check': 'CI Check',
}

export default function HooksPage() {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const userOrgs = user?.organizations ?? []
  const selectedWorkspace = useSelectedWorkspace()
  const orgName = selectedWorkspace ?? userOrgs[0] ?? null

  const { items: hooks, loading, error, refresh } = useEnforcementHooks(orgName)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const isInternalWorkspace = useIsInternalWorkspace()
  const isVisible = isInternalWorkspace && isPageVisibleForUser('enforcement-hooks', userOrgs, selectedWorkspace)

  const handleDelete = useCallback(async (id: string) => {
    if (!orgName) return
    setDeleting(true)
    try {
      await api.deleteEnforcementHook(orgName, id)
      setDeleteConfirmId(null)
      refresh()
    } finally {
      setDeleting(false)
    }
  }, [orgName, refresh])

  if (!isVisible) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <Shield className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Internal Feature</h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>Enforcement hooks are only available to internal users.</p>
      </div>
    )
  }

  if (!orgName) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <AlertCircle className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>No Workspace Selected</h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select a workspace from the sidebar.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Enforcement Hooks</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Manage pre-commit, pre-push, and CI enforcement hooks</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg mb-6" style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error)' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--status-error)' }} />
          <p className="text-sm" style={{ color: 'var(--status-error)' }}>{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      )}

      {!loading && hooks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl" style={{ border: '1px dashed var(--border-primary)' }}>
          <Webhook className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>No enforcement hooks configured</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Add hooks to enforce policies at commit, push, or CI time.</p>
        </div>
      )}

      {!loading && hooks.length > 0 && (
        <div className="space-y-3">
          {hooks.map((hook) => (
            <div key={hook.id} className="rounded-xl p-4 flex items-center justify-between" style={{ border: '1px solid var(--border-primary)' }}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{hook.name}</span>
                  {hook.enabled ? <ToggleRight className="w-4 h-4" style={{ color: 'var(--status-success)' }} /> : <ToggleLeft className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border-primary)' }}>
                    {HOOK_TYPE_LABELS[hook.type] ?? hook.type}
                  </span>
                </div>
                <p className="text-xs mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>{hook.policy}</p>
                <span className="flex items-center gap-1 text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  <Clock className="w-3 h-3" />
                  {new Date(hook.updatedAt).toLocaleDateString()}
                </span>
              </div>
              {deleteConfirmId === hook.id ? (
                <span className="flex items-center gap-2 ml-3">
                  <button onClick={() => handleDelete(hook.id)} disabled={deleting} className="px-2 py-1 rounded text-xs font-medium" style={{ background: 'var(--status-error)', color: 'var(--text-on-accent)' }}>
                    {deleting ? '...' : 'Confirm'}
                  </button>
                  <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 rounded text-xs font-medium" style={{ border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
                </span>
              ) : (
                <button onClick={() => setDeleteConfirmId(hook.id)} className="p-1.5 rounded-md hover:bg-[var(--surface-hover)] ml-3" title="Delete hook">
                  <Trash2 className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
