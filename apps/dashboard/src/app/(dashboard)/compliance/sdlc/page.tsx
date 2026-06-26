'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  TrendingUp,
  FileWarning,
  GitPullRequest,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { FeatureGate } from '@/components/FeatureGate'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { api } from '@/lib/api'
import type { SdlcComplianceStatus, SdlcDriftReport } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_SDLC_COMPLIANCE_STATUS, DEMO_SDLC_DRIFT_REPORT } from '@/lib/demo-data'

// SDLC phase labels for display
const PHASE_LABELS: Record<number, string> = {
  1: 'Specify',
  2: 'Design',
  3: 'Test',
  4: 'Implement',
  5: 'Verify',
  6: 'Review',
  7: 'Merge',
}

function getPhaseLabel(phase: number): string {
  return PHASE_LABELS[phase] || `Phase ${phase}`
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'var(--status-success)'
  if (score >= 60) return 'var(--status-warning)'
  return 'var(--status-error)'
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Needs Improvement'
  return 'Poor'
}

export default function SdlcCompliancePage() {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const selectedWorkspace = useSelectedWorkspace()
  const userOrgs = user?.organizations ?? []
  const orgName = selectedWorkspace ?? userOrgs[0] ?? null

  const [status, setStatus] = useState<SdlcComplianceStatus | null>(null)
  const [drift, setDrift] = useState<SdlcDriftReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!orgName) return
    setLoading(true)
    setError(null)
    try {
      if (isDemoMode()) {
        setStatus(DEMO_SDLC_COMPLIANCE_STATUS)
        setDrift(DEMO_SDLC_DRIFT_REPORT)
        setLoading(false)
        return
      }
      const [statusData, driftData] = await Promise.all([
        api.getSdlcComplianceStatus(orgName),
        api.getSdlcDrift(orgName),
      ])
      setStatus(statusData)
      setDrift(driftData)
    } catch (err) {
      setError('Failed to load SDLC compliance data')
    } finally {
      setLoading(false)
    }
  }, [orgName])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Route guard (#4029): SDLC compliance is internal-only (mirrors the
  // /compliance/developers sibling and the layout nav, which both map this
  // surface to the internal 'enforcement-overrides' page). Block
  // non-internal/non-EE (customer-tier) users who hand-type /compliance/sdlc
  // with the same audience-aware FeatureGate the enforcement pages use.
  if (!isPageVisibleForUser('enforcement-overrides', userOrgs, selectedWorkspace)) {
    return <FeatureGate pageId="enforcement-overrides" />
  }

  if (!orgName) {
    return (
      <div className="p-8">
        <div className="glass-card p-8 text-center">
          <Shield className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            No Workspace Selected
          </h2>
          <p className="text-[var(--text-muted)]">
            Select a workspace to view SDLC compliance data.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--text-muted)]" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="glass-card p-8 text-center">
          <XCircle className="w-12 h-12 text-[var(--status-error)] mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Error Loading Data
          </h2>
          <p className="text-[var(--text-muted)] mb-4">{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 rounded-lg bg-[var(--interactive-primary)] text-[var(--text-on-accent)] hover:bg-[var(--interactive-primary-hover)] transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const complianceRate = status && status.totalProjects > 0
    ? Math.round((status.compliantProjects / status.totalProjects) * 100)
    : 100
  const driftRate = drift?.summary
    ? Math.round(drift.summary.complianceRate * 100)
    : 100

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            SDLC Compliance
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Monitor development workflow compliance across projects
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-primary)] text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Overall Compliance Score */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: `${getScoreColor(complianceRate)}20` }}
            >
              <Shield className="w-5 h-5" style={{ color: getScoreColor(complianceRate) }} />
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Compliance Score</p>
              <p
                className="text-2xl font-bold"
                style={{ color: getScoreColor(complianceRate) }}
              >
                {complianceRate}%
              </p>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {getScoreLabel(complianceRate)} - {status?.compliantProjects ?? 0} of{' '}
            {status?.totalProjects ?? 0} projects compliant
          </p>
        </div>

        {/* Drift Detection */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                background: drift?.driftDetected
                  ? 'var(--status-warning-bg)'
                  : 'var(--status-success-bg)',
              }}
            >
              {drift?.driftDetected ? (
                <AlertTriangle className="w-5 h-5" style={{ color: 'var(--status-warning)' }} />
              ) : (
                <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--status-success)' }} />
              )}
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Workflow Drift</p>
              <p className="text-2xl font-bold text-[var(--text-primary)]">
                {drift?.driftDetected ? 'Detected' : 'None'}
              </p>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {drift?.driftItems.length ?? 0} violation(s) found across projects
          </p>
        </div>

        {/* Transition Compliance */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: `${getScoreColor(driftRate)}20` }}
            >
              <TrendingUp className="w-5 h-5" style={{ color: getScoreColor(driftRate) }} />
            </div>
            <div>
              <p className="text-sm text-[var(--text-muted)]">Phase Transition Rate</p>
              <p
                className="text-2xl font-bold"
                style={{ color: getScoreColor(driftRate) }}
              >
                {driftRate}%
              </p>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {drift?.summary.compliantTransitions ?? 0} of{' '}
            {drift?.summary.totalTransitions ?? 0} transitions followed SDLC phases
          </p>
        </div>
      </div>

      {/* Per-Project Compliance Table */}
      <div className="glass-card mb-8">
        <div className="px-6 py-4 border-b border-[var(--border-primary)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Project Compliance
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Per-repository SDLC phase tracking
          </p>
        </div>

        {status && status.projects.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-primary)]">
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Project
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Current Phase
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Skipped Phases
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Last Transition
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-primary)]">
                {status.projects.map((project) => (
                  <tr key={project.projectId} className="hover:bg-[var(--surface-raised)]">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <GitPullRequest className="w-4 h-4 text-[var(--text-muted)]" />
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {project.projectId}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--surface-raised)] text-[var(--text-secondary)]">
                        Phase {project.currentPhase}: {getPhaseLabel(project.currentPhase)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {project.skippedPhases.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {project.skippedPhases.map((phase) => (
                            <span
                              key={phase}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                              style={{
                                background: 'var(--status-error-bg)',
                                color: 'var(--status-error)',
                              }}
                            >
                              {getPhaseLabel(phase)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--text-muted)]">None</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {project.isCompliant ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--status-success)' }}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Compliant
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--status-error)' }}>
                          <XCircle className="w-3.5 h-3.5" />
                          Non-compliant
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-[var(--text-muted)]">
                      {new Date(project.lastTransition).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <Shield className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-muted)]">
              No SDLC compliance data yet. Submit phase reports via the API or CI workflow.
            </p>
          </div>
        )}
      </div>

      {/* Recent Violations */}
      {drift && drift.driftItems.length > 0 && (
        <div className="glass-card">
          <div className="px-6 py-4 border-b border-[var(--border-primary)]">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Recent Violations
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Phase transitions that skipped required SDLC steps
            </p>
          </div>

          <div className="divide-y divide-[var(--border-primary)]">
            {drift.driftItems.slice(0, 10).map((item, idx) => (
              <div key={idx} className="px-6 py-4 hover:bg-[var(--surface-raised)]">
                <div className="flex items-start gap-3">
                  <FileWarning className="w-5 h-5 mt-0.5" style={{ color: 'var(--status-warning)' }} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {item.projectId}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        Issue #{item.issueNumber}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Jumped from{' '}
                      {item.fromPhase !== null
                        ? `Phase ${item.fromPhase} (${getPhaseLabel(item.fromPhase)})`
                        : 'start'}{' '}
                      to Phase {item.toPhase} ({getPhaseLabel(item.toPhase)})
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.skippedPhases.map((phase) => (
                        <span
                          key={phase}
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs"
                          style={{
                            background: 'var(--status-error-bg)',
                            color: 'var(--status-error)',
                          }}
                        >
                          Skipped: {getPhaseLabel(phase)}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-2">
                      {item.actor} - {new Date(item.detectedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
