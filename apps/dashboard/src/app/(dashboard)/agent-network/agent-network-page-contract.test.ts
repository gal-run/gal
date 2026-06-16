import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pageSource = readFileSync(join(__dirname, 'page.tsx'), 'utf8')
const componentSource = readFileSync(
  join(__dirname, '../../../components/agent-network/AgentNetworkObservabilityPage.tsx'),
  'utf8',
)

describe('Agent Network observability page contracts', () => {
  it('is exposed through a dashboard route backed by the Agent Network component', () => {
    expect(pageSource).toContain("import AgentNetworkObservabilityPage")
    expect(pageSource).toContain('<AgentNetworkObservabilityPage />')
  })

  it('uses the sanitized event endpoints instead of rendering task input or output payloads', () => {
    expect(componentSource).toContain('api.getAgentNetworkEvents')
    expect(componentSource).toContain('api.getAgentNetworkTaskEvents')
    expect(componentSource).toContain('Event fabric observability')
    expect(componentSource).not.toContain('event.input')
    expect(componentSource).not.toContain('event.output')
    expect(componentSource).not.toContain('event.payload')
  })

  it('keeps the surface behind the existing background-agents feature gate', () => {
    expect(componentSource).toContain("isPageVisibleForUser('background-agents'")
    expect(componentSource).toContain('<FeatureGate pageId="background-agents" />')
  })
})
