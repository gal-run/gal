import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const backgroundAgentsPageSource = readFileSync(
  join(__dirname, 'BackgroundAgentsPage.tsx'),
  'utf8',
)

describe('background sessions rerender guardrail contracts', () => {
  it('uses stable selected-repo scalar deps for branch fetching to avoid rerender loops (#2735, #2672)', () => {
    expect(backgroundAgentsPageSource).toContain(
      'const selectedRepoFullName = selectedRepo?.fullName ?? selectedRepo?.name ?? null',
    )
    expect(backgroundAgentsPageSource).toContain(
      'Use stable scalar dep to prevent unnecessary re-fetches when repo object reference changes (GAL-DASHBOARD-7)',
    )
    expect(backgroundAgentsPageSource).toContain('}, [selectedRepoFullName, selectedOrgName])')
  })

  it('preserves repo selection only when the selected repo still exists in the refreshed list (#2735)', () => {
    expect(backgroundAgentsPageSource).toContain('setSelectedRepo((prev) =>')
    expect(backgroundAgentsPageSource).toContain(
      'prev && repos.some(r => r.fullName === prev.fullName) ? prev : null',
    )
    expect(backgroundAgentsPageSource).toContain('default to "All Repos" (#2263)')
  })
})
