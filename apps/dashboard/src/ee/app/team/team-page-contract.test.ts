import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const teamPageSource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

describe('team page contract regressions', () => {
  it('keeps consolidated CLI/Auth/Sync coverage on the Team surface instead of split legacy tabs (#2460)', () => {
    expect(teamPageSource).toContain('Consolidated Team Page')
    expect(teamPageSource).toContain('Displays team members with their GAL roles, CLI install status,')
    expect(teamPageSource).toContain('authentication status, and sync state in one unified view')
    expect(teamPageSource).toContain('interface CombinedTeamMember extends TeamMember')
    expect(teamPageSource).toContain('cliInstalled?: boolean')
    expect(teamPageSource).toContain('authenticated?: boolean')
    expect(teamPageSource).toContain("syncStatus?: 'synced' | 'outdated' | 'never_synced'")
  })

  it('keeps merge wiring from developer status into team rows for cli/auth/sync fields (#2460)', () => {
    expect(teamPageSource).toContain('function mergeTeamWithDeveloperStatus(')
    expect(teamPageSource).toContain('cliInstalled: devStatus?.cliInstalled')
    expect(teamPageSource).toContain('authenticated: devStatus?.authenticated')
    expect(teamPageSource).toContain('syncStatus: devStatus?.syncStatus')
    expect(teamPageSource).toContain('lastSyncAt: devStatus?.lastSyncAt')
  })
})
