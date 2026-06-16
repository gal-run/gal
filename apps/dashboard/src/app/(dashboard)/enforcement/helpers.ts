import type {
  AgentPlatform,
  ApprovedConfigResponse,
  ApprovedConfigsByPlatformResponse,
  BillingStatus,
  FleetEnforcementStatus,
  FleetListResponse,
} from '@/lib/api'
import { DEFAULT_ENFORCEMENT_SETTINGS } from '@gal/types'

export interface PlatformToggle {
  id: AgentPlatform
  label: string
  enabled: boolean
  available: boolean
}

export interface DashboardEnforcementSettings {
  enabled: boolean
  enforcementLevel: 'off' | 'warn' | 'block'
  platforms: PlatformToggle[]
  gracePeriodDays: number
  notificationsEnabled: boolean
  blockOnMismatch: boolean
  requireSync: boolean
  allowOverrides: boolean
}

const PLATFORM_OPTIONS: Array<{ id: AgentPlatform; label: string }> = [
  { id: 'claude', label: 'Claude' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'copilot', label: 'Copilot' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'codex', label: 'Codex' },
  { id: 'windsurf', label: 'Windsurf' },
]

function getReferenceConfig(
  configs: Partial<Record<AgentPlatform, ApprovedConfigResponse>>,
  availablePlatforms: AgentPlatform[],
): ApprovedConfigResponse | null {
  for (const platform of availablePlatforms) {
    const config = configs[platform]
    if (config) return config
  }
  return null
}

export function hasEnforcementTierAccess(
  billingStatus: BillingStatus | null | undefined,
): boolean {
  if (!billingStatus) return false
  if (
    billingStatus.audienceTier === 'internal' ||
    billingStatus.audienceTier === 'partners'
  ) {
    return true
  }
  return (
    billingStatus.planTier === 'enforcement' ||
    billingStatus.planTier === 'enterprise'
  )
}

export function deriveDashboardEnforcementSettings(
  approvedConfigs: ApprovedConfigsByPlatformResponse | null | undefined,
): DashboardEnforcementSettings {
  const configs = approvedConfigs?.configs ?? {}
  const availablePlatforms = approvedConfigs?.availablePlatforms ?? []
  const referenceConfig = getReferenceConfig(configs, availablePlatforms)
  const referenceSettings = {
    ...DEFAULT_ENFORCEMENT_SETTINGS,
    ...(referenceConfig?.enforcementSettings ?? {}),
  }

  const platforms = PLATFORM_OPTIONS.map(({ id, label }) => {
    const configSettings = {
      ...DEFAULT_ENFORCEMENT_SETTINGS,
      ...(configs[id]?.enforcementSettings ?? {}),
    }
    const available = availablePlatforms.includes(id)
    return {
      id,
      label,
      available,
      enabled: available ? configSettings.enabled : false,
    }
  })

  return {
    enabled: platforms.some((platform) => platform.enabled),
    enforcementLevel: referenceSettings.level,
    platforms,
    gracePeriodDays: referenceSettings.gracePeriodDays ?? 0,
    notificationsEnabled: referenceSettings.notifyOnViolation,
    blockOnMismatch: referenceSettings.blockOnMismatch,
    requireSync: referenceSettings.requireSync,
    allowOverrides: referenceSettings.allowOverrides,
  }
}

export function isMachineSrtActive(
  enforcementStatus: FleetEnforcementStatus | undefined,
): boolean {
  if (!enforcementStatus) return false
  if (typeof enforcementStatus.runtime?.srtActive === 'boolean') {
    return enforcementStatus.runtime.srtActive
  }
  return Boolean(
    enforcementStatus.runtime?.srtInstalled &&
      enforcementStatus.runtime?.srtSettingsPresent &&
      enforcementStatus.runtime?.compiledRulesPresent,
  )
}

export function getMachineMode(
  enforcementStatus: FleetEnforcementStatus | undefined,
): 'off' | 'warn' | 'block' | 'unknown' {
  return enforcementStatus?.mode ?? 'unknown'
}

export function countSrtActiveMachines(
  fleet: FleetListResponse | null | undefined,
): number {
  return (fleet?.developers ?? []).filter((developer) =>
    isMachineSrtActive(developer.enforcementStatus),
  ).length
}

export function countMachinesByMode(
  fleet: FleetListResponse | null | undefined,
  mode: 'warn' | 'block',
): number {
  return (fleet?.developers ?? []).filter(
    (developer) => getMachineMode(developer.enforcementStatus) === mode,
  ).length
}
