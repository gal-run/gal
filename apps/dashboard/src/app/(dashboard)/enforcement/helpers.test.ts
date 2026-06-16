import { describe, expect, it } from 'vitest'
import {
  countMachinesByMode,
  countSrtActiveMachines,
  deriveDashboardEnforcementSettings,
  getMachineMode,
  hasEnforcementTierAccess,
  isMachineSrtActive,
} from './helpers'

describe('enforcement dashboard helpers', () => {
  it('derives org settings from published approved-config bundles', () => {
    const settings = deriveDashboardEnforcementSettings({
      availablePlatforms: ['claude', 'cursor'],
      configs: {
        claude: {
          approved: true,
          platform: 'claude',
          enforcementSettings: {
            enabled: true,
            level: 'block',
            blockOnMismatch: true,
            requireSync: true,
            allowOverrides: false,
            notifyOnViolation: true,
            gracePeriodDays: 3,
          },
        },
        cursor: {
          approved: true,
          platform: 'cursor',
          enforcementSettings: {
            enabled: false,
            level: 'warn',
          },
        },
      },
    })

    expect(settings.enforcementLevel).toBe('block')
    expect(settings.notificationsEnabled).toBe(true)
    expect(settings.gracePeriodDays).toBe(3)
    expect(settings.platforms.find((platform) => platform.id === 'claude')).toEqual(
      expect.objectContaining({ available: true, enabled: true }),
    )
    expect(settings.platforms.find((platform) => platform.id === 'cursor')).toEqual(
      expect.objectContaining({ available: true, enabled: false }),
    )
    expect(settings.platforms.find((platform) => platform.id === 'gemini')).toEqual(
      expect.objectContaining({ available: false, enabled: false }),
    )
  })

  it('treats partner and enforcement-tier workspaces as eligible', () => {
    expect(hasEnforcementTierAccess(null)).toBe(false)
    expect(
      hasEnforcementTierAccess({
        planTier: 'convenience',
        audienceTier: 'partners',
        seatLimit: 25,
        seatsUsed: 5,
        status: 'active',
      }),
    ).toBe(true)
    expect(
      hasEnforcementTierAccess({
        planTier: 'enforcement',
        seatLimit: 25,
        seatsUsed: 5,
        status: 'active',
      }),
    ).toBe(true)
  })

  it('counts active SRT machines and effective modes from fleet payloads', () => {
    const fleet = {
      developers: [
        {
          id: 'dev-1',
          organizationId: 'org-1',
          email: 'maya@example.com',
          machineId: 'machine-1',
          registeredAt: new Date().toISOString(),
          lastCheckIn: new Date().toISOString(),
          isCompliant: true,
          enforcementStatus: {
            installed: true,
            version: '0.0.594',
            policyVersion: 'compiled',
            platforms: ['claude'],
            mode: 'block' as const,
            runtime: {
              srtInstalled: true,
              srtSettingsPresent: true,
              compiledRulesPresent: true,
            },
          },
        },
        {
          id: 'dev-2',
          organizationId: 'org-1',
          email: 'alex@example.com',
          machineId: 'machine-2',
          registeredAt: new Date().toISOString(),
          lastCheckIn: new Date().toISOString(),
          isCompliant: false,
          enforcementStatus: {
            installed: true,
            version: '0.0.594',
            policyVersion: 'compiled',
            platforms: ['claude'],
            mode: 'warn' as const,
            runtime: {
              srtInstalled: true,
              srtSettingsPresent: false,
              compiledRulesPresent: true,
            },
          },
        },
      ],
      summary: {
        total: 2,
        compliant: 1,
        nonCompliant: 1,
        installedCount: 2,
        avgPlatforms: 1,
      },
    }

    expect(isMachineSrtActive(fleet.developers[0].enforcementStatus)).toBe(true)
    expect(isMachineSrtActive(fleet.developers[1].enforcementStatus)).toBe(false)
    expect(getMachineMode(fleet.developers[0].enforcementStatus)).toBe('block')
    expect(countSrtActiveMachines(fleet)).toBe(1)
    expect(countMachinesByMode(fleet, 'warn')).toBe(1)
    expect(countMachinesByMode(fleet, 'block')).toBe(1)
  })
})
