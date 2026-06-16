import { describe, it, expect } from 'vitest'

import { buildLearningReviewSummary } from './learning-review'

describe('buildLearningReviewSummary', () => {
  it('keeps the full repo and learning set without preview truncation', () => {
    const summary = buildLearningReviewSummary([
      {
        id: '1',
        organizationId: 'org-1',
        sessionId: 'session-1',
        provider: 'claude',
        repo: 'org/repo-a',
        category: 'repo_pattern',
        title: 'Learning A1',
        content: 'A1',
        createdAt: '2026-03-20T08:00:00.000Z',
        updatedAt: '2026-03-20T09:00:00.000Z',
        status: 'approved',
      },
      {
        id: '2',
        organizationId: 'org-1',
        sessionId: 'session-1',
        provider: 'claude',
        repo: 'org/repo-a',
        category: 'repo_pattern',
        title: 'Learning A2',
        content: 'A2',
        createdAt: '2026-03-20T10:00:00.000Z',
        updatedAt: '2026-03-20T11:00:00.000Z',
        status: 'pending',
      },
      {
        id: '3',
        organizationId: 'org-1',
        sessionId: 'session-1',
        provider: 'claude',
        repo: 'org/repo-b',
        category: 'workflow_pattern',
        title: 'Learning B1',
        content: 'B1',
        createdAt: '2026-03-20T12:00:00.000Z',
        status: 'rejected',
      },
      {
        id: '4',
        organizationId: 'org-1',
        sessionId: 'session-1',
        provider: 'claude',
        repo: 'org/repo-c',
        category: 'error_resolution',
        title: 'Learning C1',
        content: 'C1',
        createdAt: '2026-03-20T13:00:00.000Z',
        status: 'pending',
      },
    ] as any)

    expect(summary.totalLearnings).toBe(4)
    expect(summary.uniqueRepos).toBe(3)
    expect(summary.groups).toHaveLength(3)
    expect(summary.groups.map((group) => group.repo)).toEqual(['org/repo-a', 'org/repo-b', 'org/repo-c'])
    expect(summary.groups[0].items).toHaveLength(2)
    expect(summary.groups[0].items.map((item) => item.title)).toEqual(['Learning A2', 'Learning A1'])
    expect(summary.counts).toEqual({ approved: 1, pending: 2, rejected: 1 })
  })
})
