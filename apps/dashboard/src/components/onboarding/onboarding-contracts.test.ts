import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const githubConnectCardSource = readFileSync(
  join(__dirname, 'GitHubConnectCard.tsx'),
  'utf8',
)

const onboardingPageSource = readFileSync(
  join(__dirname, '../../app/(dashboard)/onboarding/page.tsx'),
  'utf8',
)

describe('onboarding surface contracts', () => {
  it('keeps auto-detection completion flow when GitHub App is already connected (#1329, #1229)', () => {
    expect(githubConnectCardSource).toContain('// Auto-complete when already connected')
    expect(githubConnectCardSource).toContain("if (isConnected && status === 'pending') {")
    expect(githubConnectCardSource).toContain('onComplete();')
    expect(githubConnectCardSource).toContain("api.getGitHubAppInstallUrl('/onboarding')")
  })

  it('keeps legacy dashboard onboarding route disabled by redirecting to root (#1357)', () => {
    expect(onboardingPageSource).toContain("import { redirect } from 'next/navigation'")
    expect(onboardingPageSource).toContain('redirect(\'/\')')
  })
})
