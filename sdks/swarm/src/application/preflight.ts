import {
  GAL_SWARM_PREFLIGHT_SCHEMA_VERSION,
  type GalSwarmBurstPreflightInput,
  type GalSwarmBurstPreflightResult,
  type GalSwarmPreflightCheck,
  type GalSwarmPreflightSeverity,
} from '../contracts.js'
import { validateGalSwarmPlan } from './validation.js'

export function evaluateGalSwarmBurstPreflight(input: GalSwarmBurstPreflightInput): GalSwarmBurstPreflightResult {
  validateGalSwarmPlan(input.plan)

  const requireNoDeployments = input.requireNoDeployments ?? true
  const checks: GalSwarmPreflightCheck[] = [
    check(
      'decision-is-scale-up-or-hold',
      'Startup decision is actionable',
      'blocker',
      input.decision.action === 'scale_up' || input.decision.action === 'hold',
      `Decision action is ${input.decision.action}.`,
    ),
    check(
      'runnable-queue-present',
      'Runnable queue is present',
      'blocker',
      input.runnableTaskCount > 0,
      `${input.runnableTaskCount} runnable tasks are available.`,
    ),
    check(
      'blocked-work-not-dominant',
      'Blocked work does not dominate the burst',
      'blocker',
      input.blockedTaskCount <= input.runnableTaskCount,
      `${input.blockedTaskCount} blocked tasks vs ${input.runnableTaskCount} runnable tasks.`,
    ),
    check(
      'compute-units-within-cap',
      'Paid compute units are capped',
      'blocker',
      (input.decision.desiredComputeUnits ?? input.decision.desiredWorkers) <= input.maxAllowedComputeUnits,
      `Decision requests ${input.decision.desiredComputeUnits ?? input.decision.desiredWorkers} paid compute units; cap is ${input.maxAllowedComputeUnits}.`,
    ),
    check(
      'spend-within-cap',
      'Projected spend is capped',
      'blocker',
      input.decision.projectedSpendUsd <= input.maxAllowedSpendUsd && input.decision.projectedSpendUsd <= input.plan.maxSpendUsd,
      `Projected spend is $${input.decision.projectedSpendUsd}; cap is $${Math.min(input.maxAllowedSpendUsd, input.plan.maxSpendUsd)}.`,
    ),
    check(
      'provider-selected',
      'Provider candidate is selected',
      'blocker',
      Boolean(input.decision.provider && input.decision.computeProfileId),
      input.decision.provider ? `Selected ${input.decision.provider}/${input.decision.computeProfileId}.` : 'No provider selected.',
    ),
    check(
      'provider-available',
      'Selected provider is available',
      'blocker',
      input.selectedProvider ? input.selectedProvider.available : true,
      input.selectedProvider
        ? `${input.selectedProvider.provider} availability is ${input.selectedProvider.available}.`
        : 'No selected provider availability evidence was supplied.',
    ),
    check(
      'provider-cost-agrees',
      'Provider estimate agrees with decision spend',
      'blocker',
      input.selectedProvider ? input.decision.projectedSpendUsd === input.selectedProvider.estimatedCostUsd : true,
      input.selectedProvider
        ? `Provider estimate is $${input.selectedProvider.estimatedCostUsd}; decision spend is $${input.decision.projectedSpendUsd}.`
        : 'No selected provider cost evidence was supplied.',
    ),
    check(
      'runtime-telemetry-configured',
      'Runtime telemetry is configured',
      'blocker',
      input.runtimeTelemetryConfigured,
      input.runtimeTelemetryConfigured ? 'Runtime telemetry is configured.' : 'Runtime telemetry is missing.',
    ),
    check(
      'provider-credentials-configured',
      'Provider credentials are configured',
      'blocker',
      input.providerCredentialsConfigured,
      input.providerCredentialsConfigured ? 'Provider credentials are configured.' : 'Provider credentials are missing.',
    ),
    check(
      'drain-policy-present',
      'Drain policy is present',
      'blocker',
      input.plan.drainBelowUtilizationForSeconds > 0,
      `Drain threshold is ${input.plan.drainBelowUtilizationForSeconds}s.`,
    ),
    check(
      'shutdown-policy-present',
      'Shutdown policy is present',
      'blocker',
      input.plan.shutdownBelowUtilizationForSeconds > 0,
      `Shutdown threshold is ${input.plan.shutdownBelowUtilizationForSeconds}s.`,
    ),
    check(
      'duration-capped',
      'Burst duration is capped',
      'blocker',
      input.plan.maxDurationMinutes > 0 && input.plan.maxDurationMinutes <= 60,
      `Max duration is ${input.plan.maxDurationMinutes} minutes.`,
    ),
    check(
      'deployments-disabled',
      'Deployments are disabled for first burst',
      requireNoDeployments ? 'blocker' : 'warning',
      !requireNoDeployments || input.plan.permissions.allowDeployments === false,
      `allowDeployments is ${input.plan.permissions.allowDeployments}.`,
    ),
    check(
      'permissions-repo-scoped',
      'Repository permissions are scoped',
      'blocker',
      input.plan.permissions.allowedRepos.length > 0 && input.plan.permissions.allowedRepos.every((repo) => repo.includes('/')),
      `${input.plan.permissions.allowedRepos.length} repositories are allowed.`,
    ),
    check(
      'permissions-tools-scoped',
      'Tool permissions are scoped',
      'blocker',
      input.plan.permissions.allowedTools.length > 0,
      `${input.plan.permissions.allowedTools.length} tools are allowed.`,
    ),
    check(
      'queue-wait-target-present',
      'Queue wait target is present',
      'warning',
      input.plan.targetQueueWaitSeconds > 0,
      `Target queue wait is ${input.plan.targetQueueWaitSeconds}s.`,
    ),
    check(
      'utilization-target-present',
      'Utilization target is present',
      'warning',
      input.plan.minEffectiveUtilization > 0,
      `Minimum effective utilization is ${input.plan.minEffectiveUtilization}.`,
    ),
    check(
      'cost-snapshot-provider-matches',
      'Cost snapshot matches selected provider',
      'warning',
      input.decision.provider ? input.cost.provider === input.decision.provider : true,
      `Cost snapshot provider is ${input.cost.provider}; decision provider is ${input.decision.provider ?? 'none'}.`,
    ),
  ]

  const blockerCount = checks.filter((entry) => entry.severity === 'blocker' && !entry.passed).length
  const warningCount = checks.filter((entry) => entry.severity === 'warning' && !entry.passed).length

  return {
    schemaVersion: GAL_SWARM_PREFLIGHT_SCHEMA_VERSION,
    swarmId: input.plan.swarmId,
    passed: blockerCount === 0,
    blockerCount,
    warningCount,
    checks,
  }
}

function check(
  id: string,
  title: string,
  severity: GalSwarmPreflightSeverity,
  passed: boolean,
  reason: string,
): GalSwarmPreflightCheck {
  return { id, title, severity, passed, reason }
}
