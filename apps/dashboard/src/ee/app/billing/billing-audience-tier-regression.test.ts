import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Regression contracts for #4028 — internal/partner org billing suppression.
 *
 * Guards (dashboard-local surface only):
 *  1. BillingStatus type exposes audienceTier (api.ts)
 *  2. billing EePage derives isPrivilegedOrg from audienceTier
 *  3. billing EePage suppresses upgrade UI for privileged orgs
 *
 * NOTE: The companion API-route guard (billing-legacy.ts exposes
 * org.audienceTier) lives in the separate gal-api service repo, which is not
 * part of this OSS monorepo. It is enforced there, not here.
 *
 * The EE Billing page is fenced as EePage.tsx (ee/-fence, commit 46b6218) so
 * single-tenant builds without a license key never compile it.
 */

const billingPageSource = readFileSync(join(__dirname, 'EePage.tsx'), 'utf8')

const apiSource = readFileSync(
  join(__dirname, '../../../lib/api.ts'),
  'utf8',
)

describe('billing audience-tier regression contracts (#4028)', () => {
  it('BillingStatus interface exposes audienceTier field (#4028)', () => {
    expect(apiSource).toContain('audienceTier')
    expect(apiSource).toContain("'internal'")
    expect(apiSource).toContain("'partners'")
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
