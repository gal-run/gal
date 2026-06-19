'use client'

import { useState, useCallback } from 'react'
import { Shield, Lock, Loader2, AlertCircle, Trash2, Clock } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { useIsInternalWorkspace } from '@/hooks/useWorkspaceAudienceTier'
import { useSecurityStandards } from '@/hooks/useEnforcement'
import { api } from '@/lib/api'

const SEVERITY_COLORS: Record<string, string> = {
  low: 'var(--text-muted)',
  medium: 'var(--status-warning)',
  high: 'var(--status-error)',
  critical: 'var(--status-error)',
}

export default function SecurityPage() {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const userOrgs = user?.organizations ?? []
  const selectedWorkspace = useSelectedWorkspace()
  const orgName = selectedWorkspace ?? userOrgs[0] ?? null

  const { items: standards, loading, error, refresh } = useSecurityStandards(orgName)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const isInternalWorkspace = useIsInternalWorkspace()
  const isVisible = isInternalWorkspace && isPageVisibleForUser('enforcement-security', userOrgs, selectedWorkspace)

  const handleDelete = useCallback(async (id: string) => {
    if (!orgName) return
    setDeleting(true)
    try {
      await api.deleteSecurityStandard(orgName, id)
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
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>Security standards are only available to internal users.</p>
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
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Security Standards</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Define and enforce organization security standard rules</p>
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

      {!loading && standards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl" style={{ border: '1px dashed var(--border-primary)' }}>
          <Lock className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>No security standards defined</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Define standards to enforce required settings, forbidden tools, and more.</p>
        </div>
      )}

      {!loading && standards.length > 0 && (
        <div className="space-y-3">
          {standards.map((standard) => (
            <div key={standard.id} className="rounded-xl p-4" style={{ border: '1px solid var(--border-primary)' }}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{standard.name}</h3>
                    <span className="text-xs px-1.5 py-0.5 rounded uppercase" style={{ color: SEVERITY_COLORS[standard.severity] || 'var(--text-muted)', background: 'var(--surface-raised)' }}>
                      {standard.severity}
                    </span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{standard.description}</p>
                  <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>{standard.rules.length} rule{standard.rules.length !== 1 ? 's' : ''}</p>
                  <span className="flex items-center gap-1 text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    <Clock className="w-3 h-3" />
                    {new Date(standard.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="ml-3">
                  {deleteConfirmId === standard.id ? (
                    <span className="flex items-center gap-2">
                      <button onClick={() => handleDelete(standard.id)} disabled={deleting} className="px-2 py-1 rounded text-xs font-medium" style={{ background: 'var(--status-error)', color: 'var(--text-on-accent)' }}>
                        {deleting ? '...' : 'Confirm'}
                      </button>
                      <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 rounded text-xs font-medium" style={{ border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
                    </span>
                  ) : (
                    <button onClick={() => setDeleteConfirmId(standard.id)} className="p-1.5 rounded-md hover:bg-[var(--surface-hover)]" title="Delete standard">
                      <Trash2 className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
