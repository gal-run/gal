import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const teamPageSource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

describe('team sync badge contracts', () => {
  it('keeps per-agent sync logo badges and removes legacy single checkmark sync status cell (#2943)', () => {
    expect(teamPageSource).toContain('function AgentSyncBadges({ member }: { member: CombinedTeamMember })')
    expect(teamPageSource).toContain('<PlatformIcon platform={platform} className="w-4 h-4" />')
    expect(teamPageSource).toContain('SyncStatusBadge removed — replaced by AgentSyncBadges (#2943)')
    expect(teamPageSource).toContain('SyncStatusIcon replaced by AgentSyncBadges for per-agent logo badges (#2943)')
    expect(teamPageSource).toContain("title={`${AGENT_PLATFORM_LABELS[platform]} \\u2014 never synced`}")
    expect(teamPageSource).toContain("status?.syncStatus === 'outdated'")
  })
})
