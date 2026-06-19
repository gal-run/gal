'use client'

import { type FC, useState, useEffect } from 'react'
import { X, ExternalLink, Loader2, CheckCircle2, Circle, StopCircle, History } from 'lucide-react'
import { WorkflowStatusBadge } from './WorkflowStatusBadge'
import { api } from '@/lib/api'
import { formatDistanceToNow, format } from 'date-fns'
import type { SessionNameHistoryEntry } from '@gal/types'

interface SessionDetailModalProps {
  orgName: string
  sessionId: number
  onClose: () => void
  onSessionCancelled?: () => void
}

export const SessionDetailModal: FC<SessionDetailModalProps> = ({
  orgName,
  sessionId,
  onClose,
  onSessionCancelled,
}) => {
  const [session, setSession] = useState<any | null>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const isRunning = session?.status === 'queued' || session?.status === 'in_progress'

  const handleCancelWorkflow = async () => {
    setCancelling(true)
    try {
      await api.cancelWorkflowRun(orgName, sessionId)
      setShowCancelConfirm(false)
      onSessionCancelled?.()
      // Refresh session data
      const statusResult = await api.getWorkflowStatus(orgName, sessionId)
      if (statusResult) {
        setSession((prev: any) => ({
          ...prev,
          status: statusResult.status,
          conclusion: statusResult.conclusion,
        }))
      }
    } catch (error) {
      console.error('Failed to cancel workflow:', error)
    } finally {
      setCancelling(false)
    }
  }

  useEffect(() => {
    const fetchSessionDetails = async () => {
      try {
        const [statusResult, jobsResult] = await Promise.all([
          api.getWorkflowStatus(orgName, sessionId),
          api.getWorkflowRunJobs(orgName, sessionId),
        ])

        const runsResult = await api.listWorkflowRuns(orgName, { limit: 100 })
        const fullSession = runsResult.runs.find((r) => r.id === sessionId)

        if (fullSession && statusResult) {
          setSession({
            ...fullSession,
            status: statusResult.status,
            conclusion: statusResult.conclusion,
          })
        }

        setJobs(jobsResult.jobs)
      } catch (error) {
        console.error('Failed to fetch session details:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSessionDetails()
  }, [orgName, sessionId])

  if (loading || !session) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div
          className="w-full max-w-2xl rounded-xl shadow-xl p-6"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-2xl rounded-xl shadow-xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Session Details
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Status and Command */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <WorkflowStatusBadge status={session.status} conclusion={session.conclusion} />
              <span
                className="text-lg font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {session.command || 'Unknown Command'}
              </span>
            </div>

            {session.args && (
              <div className="flex items-center gap-2">
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Args:
                </span>
                <code
                  className="text-sm px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {session.args}
                </code>
              </div>
            )}

            <div className="flex items-center gap-4 text-sm" style={{ color: 'var(--text-muted)' }}>
              <span>
                Started {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
              </span>
              {session.triggeredBy && (
                <span>Triggered by {session.triggeredBy}</span>
              )}
            </div>
          </div>

          {/* Name / Title History */}
          {session.nameHistory && session.nameHistory.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <History className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                Session Title History
              </h3>
              <div
                className="rounded-lg p-3 space-y-2"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {(session.nameHistory as SessionNameHistoryEntry[]).map((entry, idx) => (
                  <div key={idx} className="flex items-start justify-between gap-4">
                    <span
                      className="text-sm"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {entry.name}
                    </span>
                    <div className="flex-shrink-0 text-right">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {format(new Date(entry.changedAt), 'MMM d, HH:mm')}
                      </span>
                      {entry.reason && entry.reason !== 'original' && (
                        <span
                          className="ml-2 text-xs px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {entry.reason}
                        </span>
                      )}
                      {idx === 0 && (
                        <span
                          className="ml-2 text-xs px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: 'var(--badge-blue-bg)',
                            color: 'var(--badge-blue-text)',
                          }}
                        >
                          original
                        </span>
                      )}
                      {idx === (session.nameHistory as SessionNameHistoryEntry[]).length - 1 && idx > 0 && (
                        <span
                          className="ml-2 text-xs px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: 'var(--surface-sunken)',
                            color: 'var(--status-success)',
                          }}
                        >
                          current
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Workflow Jobs */}
          {jobs.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Workflow Steps
              </h3>
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-lg p-4 space-y-3"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-sm font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {job.name}
                    </span>
                    <WorkflowStatusBadge
                      status={job.status}
                      conclusion={job.conclusion}
                      size="sm"
                    />
                  </div>

                  {/* Job Steps */}
                  {job.steps && job.steps.length > 0 && (
                    <div className="space-y-1.5">
                      {job.steps.map((step: any) => (
                        <div key={step.number} className="flex items-center gap-2">
                          {step.status === 'completed' && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-success)]" />
                          )}
                          {step.status === 'in_progress' && (
                            <Loader2 className="w-3.5 h-3.5 text-[var(--accent)] animate-spin" />
                          )}
                          {step.status === 'queued' && (
                            <Circle className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                          )}
                          <span
                            className="text-xs"
                            style={{
                              color:
                                step.status === 'completed'
                                  ? 'var(--text-primary)'
                                  : 'var(--text-muted)',
                            }}
                          >
                            {step.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {isRunning && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                disabled={cancelling}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: 'var(--status-danger-light)',
                  color: 'var(--status-danger)',
                  border: '1px solid var(--status-danger)',
                }}
              >
                {cancelling ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <StopCircle className="w-4 h-4" />
                )}
                {cancelling ? 'Cancelling...' : 'Cancel Workflow'}
              </button>
            )}

            <a
              href={session.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--accent)',
              }}
            >
              <ExternalLink className="w-4 h-4" />
              View on GitHub
            </a>
          </div>
        </div>

        {/* Cancel Confirmation Dialog */}
        {showCancelConfirm && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl"
          >
            <div
              className="p-6 rounded-lg max-w-sm mx-4"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                Cancel Workflow?
              </h3>
              <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
                Are you sure you want to cancel this running workflow? This action cannot be undone.
              </p>
              <div className="flex items-center gap-3 justify-end">
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                  }}
                >
                  Keep Running
                </button>
                <button
                  onClick={handleCancelWorkflow}
                  disabled={cancelling}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--status-danger)',
                    color: 'var(--text-on-accent)',
                  }}
                >
                  {cancelling ? 'Cancelling...' : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
