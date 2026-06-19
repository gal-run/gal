import { describe, expect, it } from 'vitest'

import { MANAGED_AGENT_TEMPLATES } from './managed-agent-templates'

describe('managed-agent templates', () => {
  it('keeps connector-specific details in deploy templates instead of API methods', () => {
    expect(MANAGED_AGENT_TEMPLATES.map((template) => template.id)).toEqual([
      'email-triage',
      'slack-triage',
    ])

    for (const template of MANAGED_AGENT_TEMPLATES) {
      expect(template.definition.requiredEvalSuites).toContain(template.defaultSuiteId)
      expect(template.version.evalSuites).toContain(template.defaultSuiteId)
      expect(template.version.runtimeRef).toBe('gal-worker://managed-agent-runtime')
      expect(template.version.executionTargetRef).toMatch(/^gal-endpoints:\/\//)
      expect(template.version.runnerRefs).toEqual(
        expect.arrayContaining([expect.stringMatching(/^gal-runners:\/\//)]),
      )
      expect(template.version.connectorRefs).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: expect.any(String) })]),
      )
    }
  })
})
