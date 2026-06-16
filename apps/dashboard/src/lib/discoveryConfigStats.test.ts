import { describe, expect, it } from 'vitest'
import { summarizeDiscoveryConfigTypeStats } from './discoveryConfigStats'
import type { DiscoveredConfigGroup } from './api'

describe('summarizeDiscoveryConfigTypeStats', () => {
  it('counts grouped config entries instead of per-repo instances (#5905)', () => {
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
          { repo: 'beta', path: 'AGENTS.md', hash: 'ddd', lastModified: '2026-04-07T00:00:00.000Z' },
        ],
      },
    ] as DiscoveredConfigGroup[]

    const stats = summarizeDiscoveryConfigTypeStats(groups)

    expect(stats.commands).toBe(2)
    expect(stats.instructions).toBe(1)
  })
})
