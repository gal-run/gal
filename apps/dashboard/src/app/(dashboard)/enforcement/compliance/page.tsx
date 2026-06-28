'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Shield,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { useWorkspaceAudienceTier } from '@/hooks/useWorkspaceAudienceTier'
import {
  api,
  type ApprovedConfigsByPlatformResponse,
  type BillingStatus,
  type EnforcementEventsResponse,
  type FleetListResponse,
} from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_BILLING_STATUS, DEMO_ENFORCEMENT_EVENTS } from '@/lib/demo-data'
import { formatRelativeTime } from '@/lib/time'
import {
  countMachinesByMode,
  countSrtActiveMachines,
  getMachineMode,
  hasEnforcementTierAccess,
  isMachineSrtActive,
} from '../helpers'

interface ComplianceSnapshot {
  billingStatus: BillingStatus | null
  approvedConfigs: ApprovedConfigsByPlatformResponse | null
  fleet: FleetListResponse | null
  events: EnforcementEventsResponse
}

function StatCard({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string | number
  tone?: 'default' | 'success' | 'warning'
}) {
  const color =
    tone === 'success'
      ? 'var(--status-success)'
      : tone === 'warning'
        ? 'var(--status-warning)'
        : 'var(--text-primary)'

  return (
    <div className="rounded-xl p-4" style={{ border: '1px solid var(--border-primary)' }}>
      <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>
        {value}
      </p>
    </div>
  )
}

export default function CompliancePage() {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const selectedWorkspace = useSelectedWorkspace()
  const workspaceAudienceTier = useWorkspaceAudienceTier()
  const userOrgs = user?.organizations ?? []
  const orgName = selectedWorkspace ?? userOrgs[0] ?? null
  const [snapshot, setSnapshot] = useState<ComplianceSnapshot>({
    billingStatus: null,
    approvedConfigs: null,
    fleet: null,
    events: { events: [], total: 0, limit: 10 },
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isVisible = isPageVisibleForUser('enforcement-compliance', userOrgs, selectedWorkspace)
  const hasTierAccess =
    workspaceAudienceTier === 'internal' ||
    workspaceAudienceTier === 'partners' ||
    hasEnforcementTierAccess(snapshot.billingStatus)

  const loadCompliance = useCallback(async () => {
    if (!orgName) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (isDemoMode()) {
        setSnapshot({
          billingStatus: DEMO_BILLING_STATUS,
          approvedConfigs: {
            availablePlatforms: ['claude', 'cursor', 'gemini'],
            configs: {},
          },
          fleet: {
            developers: [
              {
                id: 'demo-1',
                organizationId: orgName,
                email: 'maya@example.com',
                machineId: 'machine-1',
                hostname: 'maya-mbp',
                registeredAt: new Date().toISOString(),
                lastCheckIn: new Date().toISOString(),
                isCompliant: true,
                enforcementStatus: {
                  installed: true,
                  version: '0.0.594',
                  policyVersion: 'compiled',
                  platforms: ['claude', 'cursor'],
                  mode: 'block',
                  runtime: {
                    srtInstalled: true,
                    srtSettingsPresent: true,
                    compiledRulesPresent: true,
                    preToolUseHookPresent: true,
                    srtActive: true,
                  },
                },
              },
              {
                id: 'demo-2',
                organizationId: orgName,
                email: 'alex@example.com',
                machineId: 'machine-2',
                hostname: 'alex-linux',
                registeredAt: new Date().toISOString(),
                lastCheckIn: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
                isCompliant: false,
                enforcementStatus: {
                  installed: true,
                  version: '0.0.594',
                  policyVersion: 'compiled',
                  platforms: ['claude'],
                  mode: 'warn',
                  runtime: {
                    srtInstalled: true,
                    srtSettingsPresent: true,
                    compiledRulesPresent: true,
                    preToolUseHookPresent: true,
                    srtActive: true,
                  },
                },
              },
            ],
            summary: {
              total: 2,
              compliant: 1,
              nonCompliant: 1,
              installedCount: 2,
              avgPlatforms: 1.5,
            },
          },
          events: DEMO_ENFORCEMENT_EVENTS,
        })
        setLoading(false)
        return
      }

      const [billingStatus, approvedConfigs, fleet, events] = await Promise.all([
        api.getBillingStatus(orgName),
        api.getApprovedConfigsByPlatform(orgName),
        api.getFleetList(orgName),
        api.getEnforcementEvents(orgName, { limit: 10 }),
      ])

      setSnapshot({
        billingStatus,
        approvedConfigs,
        fleet,
        events,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load enforcement compliance')
    } finally {
      setLoading(false)
    }
  }, [orgName])

  useEffect(() => {
    loadCompliance()
  }, [loadCompliance])

  const publishedPlatforms = snapshot.approvedConfigs?.availablePlatforms ?? []
  const srtActiveMachines = countSrtActiveMachines(snapshot.fleet)
  const warnMachines = countMachinesByMode(snapshot.fleet, 'warn')
  const blockMachines = countMachinesByMode(snapshot.fleet, 'block')
  const recentViolations = useMemo(
    () =>
      snapshot.events.events.filter(
        (event) =>
          event.decision.allowed === false || event.decision.matchedPolicies.length > 0,
      ),
    [snapshot.events.events],
  )

  if (!isVisible) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <Shield className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Feature Disabled
        </h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
          Enforcement compliance is currently unavailable for this workspace.
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
          Select a workspace from the sidebar to inspect enforcement compliance.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Compliance Status
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Machine-level SRT activity, effective warn/block mode, and recent violation signals.
        </p>
      </div>

      {error && (
        <div
          className="flex items-center gap-3 rounded-xl p-4 mb-6"
          style={{ background: 'var(--status-error-bg)', border: '1px solid var(--status-error)' }}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--status-error)' }} />
          <p className="text-sm" style={{ color: 'var(--status-error)' }}>
            {error}
          </p>
        </div>
      )}

      {!hasTierAccess ? (
        <div className="rounded-2xl p-6" style={{ border: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Upgrade to unlock runtime compliance
          </h2>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Compliance reporting is available on Enforcement tier after developers install the runtime and sync org policy locally.
          </p>
          <Link
            href="/billing"
            className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--interactive-primary)', color: 'var(--text-on-accent)' }}
          >
            Open Billing
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
            <StatCard label="Machines Enrolled" value={snapshot.fleet?.summary.total ?? 0} />
            <StatCard label="SRT Active" value={srtActiveMachines} tone={srtActiveMachines > 0 ? 'success' : 'warning'} />
            <StatCard label="Warn Mode" value={warnMachines} />
            <StatCard label="Block Mode" value={blockMachines} tone={blockMachines > 0 ? 'success' : 'default'} />
            <StatCard label="Published Platforms" value={publishedPlatforms.length} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6">
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-primary)' }}>
              <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-primary)' }}>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Developer Machines
                </h2>
              </div>

              {(snapshot.fleet?.developers.length ?? 0) === 0 ? (
                <div className="px-6 py-12 text-center">
                  <ClipboardCheck className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    No machines enrolled yet
                  </p>
                  <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                    Developers will appear here once they enroll a machine. Fleet enrollment (`gal fleet register` / `gal enforce status`) is coming in v1.0.
                  </p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--border-primary)' }}>
                      <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Machine</th>
                      <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Platforms</th>
                      <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>SRT</th>
                      <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Mode</th>
                      <th className="text-left px-4 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Last Check-in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.fleet?.developers.map((developer) => {
                      const srtActive = isMachineSrtActive(developer.enforcementStatus)
                      const mode = getMachineMode(developer.enforcementStatus)
                      return (
                        <tr key={developer.id} style={{ borderBottom: '1px solid var(--border-primary)' }}>
                          <td className="px-4 py-3 align-top">
                            <div>
                              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                {developer.hostname || developer.email}
                              </p>
                              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                {developer.email}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                              {developer.enforcementStatus.platforms.join(', ') || 'None'}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              {srtActive ? (
                                <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--status-success)' }} />
                              ) : (
                                <ShieldAlert className="w-3.5 h-3.5" style={{ color: 'var(--status-warning)' }} />
                              )}
                              <span style={{ color: srtActive ? 'var(--status-success)' : 'var(--status-warning)' }}>
                                {srtActive ? 'Online' : 'Not active'}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span
                              className="text-xs px-2 py-1 rounded-full uppercase"
                              style={{
                                background: 'var(--surface-raised)',
                                color:
                                  mode === 'block'
                                    ? 'var(--status-success)'
                                    : mode === 'warn'
                                      ? 'var(--status-warning)'
                                      : 'var(--text-muted)',
                              }}
                            >
                              {mode}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                              {formatRelativeTime(new Date(developer.lastCheckIn))}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl p-6" style={{ border: '1px solid var(--border-primary)' }}>
                <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Recent Violations
                </h2>

                {recentViolations.length === 0 ? (
                  <div className="text-center py-8">
                    <Shield className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
                    <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      No recent violations
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentViolations.slice(0, 6).map((event) => {
                      const blocked = !event.decision.allowed
                      return (
                        <div
                          key={event.id}
                          className="rounded-xl p-4"
                          style={{ border: '1px solid var(--border-primary)' }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                {event.tool}
                              </p>
                              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                {event.decision.matchedPolicies[0]?.policyName || 'Policy match'}
                              </p>
                            </div>
                            {blocked ? (
                              <XCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--status-error)' }} />
                            ) : (
                              <ShieldAlert className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--status-warning)' }} />
                            )}
                          </div>
                          <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                            {formatRelativeTime(new Date(event.timestamp))}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl p-6" style={{ border: '1px solid var(--border-primary)' }}>
                <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
                  Next Actions
                </h2>
                <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                  <li>Per-machine install (`gal enforce install`) is coming in v1.0.</li>
                  <li>Run `gal sync --pull` after every policy change.</li>
                  <li>Switch org settings from warn to block once SRT is active on the fleet.</li>
                </ul>
                <Link
                  href="/enforcement/settings"
                  className="inline-flex items-center gap-2 mt-5 text-sm font-medium"
                  style={{ color: 'var(--interactive-primary)' }}
                >
                  Open Settings
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
