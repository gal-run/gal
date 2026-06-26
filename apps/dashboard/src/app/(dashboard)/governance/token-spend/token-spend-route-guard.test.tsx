/**
 * Route-guard proof for the Token Spend dashboard (#6285).
 *
 * Before this fix the page gated on `isPageEnabled('token-spend')` — the GLOBAL
 * enabled flag, which does NOT evaluate audienceTier and does NOT apply the EE
 * collapse. So a customer-tier workspace could see the full Token Spend
 * dashboard + the BudgetEditor. The fix switches the guard to the audience-aware
 * `isPageVisibleForUser('token-spend', userOrgs, workspace)` + the same
 * FeatureGate deny pattern the agents/enforcement pages use.
 *
 * These tests prove the guard for real, two ways:
 *  1. Behavioral: render the actual page (react-dom/server) with ONLY the
 *     feature-flags context boundary mocked. Customer (resolver → false) gets
 *     the FeatureGate deny UI and NOT the dashboard; internal/EE (resolver →
 *     true) gets the dashboard.
 *  2. Grounding: the EE-collapse the audience resolver relies on is anchored on
 *     the REAL `isEeEnabled` — a default (no-EE-key) customer build collapses
 *     every non-public page (token-spend included) to denied.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { isEeEnabled, __resetEeLicenseCacheForTests } from '@/ee/license.js'

const PAGE_ID = 'token-spend'
const DENY_COPY = 'only available to internal users' // FeatureGate token-spend message
const FEATURE_MARKER = 'GAL Code token usage' // header copy unique to the dashboard

// --- Mock ONLY the boundaries the guard depends on ------------------------
const isPageVisibleForUser = vi.fn()

vi.mock('@/contexts/FeatureFlagsContext', () => ({
  useFeatureFlags: () => ({
    isPageVisibleForUser,
    // Provide isPageEnabled too so we can prove the page no longer relies on it:
    // it is hard-wired to true here, yet a customer must STILL be denied.
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

async function renderPage(): Promise<string> {
  const mod = await import('./page')
  return renderToStaticMarkup(createElement(mod.default))
}

describe('token spend route guard (#6285)', () => {
  beforeEach(() => {
    isPageVisibleForUser.mockReset()
  })

  it('DENIES a customer-tier user even though the global flag is enabled', async () => {
    // Customer: audience-aware resolver returns false (despite isPageEnabled → true).
    isPageVisibleForUser.mockReturnValue(false)

    const html = await renderPage()

    expect(isPageVisibleForUser).toHaveBeenCalledWith(PAGE_ID, ['acme-customer'], 'acme-customer')
    expect(html).toContain(DENY_COPY)
    expect(html).not.toContain(FEATURE_MARKER)
  })

  it('ALLOWS an internal/EE user: renders the Token Spend dashboard', async () => {
    isPageVisibleForUser.mockReturnValue(true)

    const html = await renderPage()

    expect(isPageVisibleForUser).toHaveBeenCalledWith(PAGE_ID, ['acme-customer'], 'acme-customer')
    expect(html).toContain(FEATURE_MARKER)
    expect(html).not.toContain(DENY_COPY)
  })

  it('gates on the audience-aware resolver, not the global isPageEnabled flag', () => {
    const source = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
    expect(source).toContain("import { FeatureGate } from '@/components/FeatureGate'")
    expect(source).toContain("isPageVisibleForUser('token-spend', userOrgs, selectedWorkspace)")
    expect(source).toContain('<FeatureGate pageId="token-spend" />')
    // The hole: the page must no longer gate on the non-audience-aware flag.
    expect(source).not.toContain("isPageEnabled('token-spend')")
  })

  it('grounding: a default (no-EE-key) customer build is not EE-enabled', () => {
    // The audience resolver collapses every non-public page to denied when the
    // build is not EE-enabled. A customer running the default OSS/single-tenant
    // build has no EE license key, so isEeEnabled() is false — anchoring the
    // "customer ⇒ denied" premise of the behavioral tests on the REAL gate.
    const prev = process.env['GAL_EE_LICENSE_KEY']
    const prevPub = process.env['NEXT_PUBLIC_GAL_EE_LICENSE_KEY']
    try {
      delete process.env['GAL_EE_LICENSE_KEY']
      delete process.env['NEXT_PUBLIC_GAL_EE_LICENSE_KEY']
      __resetEeLicenseCacheForTests()
      expect(isEeEnabled()).toBe(false)

      // And an EE build (valid key present) IS enabled — the internal path.
      process.env['GAL_EE_LICENSE_KEY'] = 'gal-ee-AbCdEf0123456789xyz'
      __resetEeLicenseCacheForTests()
      expect(isEeEnabled()).toBe(true)
    } finally {
      if (prev === undefined) delete process.env['GAL_EE_LICENSE_KEY']
      else process.env['GAL_EE_LICENSE_KEY'] = prev
      if (prevPub === undefined) delete process.env['NEXT_PUBLIC_GAL_EE_LICENSE_KEY']
      else process.env['NEXT_PUBLIC_GAL_EE_LICENSE_KEY'] = prevPub
      __resetEeLicenseCacheForTests()
    }
  })
})
