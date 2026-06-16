import { describe, expect, it } from 'vitest'

import * as publicApi from './index.js'

describe('public package boundary', () => {
  it('exports the canonical agent contracts and validation helpers', () => {
    expect(publicApi).toHaveProperty('GAL_AGENT_CARD_SCHEMA_VERSION')
    expect(publicApi).toHaveProperty('GAL_AGENT_TASK_SCHEMA_VERSION')
    expect(publicApi).toHaveProperty('GAL_AGENT_HEALTH_SCHEMA_VERSION')
    expect(publicApi).toHaveProperty('GAL_AGENT_STATUS_SCHEMA_VERSION')
    expect(publicApi).toHaveProperty('validateGalAgentCard')
    expect(publicApi).toHaveProperty('isGalAgentTaskState')
    expect(publicApi).toHaveProperty('GAL_SWARM_AGENT_CARDS')
  })

  it('does not export internal product runtimes or control-plane clients', () => {
    expect(publicApi).not.toHaveProperty('ManagedAgentRuntimeHarness')
    expect(publicApi).not.toHaveProperty('ManagedAgentWorker')
    expect(publicApi).not.toHaveProperty('createManagedAgentControlPlaneHttpClient')
    expect(publicApi).not.toHaveProperty('GAL_OPS_TRIAGE_AGENT_CARD')
    expect(publicApi).not.toHaveProperty('EmailTriageRuntime')
    expect(publicApi).not.toHaveProperty('KeepTriageRuntime')
    expect(publicApi).not.toHaveProperty('TaskTriageRuntime')
    expect(publicApi).not.toHaveProperty('UnsubscribeRuntime')
  })
})
