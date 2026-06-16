import { describe, expect, it } from 'vitest'
import type { DiscoveredConfigGroup } from './api'
import {
  formatDiscoverySelectedItemParam,
  formatDiscoveryTypeParam,
  parseDiscoveryTypeParam,
  resolveDiscoverySelectedConfigKey,
  retainDiscoverySelectedConfigKey,
} from './discoveryUrlState'
import { getDiscoveryGroupKey } from './discoveryPolicy'

const commandGroup = {
  name: 'sdlc/4-implement/run',
  type: 'command',
  platform: 'claude',
  instances: [
    {
      repo: 'gal-run-private',
      path: '.claude/commands/sdlc/4-implement/run.md',
      content: '',
      lastModified: '2026-04-11T00:00:00.000Z',
      hash: 'command-hash',
    },
  ],
  approvedStatus: 'none',
} satisfies DiscoveredConfigGroup

const duplicateNamedGroup = {
  name: 'shared',
  type: 'command',
  platform: 'claude',
  instances: [
    {
      repo: 'repo-a',
      path: '.claude/commands/shared.md',
      content: '',
      lastModified: '2026-04-11T00:00:00.000Z',
      hash: 'duplicate-a-hash',
    },
  ],
  approvedStatus: 'none',
} satisfies DiscoveredConfigGroup

const duplicateNamedGroupOnCopilot = {
  name: 'shared',
  type: 'command',
  platform: 'copilot',
  instances: [
    {
      repo: 'repo-b',
      path: '.github/prompts/shared.prompt.md',
      content: '',
      lastModified: '2026-04-11T00:00:00.000Z',
      hash: 'duplicate-b-hash',
    },
  ],
  approvedStatus: 'none',
} satisfies DiscoveredConfigGroup

const subagentGroup = {
  name: 'meta/meta-agent',
  type: 'subagent',
  platform: 'claude',
  instances: [
    {
      repo: 'gal-run-private',
      path: '.claude/agents/meta/meta-agent.md',
      content: '',
      lastModified: '2026-04-11T00:00:00.000Z',
      hash: 'subagent-hash',
    },
  ],
  approvedStatus: 'none',
} satisfies DiscoveredConfigGroup

const groups = [commandGroup, duplicateNamedGroup, duplicateNamedGroupOnCopilot, subagentGroup]

describe('discoveryUrlState', () => {
  it('parses URL type params from either labels or internal filter values', () => {
    expect(parseDiscoveryTypeParam('Commands')).toBe('command')
    expect(parseDiscoveryTypeParam('subagent')).toBe('subagent')
    expect(parseDiscoveryTypeParam('unknown')).toBeNull()
    expect(formatDiscoveryTypeParam('command')).toBe('Commands')
    expect(formatDiscoveryTypeParam(null)).toBeNull()
  })

  it('resolves selected config params by name within the filtered view', () => {
    expect(resolveDiscoverySelectedConfigKey(groups, 'meta/meta-agent', 'subagent')).toBe(
      getDiscoveryGroupKey(subagentGroup),
    )
    expect(resolveDiscoverySelectedConfigKey(groups, getDiscoveryGroupKey(commandGroup), 'command')).toBe(
      getDiscoveryGroupKey(commandGroup),
    )
    expect(resolveDiscoverySelectedConfigKey(groups, 'meta/meta-agent', 'command')).toBeNull()
  })

  it('retains selection only when it still matches the next type filter', () => {
    expect(retainDiscoverySelectedConfigKey(groups, getDiscoveryGroupKey(subagentGroup), 'subagent')).toBe(
      getDiscoveryGroupKey(subagentGroup),
    )
    expect(retainDiscoverySelectedConfigKey(groups, getDiscoveryGroupKey(subagentGroup), 'command')).toBeNull()
    expect(retainDiscoverySelectedConfigKey(groups, null, 'command')).toBeNull()
  })

  it('formats item params as names when unambiguous and falls back to the full key for duplicates', () => {
    expect(formatDiscoverySelectedItemParam(groups, getDiscoveryGroupKey(commandGroup), 'command')).toBe(
      commandGroup.name,
    )
    expect(
      formatDiscoverySelectedItemParam(groups, getDiscoveryGroupKey(duplicateNamedGroup), 'command'),
    ).toBe(getDiscoveryGroupKey(duplicateNamedGroup))
  })
})
