'use client'

import { useState } from 'react'
import { Shield, GitBranch, Loader2, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { useIsInternalWorkspace } from '@/hooks/useWorkspaceAudienceTier'
import { useSdlcStates, useSdlcGates, useSdlcCompliance, useSdlcEnforcementConfig } from '@/hooks/useEnforcement'
import { api } from '@/lib/api'

const SDLC_PHASES = ['specify', 'design', 'test', 'implement', 'deploy-verify', 'review', 'merge'] as const

export default function SdlcPage() {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const userOrgs = user?.organizations ?? []
  const selectedWorkspace = useSelectedWorkspace()
  const orgName = selectedWorkspace ?? userOrgs[0] ?? null

  const { items: states, loading: statesLoading } = useSdlcStates(orgName)
  const { data: gates, loading: gatesLoading } = useSdlcGates(orgName)
  const { data: enforcementConfig, loading: enforcementLoading, refresh: refreshEnforcement } = useSdlcEnforcementConfig(orgName)
  const { data: compliance, loading: complianceLoading } = useSdlcCompliance(orgName)
  const loading = statesLoading || gatesLoading || enforcementLoading || complianceLoading
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const enforcementLevel = enforcementConfig?.config.level ?? 'block'
  const enforcementEnabled = enforcementConfig?.config.enabled ?? true

  const handleUpdateEnforcement = async (level: 'off' | 'warn' | 'block') => {
    if (!orgName || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.updateSdlcEnforcementConfig(orgName, {
        level,
        enabled: level !== 'off',
        reason: `Updated from SDLC enforcement dashboard to ${level} mode.`,
      })
      await refreshEnforcement()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to update SDLC enforcement mode')
    } finally {
      setSaving(false)
    }
  }

  const isInternalWorkspace = useIsInternalWorkspace()
  const isVisible = isInternalWorkspace && isPageVisibleForUser('enforcement-sdlc', userOrgs, selectedWorkspace)

  if (!isVisible) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <Shield className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Internal Feature</h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>SDLC compliance is only available to internal users.</p>
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
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>SDLC Compliance</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Phase gates, state tracking, and compliance monitoring</p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      )}

      {!loading && (
        <>
          <div className="rounded-xl p-5 mb-8" style={{ border: '1px solid var(--border-primary)', background: 'var(--surface-raised)' }}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Native Phase Gate</h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  Manual background sessions that launch <code>/sdlc:*:run</code> now respect the org SDLC enforcement mode.
                </p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  Current mode: <span style={{ color: 'var(--text-primary)' }}>{enforcementEnabled ? enforcementLevel : 'off'}</span>
                  {enforcementConfig?.config.updatedBy ? `  |  Updated by ${enforcementConfig.config.updatedBy}` : ''}
                </p>
                {enforcementConfig?.config.reason && (
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{enforcementConfig.config.reason}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {(['off', 'warn', 'block'] as const).map((level) => {
                  const active = enforcementLevel === level && (level !== 'off' ? enforcementEnabled : !enforcementEnabled)
                  return (
                    <button
                      key={level}
                      onClick={() => void handleUpdateEnforcement(level)}
                      disabled={saving}
                      className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={{
                        background: active ? 'var(--interactive-primary)' : 'var(--surface-raised)',
                        color: active ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                        border: `1px solid ${active ? 'var(--interactive-primary)' : 'var(--border-primary)'}`,
                        opacity: saving ? 0.7 : 1,
                      }}
                    >
                      {level === 'off' ? 'Off' : level === 'warn' ? 'Warn' : 'Block'}
                    </button>
                  )
                })}
              </div>
            </div>
            {saveError && (
              <div className="mt-4 text-sm" style={{ color: 'var(--status-error)' }}>
                {saveError}
              </div>
            )}
          </div>

          {compliance && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-primary)' }}>
                <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Total Projects</p>
                <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{compliance.totalProjects}</p>
              </div>
              <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-primary)' }}>
                <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Compliant</p>
                <p className="text-2xl font-bold mt-1" style={{ color: 'var(--status-success)' }}>{compliance.compliantProjects}</p>
              </div>
              <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-primary)' }}>
                <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Drifted</p>
                <p className="text-2xl font-bold mt-1" style={{ color: compliance.driftedProjects > 0 ? 'var(--status-error)' : 'var(--text-primary)' }}>{compliance.driftedProjects}</p>
              </div>
            </div>
          )}

          {gates && gates.gates.length > 0 && (
            <>
              <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Compliance Gates</h2>
              <div className="space-y-3 mb-8">
                {gates.gates.map((gate, i) => (
                  <div key={i} className="rounded-lg p-3" style={{ border: '1px solid var(--border-primary)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-raised)', color: 'var(--text-secondary)' }}>{gate.from}</span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>-&gt;</span>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-raised)', color: 'var(--text-secondary)' }}>{gate.to}</span>
                    </div>
                    <ul className="space-y-1">
                      {gate.conditions.map((c, ci) => (
                        <li key={ci} className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                          <CheckCircle className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                          {c.description}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}

          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Active State Machines</h2>
          {states.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 rounded-xl" style={{ border: '1px dashed var(--border-primary)' }}>
              <GitBranch className="w-10 h-10 mb-3" style={{ color: 'var(--text-muted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No active SDLC state machines</p>
            </div>
          ) : (
            <div className="space-y-3">
              {states.map((state) => (
                <div key={state.issueId} className="rounded-lg p-3" style={{ border: '1px solid var(--border-primary)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>#{state.issueId}</span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--surface-raised)', color: 'var(--text-secondary)' }}>{state.currentPhase}</span>
                  </div>
                  <div className="flex gap-1 mt-2">
                    {SDLC_PHASES.map((phase) => {
                      const isCompleted = SDLC_PHASES.indexOf(phase) < SDLC_PHASES.indexOf(state.currentPhase as typeof SDLC_PHASES[number])
                      const isCurrent = phase === state.currentPhase
                      return (
                        <div
                          key={phase}
                          className="flex-1 h-1.5 rounded-full"
                          style={{
                            background: isCurrent ? 'var(--text-primary)' : isCompleted ? 'var(--text-secondary)' : 'var(--border-primary)',
                          }}
                          title={phase}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {compliance && compliance.projects.length > 0 && (
            <>
              <h2 className="text-lg font-semibold mt-8 mb-4" style={{ color: 'var(--text-primary)' }}>Project Compliance</h2>
              <div className="space-y-2">
                {compliance.projects.map((p) => (
                  <div key={p.projectId} className="rounded-lg p-3 flex items-center justify-between" style={{ border: '1px solid var(--border-primary)' }}>
                    <div>
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.projectId}</span>
                      <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>Phase {p.currentPhase}</span>
                      {p.skippedPhases.length > 0 && (
                        <span className="text-xs ml-2" style={{ color: 'var(--status-error)' }}>Skipped: {p.skippedPhases.join(', ')}</span>
                      )}
                    </div>
                    {p.isCompliant ? (
                      <CheckCircle className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
                    ) : (
                      <XCircle className="w-4 h-4" style={{ color: 'var(--status-error)' }} />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
