import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './api'

describe('APIClient enforcement dashboard contracts (#6147)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('patches approved-config enforcement settings through the legacy config-management route', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        message: 'Enforcement settings updated for claude',
        enforcementSettings: {
          enabled: true,
          level: 'block',
          blockOnMismatch: true,
          requireSync: true,
          allowOverrides: true,
          notifyOnViolation: true,
          gracePeriodDays: 7,
        },
      }),
    } as any)

    const result = await api.updateApprovedConfigEnforcementSettings('Scheduler-Systems', 'claude', {
      enabled: true,
      level: 'block',
      blockOnMismatch: true,
      requireSync: true,
      allowOverrides: true,
      notifyOnViolation: true,
      gracePeriodDays: 7,
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/organizations/Scheduler-Systems/approved-config/enforcement',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
      },
    )
    expect(result.success).toBe(true)
  })

  it('fetches fleet developer status for compliance pages', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        developers: [],
        summary: {
          total: 0,
          compliant: 0,
          nonCompliant: 0,
          installedCount: 0,
          avgPlatforms: 0,
        },
      }),
    } as any)

    const fleet = await api.getFleetList('Scheduler-Systems')

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/organizations/Scheduler-Systems/fleet',
    )
    expect(fleet?.summary.total).toBe(0)
  })

  it('returns null when the fleet endpoint is unavailable', async () => {
    vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({ ok: false } as any)

    await expect(api.getFleetList('Scheduler-Systems')).resolves.toBeNull()
  })
})
