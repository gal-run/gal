import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const termsGateSource = readFileSync(
  join(__dirname, 'TermsGate.tsx'),
  'utf8',
)

const dashboardLayoutSource = readFileSync(
  join(__dirname, '../app/(dashboard)/layout.tsx'),
  'utf8',
)

describe('terms gate contracts', () => {
  it('keeps post-login legal acceptance gate semantics and API submission flow (#3055)', () => {
    expect(termsGateSource).toContain('TermsGate — blocking T&C acceptance screen (#3055)')
    // Post-#6513: unauthenticated users are redirected to /login; demo mode is a
    // separate bypass. Both checks live in the pre-render branch.
    expect(termsGateSource).toContain('if (!user) {')
    expect(termsGateSource).toContain("router.replace('/login')")
    expect(termsGateSource).toContain('if (isDemoMode())')
    expect(termsGateSource).toContain('user.termsVersion === CURRENT_TERMS_VERSION')
    expect(termsGateSource).toContain('serverAccepted || accepted')
    expect(termsGateSource).toContain('await api.acceptTerms(CURRENT_TERMS_VERSION)')
    expect(termsGateSource).toContain('I have read and agree to the Terms of Service and Privacy Policy')
    expect(termsGateSource).toContain('I Agree — Continue to Platform')
  })

  it('keeps the refreshed legal-review card structure mounted around all dashboard routes (#3430)', () => {
    expect(termsGateSource).toContain('Review & Accept Before Continuing')
    expect(termsGateSource).toContain('className="card p-8"')
    expect(termsGateSource).toContain('Terms of Service')
    expect(termsGateSource).toContain('Privacy Policy')
    expect(dashboardLayoutSource).toContain('<TermsGate>')
    expect(dashboardLayoutSource).toContain('</TermsGate>')
  })
})
