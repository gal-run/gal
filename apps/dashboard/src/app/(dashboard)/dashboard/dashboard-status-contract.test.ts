import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dashboardPageSource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

describe('dashboard status surface contracts', () => {
  it('keeps drift status section wired to project reports and badges (#1066)', () => {
    expect(dashboardPageSource).toContain('Drift status for org projects (#1066)')
    expect(dashboardPageSource).toContain('useDriftStatus(')
    expect(dashboardPageSource).toContain('{/* Drift Status Section (#1066) */}')
    expect(dashboardPageSource).toContain('<DriftStatusBadge report={report} />')
  })

  it('keeps Developer Sync command panel using high-contrast inverse surface tokens (#2946)', () => {
    expect(dashboardPageSource).toContain('{/* Developer Sync Section */}')
    expect(dashboardPageSource).toContain('gal sync --pull')
    expect(dashboardPageSource).toContain("backgroundColor: 'var(--surface-inverse)'")
    expect(dashboardPageSource).toContain("color: 'var(--text-inverse)'")
  })

  it('makes Approved Config stat card always navigable to /approved-config (#5648)', () => {
    // StatCard must accept an onClick prop (rendered as button when provided)
    expect(dashboardPageSource).toContain("onClick?: () => void")
    // The Approved Config card must always pass an onClick navigating to /approved-config
    expect(dashboardPageSource).toContain("onClick={() => router.push('/approved-config')}")
    // When no config is set, a CTA subtext must be shown
    expect(dashboardPageSource).toContain("Set up your approved config →")
  })
})
