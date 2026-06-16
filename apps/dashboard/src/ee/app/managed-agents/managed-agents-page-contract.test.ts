import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// EE Managed Agents page is fenced as EePage.tsx (ee/-fence, commit 46b6218)
// so single-tenant builds without a license key never compile it.
const pageSource = readFileSync(join(__dirname, 'EePage.tsx'), 'utf8')

describe('managed agents page contract', () => {
  it('uses the provider-neutral managed-agent control plane endpoints', () => {
    expect(pageSource).toContain('api.listManagedAgents')
    expect(pageSource).toContain('api.createManagedAgent(')
    expect(pageSource).toContain('api.createManagedAgentVersion')
    expect(pageSource).toContain('api.createManagedAgentEvalRun')
    expect(pageSource).toContain('api.claimManagedAgentEvalRun')
    expect(pageSource).toContain('api.promoteManagedAgentVersion')
    expect(pageSource).toContain("FeatureGate pageId=\"background-agents\"")
  })

  it('keeps email as a template-driven deployment instead of a Gmail route', () => {
    expect(pageSource).toContain('MANAGED_AGENT_TEMPLATES')
    expect(pageSource).toContain('connectorRefsJson')
    expect(pageSource).toContain('executionTargetRef')
    expect(pageSource).toContain('runnerRefs')
    expect(pageSource).not.toContain('/gmail')
  })
})
