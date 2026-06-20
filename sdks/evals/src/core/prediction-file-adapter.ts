import type {
  GalEvalAdapter,
  GalEvalCase,
  GalEvalPredictionFile,
  GalEvalSuite,
} from './types.js'

export class PredictionFileAdapter implements GalEvalAdapter {
  readonly id = 'prediction-file'
  private readonly predictions: Map<string, Record<string, unknown>>

  constructor(predictionFile: GalEvalPredictionFile) {
    this.predictions = new Map(
      predictionFile.predictions.map(prediction => [prediction.caseId, prediction.output]),
    )
  }

  async evaluateCase(testCase: GalEvalCase, _suite: GalEvalSuite): Promise<Record<string, unknown>> {
    const output = this.predictions.get(testCase.id)

    if (!output) {
      throw new Error(`Prediction file is missing output for case ${testCase.id}`)
    }

    return output
  }
}

export function assertPredictionFileMatchesSuite(
  predictionFile: GalEvalPredictionFile,
  suite: GalEvalSuite,
): void {
  if (predictionFile.suiteId !== suite.id) {
    throw new Error(
      `Prediction file suiteId ${predictionFile.suiteId} does not match suite ${suite.id}`,
    )
  }

  const suiteCaseIds = new Set(suite.cases.map(testCase => testCase.id))
  const extraPredictions = predictionFile.predictions
    .map(prediction => prediction.caseId)
    .filter(caseId => !suiteCaseIds.has(caseId))

  if (extraPredictions.length > 0) {
    throw new Error(`Prediction file contains unknown case ids: ${extraPredictions.join(', ')}`)
  }
}
