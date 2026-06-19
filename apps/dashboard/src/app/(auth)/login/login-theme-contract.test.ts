import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const loginPageSource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

const loginRedirectStateSource = readFileSync(
  join(__dirname, 'login-redirect-state.tsx'),
  'utf8',
)

describe('login page theme contracts', () => {
  it('uses semantic design tokens instead of hardcoded dark background colors (#1678)', () => {
    expect(loginPageSource).toContain('bg-surface-base')
    expect(loginPageSource).toContain('bg-[var(--surface-raised)]')
    expect(loginPageSource).toContain('text-[var(--text-primary)]')
    expect(loginPageSource).toContain('border-[var(--border-default)]')
    expect(loginPageSource).not.toContain('bg-black')
    expect(loginPageSource).not.toContain('background: #000')
  })

  it('shows a redirect state instead of a blank page for signed-in users (#5543)', () => {
    expect(loginPageSource).toContain('return <LoginRedirectState />')
    expect(loginPageSource).toContain('window.location.replace(redirectPath)')
    expect(loginPageSource).not.toContain('return null')
    expect(loginRedirectStateSource).toContain('Redirecting to your dashboard...')
    expect(loginRedirectStateSource).toContain('role="status"')
  })

  it('does not render the local Dev Sign In bypass (#5911)', () => {
    expect(loginPageSource).not.toContain('Dev Sign In')
    expect(loginPageSource).not.toContain('/auth/dev-login')
    expect(loginPageSource).not.toContain('Bypasses GitHub OAuth for local development')
    expect(loginPageSource).not.toContain('or use OAuth')
  })
})
