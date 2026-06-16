'use client'

/**
 * Proposals Page - Config Governance UI
 *
 * List and manage config proposals (developer-proposes/admin-approves workflow).
 *
 * Feature: Config Governance Model (GitHub Issue #1044)
 * Spec: openspec/changes/1044-config-governance-model/
 */

import { useEffect, useState } from 'react'
import { Loader2, FileText, CheckCircle, XCircle, Clock, AlertCircle, Bot } from 'lucide-react'
import { api } from '@/lib/api'
import { getUserFriendlyError } from '@/lib/errors'
import { useAuth } from '@/contexts/AuthContext'
import { ProposalModal } from '@/components/ProposalModal'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import type { ConfigProposal } from '@gal/types'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_PROPOSALS } from '@/lib/demo-data'

type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'all'

export default function Proposals() {
  const { isAdmin, user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const userOrgs = user?.organizations ?? []
  const selectedWorkspace = useSelectedWorkspace()
  const [proposals, setProposals] = useState<ConfigProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<ProposalStatus>('pending')
  const [selectedProposal, setSelectedProposal] = useState<ConfigProposal | null>(null)

  // Selected workspace IS the org — no fallback, no wrong data
  const selectedOrg = selectedWorkspace || null

  // Fetch proposals when workspace-filtered org or filter changes
  useEffect(() => {
    // In demo mode, serve pre-seeded proposals filtered by current status tab
    if (isDemoMode()) {
      const filtered = statusFilter === 'all'
        ? DEMO_PROPOSALS
        : DEMO_PROPOSALS.filter(p => p.status === statusFilter)
      setProposals(filtered)
      setLoading(false)
      return
    }

    if (!selectedOrg) {
      setLoading(false)
      setProposals([])
      return
    }

    const fetchProposals = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (statusFilter !== 'all') {
          params.append('status', statusFilter)
        }

        const response = await api.fetch(
          `/api/orgs/${encodeURIComponent(selectedOrg)}/proposals?${params.toString()}`
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || 'Failed to fetch proposals')
        }

        const data = await response.json()
        setProposals(data.proposals || [])
      } catch (err: unknown) {
        console.error('Failed to fetch proposals:', err)
        setError(getUserFriendlyError(err, 'Unable to load proposals. Please try again.'))
      } finally {
        setLoading(false)
      }
    }

    fetchProposals()
  }, [selectedOrg, statusFilter])

  const handleApprove = async (proposalId: string, comment?: string) => {
    try {
      const response = await api.fetch(`/api/proposals/${proposalId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'approve', comment }),
      })

      if (!response.ok) {
        throw new Error('Failed to approve proposal')
      }

      // Refresh proposals
      setProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status: 'approved' as const } : p))
      )
      setSelectedProposal(null)
    } catch (err: unknown) {
      console.error('Approve error:', err)
      setError(getUserFriendlyError(err, 'Failed to approve proposal'))
    }
  }

  const handleReject = async (proposalId: string, comment: string) => {
    try {
      const response = await api.fetch(`/api/proposals/${proposalId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'reject', comment }),
      })

      if (!response.ok) {
        throw new Error('Failed to reject proposal')
      }

      // Refresh proposals
      setProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status: 'rejected' as const } : p))
      )
      setSelectedProposal(null)
    } catch (err: unknown) {
      console.error('Reject error:', err)
      setError(getUserFriendlyError(err, 'Failed to reject proposal'))
    }
  }

  const getStatusIcon = (status: ConfigProposal['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-[var(--status-warning)]" />
      case 'approved':
        return <CheckCircle className="w-4 h-4 text-[var(--status-success)]" />
      case 'rejected':
        return <XCircle className="w-4 h-4 text-[var(--status-danger)]" />
      case 'withdrawn':
        return <AlertCircle className="w-4 h-4 text-[var(--text-tertiary)]" />
    }
  }

  const getStatusBadge = (status: ConfigProposal['status']) => {
    const baseClasses = 'px-2 py-1 rounded text-xs font-medium'
    switch (status) {
      case 'pending':
        return `${baseClasses} bg-[var(--status-warning-light)] text-[var(--status-warning)]`
      case 'approved':
        return `${baseClasses} bg-[var(--status-success-light)] text-[var(--status-success)]`
      case 'rejected':
        return `${baseClasses} bg-[var(--status-danger-light)] text-[var(--status-danger)]`
      case 'withdrawn':
        return `${baseClasses} bg-[var(--badge-gray-bg)] text-[var(--badge-gray-text)]`
    }
  }

  // #3296: AI decision badge for auto-approved/auto-escalated proposals
  const getAutoApprovalBadge = (proposal: ConfigProposal) => {
    const decision = (proposal as ConfigProposal & { autoApprovalDecision?: { decision: string; confidence: number } }).autoApprovalDecision
    if (!decision) return null

    const confidencePct = Math.round(decision.confidence * 100)
    const label = `AI: ${decision.decision} (${confidencePct}%)`

    const baseClasses = 'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium'
    let colorClasses = ''
    switch (decision.decision) {
      case 'approve':
        colorClasses = 'bg-[var(--status-success-light)] text-[var(--status-success)]'
        break
      case 'reject':
        colorClasses = 'bg-[var(--status-danger-light)] text-[var(--status-danger)]'
        break
      case 'escalate':
        colorClasses = 'bg-[var(--status-warning-light)] text-[var(--status-warning)]'
        break
      default:
        colorClasses = 'bg-[var(--badge-gray-bg)] text-[var(--badge-gray-text)]'
    }

    return (
      <span className={`${baseClasses} ${colorClasses}`}>
        <Bot className="w-3 h-3" />
        {label}
      </span>
    )
  }

  // #3102: Proposals is internal only — gate the entire page
  if (!isPageVisibleForUser('proposals', userOrgs)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <FileText className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Internal Feature
        </h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
          Proposals is only available to internal users.
        </p>
      </div>
    )
  }

  if (loading && !proposals.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin mx-auto mb-4" />
          <p className="text-[var(--text-muted)] text-sm">Loading proposals...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mb-2">Config Proposals</h1>
        <p className="text-[var(--text-muted)]">
          Review and approve configuration change proposals from your team
        </p>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-6 mb-6 border-b border-[var(--border-subtle)]">
        {(['pending', 'approved', 'rejected', 'all'] as ProposalStatus[]).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-1 py-3 text-sm capitalize transition-colors relative ${
              statusFilter === status
                ? 'text-[var(--text-primary)] font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium'
            }`}
          >
            {status}
            {statusFilter === status && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--interactive-primary)] dark:bg-[var(--text-tertiary)]" />
            )}
          </button>
        ))}
      </div>

      {/* Error State */}
      {error && (
        <div className="glass-card p-4 border-[var(--status-danger-text)]/50 mb-6">
          <p className="text-[var(--status-danger-text)]">{error}</p>
        </div>
      )}

      {/* Proposals List */}
      {proposals.length === 0 ? (
        <div className="bg-[var(--surface-sunken)] rounded-2xl p-12 text-center border border-dashed border-[var(--border-subtle)]">
          <FileText className="w-16 h-16 text-[var(--accent-neon)]/30 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No {statusFilter !== 'all' ? statusFilter : ''} proposals yet</h3>
          <p className="text-[var(--text-secondary)] max-w-md mx-auto">When team members propose configuration changes, they will appear here for review and approval.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {proposals.map((proposal) => (
            <div
              key={proposal.id}
              className="glass-card p-6 cursor-pointer hover:border-[var(--border-interactive)] shadow-sm hover:shadow-md transition-all duration-200"
              onClick={() => setSelectedProposal(proposal)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {getStatusIcon(proposal.status)}
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                      {proposal.scope === 'org' ? 'Organization Config' : 'Project Config'}
                    </h3>
                    <p className="text-sm text-[var(--text-muted)]">
                      {proposal.scope === 'project' ? proposal.scopeId : selectedOrg}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {getAutoApprovalBadge(proposal)}
                  <span className={getStatusBadge(proposal.status)}>{proposal.status}</span>
                </div>
              </div>

              <div className="flex items-center gap-6 text-sm text-[var(--text-muted)]">
                <span>Proposed by: {proposal.proposedBy}</span>
                <span>
                  {new Date(proposal.proposedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {proposal.basedOnVersion && <span>Based on version {proposal.basedOnVersion}</span>}
              </div>

              {/* Quick Actions for Pending Proposals */}
              {proposal.status === 'pending' && isAdmin && (
                <div className="flex gap-2 mt-4" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handleApprove(proposal.id)}
                    className="px-4 py-2 bg-[var(--status-success-light)] text-[var(--status-success)] rounded-lg hover:bg-[var(--status-success-light)]/50 transition-colors text-sm font-medium"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setSelectedProposal(proposal)}
                    className="px-4 py-2 bg-[var(--status-danger-light)] text-[var(--status-danger)] rounded-lg hover:bg-[var(--status-danger-light)]/50 transition-colors text-sm font-medium"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Proposal Detail Modal */}
      {selectedProposal && (
        <ProposalModal
          proposal={selectedProposal}
          isAdmin={isAdmin}
          onClose={() => setSelectedProposal(null)}
          onApprove={handleApprove}
          onReject={handleReject}
        />
      )}
    </div>
  )
}
