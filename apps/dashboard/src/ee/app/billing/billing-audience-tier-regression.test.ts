import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regression contracts for #4028 — internal/partner org billing suppression.
 *
 * Guards:
 *  1. BillingStatus type exposes audienceTier (api.ts)
 *  2. billing/page.tsx derives isPrivilegedOrg from audienceTier
 *  3. billing/page.tsx suppresses upgrade UI for privileged orgs
 *  4. billing-legacy.ts exposes audienceTier in the API response
 */

const billingPageSource = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

const apiSource = readFileSync(
  join(__dirname, '../../../lib/api.ts'),
  'utf8',
)

const billingLegacySource = readFileSync(
  join(
    __dirname,
    '../../../../../../apps/api/src/routes/legacy/billing-legacy.ts',
  ),
  'utf8',
)

describe('billing audience-tier regression contracts (#4028)', () => {
  it('BillingStatus interface exposes audienceTier field (#4028)', () => {
    expect(apiSource).toContain('audienceTier')
    expect(apiSource).toContain("'internal'")
    expect(apiSource).toContain("'partners'")
  })

  it('billing API route exposes audienceTier in the response (#4028)', () => {
    expect(billingLegacySource).toContain('audienceTier')
    // value must come from org, not be hardcoded
    expect(billingLegacySource).toContain('org.audienceTier')
  })

  it('billing page derives isPrivilegedOrg from audienceTier (#4028)', () => {
    expect(billingPageSource).toContain('isInternalOrg')
    expect(billingPageSource).toContain('isPartnerOrg')
    expect(billingPageSource).toContain('isPrivilegedOrg')
    expect(billingPageSource).toContain("audienceTier === 'internal'")
    expect(billingPageSource).toContain("audienceTier === 'partners'")
  })

  it('isFreeTier excludes privileged orgs so they never enter free-tier path (#4028)', () => {
    expect(billingPageSource).toContain('!isPrivilegedOrg')
    // isFreeTier derivation must gate on isPrivilegedOrg
    expect(billingPageSource).toMatch(/isFreeTier\s*=.*isPrivilegedOrg/)
  })

  it('billing page renders Internal Access / Partner Access labels for privileged orgs (#4028)', () => {
    expect(billingPageSource).toContain('Internal Access')
    expect(billingPageSource).toContain('Partner Access')
  })

  it('upgrade plan card is hidden for privileged orgs (#4028)', () => {
    expect(billingPageSource).toContain('!isPrivilegedOrg')
  })
})
