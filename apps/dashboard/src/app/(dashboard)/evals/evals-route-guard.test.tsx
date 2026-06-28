/**
 * Route-guard proof for the Evals surface (#6513).
 *
 * Before this fix both /evals (the suite list) and /evals/[suiteId] (the suite
 * detail) had ZERO route-level guard. The evals dashboard is part of the
 * internal background-agents surface (agents must pass eval gates before
 * deployment) — the layout nav maps /evals to the internal `background-agents`
 * page — yet a customer-tier user who hand-typed /evals rendered the dashboard
 * and could trigger eval runs.
 *
 * The fix adds the canonical audience-aware guard used by the /agents and
 * /sessions pages:
 *   isPageVisibleForUser('background-agents', userOrgs, workspace) → FeatureGate.
 *
 * Proven two ways: behavioral render (customer → deny, internal → content) and
 * grounding on the REAL @gal/core audience primitives.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { meetsAudience, resolveOrgTier } from '@gal/core'

const PAGE_ID = 'background-agents'
const DENY_COPY = 'Background agents and sessions are not available for this workspace'

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

// Not demo mode — exercise the real customer/internal split.
vi.mock('@/lib/demo-guard', () => ({ isDemoMode: () => false }))

vi.mock('next/navigation', () => ({
  useParams: () => ({ suiteId: 'suite-123' }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/eval-api', () => ({
  listEvalSuites: vi.fn().mockResolvedValue([]),
  getEvalReport: vi.fn().mockResolvedValue(null),
  runEval: vi.fn(),
}))

async function renderPage(importer: () => Promise<{ default: () => unknown }>): Promise<string> {
  const mod = await importer()
  return renderToStaticMarkup(createElement(mod.default as () => any))
}

const PAGES: { name: string; importer: () => Promise<any>; allowMarker: string }[] = [
  {
    name: 'evals list',
    importer: () => import('./page'),
    // After the guard passes the list renders its loading skeleton first.
    allowMarker: 'animate-pulse',
  },
  {
    name: 'eval suite detail',
    importer: () => import('./[suiteId]/page'),
    allowMarker: 'animate-pulse',
  },
]

describe('evals route guard (#6513)', () => {
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

  it('both evals pages gate on the audience-aware resolver + FeatureGate', () => {
    for (const rel of ['page.tsx', '[suiteId]/page.tsx']) {
      const source = readFileSync(join(__dirname, rel), 'utf8')
      expect(source).toContain('import { FeatureGate } from "@/components/FeatureGate"')
      expect(source).toContain('isPageVisibleForUser("background-agents", userOrgs, workspaceName)')
      expect(source).toContain('<FeatureGate pageId="background-agents" />')
    }
  })

  it('grounding: a customer org is genuinely denied the internal "background-agents" tier', () => {
    const customerTier = resolveOrgTier(null, 'free')
    const internalTier = resolveOrgTier('internal', 'free')
    expect(meetsAudience(customerTier, 'internal')).toBe(false)
    expect(meetsAudience(internalTier, 'internal')).toBe(true)
  })
})
