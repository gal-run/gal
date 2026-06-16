import { describe, expect, it } from 'vitest'

import { appendConfigToBundle } from './approved-config-bundle'

describe('appendConfigToBundle', () => {
  const baseBundle = {
    commands: [] as Array<{ name: string; content: string }>,
    subagents: [] as Array<{ name: string; content: string }>,
    hooks: [] as Array<{ name: string; content: string }>,
    settings: null as { content: string } | null,
    instructions: null as { content: string } | null,
  }

  it('coerces null config content to an empty string when adding command entries (#3636, #2990)', () => {
    const next = appendConfigToBundle({
      bundle: baseBundle,
      configType: 'command',
      configName: 'deploy',
      matchingConfig: {
        repo: 'Scheduler-Systems/infra',
        path: '.claude/commands/deploy.md',
      },
      configContent: null,
      itemHash: 'hash-cmd',
    })

    expect(next.commands).toEqual([
      {
        name: 'deploy.md',
        content: '',
        sourceRepo: 'Scheduler-Systems/infra',
        sourcePath: '.claude/commands/deploy.md',
        hash: 'hash-cmd',
      },
    ])
  })

  it('keeps Add Bundle flows stable for single-file sections by coercing missing content (#2824, #2988, #2987)', () => {
    const withSettings = appendConfigToBundle({
      bundle: baseBundle,
      configType: 'settings',
      configName: 'settings',
      matchingConfig: {
        repo: 'Scheduler-Systems/gal-run-private',
        path: '.claude/settings.json',
      },
      configContent: undefined,
      itemHash: 'hash-settings',
    })

    expect(withSettings.settings).toEqual({
      content: '',
      sourceRepo: 'Scheduler-Systems/gal-run-private',
      sourcePath: '.claude/settings.json',
      hash: 'hash-settings',
    })

    const withInstructions = appendConfigToBundle({
      bundle: withSettings,
      configType: 'instructions',
      configName: 'AGENTS',
      matchingConfig: {
        repo: 'Scheduler-Systems/gal-run-private',
        path: 'AGENTS.md',
      },
      configContent: '',
      itemHash: 'hash-instructions',
    })

    expect(withInstructions.instructions).toEqual({
      content: '',
      sourceRepo: 'Scheduler-Systems/gal-run-private',
      sourcePath: 'AGENTS.md',
      hash: 'hash-instructions',
    })
  })
})
