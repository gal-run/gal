import {
  GAL_SWARM_DEFAULT_RUNNER_LABEL,
  GAL_SWARM_DEFAULT_RUNNER_LABELS,
  GAL_SWARM_LEGACY_RUNNER_LABELS,
  type GalSwarmRunApiEndpoints,
  type GalSwarmRunCreateResponse,
  type GalSwarmRunPlan,
  type GalSwarmRunnerLabel,
  type GalSwarmStoredRun,
  type GalSwarmWorkerDispatchRequest,
  type GalSwarmWorkerIssue,
} from '../contracts.js'

/**
 * Shared run/worker DTO helpers for API, CLI, MCP, and dashboard adapters.
 *
 * These helpers intentionally avoid Express, Firestore, dashboard, and CLI
 * dependencies. Runtime repos can import them without making gal-swarm own the
 * Swarm HTTP service or worker-session dispatcher.
 */

const NORMAL_RUNNER_LABELS = new Set<string>(GAL_SWARM_DEFAULT_RUNNER_LABELS)

export function normalizeGalSwarmRunnerLabel(value: unknown): GalSwarmRunnerLabel | undefined {
  const raw = optionalString(value)
  if (!raw) return undefined
  const normalized = GAL_SWARM_LEGACY_RUNNER_LABELS[raw as keyof typeof GAL_SWARM_LEGACY_RUNNER_LABELS] ?? raw
  return NORMAL_RUNNER_LABELS.has(normalized) ? normalized as GalSwarmRunnerLabel : undefined
}

export function normalizeGalSwarmRunnerLabels(value: unknown): GalSwarmRunnerLabel[] | undefined {
  const rawLabels = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : []
  const labels: GalSwarmRunnerLabel[] = []
  for (const rawLabel of rawLabels) {
    const label = normalizeGalSwarmRunnerLabel(rawLabel)
    if (label && !labels.includes(label)) {
      labels.push(label)
    }
  }
  return labels.length > 0 ? labels : undefined
}

export function normalizeGalSwarmWorkerIssues(value: unknown): GalSwarmWorkerIssue[] {
  const rawIssues = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { issues?: unknown }).issues)
      ? (value as { issues: unknown[] }).issues
      : []

  return rawIssues.flatMap((raw): GalSwarmWorkerIssue[] => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return []
    }
    const issue = raw as Record<string, unknown>
    const repository = optionalString(issue.repository) ?? optionalString(issue.repo)
    const issueNumber =
      optionalPositiveInteger(issue.issueNumber) ??
      optionalPositiveInteger(issue.issue) ??
      optionalPositiveInteger(issue.number)
    const title = optionalString(issue.title) ?? `Issue #${issueNumber}`
    if (!repository || !issueNumber) {
      return []
    }
    return [
      {
        repository,
        issueNumber,
        title,
        url: optionalString(issue.url),
        labels: Array.isArray(issue.labels)
          ? issue.labels.filter((label): label is string => typeof label === 'string' && label.length > 0)
          : undefined,
      },
    ]
  })
}

export function normalizeGalSwarmWorkerDispatchRequest(value: unknown): GalSwarmWorkerDispatchRequest | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  const raw = value as Record<string, unknown>
  const issues = normalizeGalSwarmWorkerIssues(raw.issues)
  return {
    enabled: raw.enabled === true && issues.length > 0,
    maxSessions: optionalPositiveInteger(raw.maxSessions),
    projectContext: optionalString(raw.projectContext),
    branch: optionalString(raw.branch),
    agent: optionalString(raw.agent),
    model: optionalString(raw.model),
    runnerLabel: normalizeGalSwarmRunnerLabel(raw.runnerLabel),
    runnerLabels: normalizeGalSwarmRunnerLabels(raw.runnerLabels),
    dispatchBackend: optionalString(raw.dispatchBackend),
    issues,
  }
}

export function getGalSwarmWorkerRunnerLabels(
  request: Pick<GalSwarmWorkerDispatchRequest, 'runnerLabel' | 'runnerLabels'>,
): GalSwarmRunnerLabel[] {
  if (request.runnerLabels?.length) {
    return request.runnerLabels
  }
  if (request.runnerLabel) {
    return [request.runnerLabel]
  }
  return [...GAL_SWARM_DEFAULT_RUNNER_LABELS]
}

export function clampGalSwarmWorkerSessionCount(
  requested: number | undefined,
  issueCount: number,
  maxAllowed = 256,
): number {
  if (issueCount <= 0) return 0
  const boundedRequested = Number.isFinite(requested) && requested && requested > 0
    ? Math.trunc(requested)
    : 1
  return Math.max(1, Math.min(issueCount, boundedRequested, maxAllowed))
}

export function createGalSwarmStoredRun(
  plan: GalSwarmRunPlan,
  options: {
    approvalEvidenceUrl?: string
    createdAt?: string
    updatedAt?: string
  } = {},
): GalSwarmStoredRun {
  const now = options.createdAt ?? new Date().toISOString()
  return {
    plan,
    approvalEvidenceUrl: options.approvalEvidenceUrl?.trim() || undefined,
    createdAt: now,
    updatedAt: options.updatedAt ?? now,
  }
}

export function createGalSwarmRunApiEndpoints(plan: Pick<GalSwarmRunPlan, 'orgName' | 'runId'>): GalSwarmRunApiEndpoints {
  return {
    dashboard: `/dashboard/swarm/${plan.runId}`,
    galCode: `gal swarm status ${plan.runId} --org ${plan.orgName}`,
    stratus: {
      pipelineWorkflow: 'gpu-swarm-pipeline.yml',
      preflightWorkflow: 'gpu-swarm-preflight.yml',
      burstStartWorkflow: 'gpu-swarm-burst-start.yml',
      burstRunWorkflow: 'gpu-swarm-burst-run.yml',
    },
  }
}

export function createGalSwarmRunCreateResponse(
  run: GalSwarmStoredRun,
  endpoints: GalSwarmRunApiEndpoints = createGalSwarmRunApiEndpoints(run.plan),
): GalSwarmRunCreateResponse {
  return {
    plan: run.plan,
    run,
    endpoints,
  }
}

export function synthesizeGalSwarmWorkerDispatchFromObjective(
  orgName: string,
  objective: string,
): GalSwarmWorkerDispatchRequest {
  return {
    enabled: true,
    issues: [
      {
        repository: orgName,
        issueNumber: 1,
        title: objective,
        url: '',
      },
    ],
    runnerLabels: [GAL_SWARM_DEFAULT_RUNNER_LABEL],
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function optionalPositiveInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
  }
  return undefined
}
