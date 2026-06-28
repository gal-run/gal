/**
 * Route-guard proof for the governance Policies surface (#6878).
 *
 * Before this fix every /policies route (the list, /new, /[policyId], and
 * /check) had ZERO route-level guard — it only checked for a selected
 * workspace. So a non-internal (customer-tier) user who hand-typed /policies
 * rendered the policy manager and could create/activate/delete governance
 * policies. The `policies` PageId is internal-only and is NOT in
 * FALLBACK_PUBLIC_PAGES.
 *
 * The fix adds the canonical audience-aware guard used by the agents /
 * enforcement / governance-playground pages:
 *   isPageVisibleForUser('policies', userOrgs, workspace) → FeatureGate.
 *
 * These tests prove the guard for real, two ways:
 *  1. Behavioral: render the actual pages (react-dom/server) with ONLY the
 *     feature-flags context boundary mocked. Customer (resolver → false) gets
 *     the FeatureGate deny UI and NOT the policy content; internal/EE
 *     (resolver → true) gets the content.
 *  2. Grounding: the customer-vs-internal premise is anchored on the REAL
 *     audience primitives (`meetsAudience`/`resolveOrgTier`).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { meetsAudience, resolveOrgTier } from '@gal/core'

const PAGE_ID = 'policies'
const DENY_COPY = 'Governance policy management is only available to internal users'

// --- Mock ONLY the boundaries the guard depends on ------------------------
const isPageVisibleForUser = vi.fn()

vi.mock('@/contexts/FeatureFlagsContext', () => ({
  useFeatureFlags: () => ({
    isPageVisibleForUser,
    // Hard-wire the global flag to true so we prove the page does NOT rely on it.
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

// Keep dynamic-route params + data lanes inert (the guard must run first).
vi.mock('next/navigation', () => ({
  useParams: () => ({ policyId: 'pol-123' }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/policy-api', () => ({
  listPolicies: vi.fn().mockResolvedValue([]),
  activatePolicy: vi.fn(),
  createPolicy: vi.fn(),
  getPolicy: vi.fn().mockResolvedValue(null),
  updatePolicy: vi.fn(),
  deletePolicy: vi.fn(),
}))

async function renderPage(importer: () => Promise<{ default: () => unknown }>): Promise<string> {
  const mod = await importer()
  return renderToStaticMarkup(createElement(mod.default as () => any))
}

const PAGES: { name: string; importer: () => Promise<any>; allowMarker: string }[] = [
  {
    name: 'policies list',
    importer: () => import('./page'),
    allowMarker: 'Manage governance policies for your organization',
  },
  {
    name: 'new policy',
    importer: () => import('./new/page'),
    allowMarker: 'Create a new governance policy for your organization',
  },
  {
    name: 'policy detail',
    importer: () => import('./[policyId]/page'),
    // After the guard passes, the detail page renders its loading state first.
    allowMarker: 'Loading policy...',
  },
  {
    name: 'policy check',
    importer: () => import('./check/page'),
    allowMarker: 'Test policy enforcement decisions for tool calls',
  },
]

describe('policies route guard (#6878)', () => {
  beforeEach(() => {
    isPageVisibleForUser.mockReset()
    vi.resetModules()
  })

  for (const page of PAGES) {
    it(`DENIES a customer-tier user on the ${page.name} page (FeatureGate, not content)`, async () => {
      isPageVisibleForUser.mockReturnValue(false)
      const html = await renderPage(page.importer)
      expect(isPageVisibleForUser).toHaveBeenCalledWith(PAGE_ID, ['acme-customer'], 'acme-customer')
      expect(html).toContain(DENY_COPY)
      expect(html).not.toContain(page.allowMarker)
    })

    it(`ALLOWS an internal/EE user on the ${page.name} page (content, not FeatureGate)`, async () => {
      isPageVisibleForUser.mockReturnValue(true)
      const html = await renderPage(page.importer)
      expect(isPageVisibleForUser).toHaveBeenCalledWith(PAGE_ID, ['acme-customer'], 'acme-customer')
      expect(html).toContain(page.allowMarker)
      expect(html).not.toContain(DENY_COPY)
    })
  }

  it('every policies page gates on the audience-aware resolver + FeatureGate', () => {
    const files = ['page.tsx', 'new/page.tsx', '[policyId]/page.tsx', 'check/page.tsx']
    for (const rel of files) {
      const source = readFileSync(join(__dirname, rel), 'utf8')
      expect(source).toContain('import { FeatureGate } from "@/components/FeatureGate"')
      expect(source).toContain('isPageVisibleForUser("policies", userOrgs, orgName)')
      expect(source).toContain('<FeatureGate pageId="policies" />')
    }
  })

  it('grounding: a customer org is genuinely denied the internal "policies" tier', () => {
    const customerTier = resolveOrgTier(null, 'free')
    const internalTier = resolveOrgTier('internal', 'free')
    expect(meetsAudience(customerTier, 'internal')).toBe(false)
    expect(meetsAudience(internalTier, 'internal')).toBe(true)
  })
})
