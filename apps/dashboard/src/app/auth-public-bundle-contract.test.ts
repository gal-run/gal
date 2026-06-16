import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const rootLayoutSource = readFileSync(
  join(__dirname, 'layout.tsx'),
  'utf8',
)

const authLayoutSource = readFileSync(
  join(__dirname, '(auth)/layout.tsx'),
  'utf8',
)

const dashboardLayoutSource = readFileSync(
  join(__dirname, '(dashboard)/layout.tsx'),
  'utf8',
)

const providersSource = readFileSync(
  join(__dirname, '../providers.tsx'),
  'utf8',
)

const nextConfigSource = readFileSync(
  join(__dirname, '../../next.config.ts'),
  'utf8',
)

const authContextSource = readFileSync(
  join(__dirname, '../contexts/AuthContext.tsx'),
  'utf8',
)

const loginPageSource = readFileSync(
  join(__dirname, '(auth)/login/page.tsx'),
  'utf8',
)

const signupPageSource = readFileSync(
  join(__dirname, '(auth)/signup/page.tsx'),
  'utf8',
)

const forgotPasswordPageSource = readFileSync(
  join(__dirname, '(auth)/forgot-password/page.tsx'),
  'utf8',
)

describe('public auth bundle contracts', () => {
  it('keeps route-specific providers out of the root layout (#5592)', () => {
    expect(rootLayoutSource).not.toContain("from '@/providers'")
    expect(rootLayoutSource).not.toContain('<Providers>')
  })

  it('mounts auth and dashboard providers at their route boundaries (#5592)', () => {
    expect(providersSource).toContain('export function AuthProviders')
    expect(providersSource).toContain('export function DashboardProviders')
    expect(authLayoutSource).toContain('<AuthProviders>')
    expect(dashboardLayoutSource).toContain('<DashboardProviders>')
  })

  it('disables Sentry route manifest injection for the public auth bundle (#5592)', () => {
    expect(nextConfigSource).toContain('disableManifestInjection: true')
  })

  it('keeps auth flows on the small auth client instead of the monolithic dashboard API client (#5592)', () => {
    expect(authContextSource).toContain("from '@/lib/auth-api'")
    expect(authContextSource).not.toContain("from '@/lib/api'")
    expect(loginPageSource).toContain("from '@/lib/auth-api'")
    expect(loginPageSource).not.toContain("from '@/lib/api'")
    expect(signupPageSource).toContain("from '@/lib/auth-api'")
    expect(signupPageSource).not.toContain("from '@/lib/api'")
    expect(forgotPasswordPageSource).toContain("from '@/lib/auth-api'")
    expect(forgotPasswordPageSource).not.toContain("from '@/lib/api'")
  })
})
