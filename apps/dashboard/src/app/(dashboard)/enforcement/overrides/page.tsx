'use client'

import { useState, useCallback } from 'react'
import { Shield, Plus, Trash2, Loader2, AlertCircle, Clock, CheckCircle, XCircle, History } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { useIsInternalWorkspace } from '@/hooks/useWorkspaceAudienceTier'
import { useProjectOverrides, useCreateOverride, useDeleteOverride, useReviewOverride } from '@/hooks/useProjectOverrides'
import { useRepositories } from '@/hooks/useRepositories'
import { ProjectOverrideForm } from '@/components/enforcement/ProjectOverrideForm'
import type { ProjectOverride } from '@/lib/api'

const POLICY_TYPE_LABELS: Record<ProjectOverride['policyType'], string> = {
  'tool-allowlist': 'Tool Allowlist',
  'domain-allowlist': 'Domain Allowlist',
  'model-allowlist': 'Model Allowlist',
  'custom': 'Custom Policy',
}

const STATUS_CONFIG: Record<ProjectOverride['status'], { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'var(--status-warning)', bg: 'var(--status-warning-bg)' },
  approved: { label: 'Approved', color: 'var(--status-success)', bg: 'var(--status-success-bg)' },
  rejected: { label: 'Rejected', color: 'var(--status-error)', bg: 'var(--status-error-bg)' },
}

export default function EnforcementOverridesPage() {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const userOrgs = user?.organizations ?? []
  const selectedWorkspace = useSelectedWorkspace()
  const orgName = selectedWorkspace ?? userOrgs[0] ?? null

  const { overrides, loading, error, refresh } = useProjectOverrides(orgName)
  const { createOverride, creating } = useCreateOverride(orgName)
  const { deleteOverride, deleting } = useDeleteOverride(orgName)
  const { reviewOverride, reviewing } = useReviewOverride(orgName)
  const { repositories } = useRepositories()

  const [showForm, setShowForm] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [rejectOverrideId, setRejectOverrideId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  const isInternalWorkspace = useIsInternalWorkspace()
  const isEnforcementVisible = isInternalWorkspace && isPageVisibleForUser('enforcement-overrides', userOrgs, selectedWorkspace)

  const pendingOverrides = overrides.filter((o) => o.status === 'pending')
  const historyOverrides = overrides.filter((o) => o.status === 'approved' || o.status === 'rejected')

  const handleCreate = useCallback(
    async (data: {
      projectName: string
      policyType: ProjectOverride['policyType']
      definition: Record<string, unknown>
    }) => {
      await createOverride(data)
      setShowForm(false)
      refresh()
    },
    [createOverride, refresh],
  )

  const handleDelete = useCallback(
    async (overrideId: string) => {
      await deleteOverride(overrideId)
      setDeleteConfirmId(null)
      refresh()
    },
    [deleteOverride, refresh],
  )

  const handleApprove = useCallback(
    async (overrideId: string) => {
      await reviewOverride(overrideId, 'approve')
      refresh()
    },
    [reviewOverride, refresh],
  )

  const handleReject = useCallback(
    async (overrideId: string) => {
      if (!rejectionReason.trim()) return
      await reviewOverride(overrideId, 'reject', rejectionReason.trim())
      setRejectOverrideId(null)
      setRejectionReason('')
      refresh()
    },
    [reviewOverride, rejectionReason, refresh],
  )

  if (!isEnforcementVisible) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <Shield className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Internal Feature
        </h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
          Project overrides are only available to internal users.
        </p>
      </div>
    )
  }

  if (!orgName) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <AlertCircle className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          No Workspace Selected
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Select a workspace from the sidebar to manage project overrides.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Project Overrides
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Set per-project exceptions to organization-wide policies
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: 'var(--interactive-primary)',
            color: 'var(--text-on-accent)',
          }}
        >
          <Plus className="w-4 h-4" />
          Request Override
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-3 p-4 rounded-lg mb-6"
          style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error)' }}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--status-error)' }} />
          <p className="text-sm" style={{ color: 'var(--status-error)' }}>{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      )}

      {!loading && (
        <>
          {/* ================================================================ */}
          {/* Pending Overrides Section                                        */}
          {/* ================================================================ */}
          <div className="mb-10">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Clock className="w-5 h-5" style={{ color: STATUS_CONFIG.pending.color }} />
              Pending Overrides
              {pendingOverrides.length > 0 && (
                <span
                  className="ml-1 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ background: STATUS_CONFIG.pending.bg, color: STATUS_CONFIG.pending.color }}
                >
                  {pendingOverrides.length}
                </span>
              )}
            </h2>

            {pendingOverrides.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-12 rounded-xl"
                style={{ border: '1px dashed var(--border-primary)' }}
              >
                <Shield className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  No pending override requests
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  All projects follow the organization-wide policy.
                </p>
              </div>
            ) : (
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--border-primary)' }}
              >
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-primary)' }}>
                      <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Project
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Policy Type
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Requested
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingOverrides.map((override) => (
                      <tr
                        key={override.id}
                        className="transition-colors hover:bg-[var(--surface-hover)]"
                        style={{ borderBottom: '1px solid var(--border-primary)' }}
                      >
                        <td className="px-4 py-3">
                          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {override.projectName}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              background: 'var(--surface-raised)',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-primary)',
                            }}
                          >
                            {POLICY_TYPE_LABELS[override.policyType] ?? override.policyType}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                            <Clock className="w-3 h-3" />
                            {new Date(override.createdAt).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {rejectOverrideId === override.id ? (
                            <div className="flex flex-col items-end gap-2">
                              <textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Reason for rejection..."
                                rows={2}
                                className="w-64 rounded-lg px-3 py-2 text-xs"
                                style={{
                                  background: 'var(--surface-base)',
                                  border: '1px solid var(--border-primary)',
                                  color: 'var(--text-primary)',
                                  resize: 'none',
                                }}
                              />
                              <span className="flex items-center gap-2">
                                <button
                                  onClick={() => handleReject(override.id)}
                                  disabled={reviewing || !rejectionReason.trim()}
                                  className="px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50"
                                  style={{ background: 'var(--status-error)', color: 'var(--text-on-accent)' }}
                                >
                                  {reviewing ? 'Rejecting...' : 'Confirm Reject'}
                                </button>
                                <button
                                  onClick={() => { setRejectOverrideId(null); setRejectionReason('') }}
                                  className="px-3 py-1 rounded text-xs font-medium transition-colors"
                                  style={{ border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}
                                >
                                  Cancel
                                </button>
                              </span>
                            </div>
                          ) : deleteConfirmId === override.id ? (
                            <span className="flex items-center justify-end gap-2">
                              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Delete?</span>
                              <button
                                onClick={() => handleDelete(override.id)}
                                disabled={deleting}
                                className="px-2 py-1 rounded text-xs font-medium transition-colors"
                                style={{ background: 'var(--status-error)', color: 'var(--text-on-accent)' }}
                              >
                                {deleting ? 'Deleting...' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="px-2 py-1 rounded text-xs font-medium transition-colors"
                                style={{ border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <span className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleApprove(override.id)}
                                disabled={reviewing}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50"
                                style={{
                                  background: 'var(--status-success-bg)',
                                  color: 'var(--status-success)',
                                  border: '1px solid var(--status-success)',
                                }}
                                title="Approve override"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                Approve
                              </button>
                              <button
                                onClick={() => setRejectOverrideId(override.id)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                                style={{
                                  background: 'var(--status-error-bg)',
                                  color: 'var(--status-error)',
                                  border: '1px solid var(--status-error)',
                                }}
                                title="Reject override"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Reject
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(override.id)}
                                className="p-1.5 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
                                title="Delete override"
                              >
                                <Trash2 className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ================================================================ */}
          {/* Override History Section                                          */}
          {/* ================================================================ */}
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <History className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
              Override History
              {historyOverrides.length > 0 && (
                <span
                  className="ml-1 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ background: 'var(--surface-raised)', color: 'var(--text-muted)', border: '1px solid var(--border-primary)' }}
                >
                  {historyOverrides.length}
                </span>
              )}
            </h2>

            {historyOverrides.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-12 rounded-xl"
                style={{ border: '1px dashed var(--border-primary)' }}
              >
                <History className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                  No override history
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Approved and rejected overrides will appear here.
                </p>
              </div>
            ) : (
              <div
                className="rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--border-primary)' }}
              >
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-primary)' }}>
                      <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Project
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Policy Type
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Status
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Reviewed
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyOverrides.map((override) => {
                      const statusCfg = STATUS_CONFIG[override.status]
                      return (
                        <tr
                          key={override.id}
                          className="transition-colors hover:bg-[var(--surface-hover)]"
                          style={{ borderBottom: '1px solid var(--border-primary)' }}
                        >
                          <td className="px-4 py-3">
                            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {override.projectName}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                              style={{
                                background: 'var(--surface-raised)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border-primary)',
                              }}
                            >
                              {POLICY_TYPE_LABELS[override.policyType] ?? override.policyType}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                              style={{ background: statusCfg.bg, color: statusCfg.color }}
                            >
                              {override.status === 'approved' ? (
                                <CheckCircle className="w-3 h-3" />
                              ) : (
                                <XCircle className="w-3 h-3" />
                              )}
                              {statusCfg.label}
                            </span>
                            {override.rejectionReason && (
                              <p className="text-xs mt-1 max-w-xs truncate" style={{ color: 'var(--text-muted)' }} title={override.rejectionReason}>
                                {override.rejectionReason}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                              <Clock className="w-3 h-3" />
                              {override.reviewedAt
                                ? new Date(override.reviewedAt).toLocaleDateString()
                                : new Date(override.updatedAt).toLocaleDateString()
                              }
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {deleteConfirmId === override.id ? (
                              <span className="flex items-center justify-end gap-2">
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Delete?</span>
                                <button
                                  onClick={() => handleDelete(override.id)}
                                  disabled={deleting}
                                  className="px-2 py-1 rounded text-xs font-medium transition-colors"
                                  style={{ background: 'var(--status-error)', color: 'var(--text-on-accent)' }}
                                >
                                  {deleting ? 'Deleting...' : 'Confirm'}
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="px-2 py-1 rounded text-xs font-medium transition-colors"
                                  style={{ border: '1px solid var(--border-primary)', color: 'var(--text-secondary)' }}
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(override.id)}
                                className="p-1.5 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
                                title="Delete override"
                              >
                                <Trash2 className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Add Override Modal */}
      {showForm && (
        <ProjectOverrideForm
          repos={repositories.map((r) => r.fullName ?? r.name)}
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
          saving={creating}
        />
      )}
    </div>
  )
}
