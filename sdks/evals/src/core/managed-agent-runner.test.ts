import { describe, expect, it } from 'vitest'

import {
  createGalEvalsManagedAgentRunner,
  createPredictionFileManagedAgentRunner,
} from './managed-agent-runner.js'
import {
  GAL_EVAL_PREDICTIONS_SCHEMA_VERSION,
  GAL_EVAL_SUITE_SCHEMA_VERSION,
  type GalEvalPredictionFile,
  type GalEvalSuite,
} from './types.js'

describe('managed-agent eval runner bridge', () => {
  it('exposes gal-evals suites as structural managed-agent runners', async () => {
    const suite = makeSuite()
    const runner = createGalEvalsManagedAgentRunner({
      suite,
      adapter: {
        id: 'echo-label',
        async evaluateCase(testCase) {
          return { label: testCase.expected['label'] }
        },
      },
      taskTypes: ['ops.email.triage'],
    })

    const workPacket = {
      agent: { taskType: 'ops.email.triage', agentCardRef: 'gal-agents://agent-cards/ops-triage/email' },
      evalRun: { suiteId: suite.id },
    }
    const report = await runner.run(workPacket)

    expect(runner.id).toBe('gal-evals:echo-label:gal.ops-triage.email.v1')
    expect(runner.canRun(workPacket)).toBe(true)
    expect(report.passed).toBe(true)
    expect(report.adapterId).toBe('echo-label')
  })

  it('creates prediction-file runners for worker-produced outputs', async () => {
    const suite = makeSuite()
    const predictionFile: GalEvalPredictionFile = {
      schemaVersion: GAL_EVAL_PREDICTIONS_SCHEMA_VERSION,
      suiteId: suite.id,
      predictions: [
        {
          caseId: 'case-1',
          output: { label: 'github' },
        },
      ],
    }

    const runner = createPredictionFileManagedAgentRunner({
      suite,
      predictionFile,
      taskTypes: ['ops.email.triage'],
    })
    const report = await runner.run({
      agent: { taskType: 'ops.email.triage' },
      evalRun: { suiteId: suite.id },
    })

    expect(report.schemaVersion).toBe('gal.evals.report.v1')
    expect(report.passed).toBe(true)
    expect(report.adapterId).toBe('prediction-file')
  })

  it('rejects mismatched work packets before scoring', async () => {
    const runner = createGalEvalsManagedAgentRunner({
      suite: makeSuite(),
      adapter: {
        id: 'never-called',
        async evaluateCase() {
          return { label: 'github' }
        },
      },
    })

    await expect(
      runner.run({
        agent: {},
        evalRun: { suiteId: 'wrong-suite' },
      }),
    ).rejects.toThrow('does not match suite')
  })
})

function makeSuite(): GalEvalSuite {
  return {
    schemaVersion: GAL_EVAL_SUITE_SCHEMA_VERSION,
    id: 'gal.ops-triage.email.v1',
    name: 'Email triage',
    subject: {
      kind: 'managed_agent',
      agentId: 'gal.ops-triage.email',
      taskType: 'ops.email.triage',
    },
    evaluatorId: 'gal-evals',
    gates: [{ metric: 'overall', minScore: 1 }],
    fields: [{ path: 'label', kind: 'exact_match' }],
    cases: [
      {
        id: 'case-1',
        input: { subject: '[repo] PR merged' },
        expected: { label: 'github' },
      },
    ],
  }
}
