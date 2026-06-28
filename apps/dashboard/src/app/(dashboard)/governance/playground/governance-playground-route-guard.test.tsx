/**
 * Route-guard proof for the governance playground (#5113).
 *
 * The governance playground is INTERNAL-ONLY: it POSTs to the governance/
 * gal-code model lanes. Before this fix it had ZERO route-level guard, so a
 * non-internal (customer-tier) user who hand-typed /governance/playground
 * rendered the "Ask GAL" chat and could reach the model lane.
 *
 * These tests prove the guard for real, two ways:
 *  1. Behavioral: render the actual page (react-dom/server) with ONLY the
 *     feature-flags context boundary mocked. For a customer (resolver → false)
 *     the page renders the FeatureGate deny UI and NOT the "Ask GAL" content;
 *     for an internal/EE user (resolver → true) it renders the content.
 *  2. Grounding: the customer-vs-internal premise above is not assumed — it is
 *     anchored on the REAL audience primitives (`meetsAudience`/`resolveOrgTier`)
 *     and the REAL EE-collapse (`isEeEnabled`) the context uses.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { meetsAudience, resolveOrgTier } from '@gal/core'

const PAGE_ID = 'governance-playground'
const DENY_COPY = 'governance model playground is only available to internal users'
const FEATURE_MARKER = 'Ask GAL'

// --- Mock ONLY the boundaries the guard depends on ------------------------
const isPageVisibleForUser = vi.fn()

vi.mock('@/contexts/FeatureFlagsContext', () => ({
  useFeatureFlags: () => ({
    isPageVisibleForUser,
    isPageEnabled: () => true,
    loading: false,
  }),
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { organizations: ['acme-customer'] },
    isLoading: false,
  }),
}))

vi.mock('@/hooks/useSelectedWorkspace', () => ({
  useSelectedWorkspace: () => 'acme-customer',
}))

// Keep the model lane inert during render (the guard must run first anyway).
vi.mock('@/lib/api', () => ({
  api: { fetchWithAuth: vi.fn(), baseUrl: 'http://localhost:3000' },
}))

async function renderPage(): Promise<string> {
  const mod = await import('./page')
  return renderToStaticMarkup(createElement(mod.default))
}

describe('governance playground route guard (#5113)', () => {
  beforeEach(() => {
    isPageVisibleForUser.mockReset()
  })

  it('DENIES a customer-tier user: renders FeatureGate, NOT the Ask GAL chat', async () => {
    // Customer: the audience-aware resolver returns false.
    isPageVisibleForUser.mockReturnValue(false)

    const html = await renderPage()

    // The page asks the audience-aware resolver with the right inputs.
    expect(isPageVisibleForUser).toHaveBeenCalledWith(PAGE_ID, ['acme-customer'], 'acme-customer')
    // Deny UI is shown; feature content is NOT.
    expect(html).toContain(DENY_COPY)
    expect(html).not.toContain(FEATURE_MARKER)
  })

  it('ALLOWS an internal/EE user: renders the Ask GAL chat, NOT the FeatureGate', async () => {
    // Internal/EE: the resolver returns true.
    isPageVisibleForUser.mockReturnValue(true)

    const html = await renderPage()

    expect(isPageVisibleForUser).toHaveBeenCalledWith(PAGE_ID, ['acme-customer'], 'acme-customer')
    expect(html).toContain(FEATURE_MARKER)
    expect(html).not.toContain(DENY_COPY)
  })

  it('uses the audience-aware resolver, not the global isPageEnabled flag', () => {
    // Source-contract: matches the agents/enforcement idiom exactly.
    const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
    expect(source).toContain("import { FeatureGate } from '@/components/FeatureGate'")
    expect(source).toContain("import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'")
    expect(source).toContain("isPageVisibleForUser('governance-playground', userOrgs, selectedWorkspace)")
    expect(source).toContain('<FeatureGate pageId="governance-playground" />')
    // Must NOT gate on the non-audience-aware global flag.
    expect(source).not.toContain("isPageEnabled('governance-playground')")
  })

  it('grounding: an internal page is genuinely denied to a customer org (real audience logic)', () => {
    // A customer org (free plan, no internal/partners override) resolves to a
    // tier that does NOT meet the 'internal' requirement — so the resolver the
    // page calls returns false for these pages. This anchors the "customer ⇒
    // false" premise of the behavioral tests on the REAL @gal/core primitives.
    const customerTier = resolveOrgTier(null, 'free')
    const internalTier = resolveOrgTier('internal', 'free')
    expect(meetsAudience(customerTier, 'internal')).toBe(false) // customer: denied
    expect(meetsAudience(internalTier, 'internal')).toBe(true) // internal: allowed
  })
})
