/**
 * Route-guard proof for the New Agent page (#6513).
 *
 * Before this fix /agents/new had ZERO route-level guard. The parent /agents
 * list page already gates on the internal background-agents audience, but
 * /agents/new is independently hand-typeable — a customer-tier user could open
 * it and create/configure background-agent cards.
 *
 * The fix adds the canonical audience-aware guard used by /agents:
 *   isPageVisibleForUser('background-agents', userOrgs, workspace) → FeatureGate.
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

const PAGE_ID = 'background-agents'
const DENY_COPY = 'Background agents and sessions are not available for this workspace'
const ALLOW_MARKER = 'Define an agent that Operator Hub'

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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Keep data lanes inert (the guard must run first anyway).
vi.mock('@/lib/agent-card-api', () => ({ createAgentCard: vi.fn() }))
vi.mock('@/lib/gmail-credential-api', () => ({ getGmailOAuthUrl: vi.fn() }))

async function renderPage(): Promise<string> {
  const mod = await import('./page')
  return renderToStaticMarkup(createElement(mod.default))
}

describe('new agent route guard (#6513)', () => {
  beforeEach(() => {
    isPageVisibleForUser.mockReset()
  })

  it('DENIES a customer-tier user: renders FeatureGate, NOT the agent form', async () => {
    isPageVisibleForUser.mockReturnValue(false)
    const html = await renderPage()
    expect(isPageVisibleForUser).toHaveBeenCalledWith(PAGE_ID, ['acme-customer'], 'acme-customer')
    expect(html).toContain(DENY_COPY)
    expect(html).not.toContain(ALLOW_MARKER)
  })

  it('ALLOWS an internal/EE user: renders the agent form, NOT the FeatureGate', async () => {
    isPageVisibleForUser.mockReturnValue(true)
    const html = await renderPage()
    expect(isPageVisibleForUser).toHaveBeenCalledWith(PAGE_ID, ['acme-customer'], 'acme-customer')
    expect(html).toContain(ALLOW_MARKER)
    expect(html).not.toContain(DENY_COPY)
  })

  it('gates on the audience-aware resolver + FeatureGate', () => {
    const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
    expect(source).toContain('import { FeatureGate } from "@/components/FeatureGate"')
    expect(source).toContain('isPageVisibleForUser("background-agents", userOrgs, orgName)')
    expect(source).toContain('<FeatureGate pageId="background-agents" />')
  })

  it('grounding: a customer org is genuinely denied the internal "background-agents" tier', () => {
    const customerTier = resolveOrgTier(null, 'free')
    const internalTier = resolveOrgTier('internal', 'free')
    expect(meetsAudience(customerTier, 'internal')).toBe(false)
    expect(meetsAudience(internalTier, 'internal')).toBe(true)
  })
})
