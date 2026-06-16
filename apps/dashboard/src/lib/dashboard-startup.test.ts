import { describe, expect, it, vi } from 'vitest'

import {
  loadHomeGitHubBootstrap,
  loadWorkspaceSwitcherBootstrap,
} from './dashboard-startup'

describe('dashboard startup recovery', () => {
  it('keeps personal GitHub status when app status fails', async () => {
    const result = await loadHomeGitHubBootstrap({
      getPersonalGitHubStatus: vi.fn().mockResolvedValue({
        connected: true,
        username: 'karabil',
      }),
      getGitHubAppStatus: vi.fn().mockRejectedValue(new Error('timeout')),
    })

    expect(result).toEqual({
      githubStatus: {
        connected: true,
        username: 'karabil',
      },
      hasInstallations: false,
    })
  })

  it('falls back to disconnected status when personal GitHub lookup fails', async () => {
    const result = await loadHomeGitHubBootstrap({
      getPersonalGitHubStatus: vi.fn().mockRejectedValue(new Error('timeout')),
      getGitHubAppStatus: vi.fn().mockResolvedValue({
        hasInstallations: true,
      }),
    })

    expect(result).toEqual({
      githubStatus: {
        connected: false,
        username: undefined,
      },
      hasInstallations: true,
    })
  })

  it('keeps organizations when GitHub App status fails', async () => {
    const result = await loadWorkspaceSwitcherBootstrap({
      getOrganizations: vi.fn().mockResolvedValue([
        { name: 'Scheduler-Systems', installationId: 1 } as any,
      ]),
      getGitHubAppStatus: vi.fn().mockRejectedValue(new Error('timeout')),
    })

    expect(result).toEqual({
      organizations: [{ name: 'Scheduler-Systems', installationId: 1 }],
      hasLiveInstallations: false,
    })
  })

  it('keeps live installation state even when organizations fail', async () => {
    const result = await loadWorkspaceSwitcherBootstrap({
      getOrganizations: vi.fn().mockRejectedValue(new Error('timeout')),
      getGitHubAppStatus: vi.fn().mockResolvedValue({
        hasInstallations: true,
      }),
    })

    expect(result).toEqual({
      organizations: [],
      hasLiveInstallations: true,
    })
  })
})
