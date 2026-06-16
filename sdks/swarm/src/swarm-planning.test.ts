import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'

import {
  GAL_SWARM_DECISION_SCHEMA_VERSION,
  GAL_SWARM_HOT_START_SLO_SCHEMA_VERSION,
  GAL_SWARM_ORCHESTRATION_MODES,
  GAL_SWARM_PLAN_SCHEMA_VERSION,
  GAL_SWARM_PUBLIC_TOPOLOGY_MODES,
  GAL_SWARM_TOPOLOGY_SCHEMA_VERSION,
  GAL_SWARM_TOPOLOGY_MODE_MAPPINGS,
  GAL_SWARM_WAVE_EVIDENCE_LEDGER_SCHEMA_VERSION,
  buildGalSwarmLoadFromForecast,
  calculateGalSwarmEffectiveUtilization,
  calculateGalSwarmPressure,
  createGalSwarmHotStartSloContract,
  createGalSwarmCalibrationSummary,
  createGalSwarmProviderActionPlan,
  createGalSwarmRunPlan,
  createGalSwarmTopologyPlan,
  createGalSwarmWaveEvidenceLedger,
  defaultGalSwarmPreflightComputeProfiles,
  defaultGalSwarmProviderIntegrationProfiles,
  decideGalSwarmHotStartSlo,
  decideGalSwarmCapacity,
  detectGalSwarmWaveLeaseConflicts,
  evaluateGalSwarmBurstPreflight,
  formatGalSwarmTopologyAliasHelp,
  highestRunnablePriority,
  listGalSwarmTopologyAliases,
  normalizeGalSwarmTopologyMode,
  orderGalSwarmTopologyTasks,
  planGalSwarmDecision,
  planGalSwarmDecisionFromForecast,
  rankGalSwarmProviders,
  routeGalSwarmTopology,
  scoreGalSwarmFleetPlacement,
  selectGalSwarmProvider,
  summarizeGalSwarmWaveEvidence,
  validateGalSwarmPlan,
  type GalSwarmCostSnapshot,
  type GalSwarmExecutionForecastInput,
  type GalSwarmFleetNode,
  type GalSwarmLoadSnapshot,
  type GalSwarmPlan,
  type GalSwarmProviderCandidate,
  type GalSwarmTopologyRequest,
  type GalSwarmWaveWorkerEvidence,
} from './swarm.js'
import {
  baseCost,
  baseForecast,
  baseLoad,
  basePlan,
  hotStartContract,
  h200Candidates,
  h200Plan,
  planWithServerlessFallback,
  topologyFleet,
  topologyRequest,
  topologyTask,
  waveWorker,
} from './test-support/swarm-fixtures.js'

describe('GAL swarm planning contracts', () => {
  it('includes Swarms-inspired orchestration shapes without binding to a Python runtime', () => {
    expect(GAL_SWARM_ORCHESTRATION_MODES).toEqual([
      'sequential',
      'concurrent',
      'graph',
      'hierarchical',
      'mixture',
      'group_chat',
      'forest',
      'heavy',
      'router',
    ])
  })

  it('calculates pressure and utilization from load snapshots', () => {
    expect(calculateGalSwarmEffectiveUtilization({ ...baseLoad(), activeWorkers: 10, busyWorkers: 7 })).toBe(0.7)
    expect(calculateGalSwarmPressure({ ...baseLoad(), expectedRuntimeMinutes: 180, targetCompletionWindowMinutes: 90 })).toBe(2)
  })

  it('selects the highest runnable priority using the plan order', () => {
    expect(
      highestRunnablePriority(basePlan(), {
        priorityMix: [
          { priorityClass: 'scheduled', runnableWorkUnits: 10, expectedRuntimeMinutes: 80 },
          { priorityClass: 'release-critical', runnableWorkUnits: 1, expectedRuntimeMinutes: 20 },
        ],
      }),
    ).toBe('release-critical')
  })

  it('scales up when pressure is high and spend is within budget', () => {
    const decision = planGalSwarmDecision(
      basePlan(),
      {
        ...baseLoad(),
        runnableWorkUnits: 24,
        activeWorkers: 2,
        busyWorkers: 2,
        idleWorkers: 0,
        expectedRuntimeMinutes: 240,
        targetCompletionWindowMinutes: 90,
      },
      baseCost(),
      { now: () => '2026-05-06T09:00:00.000Z' },
    )

    expect(decision).toEqual(
      expect.objectContaining({
        schemaVersion: GAL_SWARM_DECISION_SCHEMA_VERSION,
        action: 'scale_up',
        desiredWorkers: 4,
        provider: 'stratus',
        computeProfileId: 'runpod-cpu-burst',
        priorityClass: 'release-critical',
      }),
    )
  })

  it('holds capacity when utilization is worth the spend', () => {
    const decision = planGalSwarmDecision(basePlan(), {
      ...baseLoad(),
      runnableWorkUnits: 4,
      activeWorkers: 8,
      busyWorkers: 6,
      idleWorkers: 2,
      expectedRuntimeMinutes: 60,
      targetCompletionWindowMinutes: 90,
    }, baseCost())

    expect(decision.action).toBe('hold')
    expect(decision.reason).toContain('Current capacity is justified')
  })

  it('drains when capacity is underused but work still exists', () => {
    const decision = planGalSwarmDecision(basePlan(), {
      ...baseLoad(),
      runnableWorkUnits: 2,
      activeWorkers: 8,
      busyWorkers: 2,
      idleWorkers: 6,
      expectedRuntimeMinutes: 30,
      targetCompletionWindowMinutes: 90,
    }, baseCost())

    expect(decision.action).toBe('drain')
    expect(decision.desiredWorkers).toBe(2)
  })

  it('routes new work to serverless when self-hosted utilization drops below fallback threshold', () => {
    const decision = planGalSwarmDecision(planWithServerlessFallback(), {
      ...baseLoad(),
      runnableWorkUnits: 2,
      activeWorkers: 8,
      busyWorkers: 1,
      idleWorkers: 7,
      expectedRuntimeMinutes: 20,
      targetCompletionWindowMinutes: 90,
    }, baseCost())

    expect(decision).toEqual(
      expect.objectContaining({
        action: 'route_serverless',
        routingTarget: 'serverless',
        serverlessEndpointId: 'serverless-glm-mini',
        provider: 'stratus',
        desiredWorkers: 1,
      }),
    )
  })

  it('shuts down when there is no runnable work and utilization is low', () => {
    const decision = planGalSwarmDecision(basePlan(), {
      ...baseLoad(),
      queuedWorkUnits: 0,
      runnableWorkUnits: 0,
      activeWorkers: 5,
      busyWorkers: 0,
      idleWorkers: 5,
      expectedRuntimeMinutes: 0,
    }, baseCost())

    expect(decision.action).toBe('shutdown')
    expect(decision.desiredWorkers).toBe(0)
  })

  it('validates required plan shape before release', () => {
    const invalid = {
      ...basePlan(),
      schemaVersion: GAL_SWARM_PLAN_SCHEMA_VERSION,
      maxWorkers: 1,
      minWorkers: 2,
    }

    expect(() => validateGalSwarmPlan(invalid)).toThrow(
      'Swarm plan maxWorkers must be greater than or equal to minWorkers',
    )
  })

  it('builds swarm load snapshots from prediction forecasts without importing prediction runtime', () => {
    const load = buildGalSwarmLoadFromForecast(basePlan(), baseForecast(), {
      activeWorkers: 1,
      priorityClass: 'user-facing',
    })

    expect(load).toEqual(
      expect.objectContaining({
        queuedWorkUnits: 3,
        runnableWorkUnits: 2,
        activeWorkers: 1,
        busyWorkers: 1,
        expectedRuntimeMinutes: 104,
        targetCompletionWindowMinutes: 60,
      }),
    )
    expect(load.priorityMix).toEqual([
      { priorityClass: 'user-facing', runnableWorkUnits: 2, expectedRuntimeMinutes: 104 },
    ])
  })

  it('uses forecast recommendation to scale burst workers before execution starts', () => {
    const decision = planGalSwarmDecisionFromForecast(basePlan(), baseForecast(), baseCost(), {
      now: () => '2026-05-06T11:30:00.000Z',
      activeWorkers: 0,
    })

    expect(decision).toEqual(
      expect.objectContaining({
        schemaVersion: GAL_SWARM_DECISION_SCHEMA_VERSION,
        action: 'scale_up',
        desiredWorkers: 2,
        provider: 'stratus',
        computeProfileId: 'runpod-cpu-burst',
        priorityClass: 'release-critical',
      }),
    )
    expect(decision.reason).toContain('Prediction forecast recommends scale-up')
  })

  it('describes every burst provider integration surface', () => {
    const profiles = defaultGalSwarmProviderIntegrationProfiles()

    expect(profiles.map((profile) => profile.provider)).toEqual(['runpod', 'crusoe', 'gcp', 'aws', 'azure'])
    expect(profiles.find((profile) => profile.provider === 'runpod')).toEqual(
      expect.objectContaining({
        lifecycleSurface: 'pod',
        billingGranularity: 'second',
        adapterPackage: '@stratus/gpu-provider-runpod',
        metricsSurfaces: ['runtime_api', 'container_metrics'],
      }),
    )
    expect(profiles.find((profile) => profile.provider === 'crusoe')?.metricsSurfaces).toContain('dcgm_agent')
    expect(profiles.find((profile) => profile.provider === 'aws')?.billingGranularity).toBe('second')
    expect(profiles.find((profile) => profile.provider === 'azure')?.sdkPackages).toContain('@azure/arm-compute')
    expect(profiles.find((profile) => profile.provider === 'gcp')?.sdkPackages).toContain('@google-cloud/compute')
  })

  it('declares cheap GCP L4 spot preflight profiles before H200 bursts', () => {
    const profiles = defaultGalSwarmPreflightComputeProfiles()

    expect(profiles.map((profile) => profile.id)).toEqual([
      'gcp-l4-spot-glm-4-9b-tool-call-smoke',
      'gcp-l4-spot-qwen2-5-coder-7b-coding-smoke',
    ])
    expect(profiles.every((profile) => profile.provider === 'gcp')).toBe(true)
    expect(profiles.every((profile) => profile.spot === true)).toBe(true)
    expect(profiles.every((profile) => profile.zone === 'us-east4-a')).toBe(true)
    expect(profiles.every((profile) => profile.gpuType === 'NVIDIA L4')).toBe(true)
    expect(profiles.every((profile) => profile.gpuCount === 1)).toBe(true)
    expect(profiles.every((profile) => profile.maxDurationMinutes === 15)).toBe(true)
    expect(profiles.every((profile) => profile.maxSpendUsd === 0.1)).toBe(true)
    expect(profiles.every((profile) => profile.imageRef?.startsWith('us-docker.pkg.dev/gal-run/gal-swarm-preflight/'))).toBe(true)
    expect(profiles.every((profile) => profile.modelCache?.mode === 'hydrate_on_startup')).toBe(true)
    expect(profiles.every((profile) => profile.modelCache?.mountPath === '/models')).toBe(true)
    expect(profiles.every((profile) => profile.startupBudgetSeconds === 600)).toBe(true)
    expect(profiles.every((profile) => profile.readinessProbe?.path === '/v1/models')).toBe(true)
    expect(profiles.every((profile) => profile.shutdownPolicy?.deleteInstance === true)).toBe(true)
    expect(profiles.find((profile) => profile.purpose === 'tool_calling_smoke')?.modelId).toBe('zai-org/glm-4-9b-chat-hf')
    expect(profiles.find((profile) => profile.purpose === 'coding_smoke')?.modelId).toBe('Qwen/Qwen2.5-Coder-7B-Instruct')
  })

  it.skip('ranks RunPod first for a short H200 burst when public pricing is lower', () => {
    const selection = selectGalSwarmProvider({
      plan: h200Plan(),
      expectedRuntimeMinutes: 60,
      desiredWorkers: 1,
      candidates: h200Candidates(),
    })

    expect(selection.selected).toEqual(
      expect.objectContaining({
        provider: 'stratus',
        computeProfileId: 'runpod-h200-8x',
        estimatedCostUsd: 29.6773,
      }),
    )
    expect(selection.rankedCandidates.map((candidate) => candidate.provider)).toEqual([
      'runpod',
      'crusoe',
      'aws',
      'gcp',
      'azure',
    ])
  })

  it.skip('lets provider ranking drive scale-up decisions from forecasts', () => {
    const decision = planGalSwarmDecisionFromForecast(h200Plan(), baseForecast(), {
      ...baseCost(),
      provider: 'azure',
      projectedSpendUsd: 70,
    }, {
      activeWorkers: 0,
      providerCandidates: h200Candidates(),
    })

    expect(decision.action).toBe('scale_up')
    expect(decision.provider).toBe('runpod')
    expect(decision.computeProfileId).toBe('runpod-h200-8x')
  })

  it.skip('prices H200 compute units separately from logical forecast workers', () => {
    const decision = planGalSwarmDecisionFromForecast({ ...h200Plan(), maxWorkers: 40 }, {
      ...baseForecast(),
      capacity: {
        ...baseForecast().capacity,
        recommendedWorkers: 32,
        expectedUsefulWorkerMinutes: 1_400,
      },
    }, {
      ...baseCost(),
      provider: 'stratus',
      projectedSpendUsd: 40,
    }, {
      activeWorkers: 0,
      logicalWorkersPerComputeUnit: 32,
      providerCandidates: h200Candidates(),
    })

    expect(decision.action).toBe('scale_up')
    expect(decision.desiredWorkers).toBe(32)
    expect(decision.desiredComputeUnits).toBe(1)
    expect(decision.projectedSpendUsd).toBe(29.6773)
  })

  it('blocks burst startup when mechanical safety preflight fails', () => {
    const decision = planGalSwarmDecisionFromForecast(h200Plan(), baseForecast(), baseCost(), {
      activeWorkers: 0,
      logicalWorkersPerComputeUnit: 32,
      providerCandidates: h200Candidates(),
    })
    const preflight = evaluateGalSwarmBurstPreflight({
      plan: h200Plan(),
      decision,
      cost: baseCost(),
      runnableTaskCount: 2,
      blockedTaskCount: 1,
      maxAllowedSpendUsd: 40,
      maxAllowedComputeUnits: 1,
      runtimeTelemetryConfigured: false,
      providerCredentialsConfigured: false,
      requireNoDeployments: true,
    })

    expect(preflight.passed).toBe(false)
    expect(preflight.checks.find((check) => check.id === 'runtime-telemetry-configured')?.passed).toBe(false)
    expect(preflight.checks.find((check) => check.id === 'provider-credentials-configured')?.passed).toBe(false)
  })

  it.skip('keeps unavailable providers ranked but does not select them', () => {
    const ranked = rankGalSwarmProviders({
      plan: h200Plan(),
      expectedRuntimeMinutes: 60,
      desiredWorkers: 1,
      candidates: h200Candidates().map((candidate) =>
        candidate.provider === 'runpod' ? { ...candidate, available: false } : candidate,
      ),
    })
    const selection = selectGalSwarmProvider({
      plan: h200Plan(),
      expectedRuntimeMinutes: 60,
      desiredWorkers: 1,
      candidates: ranked,
    })

    expect(ranked.find((candidate) => candidate.provider === 'runpod')?.available).toBe(false)
    expect(selection.selected?.provider).toBe('crusoe')
  })

  it('falls back to swarm drain policy when forecast utilization is too low', () => {
    const decision = planGalSwarmDecisionFromForecast(
      basePlan(),
      {
        ...baseForecast(),
        capacity: {
          ...baseForecast().capacity,
          action: 'drain',
          recommendedWorkers: 1,
          expectedUtilization: 0.2,
          expectedUsefulWorkerMinutes: 20,
          reason: 'Forecast utilization is too low.',
        },
      },
      baseCost(),
      { activeWorkers: 4 },
    )

    expect(decision.action).toBe('drain')
  })

  it('uses forecast recommendation to shut down when prediction sees no useful runnable work', () => {
    const decision = planGalSwarmDecisionFromForecast(
      basePlan(),
      {
        ...baseForecast(),
        taskForecasts: [],
        capacity: {
          action: 'shutdown',
          recommendedWorkers: 0,
          expectedUtilization: 0,
          expectedUsefulWorkerMinutes: 0,
          expectedWastedWorkerMinutes: 0,
          reason: 'No useful pre-execution work is available for burst compute.',
        },
      },
      baseCost(),
      { activeWorkers: 3, busyWorkers: 0 },
    )

    expect(decision.action).toBe('shutdown')
    expect(decision.reason).toContain('Prediction forecast recommends shutdown')
  })

  it('preserves prediction-driven serverless fallback decisions', () => {
    const decision = planGalSwarmDecisionFromForecast(
      planWithServerlessFallback(),
      {
        ...baseForecast(),
        capacity: {
          ...baseForecast().capacity,
          action: 'route_serverless',
          recommendedWorkers: 1,
          expectedUtilization: 0.16,
          expectedUsefulWorkerMinutes: 15,
          reason: 'Useful work exists, but self-hosted utilization is below the serverless switch threshold.',
        },
      },
      baseCost(),
      { activeWorkers: 4, busyWorkers: 1 },
    )

    expect(decision.action).toBe('route_serverless')
    expect(decision.routingTarget).toBe('serverless')
    expect(decision.serverlessEndpointId).toBe('serverless-glm-mini')
  })
})
