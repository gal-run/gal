import type { GalEvalReport } from './types.js'

export interface SubmitEvaluationReportOptions {
  apiBaseUrl: string
  orgName: string
  agentId: string
  version: string
  runId: string
  bearerToken?: string
}

export interface SubmittedEvalRun {
  runId: string
  status: string
  gateStatus: string
  [key: string]: unknown
}

export interface ManagedAgentEvalWorkPacket {
  schemaVersion: 'gal.managed_agents.eval_work_packet.v1'
  agent: Record<string, unknown>
  version: Record<string, unknown>
  evalRun: SubmittedEvalRun
  submission: {
    method: 'POST'
    path: string
    reportSchemaVersion: 'gal.evals.report.v1'
  }
}

type FetchLike = typeof fetch

function buildEvalRunBasePath(options: SubmitEvaluationReportOptions): string {
  return [
    'api',
    'managed-agents',
    encodeURIComponent(options.orgName),
    encodeURIComponent(options.agentId),
    'versions',
    encodeURIComponent(options.version),
    'eval-runs',
    encodeURIComponent(options.runId),
  ].join('/')
}

export function buildReportSubmissionUrl(options: SubmitEvaluationReportOptions): string {
  const baseUrl = options.apiBaseUrl.replace(/\/+$/, '')
  return [baseUrl, buildEvalRunBasePath(options), 'report'].join('/')
}

export function buildEvalRunClaimUrl(options: SubmitEvaluationReportOptions): string {
  const baseUrl = options.apiBaseUrl.replace(/\/+$/, '')
  return [baseUrl, buildEvalRunBasePath(options), 'claim'].join('/')
}

function buildHeaders(bearerToken: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (bearerToken) {
    headers['Authorization'] = `Bearer ${bearerToken}`
  }
  return headers
}

export async function claimEvaluationRun(
  options: SubmitEvaluationReportOptions,
  fetchImpl: FetchLike = fetch,
): Promise<ManagedAgentEvalWorkPacket> {
  const response = await fetchImpl(buildEvalRunClaimUrl(options), {
    method: 'POST',
    headers: buildHeaders(options.bearerToken),
    body: JSON.stringify({}),
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      typeof data?.error === 'string'
        ? data.error
        : typeof data?.message === 'string'
          ? data.message
          : 'Failed to claim evaluation run'
    throw new Error(message)
  }

  if (!data?.workPacket || typeof data.workPacket !== 'object') {
    throw new Error('Eval run claim response did not include workPacket')
  }

  return data.workPacket as ManagedAgentEvalWorkPacket
}

export async function submitEvaluationReport(
  report: GalEvalReport,
  options: SubmitEvaluationReportOptions,
  fetchImpl: FetchLike = fetch,
): Promise<SubmittedEvalRun> {
  const response = await fetchImpl(buildReportSubmissionUrl(options), {
    method: 'POST',
    headers: buildHeaders(options.bearerToken),
    body: JSON.stringify({ reportSnapshot: report }),
  })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      typeof data?.error === 'string'
        ? data.error
        : typeof data?.message === 'string'
          ? data.message
          : 'Failed to submit evaluation report'
    throw new Error(message)
  }

  if (!data?.evalRun || typeof data.evalRun !== 'object') {
    throw new Error('Report submission response did not include evalRun')
  }

  return data.evalRun as SubmittedEvalRun
}
