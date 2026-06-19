import {
  GAL_EVAL_REPORT_SCHEMA_VERSION,
  type GalEvalAdapter,
  type GalEvalCase,
  type GalEvalCaseResult,
  type GalEvalField,
  type GalEvalFieldKind,
  type GalEvalFieldResult,
  type GalEvalMetricResult,
  type GalEvalReport,
  type GalEvalSuite,
} from './types.js'

export async function runEvaluationSuite(
  suite: GalEvalSuite,
  adapter: GalEvalAdapter,
): Promise<GalEvalReport> {
  const cases: GalEvalCaseResult[] = []

  for (const testCase of suite.cases) {
    const output = await adapter.evaluateCase(testCase, suite)
    cases.push(scoreCase(testCase, output, suite.fields))
  }

  const metrics = buildMetrics(cases, suite)
  const totalWeight = cases.reduce((sum, testCase) => sum + caseWeight(testCase), 0)
  const weightedScore =
    totalWeight === 0
      ? 1
      : cases.reduce((sum, testCase) => sum + testCase.score * caseWeight(testCase), 0) / totalWeight
  const suggestions = cases.flatMap(testCase =>
    testCase.fields.flatMap(field => (field.suggestion && !field.passed ? [field.suggestion] : [])),
  )

  return {
    schemaVersion: GAL_EVAL_REPORT_SCHEMA_VERSION,
    suiteId: suite.id,
    suiteName: suite.name,
    evaluatorId: suite.evaluatorId,
    adapterId: adapter.id,
    subject: suite.subject,
    generatedAt: new Date().toISOString(),
    score: weightedScore,
    passed: metrics.every(metric => metric.passed),
    metrics,
    cases,
    suggestions: Array.from(new Set(suggestions)),
  }
}

export function formatEvaluationReport(report: GalEvalReport): string {
  const lines = [
    `${report.suiteName}`,
    '='.repeat(report.suiteName.length),
    '',
    `Suite: ${report.suiteId}`,
    `Evaluator: ${report.evaluatorId}`,
    `Adapter: ${report.adapterId}`,
    `Subject: ${report.subject.agentId ?? report.subject.kind}${report.subject.taskType ? ` / ${report.subject.taskType}` : ''}`,
    `Overall score: ${formatPercent(report.score)}`,
    `Gate: ${report.passed ? 'PASS' : 'FAIL'}`,
    '',
    'Metrics:',
  ]

  for (const metric of report.metrics) {
    const gate = metric.gate ? `, gate ${formatPercent(metric.gate.minScore)}` : ''
    lines.push(`- ${metric.metric}: ${formatPercent(metric.score)} (${metric.correct}/${metric.total}${gate})`)
  }

  const failedFields = report.cases.flatMap(testCase =>
    testCase.fields
      .filter(field => !field.passed)
      .map(field => ({ caseId: testCase.caseId, field })),
  )

  if (failedFields.length === 0) {
    lines.push('', 'Mismatches: none')
  } else {
    lines.push('', 'Mismatches:')
    for (const { caseId, field } of failedFields) {
      lines.push(
        `- ${caseId} ${field.path}: expected ${JSON.stringify(field.expected)}, got ${JSON.stringify(field.actual)}${field.suggestion ? `. ${field.suggestion}` : ''}`,
      )
    }
  }

  if (report.suggestions.length > 0) {
    lines.push('', 'Suggested corrections:')
    for (const suggestion of report.suggestions) {
      lines.push(`- ${suggestion}`)
    }
  }

  return lines.join('\n')
}

function scoreCase(
  testCase: GalEvalCase,
  output: Record<string, unknown>,
  suiteFields: GalEvalField[],
): GalEvalCaseResult {
  const fields = testCase.fields ?? suiteFields
  const fieldResults = fields.map(field => scoreField(field, testCase, output))
  const totalWeight = fieldResults.reduce((sum, field) => sum + field.weight, 0)
  const score =
    totalWeight === 0
      ? 1
      : fieldResults.reduce((sum, field) => sum + field.score * field.weight, 0) / totalWeight

  return {
    caseId: testCase.id,
    title: testCase.title,
    tags: testCase.tags,
    score,
    passed: fieldResults.every(field => field.passed),
    output,
    fields: fieldResults,
  }
}

function scoreField(
  field: GalEvalField,
  testCase: GalEvalCase,
  output: Record<string, unknown>,
): GalEvalFieldResult {
  const expected = readPath(testCase.expected, field.path)
  const actual = readPath(output, field.path)
  const score = scoreValue(field.kind, expected, actual, field)
  const passed = score === 1

  return {
    path: field.path,
    metric: field.path,
    expected,
    actual,
    score,
    weight: field.weight ?? 1,
    passed,
    suggestion: passed ? undefined : suggestionForField(testCase, field, expected, actual),
  }
}

function buildMetrics(cases: GalEvalCaseResult[], suite: GalEvalSuite): GalEvalMetricResult[] {
  const metricNames = new Set<string>()
  for (const field of suite.fields) {
    metricNames.add(field.path)
  }
  for (const testCase of cases) {
    for (const field of testCase.fields) {
      metricNames.add(field.metric)
    }
  }

  const metrics: GalEvalMetricResult[] = Array.from(metricNames).map(metric => {
    const matching = cases.flatMap(testCase => testCase.fields.filter(field => field.metric === metric))
    const total = matching.length
    const correct = matching.filter(field => field.passed).length
    const score = total === 0 ? 1 : correct / total
    const gate = suite.gates.find(candidate => candidate.metric === metric || candidate.metric === 'overall')

    return {
      metric,
      score,
      correct,
      total,
      passed: gate ? score >= gate.minScore : true,
      gate,
    }
  })

  metrics.push(overallMetric(cases, suite))
  return metrics
}

function overallMetric(cases: GalEvalCaseResult[], suite: GalEvalSuite): GalEvalMetricResult {
  const total = cases.length
  const correct = cases.filter(testCase => testCase.passed).length
  const score = total === 0 ? 1 : correct / total
  const gate = suite.gates.find(candidate => candidate.metric === 'overall')

  return {
    metric: 'overall',
    score,
    correct,
    total,
    passed: gate ? score >= gate.minScore : true,
    gate,
  }
}

function scoreValue(kind: GalEvalFieldKind, expected: unknown, actual: unknown, field: GalEvalField): number {
  if (kind === 'number_range') {
    if (typeof actual !== 'number') {
      return 0
    }

    const min = field.min ?? Number.NEGATIVE_INFINITY
    const max = field.max ?? Number.POSITIVE_INFINITY
    return actual >= min && actual <= max ? 1 : 0
  }

  return Object.is(expected, actual) ? 1 : 0
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') {
      return undefined
    }

    return (value as Record<string, unknown>)[key]
  }, source)
}

function suggestionForField(
  testCase: GalEvalCase,
  field: GalEvalField,
  expected: unknown,
  actual: unknown,
): string {
  return `Case ${testCase.id} missed ${field.path}; expected ${JSON.stringify(expected)} but produced ${JSON.stringify(actual)}.`
}

function caseWeight(testCase: GalEvalCaseResult): number {
  return testCase.fields.reduce((sum, field) => sum + field.weight, 0)
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}
