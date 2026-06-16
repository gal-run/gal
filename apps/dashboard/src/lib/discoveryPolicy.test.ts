import { describe, expect, it } from 'vitest'
import { getPublishedPolicyItem } from './discoveryPolicy'

const baseGroup = {
  approvedStatus: 'none' as const,
  instances: [
    {
      repo: 'repo-one',
      path: '.placeholder',
      content: '',
      lastModified: '2026-04-11T10:00:00.000Z',
      hash: 'hash-1',
    },
  ],
}

describe('getPublishedPolicyItem', () => {
  it('matches workflow and prompt groups against approved commands by exact source path', () => {
    const approvedConfigs = {
      claude: {
        approved: true,
        commands: [
          {
            name: 'release-train',
            content: '# workflow',
            sourceRepo: 'repo-one',
            sourcePath: '.windsurf/workflows/release-train.md',
          },
          {
            name: 'triage',
            content: '# prompt',
            sourceRepo: 'repo-one',
            sourcePath: '.github/prompts/triage.prompt.md',
          },
        ],
      },
    }

    expect(
      getPublishedPolicyItem(
        {
          ...baseGroup,
          name: 'release-train',
          type: 'workflow',
          platform: 'claude',
          instances: [{ ...baseGroup.instances[0], path: '.windsurf/workflows/release-train.md' }],
        },
        approvedConfigs as any,
      ),
    ).toMatchObject({ matchType: 'exact', sourcePath: '.windsurf/workflows/release-train.md' })

    expect(
      getPublishedPolicyItem(
        {
          ...baseGroup,
          name: 'triage',
          type: 'prompt',
          platform: 'claude',
          instances: [{ ...baseGroup.instances[0], path: '.github/prompts/triage.prompt.md' }],
        },
        approvedConfigs as any,
      ),
    ).toMatchObject({ matchType: 'exact', sourcePath: '.github/prompts/triage.prompt.md' })
  })

  it('matches policy groups against approved rules and skills against approved skills', () => {
    const approvedConfigs = {
      gemini: {
        approved: true,
        rules: [
          {
            name: 'security',
            content: 'mode = "strict"',
            sourceRepo: 'repo-one',
            sourcePath: '.gemini/policies/security.toml',
          },
        ],
        skills: [
          {
            name: 'release-manager',
            content: '# skill',
            sourceRepo: 'repo-one',
            sourcePath: '.claude/skills/release-manager/SKILL.md',
          },
        ],
      },
    }

    expect(
      getPublishedPolicyItem(
        {
          ...baseGroup,
          name: 'security',
          type: 'policy',
          platform: 'gemini',
          instances: [{ ...baseGroup.instances[0], path: '.gemini/policies/security.toml' }],
        },
        approvedConfigs as any,
      ),
    ).toMatchObject({ matchType: 'exact', sourcePath: '.gemini/policies/security.toml' })

    expect(
      getPublishedPolicyItem(
        {
          ...baseGroup,
          name: 'release-manager',
          type: 'skill',
          platform: 'gemini',
          instances: [{ ...baseGroup.instances[0], path: '.claude/skills/release-manager/SKILL.md' }],
        },
        approvedConfigs as any,
      ),
    ).toMatchObject({ matchType: 'exact', sourcePath: '.claude/skills/release-manager/SKILL.md' })
  })
})
