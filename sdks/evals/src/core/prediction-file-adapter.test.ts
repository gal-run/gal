import { describe, expect, it } from 'vitest'
import { runEvaluationSuite } from './runner.js'
import { PredictionFileAdapter, assertPredictionFileMatchesSuite } from './prediction-file-adapter.js'
import {
  GAL_EVAL_PREDICTIONS_SCHEMA_VERSION,
  GAL_EVAL_SUITE_SCHEMA_VERSION,
  type GalEvalPredictionFile,
  type GalEvalSuite,
} from './types.js'

describe('PredictionFileAdapter', () => {
  const suite: GalEvalSuite = {
    schemaVersion: GAL_EVAL_SUITE_SCHEMA_VERSION,
    id: 'prediction-suite',
    name: 'Prediction Suite',
    subject: { kind: 'managed_agent', agentId: 'demo.agent' },
    evaluatorId: 'demo',
    gates: [{ metric: 'overall', minScore: 1 }],
    fields: [{ path: 'label', kind: 'exact_match' }],
    cases: [
      {
        id: 'case-1',
        input: {},
        expected: { label: 'expected' },
      },
    ],
  }

  it('scores outputs emitted by a prediction file', async () => {
    const predictions: GalEvalPredictionFile = {
      schemaVersion: GAL_EVAL_PREDICTIONS_SCHEMA_VERSION,
      suiteId: suite.id,
      predictions: [{ caseId: 'case-1', output: { label: 'expected' } }],
    }

    const report = await runEvaluationSuite(suite, new PredictionFileAdapter(predictions))

    expect(report.passed).toBe(true)
    expect(report.score).toBe(1)
  })

  it('rejects predictions for the wrong suite', () => {
    const predictions: GalEvalPredictionFile = {
      schemaVersion: GAL_EVAL_PREDICTIONS_SCHEMA_VERSION,
      suiteId: 'other-suite',
      predictions: [],
    }

    expect(() => assertPredictionFileMatchesSuite(predictions, suite)).toThrow(
      'does not match suite',
    )
  })
})
