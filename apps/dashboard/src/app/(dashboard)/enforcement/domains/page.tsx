'use client'

import { useState, useCallback } from 'react'
import { Shield, Globe, Loader2, AlertCircle, Trash2, Clock } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { useIsInternalWorkspace } from '@/hooks/useWorkspaceAudienceTier'
import { useDomainAccessStats, useDomainExceptions } from '@/hooks/useEnforcement'
import { api } from '@/lib/api'

export default function DomainsPage() {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const userOrgs = user?.organizations ?? []
  const selectedWorkspace = useSelectedWorkspace()
  const orgName = selectedWorkspace ?? userOrgs[0] ?? null

  const { data: stats, loading: statsLoading } = useDomainAccessStats(orgName)
  const { items: exceptions, loading: exceptionsLoading, refresh: refreshExceptions } = useDomainExceptions(orgName)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loading = statsLoading || exceptionsLoading
  const isInternalWorkspace = useIsInternalWorkspace()
  const isVisible = isInternalWorkspace && isPageVisibleForUser('enforcement-domains', userOrgs, selectedWorkspace)

  const handleDelete = useCallback(async (id: string) => {
    if (!orgName) return
    setDeleting(true)
    try {
      await api.deleteDomainException(orgName, id)
      setDeleteConfirmId(null)
      refreshExceptions()
    } finally {
      setDeleting(false)
    }
  }, [orgName, refreshExceptions])

  if (!isVisible) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <Shield className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Internal Feature</h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>Domain auditing is only available to internal users.</p>
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
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Domain Audit</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Domain access statistics and exception management for agent web requests</p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      )}

      {!loading && (
        <>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Access Statistics</h2>
          {stats && stats.stats.length > 0 ? (
            <div className="rounded-xl overflow-hidden mb-8" style={{ border: '1px solid var(--border-primary)' }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-primary)' }}>
                    <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Domain</th>
                    <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total</th>
                    <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Blocked</th>
                    <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Last Accessed</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.stats.map((s) => (
                    <tr key={s.domain} className="hover:bg-[var(--surface-hover)]" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                      <td className="px-4 py-3"><span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{s.domain}</span></td>
                      <td className="px-4 py-3"><span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{s.totalRequests}</span></td>
                      <td className="px-4 py-3"><span className="text-sm" style={{ color: s.blockedRequests > 0 ? 'var(--status-error)' : 'var(--text-muted)' }}>{s.blockedRequests}</span></td>
                      <td className="px-4 py-3"><span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(s.lastAccessed).toLocaleDateString()}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 rounded-xl mb-8" style={{ border: '1px dashed var(--border-primary)' }}>
              <Globe className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No domain access data</p>
            </div>
          )}

          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Domain Exceptions</h2>
          {exceptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 rounded-xl" style={{ border: '1px dashed var(--border-primary)' }}>
              <Shield className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No domain exceptions</p>
            </div>
          ) : (
            <div className="space-y-2">
              {exceptions.map((exc) => (
                <div key={exc.id} className="rounded-lg p-3 flex items-center justify-between" style={{ border: '1px solid var(--border-primary)' }}>
                  <div>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{exc.domain}</span>
                    {exc.repoName && <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>({exc.repoName})</span>}
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{exc.justification}</p>
                    <span className="flex items-center gap-1 text-xs mt-1" style={{ color: exc.expired ? 'var(--status-error)' : 'var(--text-muted)' }}>
                      <Clock className="w-3 h-3" />
                      {exc.expired ? 'Expired' : `Expires ${new Date(exc.expiresAt).toLocaleDateString()}`}
                    </span>
                  </div>
                  {deleteConfirmId === exc.id ? (
                    <span className="flex items-center gap-2">
                      <button onClick={() => handleDelete(exc.id)} disabled={deleting} className="px-2 py-1 rounded text-xs font-medium" style={{ background: 'var(--status-error)', color: 'var(--text-on-accent)' }}>
                        {deleting ? '...' : 'Confirm'}
                      </button>
                      <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 rounded text-xs font-medium" style={{ border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}>Cancel</button>
                    </span>
                  ) : (
                    <button onClick={() => setDeleteConfirmId(exc.id)} className="p-1.5 rounded-md hover:bg-[var(--surface-hover)]" title="Revoke exception">
                      <Trash2 className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
