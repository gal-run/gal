import { describe, expect, it, vi } from 'vitest'

import { getGitHubOnboardingInstallUrl } from './github-connect-url'

describe('getGitHubOnboardingInstallUrl', () => {
  it('routes onboarding GitHub connect through the GitHub App installation flow (#1341, #548, #488, #1611)', () => {
    const provider = {
      getGitHubAppInstallUrl: vi.fn(
        () =>
          'https://github.com/apps/gal-by-scheduler-systems/installations/new?state=%2Fonboarding',
      ),
    }

    const url = getGitHubOnboardingInstallUrl(provider)

    expect(provider.getGitHubAppInstallUrl).toHaveBeenCalledWith('/onboarding')
    expect(url).toContain('/apps/gal-by-scheduler-systems/installations/new')
    expect(url).toContain('state=%2Fonboarding')
    expect(url).not.toContain('/settings/installations')
  })
})
