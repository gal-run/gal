import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './api'

describe('APIClient approved-config action contracts', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches file preview content for approved/discovered entries and returns null on missing payloads (#2826)', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth')

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: 'name: deploy\ncommand: pnpm deploy',
        sha: 'abc123',
      }),
    } as any)

    const preview = await api.getConfigContent(
      'Scheduler-Systems',
      'your-org/infra',
      '.claude/commands/deploy.md',
    )

    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/organizations/Scheduler-Systems/config-content?repo=your-org%2Finfra&path=.claude%2Fcommands%2Fdeploy.md',
      {},
    )
    expect(preview).toEqual({
      content: 'name: deploy\ncommand: pnpm deploy',
      sha: 'abc123',
    })

    fetchSpy.mockResolvedValueOnce({ ok: false } as any)
    await expect(
      api.getConfigContent('Scheduler-Systems', 'your-org/infra', '.claude/commands/deploy.md'),
    ).resolves.toBeNull()
  })

  it('removes only selected approved-config items via scoped PATCH payloads (#2825)', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        removed: { commands: 1, subagents: 0, hooks: 0, rules: 0, skills: 0 },
        remaining: { commands: 2, subagents: 1, hooks: 1, rules: 0, skills: 0 },
        hash: 'next-hash',
      }),
    } as any)

    const result = await api.removeFromApprovedConfig('Scheduler-Systems', 'claude', {
      commandRefs: [
        {
          name: 'deploy.md',
          sourceRepo: 'your-org/infra',
          sourcePath: '.claude/commands/deploy.md',
        },
      ],
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/organizations/Scheduler-Systems/approved-config/remove',
      {
        method: 'PATCH',
        body: JSON.stringify({
          platform: 'claude',
          commandRefs: [
            {
              name: 'deploy.md',
              sourceRepo: 'your-org/infra',
              sourcePath: '.claude/commands/deploy.md',
            },
          ],
        }),
      },
    )
    expect(result).toEqual({
      success: true,
      removed: { commands: 1, subagents: 0, hooks: 0, rules: 0, skills: 0 },
      remaining: { commands: 2, subagents: 1, hooks: 1, rules: 0, skills: 0 },
      hash: 'next-hash',
    })
  })

  it('preserves explicit preferred-instance selections when bulk-approving from discovery (#2829, #2274)', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        hash: 'bundle-hash',
        summary: { total: 1, byType: { command: 1 }, conflictsResolved: 1 },
      }),
    } as any)

    const result = await api.bulkApproveConfigs('Scheduler-Systems', 'claude', {
      configSelections: [
        {
          type: 'command',
          name: 'deploy',
          preferredInstance: {
            repo: 'your-org/infra',
            path: '.claude/commands/deploy.md',
          },
        },
      ],
      approveAll: {
        conflictResolutions: [
          {
            type: 'command',
            name: 'deploy',
            preferredRepo: 'your-org/infra',
            preferredPath: '.claude/commands/deploy.md',
          },
        ],
      },
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/organizations/Scheduler-Systems/approved-config/bulk-approve',
      {
        method: 'POST',
        body: JSON.stringify({
          platform: 'claude',
          configSelections: [
            {
              type: 'command',
              name: 'deploy',
              preferredInstance: {
                repo: 'your-org/infra',
                path: '.claude/commands/deploy.md',
              },
            },
          ],
          approveAll: {
            conflictResolutions: [
              {
                type: 'command',
                name: 'deploy',
                preferredRepo: 'your-org/infra',
                preferredPath: '.claude/commands/deploy.md',
              },
            ],
          },
        }),
      },
    )
    expect(result).toEqual({
      success: true,
      hash: 'bundle-hash',
      summary: { total: 1, byType: { command: 1 }, conflictsResolved: 1 },
    })
  })
})
