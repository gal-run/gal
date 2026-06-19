import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const layoutSource = readFileSync(
  join(__dirname, 'layout.tsx'),
  'utf8',
)

describe('dashboard layout navigation contracts', () => {
  it('keeps Discovery and Approved Config routes present in sidebar navigation (#1361)', () => {
    expect(layoutSource).toContain('path: "/discovery"')
    expect(layoutSource).toContain('label: "Discovery"')
    expect(layoutSource).toContain('path: "/approved-config"')
    expect(layoutSource).toContain('label: "Approved Config"')
  })

  it('does not expose the legacy "Job Queue" navigation label anymore (#660)', () => {
    expect(layoutSource).not.toContain('Job Queue')
    expect(layoutSource).toContain('path: "/sessions"')
    expect(layoutSource).toContain('label: "Sessions"')
  })

  it('exposes Agent Network observability from the main dashboard navigation', () => {
    expect(layoutSource).toContain('path: "/agent-network"')
    expect(layoutSource).toContain('label: "Agent Network"')
    expect(layoutSource).toContain('icon: Network')
    expect(layoutSource).toContain('pageId: "background-agents"')
  })

  it('exposes managed-agent deployment from the main dashboard navigation', () => {
    expect(layoutSource).toContain('path: "/managed-agents"')
    expect(layoutSource).toContain('label: "Managed Agents"')
    expect(layoutSource).toContain('pageId: "background-agents"')
  })

  it('keeps mobile content from inheriting the hidden sidebar width', () => {
    // The sidebar offset was migrated off the legacy negative-margin trick
    // (-ml-60 / lg:ml-0). The sidebar is now a `fixed lg:relative` <aside> that
    // slides off-screen on mobile (-translate-x-full lg:translate-x-0), so it
    // is out of layout flow on mobile and in-flow on desktop. The main content
    // is a `flex-1` sibling that fills the remaining width on both. This means
    // mobile content can never inherit the hidden sidebar's width.
    expect(layoutSource).toContain('fixed lg:relative')
    expect(layoutSource).toContain('-translate-x-full lg:translate-x-0')
    expect(layoutSource).toContain('flex-1 flex flex-col')
  })

  it('keeps billing entry in the sidebar while avoiding legacy "Upgrade Plan" menu wording (#1227)', () => {
    expect(layoutSource).toContain('path: "/billing"')
    expect(layoutSource).toContain('label: "Billing"')
    expect(layoutSource).not.toContain('Upgrade Plan')
  })

  it('keeps public enforcement entry visible while hiding internal audit and browser-profile routes', () => {
    expect(layoutSource).toContain('path: "/enforcement"')
    expect(layoutSource).toContain('pageId: "enforcement-compliance"')
    expect(layoutSource).toContain('"/audit-logs"')
    expect(layoutSource).toContain('"/browser-profiles"')
    expect(layoutSource).toContain('const INTERNAL_ONLY_PATH_PREFIXES = [')
    expect(layoutSource).toContain('"/enforcement/overrides"')
  })

  it('calls checkAuth after organizations-updated event so sidebar nav re-renders after GitHub App install (#5668)', () => {
    // The subscribeOrganizationsUpdated handler must call checkAuth() alongside
    // fetchInstallationCount() so that user.organizations is refreshed in
    // AuthContext. Without this, useIsOnboardingComplete() stays false after
    // a GitHub App install and the sidebar nav items remain empty until a manual
    // page refresh.
    expect(layoutSource).toContain('checkAuth')
    expect(layoutSource).toContain('subscribeOrganizationsUpdated')
    // Verify both are called in the same effect (they appear in proximity in
    // the organizations-updated subscription block). Use the call-site occurrence
    // (lastIndexOf) not the import declaration (indexOf) which would find the
    // wrong location and miss the handler body.
    const callSiteIdx = layoutSource.lastIndexOf('subscribeOrganizationsUpdated')
    const orgUpdatedBlock = layoutSource.slice(callSiteIdx, callSiteIdx + 300)
    expect(orgUpdatedBlock).toContain('fetchInstallationCount')
    expect(orgUpdatedBlock).toContain('checkAuth')
  })
})
