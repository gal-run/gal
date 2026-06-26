/**
 * Route-guard proof for the SDLC compliance page (#4029).
 *
 * Before this fix /compliance/sdlc had ZERO route-level guard — unlike its
 * sibling /compliance/developers, which already gates on the internal
 * workspace. SDLC compliance is internal-only (the layout nav maps it to the
 * internal `enforcement-overrides` page), yet a customer-tier user who
 * hand-typed /compliance/sdlc rendered the full compliance dashboard.
 *
 * The fix adds the canonical audience-aware guard:
 *   isPageVisibleForUser('enforcement-overrides', userOrgs, workspace) → FeatureGate.
 *
 * Proven two ways: behavioral render + grounding on the REAL @gal/core
 * audience primitives.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { meetsAudience, resolveOrgTier } from '@gal/core'

const PAGE_ID = 'enforcement-overrides'
const DENY_COPY = 'Enforcement overrides are only available to internal users'
// After the guard passes the page renders its loading spinner (animate-spin),
// never the deny copy.
const ALLOW_MARKER = 'animate-spin'

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

vi.mock('@/lib/demo-guard', () => ({ isDemoMode: () => false }))

async function renderPage(): Promise<string> {
  const mod = await import('./page')
  return renderToStaticMarkup(createElement(mod.default))
}

describe('sdlc compliance route guard (#4029)', () => {
  beforeEach(() => {
    isPageVisibleForUser.mockReset()
  })

  it('DENIES a customer-tier user: renders FeatureGate, NOT the compliance dashboard', async () => {
    isPageVisibleForUser.mockReturnValue(false)
    const html = await renderPage()
    expect(isPageVisibleForUser).toHaveBeenCalledWith(PAGE_ID, ['acme-customer'], 'acme-customer')
    expect(html).toContain(DENY_COPY)
    expect(html).not.toContain(ALLOW_MARKER)
  })

  it('ALLOWS an internal/EE user: renders the compliance dashboard, NOT the FeatureGate', async () => {
    isPageVisibleForUser.mockReturnValue(true)
    const html = await renderPage()
    expect(isPageVisibleForUser).toHaveBeenCalledWith(PAGE_ID, ['acme-customer'], 'acme-customer')
    expect(html).toContain(ALLOW_MARKER)
    expect(html).not.toContain(DENY_COPY)
  })

  it('gates on the audience-aware resolver + FeatureGate', () => {
    const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
    expect(source).toContain("import { FeatureGate } from '@/components/FeatureGate'")
    expect(source).toContain("isPageVisibleForUser('enforcement-overrides', userOrgs, selectedWorkspace)")
    expect(source).toContain('<FeatureGate pageId="enforcement-overrides" />')
  })

  it('grounding: a customer org is genuinely denied the internal "enforcement-overrides" tier', () => {
    const customerTier = resolveOrgTier(null, 'free')
    const internalTier = resolveOrgTier('internal', 'free')
    expect(meetsAudience(customerTier, 'internal')).toBe(false)
    expect(meetsAudience(internalTier, 'internal')).toBe(true)
  })
})
