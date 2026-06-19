import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dashboardLayoutSource = readFileSync(
  join(__dirname, 'layout.tsx'),
  'utf8',
)

const settingsPageSource = readFileSync(
  join(__dirname, 'settings/page.tsx'),
  'utf8',
)

const auditLogsPageSource = readFileSync(
  join(__dirname, 'audit-logs/page.tsx'),
  'utf8',
)

const browserProfilesPageSource = readFileSync(
  join(__dirname, 'browser-profiles/page.tsx'),
  'utf8',
)

describe('dashboard layout and settings surface contracts', () => {
  it('keeps workspace-switch remount protection for page data correctness (#2278)', () => {
    expect(dashboardLayoutSource).toContain('Main Content — keyed by workspace so pages fully remount on switch (#2278)')
    expect(dashboardLayoutSource).toContain('<Fragment key={selectedWorkspace ?? "__none__"}>')
  })

  it('keeps collapsible sidebar control and unified footer actions (#3025, #3603, #2831)', () => {
    expect(dashboardLayoutSource).toContain('SIDEBAR_COLLAPSED_KEY')
    expect(dashboardLayoutSource).toContain('toggleSidebarCollapsed')
    expect(dashboardLayoutSource).toContain('title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}')
    expect(dashboardLayoutSource).toContain('Unified sidebar footer — Visit link + env badge + theme toggle + collapse')
    expect(dashboardLayoutSource).toContain('href="https://app.gal.run"')
    expect(dashboardLayoutSource).toContain('Visit gal.run')
  })

  it('uses SSR-safe false initial value for sidebarCollapsed and hydrates via useEffect to prevent React hydration mismatch (#3990)', () => {
    // The lazy initializer that read localStorage caused React error #418 because
    // the server rendered false while the client could render true. We now use a
    // static false initial value and hydrate in a useEffect.
    expect(dashboardLayoutSource).toContain('const [sidebarCollapsed, setSidebarCollapsed] = useState(false);')
    // The useEffect must read localStorage after mount, not during render
    expect(dashboardLayoutSource).toContain("localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === \"true\"")
    expect(dashboardLayoutSource).toContain('setSidebarCollapsed(true)')
    // The old lazy initializer pattern must be gone
    expect(dashboardLayoutSource).not.toContain('useState(() => {')
  })

  it('keeps settings tabs gated behind internal visibility controls (#2429, #138, #140)', () => {
    expect(settingsPageSource).toContain('Gate agents, agent-credentials, dispatch-rules, and environments tabs behind internal feature flag (#2429)')
    // #4678: auto-approval promoted to partner tier — no longer in internalOnlyTabs
    expect(settingsPageSource).toContain("const internalOnlyTabs: SettingsTab[] = ['agents', 'agent-credentials', 'dispatch-rules', 'environments']")
    expect(settingsPageSource).not.toContain("const internalOnlyTabs: SettingsTab[] = ['agents', 'agent-credentials', 'dispatch-rules', 'auto-approval']")
    // auto-approval now gated separately via page-visibility (partner tier)
    expect(settingsPageSource).toContain("if (t === 'auto-approval') return showAutoApprovalTab")
    expect(settingsPageSource).toContain("const requestedTab: SettingsTab = allTabs.includes(tabParam as SettingsTab) ? (tabParam as SettingsTab) : 'github'")
    expect(settingsPageSource).toContain('const internalTabResolutionPending =')
    expect(settingsPageSource).toContain("if (internalTabResolutionPending) return")
    expect(settingsPageSource).toContain("label=\"Agent Credentials\"")
    expect(settingsPageSource).toContain("label=\"Dispatch Rules\"")
  })

  it('keeps audit logs and browser profiles behind explicit internal guards', () => {
    expect(auditLogsPageSource).toContain("useIsInternalWorkspace")
    expect(auditLogsPageSource).toContain("const isVisible = isInternalWorkspace && isPageVisibleForUser('audit-logs', userOrgs, selectedWorkspace)")
    expect(auditLogsPageSource).toContain("if (!isVisible) {")
    expect(auditLogsPageSource).toContain("Audit logs are only available to internal users.")

    expect(browserProfilesPageSource).toContain("useIsInternalWorkspace")
    expect(browserProfilesPageSource).toContain("const isVisible = isInternalWorkspace && isPageVisibleForUser('browser-profiles', userOrgs, selectedWorkspace)")
    expect(browserProfilesPageSource).toContain("if (!isVisible) {")
    expect(browserProfilesPageSource).toContain("Browser profiles are only available to internal users.")
  })
})
