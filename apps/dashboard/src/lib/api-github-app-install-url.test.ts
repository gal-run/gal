import { afterEach, describe, expect, it } from 'vitest'

import { api } from './api'

describe('APIClient.getGitHubAppInstallUrl', () => {
  const originalSlug = process.env['NEXT_PUBLIC_GITHUB_APP_SLUG']

  afterEach(() => {
    if (originalSlug === undefined) {
      delete process.env['NEXT_PUBLIC_GITHUB_APP_SLUG']
    } else {
      process.env['NEXT_PUBLIC_GITHUB_APP_SLUG'] = originalSlug
    }
  })

  it('uses the configured GitHub App slug and preserves onboarding state (#1341)', () => {
    process.env['NEXT_PUBLIC_GITHUB_APP_SLUG'] = 'gal-governance-agentic-layer'

    const url = new URL(api.getGitHubAppInstallUrl('/onboarding'))

    expect(url.origin).toBe('https://github.com')
    expect(url.pathname).toBe('/apps/gal-governance-agentic-layer/installations/new')
    expect(url.searchParams.get('state')).toBe('/onboarding')
  })

  it('falls back to the default GitHub App slug when env is unset', () => {
    delete process.env['NEXT_PUBLIC_GITHUB_APP_SLUG']

    const url = new URL(api.getGitHubAppInstallUrl())

    expect(url.pathname).toBe('/apps/gal-by-scheduler-systems/installations/new')
    expect(url.searchParams.has('state')).toBe(false)
  })
})
