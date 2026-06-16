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
        repo: 'your-org/infra',
        path: '.claude/commands/deploy.md',
      },
      configContent: null,
      itemHash: 'hash-cmd',
    })

    expect(next.commands).toEqual([
      {
        name: 'deploy.md',
        content: '',
        sourceRepo: 'your-org/infra',
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
        repo: 'your-org/your-repo',
        path: '.claude/settings.json',
      },
      configContent: undefined,
      itemHash: 'hash-settings',
    })

    expect(withSettings.settings).toEqual({
      content: '',
      sourceRepo: 'your-org/your-repo',
      sourcePath: '.claude/settings.json',
      hash: 'hash-settings',
    })

    const withInstructions = appendConfigToBundle({
      bundle: withSettings,
      configType: 'instructions',
      configName: 'AGENTS',
      matchingConfig: {
        repo: 'your-org/your-repo',
        path: 'AGENTS.md',
      },
      configContent: '',
      itemHash: 'hash-instructions',
    })

    expect(withInstructions.instructions).toEqual({
      content: '',
      sourceRepo: 'your-org/your-repo',
      sourcePath: 'AGENTS.md',
      hash: 'hash-instructions',
    })
  })
})
