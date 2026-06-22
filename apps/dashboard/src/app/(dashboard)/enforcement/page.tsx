'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TerminalSquare,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { useWorkspaceAudienceTier } from '@/hooks/useWorkspaceAudienceTier'
import { api, type ApprovedConfigsByPlatformResponse, type BillingStatus, type FleetListResponse } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_BILLING_STATUS } from '@/lib/demo-data'
import {
  countMachinesByMode,
  countSrtActiveMachines,
  hasEnforcementTierAccess,
} from './helpers'

interface OnboardingSnapshot {
  billingStatus: BillingStatus | null
  approvedConfigs: ApprovedConfigsByPlatformResponse | null
  fleet: FleetListResponse | null
}

function StatusCard({
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

function OnboardingStep({
  title,
  description,
  complete,
  actionHref,
  actionLabel,
  command,
  upcoming,
}: {
  title: string
  description: string
  complete: boolean
  actionHref?: string
  actionLabel?: string
  command?: string
  upcoming?: boolean
}) {
  return (
    <div className="rounded-xl p-5" style={{ border: '1px solid var(--border-primary)' }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {complete ? (
              <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
            ) : (
              <ShieldAlert className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />
            )}
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h3>
          </div>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            {description}
          </p>
          {command && (
            <code
              className="inline-block mt-3 rounded-md px-2 py-1 text-xs"
              style={{ background: 'var(--surface-raised)', color: 'var(--text-secondary)' }}
            >
              {command}
              {upcoming ? ' (coming in v1.0)' : ''}
            </code>
          )}
        </div>
        <span
          className="text-xs px-2 py-1 rounded-full whitespace-nowrap"
          style={{
            background: complete ? 'var(--status-success-bg)' : 'var(--surface-raised)',
            color: complete ? 'var(--status-success)' : 'var(--text-muted)',
          }}
        >
          {complete ? 'Done' : upcoming ? 'Upcoming' : 'Next'}
        </span>
      </div>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium"
          style={{ color: 'var(--interactive-primary)' }}
        >
          {actionLabel}
          <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  )
}

export default function EnforcementLandingPage() {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const selectedWorkspace = useSelectedWorkspace()
  const workspaceAudienceTier = useWorkspaceAudienceTier()
  const userOrgs = user?.organizations ?? []
  const orgName = selectedWorkspace ?? userOrgs[0] ?? null
  const [snapshot, setSnapshot] = useState<OnboardingSnapshot>({
    billingStatus: null,
    approvedConfigs: null,
    fleet: null,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isVisible = isPageVisibleForUser('enforcement-compliance', userOrgs, selectedWorkspace)
  const hasWorkspaceAccess =
    workspaceAudienceTier === 'internal' ||
    workspaceAudienceTier === 'partners' ||
    hasEnforcementTierAccess(snapshot.billingStatus)

  const loadSnapshot = useCallback(async () => {
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
            configs: {
              claude: {
                approved: true,
                platform: 'claude',
                enforcementSettings: {
                  enabled: true,
                  level: 'block',
                  blockOnMismatch: true,
                  requireSync: true,
                  allowOverrides: true,
                  notifyOnViolation: true,
                  gracePeriodDays: 7,
                },
              },
              cursor: {
                approved: true,
                platform: 'cursor',
                enforcementSettings: {
                  enabled: true,
                  level: 'warn',
                  blockOnMismatch: false,
                  requireSync: true,
                  allowOverrides: true,
                  notifyOnViolation: true,
                  gracePeriodDays: 7,
                },
              },
            },
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
            ],
            summary: {
              total: 1,
              compliant: 1,
              nonCompliant: 0,
              installedCount: 1,
              avgPlatforms: 2,
            },
          },
        })
        setLoading(false)
        return
      }

      const [billingStatus, approvedConfigs, fleet] = await Promise.all([
        api.getBillingStatus(orgName),
        api.getApprovedConfigsByPlatform(orgName),
        api.getFleetList(orgName),
      ])

      setSnapshot({
        billingStatus,
        approvedConfigs,
        fleet,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load enforcement onboarding status')
    } finally {
      setLoading(false)
    }
  }, [orgName])

  useEffect(() => {
    loadSnapshot()
  }, [loadSnapshot])

  const publishedPlatforms = snapshot.approvedConfigs?.availablePlatforms ?? []
  const srtActiveMachines = countSrtActiveMachines(snapshot.fleet)
  const warnMachines = countMachinesByMode(snapshot.fleet, 'warn')
  const blockMachines = countMachinesByMode(snapshot.fleet, 'block')

  const onboardingSteps = useMemo(
    () => [
      {
        title: 'Publish approved config bundles',
        description: 'Enforcement compiles from the workspace approved-config bundle. Publish at least one platform before onboarding developers.',
        complete: publishedPlatforms.length > 0,
        actionHref: '/approved-config',
        actionLabel: 'Open Approved Config',
      },
      {
        title: 'Install the sandbox runtime',
        description: 'Developers will install the pinned runtime locally once per machine. Per-machine runtime install is in active development.',
        complete: (snapshot.fleet?.developers ?? []).some((developer) => developer.enforcementStatus.runtime?.srtInstalled),
        command: 'gal enforce install',
        upcoming: true,
      },
      {
        title: 'Compile and sync org rules',
        description: 'Sync will write the hook config and ~/.srt-settings.json from the approved RuleSet. Rule compile-and-sync is in active development.',
        complete: (snapshot.fleet?.developers ?? []).some((developer) => developer.enforcementStatus.runtime?.compiledRulesPresent),
        command: 'gal sync --pull',
        upcoming: true,
      },
      {
        title: 'Confirm runtime is active',
        description: 'Once enrolled, at least one machine should report SRT active before you switch org-wide enforcement to block mode. Runtime activation and block mode are coming in v1.0.',
        complete: srtActiveMachines > 0,
        actionHref: '/enforcement/compliance',
        actionLabel: 'View machine status',
        upcoming: true,
      },
    ],
    [publishedPlatforms.length, snapshot.fleet?.developers, srtActiveMachines],
  )

  if (!isVisible) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <Shield className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Feature Disabled
        </h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
          Enforcement onboarding is currently unavailable for this workspace.
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
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
          Select a workspace to onboard Enforcement tier and track machine compliance.
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
      <div className="flex flex-col gap-2 mb-8">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Enforcement
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Roll out runtime enforcement, confirm machines are online, and move from warn mode to block mode with evidence.
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

      {!hasWorkspaceAccess ? (
        <div className="rounded-2xl p-6 md:p-8" style={{ border: '1px solid var(--border-primary)' }}>
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--surface-raised)' }}
            >
              <ShieldCheck className="w-6 h-6" style={{ color: 'var(--interactive-primary)' }} />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                Upgrade to the Enforcement tier
              </h2>
              <p className="text-sm mt-2 max-w-2xl" style={{ color: 'var(--text-muted)' }}>
                Enforcement tier adds runtime sandboxing, machine-level compliance reporting, and violation telemetry. After upgrade, your admins can publish approved bundles and confirm SRT is active from this workspace. Per-machine onboarding via `gal enforce install` is coming in v1.0.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                <StatusCard label="Published Platforms" value={publishedPlatforms.length} />
                <StatusCard label="Machines Reporting" value={snapshot.fleet?.summary.total ?? 0} />
                <StatusCard label="SRT Active" value={srtActiveMachines} />
              </div>
              <Link
                href="/billing"
                className="inline-flex items-center gap-2 mt-6 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--interactive-primary)', color: 'var(--text-on-accent)' }}
              >
                Open Billing
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <StatusCard label="Published Platforms" value={publishedPlatforms.length} tone={publishedPlatforms.length > 0 ? 'success' : 'warning'} />
            <StatusCard label="Machines Enrolled" value={snapshot.fleet?.summary.total ?? 0} />
            <StatusCard label="SRT Active" value={srtActiveMachines} tone={srtActiveMachines > 0 ? 'success' : 'warning'} />
            <StatusCard label="Block Mode" value={blockMachines} tone={blockMachines > 0 ? 'success' : 'default'} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6">
            <div className="space-y-4">
              <div className="rounded-2xl p-6" style={{ border: '1px solid var(--border-primary)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <TerminalSquare className="w-5 h-5" style={{ color: 'var(--interactive-primary)' }} />
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Onboarding Checklist
                  </h2>
                </div>
                <div className="space-y-4">
                  {onboardingSteps.map((step) => (
                    <OnboardingStep key={step.title} {...step} />
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl p-6" style={{ border: '1px solid var(--border-primary)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <ClipboardCheck className="w-5 h-5" style={{ color: 'var(--interactive-primary)' }} />
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Rollout Snapshot
                  </h2>
                </div>
                <dl className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <dt style={{ color: 'var(--text-muted)' }}>Warn-mode machines</dt>
                    <dd style={{ color: 'var(--text-primary)' }}>{warnMachines}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt style={{ color: 'var(--text-muted)' }}>Block-mode machines</dt>
                    <dd style={{ color: 'var(--text-primary)' }}>{blockMachines}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt style={{ color: 'var(--text-muted)' }}>Plan tier</dt>
                    <dd style={{ color: 'var(--text-primary)' }}>
                      {workspaceAudienceTier === 'internal'
                        ? 'Internal'
                        : workspaceAudienceTier === 'partners'
                          ? 'Partner'
                          : snapshot.billingStatus?.planTier ?? 'unknown'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-2xl p-6" style={{ border: '1px solid var(--border-primary)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="w-5 h-5" style={{ color: 'var(--interactive-primary)' }} />
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Quick Links
                  </h2>
                </div>
                <div className="space-y-3">
                  <Link href="/enforcement/settings" className="block rounded-xl p-4 transition-colors hover:bg-[var(--surface-hover)]" style={{ border: '1px solid var(--border-primary)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Settings</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Set org-wide warn/block mode and violation telemetry.
                    </p>
                  </Link>
                  <Link href="/enforcement/compliance" className="block rounded-xl p-4 transition-colors hover:bg-[var(--surface-hover)]" style={{ border: '1px solid var(--border-primary)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Compliance</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Inspect machine status, SRT activity, and recent violations.
                    </p>
                  </Link>
                  <Link href="/approved-config" className="block rounded-xl p-4 transition-colors hover:bg-[var(--surface-hover)]" style={{ border: '1px solid var(--border-primary)' }}>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Approved Config</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Publish the bundle that enforcement compiles from.
                    </p>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
