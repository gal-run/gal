'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2, Save, Shield } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import {
  useIsWorkspaceAdmin,
  useWorkspaceAudienceTier,
} from '@/hooks/useWorkspaceAudienceTier'
import {
  api,
  type ApprovedConfigsByPlatformResponse,
  type BillingStatus,
} from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_BILLING_STATUS, DEMO_ENFORCEMENT_SETTINGS } from '@/lib/demo-data'
import {
  deriveDashboardEnforcementSettings,
  hasEnforcementTierAccess,
  type DashboardEnforcementSettings,
} from '../helpers'

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
      style={{
        background: checked ? 'var(--interactive-primary)' : 'var(--border-primary)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span
        className="inline-block h-4 w-4 rounded-full transition-transform"
        style={{
          background: 'var(--text-on-accent)',
          transform: checked ? 'translateX(1.375rem)' : 'translateX(0.25rem)',
        }}
      />
    </button>
  )
}

const LEVEL_OPTIONS: Array<{
  value: 'off' | 'warn' | 'block'
  label: string
  description: string
}> = [
  {
    value: 'off',
    label: 'Off',
    description: 'Keep the approved policy published, but do not enforce it on developer machines.',
  },
  {
    value: 'warn',
    label: 'Warn',
    description: 'Developers see violations and telemetry is recorded, but commands still run.',
  },
  {
    value: 'block',
    label: 'Block',
    description: 'Violation decisions block the matching command or tool call.',
  },
]

export default function EnforcementSettingsPage() {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const selectedWorkspace = useSelectedWorkspace()
  const workspaceAudienceTier = useWorkspaceAudienceTier()
  const isWorkspaceAdmin = useIsWorkspaceAdmin()
  const userOrgs = user?.organizations ?? []
  const orgName = selectedWorkspace ?? userOrgs[0] ?? null
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null)
  const [approvedConfigs, setApprovedConfigs] = useState<ApprovedConfigsByPlatformResponse | null>(null)
  const [settings, setSettings] = useState<DashboardEnforcementSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const isVisible = isPageVisibleForUser('enforcement-compliance', userOrgs, selectedWorkspace)
  const hasTierAccess =
    workspaceAudienceTier === 'internal' ||
    workspaceAudienceTier === 'partners' ||
    hasEnforcementTierAccess(billingStatus)

  const loadSettings = useCallback(async () => {
    if (!orgName) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (isDemoMode()) {
        setBillingStatus(DEMO_BILLING_STATUS)
        setApprovedConfigs({
          availablePlatforms: ['claude', 'cursor', 'gemini'],
          configs: {
            claude: {
              approved: true,
              platform: 'claude',
              enforcementSettings: {
                enabled: true,
                level: 'warn',
                blockOnMismatch: false,
                requireSync: true,
                allowOverrides: true,
                notifyOnViolation: true,
                gracePeriodDays: DEMO_ENFORCEMENT_SETTINGS.gracePeriodDays,
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
                gracePeriodDays: DEMO_ENFORCEMENT_SETTINGS.gracePeriodDays,
              },
            },
          },
        })
        setSettings({
          ...DEMO_ENFORCEMENT_SETTINGS,
          platforms: DEMO_ENFORCEMENT_SETTINGS.platforms.map((platform) => ({
            ...platform,
            id: platform.id as DashboardEnforcementSettings['platforms'][number]['id'],
            available: true,
          })),
          blockOnMismatch: false,
          requireSync: true,
          allowOverrides: true,
        })
        setLoading(false)
        return
      }

      const [nextBillingStatus, nextApprovedConfigs] = await Promise.all([
        api.getBillingStatus(orgName),
        api.getApprovedConfigsByPlatform(orgName),
      ])
      setBillingStatus(nextBillingStatus)
      setApprovedConfigs(nextApprovedConfigs)
      setSettings(deriveDashboardEnforcementSettings(nextApprovedConfigs))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load enforcement settings')
    } finally {
      setLoading(false)
    }
  }, [orgName])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSave = async () => {
    if (!orgName || !settings) return
    const targets = settings.platforms.filter((platform) => platform.available)

    if (!isWorkspaceAdmin) {
      setError('Only workspace admins can update enforcement settings.')
      return
    }

    if (targets.length === 0) {
      setError('Publish an approved config for at least one platform before enabling enforcement.')
      return
    }

    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      await Promise.all(
        targets.map((platform) =>
          api.updateApprovedConfigEnforcementSettings(orgName, platform.id, {
            enabled: platform.enabled,
            level: settings.enforcementLevel,
            blockOnMismatch: settings.blockOnMismatch,
            requireSync: settings.requireSync,
            allowOverrides: settings.allowOverrides,
            notifyOnViolation: settings.notificationsEnabled,
            gracePeriodDays: settings.gracePeriodDays,
          }),
        ),
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      await loadSettings()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save enforcement settings')
    } finally {
      setSaving(false)
    }
  }

  if (!isVisible) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <Shield className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Feature Disabled
        </h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
          Enforcement settings are currently unavailable for this workspace.
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
          Select a workspace from the sidebar to configure enforcement.
        </p>
      </div>
    )
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-muted)' }} />
      </div>
    )
  }

  const availablePlatforms = settings.platforms.filter((platform) => platform.available)

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Enforcement Settings
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Control rollout mode and violation telemetry for each published platform.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !hasTierAccess || !isWorkspaceAdmin || availablePlatforms.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: saved ? 'var(--status-success)' : 'var(--interactive-primary)',
            color: 'var(--text-on-accent)',
            opacity: saving || !hasTierAccess || !isWorkspaceAdmin || availablePlatforms.length === 0 ? 0.55 : 1,
          }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? 'Saved' : saving ? 'Saving...' : 'Save Changes'}
        </button>
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
            Enforcement tier required
          </h2>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Upgrade the workspace to Enforcement tier before you turn on warn/block mode or violation telemetry.
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
        <div className="space-y-6">
          <div className="rounded-2xl p-6" style={{ border: '1px solid var(--border-primary)' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Published Platforms
                </h2>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  Enforcement settings apply to approved-config bundles that already exist in this workspace.
                </p>
              </div>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {availablePlatforms.length} active platform{availablePlatforms.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="space-y-3 mt-5">
              {settings.platforms.map((platform) => (
                <div
                  key={platform.id}
                  className="flex items-center justify-between gap-4 rounded-xl px-4 py-3"
                  style={{ border: '1px solid var(--border-primary)' }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {platform.label}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      {platform.available
                        ? 'Published in Approved Config and eligible for enforcement.'
                        : 'Publish an Approved Config bundle before enabling enforcement on this platform.'}
                    </p>
                  </div>
                  <Toggle
                    checked={platform.enabled}
                    disabled={!platform.available || !isWorkspaceAdmin}
                    onChange={(enabled) => {
                      setSettings((current) =>
                        current
                          ? {
                              ...current,
                              platforms: current.platforms.map((item) =>
                                item.id === platform.id ? { ...item, enabled } : item,
                              ),
                            }
                          : current,
                      )
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl p-6" style={{ border: '1px solid var(--border-primary)' }}>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Rollout Mode
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              Pick the org-wide default. The selected mode is written back to each published platform bundle.
            </p>
            <div className="space-y-3 mt-5">
              {LEVEL_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-start gap-3 rounded-xl p-4 cursor-pointer"
                  style={{
                    border: `1px solid ${settings.enforcementLevel === option.value ? 'var(--interactive-primary)' : 'var(--border-primary)'}`,
                    background: settings.enforcementLevel === option.value ? 'var(--surface-hover)' : 'transparent',
                    opacity: isWorkspaceAdmin ? 1 : 0.8,
                  }}
                >
                  <input
                    type="radio"
                    name="enforcementLevel"
                    className="mt-1"
                    checked={settings.enforcementLevel === option.value}
                    disabled={!isWorkspaceAdmin}
                    onChange={() => setSettings((current) => current ? { ...current, enforcementLevel: option.value } : current)}
                  />
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {option.label}
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      {option.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl p-6" style={{ border: '1px solid var(--border-primary)' }}>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Grace Period
              </h2>
              <p className="text-sm mt-1 mb-4" style={{ color: 'var(--text-muted)' }}>
                Delay enforcement after a policy change so developers can sync before warnings or blocks apply.
              </p>
              <input
                type="number"
                min={0}
                value={settings.gracePeriodDays}
                disabled={!isWorkspaceAdmin}
                onChange={(event) =>
                  setSettings((current) =>
                    current
                      ? {
                          ...current,
                          gracePeriodDays: Math.max(0, Number(event.target.value || 0)),
                        }
                      : current,
                  )
                }
                className="w-full rounded-lg px-3 py-2"
                style={{
                  border: '1px solid var(--border-primary)',
                  background: 'var(--surface-primary)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            <div className="rounded-2xl p-6" style={{ border: '1px solid var(--border-primary)' }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                    Violation Telemetry
                  </h2>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                    Record violations so admins can audit blocked and warn-mode events from the compliance page.
                  </p>
                </div>
                <Toggle
                  checked={settings.notificationsEnabled}
                  disabled={!isWorkspaceAdmin}
                  onChange={(notificationsEnabled) =>
                    setSettings((current) =>
                      current ? { ...current, notificationsEnabled } : current,
                    )
                  }
                />
              </div>
            </div>
          </div>

          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {isWorkspaceAdmin
              ? 'Saving writes enforcement settings back to each published platform bundle.'
              : 'You can review enforcement settings, but only workspace admins can save changes.'}
          </p>
        </div>
      )}
    </div>
  )
}
