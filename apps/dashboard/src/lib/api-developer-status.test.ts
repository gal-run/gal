import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './api'

describe('APIClient developer status contracts (#2276, #2670, #2673, #2674)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches developer status summary from the org endpoint', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        organization: 'Scheduler-Systems',
        totalDevelopers: 3,
        cliInstalled: 3,
        authenticated: 2,
        authExpired: 1,
        syncedToLatest: 2,
        outOfSync: 1,
        neverSynced: 0,
        developers: [],
      }),
    } as any)

    const status = await api.getDeveloperStatus('Scheduler-Systems')

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/organizations/Scheduler-Systems/developer-status',
    )
    expect(status.totalDevelopers).toBe(3)
    expect(status.authExpired).toBe(1)
  })

  it('throws when developer status endpoint returns non-OK', async () => {
    vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({ ok: false } as any)

    await expect(api.getDeveloperStatus('Scheduler-Systems')).rejects.toThrow(
      'Failed to fetch developer status',
    )
  })

  it('posts to seed developer status and returns seed summary', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        seeded: 5,
        existing: 2,
      }),
    } as any)

    const result = await api.seedDeveloperStatus('Scheduler-Systems')

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/organizations/Scheduler-Systems/developer-status/seed',
      { method: 'POST' },
    )
    expect(result).toEqual({ success: true, seeded: 5, existing: 2 })
  })

  it('throws when seeding developer status fails', async () => {
    vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({ ok: false } as any)

    await expect(api.seedDeveloperStatus('Scheduler-Systems')).rejects.toThrow(
      'Failed to seed developer status',
    )
  })
})
