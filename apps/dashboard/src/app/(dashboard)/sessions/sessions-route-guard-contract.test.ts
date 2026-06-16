import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sessionsPageSource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

const sessionDetailPageSource = readFileSync(
  join(__dirname, '[sessionId]', 'page.tsx'),
  'utf8',
)

const agentsPageSource = readFileSync(
  join(__dirname, '..', 'agents', 'page.tsx'),
  'utf8',
)

const featureGateSource = readFileSync(
  join(__dirname, '..', '..', '..', 'components', 'FeatureGate.tsx'),
  'utf8',
)

describe('background agents route guard contracts', () => {
  it('guards unified sessions routes with auth and background-agent visibility (#6591)', () => {
    for (const source of [sessionsPageSource, sessionDetailPageSource]) {
      expect(source).toContain("import { FeatureGate } from '@/components/FeatureGate'")
      expect(source).toContain("import { useAuth } from '@/contexts/AuthContext'")
      expect(source).toContain("import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'")
      expect(source).toContain("import { isDemoMode } from '@/lib/demo-guard'")
      expect(source).toContain("if (isLoading || flagsLoading)")
      expect(source).toContain('if (!user && !isDemoMode())')
      expect(source).toContain("isPageVisibleForUser('background-agents', userOrgs, selectedWorkspace)")
      expect(source).toContain('<FeatureGate pageId="background-agents" />')
    }
  })

  it('keeps the agents catalog behind the same background-agent route gate (#6591)', () => {
    expect(agentsPageSource).toContain("import { FeatureGate } from '@/components/FeatureGate'")
    expect(agentsPageSource).toContain('authLoading || flagsLoading')
    expect(agentsPageSource).toContain('if (!user && !isDemoMode())')
    expect(agentsPageSource).toContain("isPageVisibleForUser('background-agents', userOrgs, workspaceName)")
    expect(agentsPageSource).toContain('<FeatureGate pageId="background-agents" />')
  })

  it('provides a specific blocked-state UI for background agents (#6591)', () => {
    expect(featureGateSource).toContain("'background-agents': {")
    expect(featureGateSource).toContain("title: 'Background Agents Unavailable'")
    expect(featureGateSource).toContain('Background agents and sessions are not available for this workspace')
  })
})
