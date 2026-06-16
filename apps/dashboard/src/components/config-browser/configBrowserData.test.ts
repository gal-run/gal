import { describe, expect, it } from 'vitest'
import { analyzeConfigContentBatchResults, getVisibleConfigGroups } from './configBrowserData'
import type { DiscoveredConfigGroup } from '@/lib/api'

describe('getVisibleConfigGroups', () => {
  it('returns grouped entries for the active filter instead of expanding by repo instance (#5905)', () => {
    const groups = [
      {
        name: 'commands/review.md',
        type: 'command',
        instances: [
          { repo: 'alpha', path: '.claude/commands/review.md', hash: 'aaa', lastModified: '2026-04-11T00:00:00.000Z' },
          { repo: 'beta', path: '.claude/commands/review.md', hash: 'aaa', lastModified: '2026-04-10T00:00:00.000Z' },
        ],
      },
      {
        name: 'commands/test.md',
        type: 'command',
        instances: [
          { repo: 'gamma', path: '.claude/commands/test.md', hash: 'bbb', lastModified: '2026-04-09T00:00:00.000Z' },
        ],
      },
      {
        name: 'AGENTS.md',
        type: 'instructions',
        instances: [
          { repo: 'alpha', path: 'AGENTS.md', hash: 'ccc', lastModified: '2026-04-08T00:00:00.000Z' },
        ],
      },
    ] as DiscoveredConfigGroup[]

    const visibleGroups = getVisibleConfigGroups(groups, {
      searchQuery: '',
      typeFilter: 'command',
      statusFilter: 'all',
      sortBy: 'recent',
    })

    expect(visibleGroups).toHaveLength(2)
    expect(visibleGroups.map((group) => group.name)).toEqual([
      'commands/review.md',
      'commands/test.md',
    ])
  })

  it('classifies zero-content preview results as unavailable and mixed results as partial (#5943, #5944)', () => {
    const unavailable = analyzeConfigContentBatchResults(
      {
        'repo:missing.md': { error: 'Config preview unavailable — please re-sync your organization in Settings > GitHub.' },
      },
      'fallback',
    )
    expect(unavailable.contentEntries).toEqual([])
    expect(unavailable.failure).toEqual({
      status: 'unavailable',
      message: 'Config preview unavailable — please re-sync your organization in Settings > GitHub.',
      availableCount: 0,
      failedCount: 1,
    })

    const partial = analyzeConfigContentBatchResults(
      {
        'repo:ok.md': { content: '# ok' },
        'repo:missing.md': { error: 'Config preview unavailable — please re-sync your organization in Settings > GitHub.' },
      },
      'fallback',
    )
    expect(partial.contentEntries).toEqual([['repo:ok.md', '# ok']])
    expect(partial.failure).toEqual({
      status: 'partial',
      message:
        'Config preview partially available — 1 source could not be loaded. Please re-sync your organization in Settings > GitHub.',
      availableCount: 1,
      failedCount: 1,
    })
  })
})
