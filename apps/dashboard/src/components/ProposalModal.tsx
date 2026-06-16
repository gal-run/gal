'use client'

/**
 * Proposal Modal Component - View proposal details with diff
 *
 * Feature: Config Governance Model (GitHub Issue #1044)
 */

import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'
import { DiffViewer } from './DiffViewer'
import type { ConfigProposal, ConfigDiff } from '@gal/types'

const DEMO_DIFFS: Record<string, ConfigDiff> = {
  'prop-1': {
    added: {
      'hooks.pre-commit': { type: 'shell', command: 'gal validate --quick' },
    },
    modified: {
      'instructions.content': {
        old: 'Always follow our security policy. Use approved libraries only.',
        new: 'Always follow our security policy. Use approved libraries only. Never expose API keys or secrets in code or commits.',
      },
    },
    removed: {},
  },
  'prop-2': {
    added: {},
    modified: {
      'settings.permissions.allow': {
        old: ['Bash', 'Read', 'Write', 'Edit'],
        new: ['Bash', 'Read', 'Write', 'Edit', 'WebFetch'],
      },
    },
    removed: {},
  },
  'prop-3': {
    added: {
      'commands.review-pr': {
        description: 'Review a pull request for security and code quality',
        template: '/review-pr $ARGUMENTS',
      },
    },
    modified: {},
    removed: {
      'commands.legacy-review': { description: 'Old review command' },
    },
  },
  'prop-4': {
    added: {},
    modified: {
      'settings.network.allowedDomains': {
        old: ['api.github.com', 'registry.npmjs.org'],
        new: ['api.github.com', 'registry.npmjs.org', 'pypi.org', 'crates.io'],
      },
    },
    removed: {},
  },
  'prop-5': {
    added: {
      'agents.security-auditor': {
        description: 'Specialized agent for security audits',
        model: 'claude-opus-4-5',
        tools: ['Read', 'Grep', 'Glob'],
      },
    },
    modified: {
      'policyName': {
        old: 'security-baseline',
        new: 'security-baseline-v2',
      },
    },
    removed: {},
  },
}

interface ProposalModalProps {
  proposal: ConfigProposal
  isAdmin: boolean
  onClose: () => void
  onApprove: (proposalId: string, comment?: string) => Promise<void>
  onReject: (proposalId: string, comment: string) => Promise<void>
}

export function ProposalModal({
  proposal,
  isAdmin,
  onClose,
  onApprove,
  onReject,
}: ProposalModalProps) {
  const [diff, setDiff] = useState<ConfigDiff | null>(null)
  const [loading, setLoading] = useState(true)
  const [comment, setComment] = useState('')
  const [action, setAction] = useState<'approve' | 'reject' | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const fetchDiff = async () => {
      setLoading(true)
      try {
        if (isDemoMode()) {
          await new Promise((r) => setTimeout(r, 400))
          setDiff(DEMO_DIFFS[proposal.id] ?? DEMO_DIFFS['prop-1'])
          return
        }
        const response = await api.fetch(`/api/proposals/${proposal.id}`)
        if (!response.ok) {
          throw new Error('Failed to fetch proposal details')
        }
        const data = await response.json()
        setDiff(data.diff)
      } catch (err) {
        console.error('Failed to fetch diff:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchDiff()
  }, [proposal.id])

  const handleSubmit = async () => {
    if (!action) return

    setSubmitting(true)
    try {
      if (action === 'approve') {
        await onApprove(proposal.id, comment || undefined)
      } else if (action === 'reject') {
        if (!comment.trim()) {
          alert('Please provide a reason for rejection')
          return
        }
        await onReject(proposal.id, comment)
      }
      onClose()
    } catch (err) {
      console.error('Failed to submit review:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="glass-card max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              Proposal Details
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {proposal.scope === 'org' ? 'Workspace Config' : 'Project Config'} •{' '}
              {proposal.scopeId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Proposal Info */}
          <div className="mb-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[var(--text-muted)]">Proposed by:</span>
                <span className="ml-2 text-[var(--text-primary)]">{proposal.proposedBy}</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Proposed at:</span>
                <span className="ml-2 text-[var(--text-primary)]">
                  {new Date(proposal.proposedAt).toLocaleString()}
                </span>
              </div>
              {proposal.basedOnVersion && (
                <div>
                  <span className="text-[var(--text-muted)]">Based on version:</span>
                  <span className="ml-2 text-[var(--text-primary)]">
                    {proposal.basedOnVersion}
                  </span>
                </div>
              )}
              <div>
                <span className="text-[var(--text-muted)]">Status:</span>
                <span className="ml-2 text-[var(--text-primary)] capitalize">
                  {proposal.status}
                </span>
              </div>
            </div>

            {proposal.reviewedBy && (
              <div className="mt-4 p-4 bg-[var(--bg-tertiary)] rounded-lg">
                <p className="text-sm text-[var(--text-muted)] mb-1">
                  Reviewed by {proposal.reviewedBy} on{' '}
                  {proposal.reviewedAt && new Date(proposal.reviewedAt).toLocaleString()}
                </p>
                {proposal.reviewComment && (
                  <p className="text-sm text-[var(--text-primary)]">{proposal.reviewComment}</p>
                )}
              </div>
            )}
          </div>

          {/* Diff Viewer */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
            </div>
          ) : diff ? (
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
                Configuration Changes
              </h3>
              <DiffViewer diff={diff} />
            </div>
          ) : (
            <p className="text-[var(--text-muted)] text-center py-12">No changes to display</p>
          )}

          {/* Review Section (Admin Only, Pending Only) */}
          {isAdmin && proposal.status === 'pending' && !action && (
            <div className="mt-8 pt-6 border-t border-[var(--border-subtle)]">
              <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">
                Review Proposal
              </h3>
              <div className="flex gap-3">
                <button
                  onClick={() => setAction('approve')}
                  className="flex-1 px-4 py-3 bg-[var(--status-success-light)] text-[var(--status-success)] rounded-lg hover:bg-[var(--status-success-light)]/50 transition-colors font-medium"
                >
                  Approve
                </button>
                <button
                  onClick={() => setAction('reject')}
                  className="flex-1 px-4 py-3 bg-[var(--status-danger-light)] text-[var(--status-danger)] rounded-lg hover:bg-[var(--status-danger-light)]/50 transition-colors font-medium"
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          {/* Comment Form */}
          {action && (
            <div className="mt-6 p-4 bg-[var(--bg-tertiary)] rounded-lg">
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
                Comment {action === 'reject' && <span className="text-[var(--status-danger)]">*</span>}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  action === 'approve'
                    ? 'Optional: Add a comment about this approval'
                    : 'Required: Explain why this proposal is being rejected'
                }
                className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none"
                rows={4}
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || (action === 'reject' && !comment.trim())}
                  className="px-4 py-2 bg-[var(--accent)] text-[var(--text-on-accent)] rounded-lg hover:bg-[var(--accent)]/80 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    `Confirm ${action === 'approve' ? 'Approval' : 'Rejection'}`
                  )}
                </button>
                <button
                  onClick={() => {
                    setAction(null)
                    setComment('')
                  }}
                  disabled={submitting}
                  className="px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-secondary)] transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
