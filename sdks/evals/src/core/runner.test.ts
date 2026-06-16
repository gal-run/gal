import { describe, expect, it } from 'vitest'
import { runEvaluationSuite } from './runner.js'
import { GAL_EVAL_SUITE_SCHEMA_VERSION, type GalEvalSuite } from './types.js'

describe('runEvaluationSuite', () => {
  it('scores fields and applies gates', async () => {
    const suite: GalEvalSuite = {
      schemaVersion: GAL_EVAL_SUITE_SCHEMA_VERSION,
      id: 'demo-suite',
      name: 'Demo Suite',
      subject: { kind: 'managed_agent', agentId: 'demo.agent', taskType: 'demo.task' },
      evaluatorId: 'demo-evaluator',
      gates: [{ metric: 'overall', minScore: 1 }],
      fields: [{ path: 'label', kind: 'exact_match' }],
      cases: [
        {
          id: 'case-1',
          input: { value: 'x' },
          expected: { label: 'x' },
        },
      ],
    }

    const report = await runEvaluationSuite(suite, {
      id: 'echo',
      async evaluateCase(testCase) {
        return { label: testCase.input['value'] }
      },
    })

    expect(report.passed).toBe(true)
    expect(report.score).toBe(1)
    expect(report.metrics.find(metric => metric.metric === 'overall')?.passed).toBe(true)
  })
})
