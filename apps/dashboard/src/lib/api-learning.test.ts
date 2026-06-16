import { describe, it, expect, vi, beforeEach } from 'vitest'

import { api } from './api'

describe('APIClient learning contracts (#4363)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches org learnings with repo/status filters', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        learnings: [
          {
            id: 'learning-1',
            organizationId: 'org-1',
            sessionId: 'session-1',
            provider: 'claude',
            repo: 'org/repo',
            category: 'repo_pattern',
            title: 'Use pnpm',
            content: 'Prefer pnpm.',
            createdAt: '2026-03-26T00:00:00.000Z',
            updatedAt: '2026-03-26T00:00:00.000Z',
            status: 'approved',
          },
        ],
        totalCount: 1,
      }),
    } as any)

    const result = await api.getLearnings('org-1', {
      repo: 'org/repo',
      status: 'approved',
      limit: 10,
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/orgs/org-1/learnings?repo=org%2Frepo&status=approved&limit=10',
    )
    expect(result.totalCount).toBe(1)
    expect(result.learnings).toHaveLength(1)
    expect(result.learnings[0].repo).toBe('org/repo')
  })
})
