import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './api'

describe('APIClient.generateApprovedConfigProposal (#2823, #2987)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts AI Draft generation requests with dashboard client-surface metadata', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        proposal: { id: 'prop-1' },
        generation: { model: 'gemini-2.5-flash-lite' },
      }),
    } as any)

    const result = await api.generateApprovedConfigProposal('Scheduler-Systems', {
      repository: 'Scheduler-Systems/gal-run-private',
      filePath: 'AGENTS.md',
      prompt: 'Harden for production',
    } as any)

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/organizations/Scheduler-Systems/approved-config/proposals/generate',
      {
        method: 'POST',
        body: JSON.stringify({
          clientSurface: 'dashboard',
          repository: 'Scheduler-Systems/gal-run-private',
          filePath: 'AGENTS.md',
          prompt: 'Harden for production',
        }),
      },
    )
    expect(result).toEqual({
      success: true,
      proposal: { id: 'prop-1' },
      generation: { model: 'gemini-2.5-flash-lite' },
    })
  })

  it('returns a structured failure when proposal generation responds with an API error', async () => {
    vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        error: 'Gemini provider is unavailable',
      }),
    } as any)

    await expect(
      api.generateApprovedConfigProposal('Scheduler-Systems', {
        repository: 'Scheduler-Systems/gal-run-private',
        filePath: '.claude/settings.json',
      } as any),
    ).resolves.toEqual({
      success: false,
      error: 'Gemini provider is unavailable',
    })
  })

  it('falls back to a network error response when AI Draft request throws', async () => {
    vi.spyOn(api, 'fetchWithAuth').mockRejectedValue(new Error('network down'))

    await expect(
      api.generateApprovedConfigProposal('Scheduler-Systems', {
        repository: 'Scheduler-Systems/gal-run-private',
        filePath: 'AGENTS.md',
      } as any),
    ).resolves.toEqual({
      success: false,
      error: 'Network error',
    })
  })
})
