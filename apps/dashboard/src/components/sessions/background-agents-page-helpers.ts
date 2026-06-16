export interface BackgroundAgentsRepo {
  name: string
  fullName: string
  hasConfigs?: boolean
}

export interface SessionFailureDetails {
  category: string | null
  reason: string | null
  workflowConclusion: string | null
  failedStep: string | null
  workflowRunUrl: string | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function humanizeFailureCategory(category: string | null): string | null {
  switch (category) {
    case 'startup_failure':
      return 'Startup failure'
    case 'credential_error':
      return 'Credential error'
    case 'timeout':
      return 'Timeout'
    case 'runtime_error':
      return 'Runtime error'
    case 'command_expansion':
      return 'Command expansion'
    case 'preflight_rejection':
      return 'Preflight rejected'
    case 'manual':
      return 'Cancelled'
    default:
      return null
  }
}

export function reconcileSelectedRepo(
  previousSelection: BackgroundAgentsRepo | null,
  repos: BackgroundAgentsRepo[],
): BackgroundAgentsRepo | null {
  if (!previousSelection) {
    return null
  }

  return repos.some((repo) => repo.fullName === previousSelection.fullName)
    ? previousSelection
    : null
}

export function getSelectedRepoFullName(
  selectedRepo: BackgroundAgentsRepo | null,
): string | null {
  return selectedRepo?.fullName ?? selectedRepo?.name ?? null
}

export function resolveBranchFetchTarget(
  selectedRepoFullName: string | null,
  selectedOrgName: string | null,
): { owner: string; repo: string } | null {
  if (!selectedRepoFullName) {
    return null
  }

  const repoFullName = selectedRepoFullName.includes('/')
    ? selectedRepoFullName
    : `${selectedOrgName}/${selectedRepoFullName}`

  const [owner, repo] = repoFullName.split('/')
  if (!owner || !repo) {
    return null
  }

  return { owner, repo }
}

export function getSessionMetadataWarning(metadataValue: unknown): string | null {
  const metadata = asRecord(metadataValue)
  if (!metadata) return null

  const commandExpansion = asRecord(metadata.commandExpansion)
  const commandExpansionError = asText(commandExpansion?.error)
  const commandName = asText(commandExpansion?.command) || 'command'
  if (commandExpansion?.attempted === true && commandExpansion?.expanded === false && commandExpansionError) {
    return `[GAL] Command expansion failed for ${commandName}: ${commandExpansionError}`
  }

  const expansionError = asText(metadata.expansionError)
  if (expansionError) return expansionError

  const preflight = asRecord(metadata.preflight)
  const preflightReason = asText(preflight?.rejectionReason)
  if (preflightReason) return preflightReason

  const dispatchReadiness = asRecord(metadata.dispatchReadiness)
  const failure = asRecord(dispatchReadiness?.failure)
  const failureMessage = asText(failure?.message)
  if (failureMessage) return failureMessage

  return null
}

export function getSessionFailureDetails(
  metadataValue: unknown,
  errorMessage?: string | null,
): SessionFailureDetails | null {
  const metadata = asRecord(metadataValue)
  const failureCategory = humanizeFailureCategory(asText(metadata?.failureCategory))
  const workflowConclusion = asText(metadata?.workflowConclusion)
  const failedStep = asText(metadata?.failedStep)
  const workflowRunUrl = asText(metadata?.workflowRunUrl)
  const reason =
    asText(errorMessage) ||
    (failedStep ? `Workflow failed at step "${failedStep}"` : null) ||
    getSessionMetadataWarning(metadataValue) ||
    (workflowConclusion ? `Workflow concluded: ${workflowConclusion}` : null)

  if (!failureCategory && !workflowConclusion && !failedStep && !workflowRunUrl && !reason) {
    return null
  }

  return {
    category: failureCategory,
    reason,
    workflowConclusion,
    failedStep,
    workflowRunUrl,
  }
}
