import { describe, expect, it } from 'vitest'
import {
  applyGalPredictionCalibration,
  buildGalPredictionRequestFromGitHubDependencies,
  buildKimiK26AgentSwarmExecutionRequirements,
  calibrateGalPredictionFromTraces,
  calculateGalPredictionClusterUtilization,
  defaultGalPredictionPreflightModelCapabilityProfiles,
  defaultGalPredictionPreflightThroughputProfiles,
  evaluateGalPredictionBurstReadiness,
  evaluateGalPredictionModelFit,
  forecastGalExecution,
  GAL_EXECUTION_TRACE_SCHEMA_VERSION,
  GAL_GITHUB_DEPENDENCY_SOURCE_SCHEMA_VERSION,
  GAL_PREDICTION_REQUEST_SCHEMA_VERSION,
  type GalPredictionExecutionTrace,
  type GalPredictionGitHubDependencySource,
  type GalPredictionModelThroughputProfile,
  type GalPredictionRequest,
} from './prediction.js'

const baseRequest: GalPredictionRequest = {
  schemaVersion: GAL_PREDICTION_REQUEST_SCHEMA_VERSION,
  requestId: 'forecast-1',
  horizonMinutes: 60,
  maxWorkers: 8,
  workerStartupMinutes: 4,
  targetUtilization: 0.7,
  tasks: [
    {
      id: 'map',
      title: 'Map dependency graph',
      kind: 'planning',
      priority: 10,
      dependsOn: [],
      expectedInputTokens: 6_000,
      expectedOutputTokens: 2_000,
      expectedReasoningTokens: 4_000,
      baseExecutionMinutes: 12,
      toolProfiles: [{ toolKind: 'filesystem', expectedCalls: 8, expectedWallClockMinutes: 4, blockingProbability: 0 }],
      canRunInParallel: false,
      requiredAgentCapabilities: ['repo-read'],
      repository: 'acme/app',
    },
    {
      id: 'ci-heavy',
      title: 'Run release validation',
      kind: 'ci_cd',
      priority: 9,
      dependsOn: ['map'],
      expectedInputTokens: 3_000,
      expectedOutputTokens: 1_000,
      expectedReasoningTokens: 1_000,
      baseExecutionMinutes: 6,
      toolProfiles: [{ toolKind: 'github', expectedCalls: 5, expectedWallClockMinutes: 3, blockingProbability: 0.2 }],
      ciProfiles: [
        {
          workflowName: 'CI',
          expectedRuntimeMinutes: 25,
          expectedQueueMinutes: 8,
          failureProbability: 0.15,
          rerunProbability: 0.25,
        },
      ],
      canRunInParallel: true,
      requiredAgentCapabilities: ['github-actions'],
      repository: 'acme/app',
    },
    {
      id: 'token-heavy',
      title: 'Implement split',
      kind: 'coding',
      priority: 8,
      dependsOn: ['map'],
      expectedInputTokens: 80_000,
      expectedOutputTokens: 18_000,
      expectedReasoningTokens: 45_000,
      baseExecutionMinutes: 45,
      toolProfiles: [{ toolKind: 'shell', expectedCalls: 26, expectedWallClockMinutes: 18, blockingProbability: 0.05 }],
      canRunInParallel: true,
      requiredAgentCapabilities: ['typescript', 'tests'],
      repository: 'acme/app',
    },
  ],
}

describe('forecastGalExecution', () => {
  it('aggregates token, tool, CI, and dependency forecasts', () => {
    const forecast = forecastGalExecution(baseRequest, { now: () => '2026-05-06T10:00:00.000Z' })

    expect(forecast.expectedTokens).toBe(160_000)
    expect(forecast.expectedToolCalls).toBe(39)
    expect(forecast.expectedCiMinutes).toBe(35)
    expect(forecast.dependencyMap['token-heavy']).toEqual(['map'])
    expect(forecast.generatedAt).toBe('2026-05-06T10:00:00.000Z')
    expect(forecast.taskForecasts[0].executionRequirements).toEqual(
      expect.objectContaining({
        backend: 'gal_agents',
        mode: 'model_agent',
        estimatedConcurrentAgents: 1,
        requiresHostedRuntime: false,
      }),
    )
    expect(forecast.taskForecasts[0].executionRequirements.sandbox).toEqual(
      expect.objectContaining({
        isolationLevel: 'container',
        allowedRepos: ['acme/app'],
        allowedTools: ['filesystem', 'repo-read'],
        requiresFilesystem: true,
      }),
    )
  })

  it('identifies the actual critical path rather than just the most token-heavy task class', () => {
    const forecast = forecastGalExecution(baseRequest)

    expect(forecast.criticalPathTaskIds).toEqual(['map', 'token-heavy'])
    expect(forecast.criticalPathMinutes).toBe(79)
  })

  it('marks CI-bound and parallelizable work separately', () => {
    const forecast = forecastGalExecution(baseRequest)

    expect(forecast.ciBoundTaskIds).toEqual(['ci-heavy'])
    expect(forecast.parallelizableTaskIds).toEqual(['ci-heavy', 'token-heavy'])
  })

  it('recommends scale-up when useful worker minutes justify a one-hour burst', () => {
    const forecast = forecastGalExecution(baseRequest)

    expect(forecast.capacity.action).toBe('scale_up')
    expect(forecast.capacity.recommendedWorkers).toBeGreaterThanOrEqual(2)
    expect(forecast.capacity.expectedUtilization).toBeGreaterThan(0.55)
  })

  it('routes low-utilization forecast work to serverless fallback when configured', () => {
    const forecast = forecastGalExecution({
      ...baseRequest,
      requestId: 'serverless-tail',
      maxWorkers: 8,
      workerStartupMinutes: 20,
      serverlessFallback: {
        enabled: true,
        endpointId: 'serverless-glm-mini',
        switchBelowUtilization: 0.25,
        minSustainSeconds: 300,
      },
      tasks: [
        {
          ...baseRequest.tasks[0],
          id: 'tail-doc',
          dependsOn: [],
          baseExecutionMinutes: 3,
          expectedInputTokens: 500,
          expectedOutputTokens: 250,
          expectedReasoningTokens: 250,
          toolProfiles: [],
          canRunInParallel: true,
        },
      ],
    })

    expect(forecast.capacity.action).toBe('route_serverless')
    expect(forecast.capacity.reason).toContain('serverless fallback')
  })

  it('recommends shutdown when there are no forecast tasks', () => {
    const forecast = forecastGalExecution({
      ...baseRequest,
      requestId: 'empty',
      tasks: [],
    })

    expect(forecast.capacity.action).toBe('shutdown')
    expect(forecast.capacity.recommendedWorkers).toBe(0)
  })

  it('forecasts token-level capacity, cluster billable minutes, and cost for an H200 burst profile', () => {
    const forecast = forecastGalExecution({
      ...baseRequest,
      throughputProfiles: [h200ThroughputProfile()],
      tasks: baseRequest.tasks.map((task) => ({
        ...task,
        executionRequirements: {
          ...(task.executionRequirements ?? buildKimiK26AgentSwarmExecutionRequirements()),
          backend: 'gal_agents',
          mode: 'gal_managed_swarm',
          modelId: 'glm-5-fp8',
          provider: 'runpod',
          requiresHostedRuntime: true,
          sandbox: {
            isolationLevel: 'microvm',
            allowedRepos: [task.repository ?? 'acme/app'],
            allowedSecrets: ['model-registry-token'],
            allowedNetworks: ['api.github.com', 'huggingface.co'],
            allowedTools: ['gh', 'shell', 'vllm'],
            requiresFilesystem: true,
            requiresNetwork: true,
            requiresGpu: true,
            allowDeployments: false,
            minCpuCores: 64,
            minMemoryGb: 512,
            minDiskGb: 1_000,
          },
        },
      })),
    })

    const tokenHeavy = forecast.taskForecasts.find((task) => task.taskId === 'token-heavy')
    expect(tokenHeavy?.tokenCapacity).toEqual(
      expect.objectContaining({
        profileId: 'runpod-h200-8x-glm-5-fp8',
        modelId: 'glm-5-fp8',
        provider: 'runpod',
        gpuType: 'NVIDIA H200 SXM',
        gpuCount: 8,
        contextFits: true,
      }),
    )
    expect(tokenHeavy?.tokenCapacity?.expectedRuntimeMinutes).toBeGreaterThan(0.4)
    expect(forecast.capacity.clusterCapacity).toEqual(
      expect.objectContaining({
        profileId: 'runpod-h200-8x-glm-5-fp8',
        billableClusterMinutes: 60,
        expectedStartupSeconds: 900,
        contextFits: true,
      }),
    )
    expect(forecast.capacity.clusterCapacity?.plannedClusterMinutes).toBeGreaterThan(25)
    expect(forecast.capacity.clusterCapacity?.projectedCostUsd).toBeCloseTo(34.48, 2)
  })

  it('blocks burst startup when forecast confidence is too low or human-gated work dominates', () => {
    const forecast = forecastGalExecution({
      ...baseRequest,
      throughputProfiles: [h200ThroughputProfile()],
      tasks: baseRequest.tasks.map((task) => ({
        ...task,
        toolProfiles: [...task.toolProfiles, { toolKind: 'human', expectedCalls: 1, expectedWallClockMinutes: 60, blockingProbability: 0.95 }],
        blockerKind: 'human',
      })),
    })
    const readiness = evaluateGalPredictionBurstReadiness(forecast, {
      minConfidence: 0.35,
      maxBlockedTaskRatio: 0.2,
      maxClusterCostUsd: 50,
      maxBillableClusterMinutes: 60,
    })

    expect(readiness.ready).toBe(false)
    expect(readiness.blockerCount).toBeGreaterThan(0)
    expect(readiness.checks.find((check) => check.id === 'blocked-ratio-safe')?.passed).toBe(false)
  })

  it('passes burst readiness for a bounded machine-runnable H200 forecast', () => {
    const forecast = forecastGalExecution({
      ...baseRequest,
      throughputProfiles: [h200ThroughputProfile()],
      tasks: baseRequest.tasks.map((task) => ({
        ...task,
        executionRequirements: {
          ...(task.executionRequirements ?? buildKimiK26AgentSwarmExecutionRequirements()),
          backend: 'gal_agents',
          mode: 'gal_managed_swarm',
          modelId: 'glm-5-fp8',
          provider: 'runpod',
          requiresHostedRuntime: true,
          sandbox: {
            isolationLevel: 'microvm',
            allowedRepos: [task.repository ?? 'acme/app'],
            allowedSecrets: ['model-registry-token'],
            allowedNetworks: ['api.github.com'],
            allowedTools: ['gh', 'shell', 'vllm'],
            requiresFilesystem: true,
            requiresNetwork: true,
            requiresGpu: true,
            allowDeployments: false,
          },
        },
      })),
    })
    const readiness = evaluateGalPredictionBurstReadiness(forecast, {
      minConfidence: 0.35,
      maxBlockedTaskRatio: 0.2,
      maxClusterCostUsd: 50,
      maxBillableClusterMinutes: 60,
    })

    expect(readiness.ready).toBe(true)
    expect(readiness.runnableTaskCount).toBe(3)
    expect(readiness.checks.find((check) => check.id === 'cluster-context-fits')?.passed).toBe(true)
  })

  it('marks small smoke models as startup validation only for release-heavy work', () => {
    const forecast = forecastGalExecution(baseRequest)
    const fit = evaluateGalPredictionModelFit(forecast, {
      id: 'smoke-7b-1xl40s',
      modelId: 'smoke-7b',
      qualityTier: 'smoke',
      maxContextTokens: 32_000,
      maxTaskTokens: 20_000,
      maxToolCalls: 12,
      supportsCodeEditing: false,
      supportsCiDebugging: false,
      supportsReleaseWork: false,
      supportsLongHorizonPlanning: false,
      supportsAutonomousExecution: false,
    })

    expect(fit.totalTasks).toBe(3)
    expect(fit.smokeTestableTasks).toBeGreaterThan(0)
    expect(fit.solvableTasks).toBeLessThan(fit.totalTasks)
    expect(fit.taskFits.find((task) => task.taskId === 'token-heavy')?.canSolve).toBe(false)
  })

  it('separates the cheap GLM tool-call smoke from the Qwen coding smoke', () => {
    const forecast = forecastGalExecution(baseRequest)
    const profiles = defaultGalPredictionPreflightModelCapabilityProfiles()

    const glmToolFit = evaluateGalPredictionModelFit(
      forecast,
      profiles.find((profile) => profile.id === 'gcp-l4-spot-glm-4-9b-tool-call-smoke')!,
    )
    const qwenCodingFit = evaluateGalPredictionModelFit(
      forecast,
      profiles.find((profile) => profile.id === 'gcp-l4-spot-qwen2-5-coder-7b-coding-smoke')!,
    )

    expect(glmToolFit.modelId).toBe('zai-org/glm-4-9b-chat-hf')
    expect(glmToolFit.taskFits.find((task) => task.taskId === 'map')?.canSmokeTest).toBe(true)
    expect(glmToolFit.taskFits.find((task) => task.taskId === 'token-heavy')?.canSolve).toBe(false)
    expect(qwenCodingFit.modelId).toBe('Qwen/Qwen2.5-Coder-7B-Instruct')
    expect(qwenCodingFit.taskFits.find((task) => task.taskId === 'map')?.canSmokeTest).toBe(false)
    expect(qwenCodingFit.taskFits.find((task) => task.taskId === 'token-heavy')?.canSolve).toBe(false)
  })

  it('publishes cheap GCP L4 spot throughput profiles for first preflight runs', () => {
    const profiles = defaultGalPredictionPreflightThroughputProfiles()

    expect(profiles.map((profile) => profile.id)).toEqual([
      'gcp-l4-spot-glm-4-9b-tool-call-smoke',
      'gcp-l4-spot-qwen2-5-coder-7b-coding-smoke',
    ])
    expect(profiles.every((profile) => profile.provider === 'gcp')).toBe(true)
    expect(profiles.every((profile) => profile.gpuType === 'NVIDIA L4')).toBe(true)
    expect(profiles.every((profile) => profile.gpuCount === 1)).toBe(true)
    expect(profiles.every((profile) => profile.hourlyCostUsd === 0.282)).toBe(true)
    expect(profiles.every((profile) => profile.minBillableSeconds === 60)).toBe(true)
    expect(profiles.every((profile) => profile.imageRef?.startsWith('us-docker.pkg.dev/gal-run/gal-swarm-preflight/'))).toBe(true)
    expect(profiles.every((profile) => profile.modelCacheMode === 'hydrate_on_startup')).toBe(true)
    expect(profiles.every((profile) => profile.modelCacheHitProbability === 0.85)).toBe(true)
    expect(profiles.every((profile) => profile.startupBudgetSeconds === 600)).toBe(true)
    expect(profiles.every((profile) => profile.coldStartSeconds < 600)).toBe(true)
  })

  it('marks frontier-capable profiles as execution-capable when task size fits', () => {
    const forecast = forecastGalExecution(baseRequest)
    const fit = evaluateGalPredictionModelFit(forecast, {
      id: 'frontier-h200',
      modelId: 'glm-5.1',
      qualityTier: 'frontier',
      maxContextTokens: 200_000,
      maxTaskTokens: 200_000,
      maxToolCalls: 200,
      supportsCodeEditing: true,
      supportsCiDebugging: true,
      supportsReleaseWork: true,
      supportsLongHorizonPlanning: true,
      supportsAutonomousExecution: true,
    })

    expect(fit.solvableTasks).toBe(3)
  })

  it('blocks missing dependencies', () => {
    expect(() =>
      forecastGalExecution({
        ...baseRequest,
        tasks: [{ ...baseRequest.tasks[0], dependsOn: ['missing'] }],
      }),
    ).toThrow('depends on missing task')
  })

  it('blocks cyclic dependencies', () => {
    expect(() =>
      forecastGalExecution({
        ...baseRequest,
        tasks: [
          { ...baseRequest.tasks[0], id: 'a', dependsOn: ['b'] },
          { ...baseRequest.tasks[1], id: 'b', dependsOn: ['a'] },
        ],
      }),
    ).toThrow('Cycle detected')
  })
})

describe('cluster runtime utilization', () => {
  it('recommends scale-up while runtime token throughput or GPU pressure is saturated', () => {
    const utilization = calculateGalPredictionClusterUtilization(
      {
        profileId: 'runpod-h200-8x-glm-5-fp8',
        observedAt: '2026-05-06T13:00:00.000Z',
        activeWorkers: 8,
        busyWorkers: 7,
        idleWorkers: 1,
        queuedRequests: 28,
        runningRequests: 64,
        inputTokensPerSecond: 52_000,
        outputTokensPerSecond: 1_900,
        reasoningTokensPerSecond: 1_100,
        gpuUtilizationRatio: 0.91,
        gpuMemoryUtilizationRatio: 0.82,
        queueWaitSeconds: 45,
        providerStatus: 'running',
      },
      h200ThroughputProfile(),
    )

    expect(utilization.action).toBe('scale_up')
    expect(utilization.tokenThroughputUtilization).toBeGreaterThan(0.75)
    expect(utilization.workerUtilization).toBeGreaterThan(0.8)
    expect(utilization.queuePressure).toBeGreaterThan(0.15)
  })

  it('recommends shutdown after the cluster is idle and empty', () => {
    const utilization = calculateGalPredictionClusterUtilization(
      {
        profileId: 'runpod-h200-8x-glm-5-fp8',
        observedAt: '2026-05-06T13:30:00.000Z',
        activeWorkers: 8,
        busyWorkers: 0,
        idleWorkers: 8,
        queuedRequests: 0,
        runningRequests: 0,
        inputTokensPerSecond: 0,
        outputTokensPerSecond: 0,
        gpuUtilizationRatio: 0.03,
        gpuMemoryUtilizationRatio: 0.06,
        queueWaitSeconds: 0,
        providerStatus: 'running',
      },
      h200ThroughputProfile(),
    )

    expect(utilization.action).toBe('shutdown')
    expect(utilization.effectiveUtilization).toBeLessThan(0.12)
  })

  it('recommends serverless fallback when running cluster utilization is too low for self-hosted capacity', () => {
    const utilization = calculateGalPredictionClusterUtilization(
      {
        profileId: 'runpod-h200-8x-glm-5-fp8',
        observedAt: '2026-05-06T13:45:00.000Z',
        activeWorkers: 8,
        busyWorkers: 1,
        idleWorkers: 7,
        queuedRequests: 2,
        runningRequests: 1,
        inputTokensPerSecond: 500,
        outputTokensPerSecond: 30,
        gpuUtilizationRatio: 0.08,
        gpuMemoryUtilizationRatio: 0.12,
        queueWaitSeconds: 3,
        providerStatus: 'running',
      },
      h200ThroughputProfile(),
      {
        serverlessFallback: {
          enabled: true,
          endpointId: 'serverless-glm-mini',
          switchBelowUtilization: 0.25,
          minSustainSeconds: 300,
        },
      },
    )

    expect(utilization.action).toBe('route_serverless')
    expect(utilization.reason).toContain('serverless fallback threshold')
  })
})

describe('trace calibration', () => {
  it('aggregates token, tool, CI, rerun, failure, and blocker traces deterministically', () => {
    const calibration = calibrateGalPredictionFromTraces(baseTraces(), {
      now: () => '2026-05-06T12:00:00.000Z',
      taskKind: 'coding',
      repository: 'acme/app',
    })

    expect(calibration).toEqual(
      expect.objectContaining({
        schemaVersion: 'gal.trace-calibration.v1',
        traceCount: 2,
        taskKind: 'coding',
        repository: 'acme/app',
        avgInputTokens: 90_000,
        avgOutputTokens: 20_000,
        avgReasoningTokens: 50_000,
        avgBaseExecutionMinutes: 60,
        generatedAt: '2026-05-06T12:00:00.000Z',
      }),
    )
    expect(calibration.avgToolCallsByKind.shell).toBe(30)
    expect(calibration.avgToolMinutesByKind.shell).toBe(21)
    expect(calibration.avgCiRuntimeMinutesByWorkflow.CI).toBe(26)
    expect(calibration.avgCiQueueMinutesByWorkflow.CI).toBe(9)
    expect(calibration.ciFailureProbabilityByWorkflow.CI).toBe(0.5)
    expect(calibration.ciRerunProbabilityByWorkflow.CI).toBe(0.5)
    expect(calibration.blockerProbabilityByKind.none).toBe(0.5)
    expect(calibration.blockerProbabilityByKind.ci).toBe(0.5)
  })

  it('applies calibration to task estimates without changing forecast schema', () => {
    const calibration = calibrateGalPredictionFromTraces(baseTraces(), {
      taskKind: 'coding',
      repository: 'acme/app',
    })
    const calibratedTask = applyGalPredictionCalibration(baseRequest.tasks[2], calibration)
    const forecast = forecastGalExecution({
      ...baseRequest,
      tasks: [baseRequest.tasks[0], calibratedTask],
    })

    expect(calibratedTask.expectedInputTokens).toBe(90_000)
    expect(calibratedTask.expectedOutputTokens).toBe(20_000)
    expect(calibratedTask.expectedReasoningTokens).toBe(50_000)
    expect(calibratedTask.baseExecutionMinutes).toBe(60)
    expect(calibratedTask.toolProfiles[0].expectedCalls).toBe(30)
    expect(calibratedTask.toolProfiles[0].expectedWallClockMinutes).toBe(21)
    expect(forecast.schemaVersion).toBe('gal.execution-forecast.v1')
    expect(forecast.expectedTokens).toBe(172_000)
  })

  it('returns unchanged task estimates for empty calibration', () => {
    const calibration = calibrateGalPredictionFromTraces([], { taskKind: 'coding' })
    const calibratedTask = applyGalPredictionCalibration(baseRequest.tasks[2], calibration)

    expect(calibratedTask).toEqual(baseRequest.tasks[2])
  })

  it('validates trace timing and duplicate trace IDs', () => {
    expect(() =>
      calibrateGalPredictionFromTraces([
        {
          ...baseTraces()[0],
          finishedAt: '2026-05-06T09:00:00.000Z',
          startedAt: '2026-05-06T10:00:00.000Z',
        },
      ]),
    ).toThrow('finishedAt must be after startedAt')

    expect(() => calibrateGalPredictionFromTraces([baseTraces()[0], baseTraces()[0]])).toThrow(
      'Duplicate execution trace id',
    )
  })
})

describe('GitHub dependency ingestion', () => {
  it('converts cross-repo GitHub dependency nodes into forecastable task edges', () => {
    const request = buildGalPredictionRequestFromGitHubDependencies(baseGitHubDependencySource(), {
      requestId: 'dependency-map-1',
      horizonMinutes: 60,
      maxWorkers: 6,
      workerStartupMinutes: 4,
      targetUtilization: 0.7,
      defaultTokenEstimate: 5_000,
      defaultExecutionMinutes: 8,
    })
    const forecast = forecastGalExecution(request)

    expect(request.schemaVersion).toBe(GAL_PREDICTION_REQUEST_SCHEMA_VERSION)
    expect(request.tasks.map((task) => task.id)).toEqual([
      'agent-network-3',
      'stratus-3279',
      'agent-network-ci',
      'agent-network-release',
      'prod-deploy',
      'status-page',
    ])
    expect(forecast.dependencyMap['stratus-3279']).toEqual(['agent-network-3'])
    expect(forecast.dependencyMap['agent-network-release']).toEqual(['agent-network-ci', 'stratus-3279'])
    expect(forecast.criticalPathTaskIds).toEqual([
      'agent-network-3',
      'stratus-3279',
      'agent-network-ci',
      'agent-network-release',
      'prod-deploy',
      'status-page',
    ])
  })

  it('infers blockers and capabilities from GitHub node shape', () => {
    const request = buildGalPredictionRequestFromGitHubDependencies(baseGitHubDependencySource(), {
      requestId: 'dependency-map-2',
      horizonMinutes: 60,
      maxWorkers: 6,
      workerStartupMinutes: 4,
      targetUtilization: 0.7,
    })

    const byId = new Map(request.tasks.map((task) => [task.id, task]))
    expect(byId.get('stratus-3279')).toEqual(
      expect.objectContaining({
        kind: 'review',
        blockerKind: 'review',
        requiredAgentCapabilities: ['github', 'review'],
        repository: 'StratusCloudLabs/stratus',
      }),
    )
    expect(byId.get('agent-network-ci')?.ciProfiles).toEqual([
      {
        workflowName: 'CI',
        expectedRuntimeMinutes: 25,
        expectedQueueMinutes: 10,
        failureProbability: 0.2,
        rerunProbability: 0.2,
      },
      {
        workflowName: 'API build',
        expectedRuntimeMinutes: 35,
        expectedQueueMinutes: 5,
        failureProbability: 0.8,
        rerunProbability: 0.5,
      },
    ])
    expect(byId.get('prod-deploy')).toEqual(
      expect.objectContaining({
        kind: 'release',
        blockerKind: 'deployment',
        requiredAgentCapabilities: ['github', 'deploy'],
      }),
    )
    expect(byId.get('status-page')).toEqual(
      expect.objectContaining({
        kind: 'other',
        blockerKind: 'external_service',
        requiredAgentCapabilities: ['github', 'network'],
      }),
    )
    expect(byId.get('status-page')?.executionRequirements).toEqual(
      expect.objectContaining({
        backend: 'kimi_k2_6',
        mode: 'model_agent_swarm',
        modelId: 'kimi-k2.6',
        provider: 'moonshot',
        maxSubAgents: 300,
        toolCallBudget: 4_000,
        requiresHostedRuntime: true,
      }),
    )
    expect(byId.get('status-page')?.executionRequirements?.sandbox).toEqual(
      expect.objectContaining({
        isolationLevel: 'hosted_external',
        allowedNetworks: ['status.example.com'],
        allowedTools: ['kimi-agent-swarm', 'web-search'],
        requiresNetwork: true,
      }),
    )
    expect(byId.get('prod-deploy')?.executionRequirements?.sandbox).toEqual(
      expect.objectContaining({
        isolationLevel: 'microvm',
        allowedSecrets: ['deployment-token'],
        allowDeployments: true,
      }),
    )
  })

  it('validates missing and cyclic GitHub dependency nodes', () => {
    expect(() =>
      buildGalPredictionRequestFromGitHubDependencies(
        {
          ...baseGitHubDependencySource(),
          nodes: [{ ...baseGitHubDependencySource().nodes[0], dependsOn: ['missing'] }],
        },
        baseGitHubDependencyOptions(),
      ),
    ).toThrow('depends on missing node')

    expect(() =>
      buildGalPredictionRequestFromGitHubDependencies(
        {
          ...baseGitHubDependencySource(),
          nodes: [
            { ...baseGitHubDependencySource().nodes[0], id: 'a', dependsOn: ['b'] },
            { ...baseGitHubDependencySource().nodes[1], id: 'b', dependsOn: ['a'] },
          ],
        },
        baseGitHubDependencyOptions(),
      ),
    ).toThrow('Cycle detected at GitHub dependency node')
  })
})

describe('executor and sandbox requirements', () => {
  it('models Kimi K2.6 Agent Swarm as a hosted compound executor', () => {
    const requirements = buildKimiK26AgentSwarmExecutionRequirements()

    expect(requirements).toEqual(
      expect.objectContaining({
        backend: 'kimi_k2_6',
        mode: 'model_agent_swarm',
        modelId: 'kimi-k2.6',
        provider: 'moonshot',
        estimatedConcurrentAgents: 8,
        maxSubAgents: 300,
        toolCallBudget: 4_000,
        requiresHostedRuntime: true,
      }),
    )
    expect(requirements.sandbox).toEqual(
      expect.objectContaining({
        isolationLevel: 'hosted_external',
        allowedNetworks: ['kimi.com', 'api.moonshot.ai'],
        allowedTools: ['kimi-agent-swarm'],
        requiresFilesystem: false,
        requiresNetwork: true,
      }),
    )
  })

  it('validates Kimi K2.6 Agent Swarm advertised planning limits', () => {
    expect(() =>
      forecastGalExecution({
        ...baseRequest,
        tasks: [
          {
            ...baseRequest.tasks[0],
            executionRequirements: buildKimiK26AgentSwarmExecutionRequirements({ maxSubAgents: 301 }),
          },
        ],
      }),
    ).toThrow('maxSubAgents must be at most 300')

    expect(() =>
      forecastGalExecution({
        ...baseRequest,
        tasks: [
          {
            ...baseRequest.tasks[0],
            executionRequirements: buildKimiK26AgentSwarmExecutionRequirements({ toolCallBudget: 4_001 }),
          },
        ],
      }),
    ).toThrow('toolCallBudget must be at most 4000')
  })
})

function baseTraces(): GalPredictionExecutionTrace[] {
  return [
    {
      schemaVersion: GAL_EXECUTION_TRACE_SCHEMA_VERSION,
      traceId: 'trace-1',
      taskId: 'token-heavy',
      taskKind: 'coding',
      repository: 'acme/app',
      startedAt: '2026-05-06T09:00:00.000Z',
      finishedAt: '2026-05-06T10:00:00.000Z',
      tokenUsage: {
        inputTokens: 80_000,
        outputTokens: 18_000,
        reasoningTokens: 45_000,
      },
      toolUsage: [{ toolKind: 'shell', calls: 26, wallClockMinutes: 18, blocked: false }],
      ciUsage: [{ workflowName: 'CI', runtimeMinutes: 24, queueMinutes: 8, reruns: 0, failed: false }],
      blockerKind: 'none',
      completed: true,
    },
    {
      schemaVersion: GAL_EXECUTION_TRACE_SCHEMA_VERSION,
      traceId: 'trace-2',
      taskId: 'token-heavy',
      taskKind: 'coding',
      repository: 'acme/app',
      startedAt: '2026-05-06T10:00:00.000Z',
      finishedAt: '2026-05-06T11:00:00.000Z',
      tokenUsage: {
        inputTokens: 100_000,
        outputTokens: 22_000,
        reasoningTokens: 55_000,
      },
      toolUsage: [{ toolKind: 'shell', calls: 34, wallClockMinutes: 24, blocked: false }],
      ciUsage: [{ workflowName: 'CI', runtimeMinutes: 28, queueMinutes: 10, reruns: 1, failed: true }],
      blockerKind: 'ci',
      completed: false,
    },
    {
      schemaVersion: GAL_EXECUTION_TRACE_SCHEMA_VERSION,
      traceId: 'trace-3',
      taskId: 'map',
      taskKind: 'planning',
      repository: 'acme/app',
      startedAt: '2026-05-06T11:00:00.000Z',
      finishedAt: '2026-05-06T11:15:00.000Z',
      tokenUsage: {
        inputTokens: 6_000,
        outputTokens: 2_000,
        reasoningTokens: 4_000,
      },
      toolUsage: [{ toolKind: 'filesystem', calls: 8, wallClockMinutes: 4, blocked: false }],
      blockerKind: 'none',
      completed: true,
    },
  ]
}

function baseGitHubDependencySource(): GalPredictionGitHubDependencySource {
  return {
    schemaVersion: GAL_GITHUB_DEPENDENCY_SOURCE_SCHEMA_VERSION,
    sourceId: 'release-map-1',
    nodes: [
      {
        id: 'agent-network-3',
        repository: 'gal-run/agent-network',
        title: 'Define release milestones',
        kind: 'issue',
        state: 'open',
        labels: ['release-critical'],
        dependsOn: [],
      },
      {
        id: 'stratus-3279',
        repository: 'StratusCloudLabs/stratus',
        title: 'Connect beefy issue to runtime repo',
        kind: 'pull_request',
        state: 'blocked',
        requiredReviewers: 1,
        dependsOn: ['agent-network-3'],
      },
      {
        id: 'agent-network-ci',
        repository: 'gal-run/agent-network',
        title: 'Release validation checks',
        kind: 'workflow_check',
        state: 'in_progress',
        pendingChecks: ['CI'],
        failingChecks: ['API build'],
        dependsOn: ['stratus-3279'],
      },
      {
        id: 'agent-network-release',
        repository: 'gal-run/agent-network',
        title: 'Publish agent-network release',
        kind: 'release',
        state: 'queued',
        dependsOn: ['agent-network-ci', 'stratus-3279'],
      },
      {
        id: 'prod-deploy',
        repository: 'acme/app',
        title: 'Production deploy gate',
        kind: 'deployment_gate',
        state: 'queued',
        deploymentEnvironment: 'production',
        dependsOn: ['agent-network-release'],
      },
      {
        id: 'status-page',
        repository: 'acme/app',
        title: 'External status page verification',
        kind: 'external_service',
        state: 'queued',
        externalService: 'status.example.com',
        dependsOn: ['prod-deploy'],
      },
    ],
  }
}

function baseGitHubDependencyOptions() {
  return {
    requestId: 'dependency-map-invalid',
    horizonMinutes: 60,
    maxWorkers: 4,
    workerStartupMinutes: 4,
    targetUtilization: 0.7,
  }
}

function h200ThroughputProfile(): GalPredictionModelThroughputProfile {
  return {
    id: 'runpod-h200-8x-glm-5-fp8',
    modelId: 'glm-5-fp8',
    provider: 'runpod',
    gpuType: 'NVIDIA H200 SXM',
    gpuCount: 8,
    maxContextTokens: 200_000,
    maxConcurrentRequests: 64,
    prefillTokensPerSecond: 60_000,
    decodeTokensPerSecond: 2_500,
    reasoningTokensPerSecond: 2_500,
    coldStartSeconds: 900,
    drainSeconds: 600,
    shutdownSeconds: 180,
    minBillableSeconds: 3_600,
    hourlyCostUsd: 34.48,
  }
}
