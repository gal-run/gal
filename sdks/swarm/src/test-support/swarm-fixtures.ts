/**
 * Shared fixtures for GAL Swarm contract tests.
 *
 * Test cases stay in domain-specific files; these builders keep the examples
 * consistent without shipping test-only code in the package build.
 */

import {
  GAL_SWARM_PLAN_SCHEMA_VERSION,
  GAL_SWARM_TOPOLOGY_SCHEMA_VERSION,
  createGalSwarmHotStartSloContract,
  type GalSwarmCostSnapshot,
  type GalSwarmExecutionForecastInput,
  type GalSwarmFleetNode,
  type GalSwarmLoadSnapshot,
  type GalSwarmPlan,
  type GalSwarmProviderCandidate,
  type GalSwarmTopologyRequest,
  type GalSwarmWaveWorkerEvidence,
} from '../swarm.js'

export function topologyRequest(overrides: Partial<GalSwarmTopologyRequest> = {}): GalSwarmTopologyRequest {
  return {
    schemaVersion: GAL_SWARM_TOPOLOGY_SCHEMA_VERSION,
    objective: 'Make GAL Swarm a governed coding swarm',
    repositories: ['gal-run/gal-swarm'],
    issues: ['gal-run/gal-swarm#42'],
    riskLevel: 'medium',
    desiredMode: 'auto',
    governance: {
      allowedRepositories: ['gal-run/gal-swarm'],
      allowedTools: ['gh', 'pnpm', 'docker'],
      requireFileLeases: true,
    },
    tasks: [
      topologyTask('scope', 'Read governance contract', 'scope', []),
      topologyTask('implement', 'Implement change', 'implementation', ['scope']),
    ],
    ...overrides,
  }
}

export function topologyTask(
  id: string,
  title: string,
  kind: GalSwarmTopologyRequest['tasks'][number]['kind'],
  dependsOn: string[],
): GalSwarmTopologyRequest['tasks'][number] {
  return {
    id,
    title,
    kind,
    repository: 'gal-run/gal-swarm',
    issueRefs: ['gal-run/gal-swarm#42'],
    dependsOn,
  }
}

export function topologyFleet(): GalSwarmFleetNode[] {
  return [
    {
      id: 'ubuntu-1',
      label: 'ubuntu-1',
      os: 'linux',
      arch: 'x64',
      runnerLabels: ['agents-high-runc-x64'],
      capabilities: ['linux-x64', 'docker', 'build', 'test', 'repo-write'],
      cpuCores: 32,
      memoryGb: 96,
      maxConcurrentLanes: 8,
    },
    {
      id: 'mac-mini-1',
      label: 'mac-mini-1',
      os: 'darwin',
      arch: 'arm64',
      runnerLabels: ['agents-mac-arm64'],
      capabilities: ['darwin-arm64', 'mac', 'ios', 'test', 'browser'],
      cpuCores: 8,
      memoryGb: 16,
      maxConcurrentLanes: 2,
    },
    {
      id: 'kali-1',
      label: 'kali-1',
      os: 'linux',
      arch: 'x64',
      runnerLabels: ['agents-kali-runc'],
      capabilities: ['linux-x64', 'kali', 'security', 'test'],
      cpuCores: 8,
      memoryGb: 16,
      maxConcurrentLanes: 1,
    },
  ]
}

export function hotStartContract() {
  return createGalSwarmHotStartSloContract({
    sloId: 'stratus-github-300-sandbox-hot-start',
    targetDispatchLatencyMs: 500,
    desiredConcurrentSandboxes: 300,
    targetConcurrentSandboxes: 300,
    warmIdleTarget: 50,
    minWarmWorkers: 50,
    maxWarmWorkers: 400,
    runnerLabels: ['agents-standard-runc-x64', 'agents-medium-runc-x64'],
    ownership: {
      githubRepository: 'gal-run/gal-swarm',
      stratusService: 'stratus-github-runner-warm-pool',
      gitopsPath: 'clusters/stratus/github-runners/warm-pool',
      owner: 'StratusCloudLabs/stratus',
    },
  })
}

export function waveWorker(
  index: number,
  lease = { repository: 'gal-run/gal-swarm', paths: [`src/worker-${index}.ts`] },
): GalSwarmWaveWorkerEvidence {
  return {
    laneId: `lane-worker-${index}`,
    workerId: `worker-${index}`,
    role: 'worker',
    riskLevel: 'medium',
    taskIds: [`task-${index}`],
    assignedRepositories: [lease.repository],
    fileLeases: [lease],
    proofArtifacts: [
      {
        id: `proof-${index}`,
        kind: 'diff',
        title: `Worker ${index} diff proof`,
        uri: `artifact://worker-${index}/diff`,
      },
    ],
    testEvidence: [
      {
        id: `test-${index}`,
        command: 'npm test -- src/swarm.test.ts',
        status: 'passed',
      },
    ],
    runtimeEvidence: [
      {
        id: `runtime-${index}`,
        target: 'dist/index.js',
        status: 'passed',
      },
    ],
    readyForReconciliation: true,
  }
}

export function basePlan(): GalSwarmPlan {
  return {
    schemaVersion: GAL_SWARM_PLAN_SCHEMA_VERSION,
    swarmId: 'release-spike-2026-05-06',
    objective: 'Drain release-critical CI and agent tasks during a short compute spike.',
    orchestrationMode: 'hierarchical',
    maxDurationMinutes: 120,
    maxSpendUsd: 80,
    targetQueueWaitSeconds: 120,
    minEffectiveUtilization: 0.45,
    drainBelowUtilizationForSeconds: 900,
    shutdownBelowUtilizationForSeconds: 900,
    minWorkers: 0,
    maxWorkers: 20,
    priorityOrder: ['release-critical', 'user-facing', 'scheduled', 'speculative'],
    providers: ['stratus', 'runpod', 'crusoe'],
    computeProfiles: [
      {
        id: 'runpod-cpu-burst',
        provider: 'stratus',
        label: 'RunPod CPU burst',
        cpuCores: 16,
        memoryGb: 64,
        image: 'ghcr.io/gal-run/agent-runner:latest',
        tools: ['gh', 'pnpm', 'docker'],
      },
    ],
    permissions: {
      allowedRepos: ['gal-run/gal-private', 'gal-run/agent-network'],
      allowedSecrets: ['runner-token'],
      allowedNetworks: ['github.com', 'api.gal.run'],
      allowedTools: ['gh', 'pnpm', 'docker'],
      allowDeployments: false,
      maxPrivilegeReason: 'Burst CI and verification only.',
    },
  }
}

export function h200Plan(): GalSwarmPlan {
  return {
    ...basePlan(),
    maxSpendUsd: 120,
    providers: ['runpod', 'crusoe', 'gcp', 'aws', 'azure'],
    computeProfiles: [
      { id: 'runpod-h200-8x', provider: 'stratus', label: 'RunPod 8x H200', gpuType: 'H200', gpuCount: 8, tools: ['vllm'] },
      { id: 'crusoe-h200-8x', provider: 'crusoe', label: 'Crusoe 8x H200 HGX', gpuType: 'H200', gpuCount: 8, tools: ['vllm'] },
      { id: 'gcp-a3-ultra-8x', provider: 'stratus', label: 'GCP A3 Ultra 8x H200', gpuType: 'H200', gpuCount: 8, tools: ['vllm'] },
      { id: 'aws-p5e-8x', provider: 'aws', label: 'AWS P5e 8x H200', gpuType: 'H200', gpuCount: 8, tools: ['vllm'] },
      { id: 'azure-nd-h200-8x', provider: 'azure', label: 'Azure ND H200 8x', gpuType: 'H200', gpuCount: 8, tools: ['vllm'] },
    ],
  }
}

export function planWithServerlessFallback(): GalSwarmPlan {
  return {
    ...basePlan(),
    serverlessEndpoints: [
      {
        id: 'serverless-glm-mini',
        provider: 'stratus',
        label: 'Stratus serverless GLM mini',
        endpointRef: 'stratus://serverless/gal-swarm/glm-mini',
        modelId: 'glm-mini',
        maxQueueWaitSeconds: 30,
        maxCostUsdPer1kTokens: 0.01,
        tools: ['openai-compatible-chat'],
      },
    ],
    serverlessFallback: {
      enabled: true,
      endpointId: 'serverless-glm-mini',
      switchBelowUtilization: 0.25,
      minSustainSeconds: 300,
      drainSelfHosted: true,
    },
  }
}

export function h200Candidates(): GalSwarmProviderCandidate[] {
  return [
    {
      provider: 'stratus',
      computeProfileId: 'runpod-h200-8x',
      hourlyCostUsd: 28.72,
      minBillableSeconds: 1,
      estimatedStartupSeconds: 90,
      estimatedShutdownSeconds: 30,
      available: true,
      reliabilityScore: 0.78,
      localityScore: 0.7,
    },
    {
      provider: 'crusoe',
      computeProfileId: 'crusoe-h200-8x',
      hourlyCostUsd: 34.32,
      minBillableSeconds: 60,
      estimatedStartupSeconds: 180,
      estimatedShutdownSeconds: 60,
      available: true,
      reliabilityScore: 0.84,
      localityScore: 0.7,
    },
    {
      provider: 'stratus',
      computeProfileId: 'gcp-a3-ultra-8x',
      hourlyCostUsd: 84.81,
      minBillableSeconds: 60,
      estimatedStartupSeconds: 300,
      estimatedShutdownSeconds: 90,
      available: true,
      reliabilityScore: 0.9,
      localityScore: 0.9,
    },
    {
      provider: 'aws',
      computeProfileId: 'aws-p5e-8x',
      hourlyCostUsd: 45.77,
      minBillableSeconds: 3600,
      estimatedStartupSeconds: 360,
      estimatedShutdownSeconds: 90,
      available: true,
      reliabilityScore: 0.92,
      localityScore: 0.9,
      requiresReservation: true,
    },
    {
      provider: 'azure',
      computeProfileId: 'azure-nd-h200-8x',
      hourlyCostUsd: 84,
      minBillableSeconds: 60,
      estimatedStartupSeconds: 360,
      estimatedShutdownSeconds: 120,
      available: true,
      reliabilityScore: 0.9,
      localityScore: 0.85,
    },
  ]
}

export function baseLoad(): GalSwarmLoadSnapshot {
  return {
    queuedWorkUnits: 24,
    runnableWorkUnits: 12,
    activeWorkers: 4,
    busyWorkers: 3,
    idleWorkers: 1,
    avgQueueWaitSeconds: 60,
    p95QueueWaitSeconds: 180,
    expectedRuntimeMinutes: 120,
    targetCompletionWindowMinutes: 120,
    priorityMix: [
      { priorityClass: 'release-critical', runnableWorkUnits: 3, expectedRuntimeMinutes: 60 },
      { priorityClass: 'scheduled', runnableWorkUnits: 9, expectedRuntimeMinutes: 60 },
    ],
  }
}

export function baseCost(): GalSwarmCostSnapshot {
  return {
    provider: 'stratus',
    hourlyCostUsd: 1.8,
    startupLatencySeconds: 90,
    shutdownLatencySeconds: 30,
    minimumBillableSeconds: 60,
    currentSpendUsd: 12,
    projectedSpendUsd: 36,
  }
}

export function baseForecast(): GalSwarmExecutionForecastInput {
  return {
    requestId: 'forecast-1',
    horizonMinutes: 60,
    criticalPathMinutes: 79,
    parallelizableTaskIds: ['ci-heavy', 'token-heavy'],
    ciBoundTaskIds: ['ci-heavy'],
    blockedTaskIds: ['blocked-review'],
    taskForecasts: [
      {
        taskId: 'map',
        expectedWallClockMinutes: 16,
        expectedCiMinutes: 0,
        blockingProbability: 0,
        canRunInParallel: false,
      },
      {
        taskId: 'ci-heavy',
        expectedWallClockMinutes: 44,
        expectedCiMinutes: 35,
        blockingProbability: 0.4,
        canRunInParallel: true,
      },
      {
        taskId: 'blocked-review',
        expectedWallClockMinutes: 20,
        expectedCiMinutes: 0,
        blockingProbability: 0.8,
        canRunInParallel: true,
      },
    ],
    capacity: {
      action: 'scale_up',
      recommendedWorkers: 2,
      expectedUtilization: 0.86,
      expectedUsefulWorkerMinutes: 104,
      expectedWastedWorkerMinutes: 24,
      reason: 'Forecasted useful work justifies a self-hosted burst within the planning horizon.',
    },
  }
}
