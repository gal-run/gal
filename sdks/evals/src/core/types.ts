export const GAL_EVAL_SUITE_SCHEMA_VERSION = 'gal.evals.suite.v1' as const
export const GAL_EVAL_REPORT_SCHEMA_VERSION = 'gal.evals.report.v1' as const
export const GAL_EVAL_PREDICTIONS_SCHEMA_VERSION = 'gal.evals.predictions.v1' as const

export type GalEvalSubjectKind =
  | 'managed_agent'
  | 'agent_card'
  | 'runtime_adapter'
  | 'tool_connector'
  | 'policy'

export type GalEvalFieldKind = 'exact_match' | 'boolean_match' | 'number_range' | 'custom'

export interface GalEvalSubject {
  kind: GalEvalSubjectKind
  agentId?: string
  taskType?: string
  version?: string
  repo?: string
}

export interface GalEvalGate {
  metric: string
  minScore: number
}

export interface GalEvalField {
  path: string
  kind: GalEvalFieldKind
  weight?: number
  min?: number
  max?: number
}

export interface GalEvalCase {
  id: string
  title?: string
  tags?: string[]
  input: Record<string, unknown>
  expected: Record<string, unknown>
  fields?: GalEvalField[]
}

export interface GalEvalSuite {
  schemaVersion: typeof GAL_EVAL_SUITE_SCHEMA_VERSION
  id: string
  name: string
  description?: string
  subject: GalEvalSubject
  evaluatorId: string
  gates: GalEvalGate[]
  fields: GalEvalField[]
  cases: GalEvalCase[]
  metadata?: Record<string, unknown>
}

export interface GalEvalAdapter {
  id: string
  evaluateCase(testCase: GalEvalCase, suite: GalEvalSuite): Promise<Record<string, unknown>>
}

export interface GalEvalFieldResult {
  path: string
  metric: string
  expected: unknown
  actual: unknown
  score: number
  weight: number
  passed: boolean
  suggestion?: string
}

export interface GalEvalCaseResult {
  caseId: string
  title?: string
  tags?: string[]
  score: number
  passed: boolean
  output: Record<string, unknown>
  fields: GalEvalFieldResult[]
}

export interface GalEvalMetricResult {
  metric: string
  score: number
  correct: number
  total: number
  passed: boolean
  gate?: GalEvalGate
}

export interface GalEvalReport {
  schemaVersion: typeof GAL_EVAL_REPORT_SCHEMA_VERSION
  suiteId: string
  suiteName: string
  evaluatorId: string
  adapterId: string
  subject: GalEvalSubject
  generatedAt: string
  score: number
  passed: boolean
  metrics: GalEvalMetricResult[]
  cases: GalEvalCaseResult[]
  suggestions: string[]
}

export interface GalEvalPrediction {
  caseId: string
  output: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface GalEvalPredictionFile {
  schemaVersion: typeof GAL_EVAL_PREDICTIONS_SCHEMA_VERSION
  suiteId: string
  subject?: GalEvalSubject
  generatedAt?: string
  predictions: GalEvalPrediction[]
  metadata?: Record<string, unknown>
}
