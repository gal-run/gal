import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'

import {
  GAL_SWARM_DECISION_SCHEMA_VERSION,
  GAL_SWARM_HOT_START_SLO_SCHEMA_VERSION,
  GAL_SWARM_ORCHESTRATION_MODES,
  GAL_SWARM_DEFAULT_RUNNER_LABELS,
  GAL_SWARM_PLAN_SCHEMA_VERSION,
  GAL_SWARM_PUBLIC_TOPOLOGY_MODES,
  GAL_SWARM_TOPOLOGY_SCHEMA_VERSION,
  GAL_SWARM_TOPOLOGY_MODE_MAPPINGS,
  GAL_SWARM_WAVE_EVIDENCE_LEDGER_SCHEMA_VERSION,
  GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION,
  buildGalSwarmWaveLedgerTaskMetadata,
  buildGalSwarmLoadFromForecast,
  calculateGalSwarmEffectiveUtilization,
  calculateGalSwarmPressure,
  clampGalSwarmWorkerSessionCount,
  createGalSwarmHotStartSloContract,
  createGalSwarmCalibrationSummary,
  createGalSwarmProviderActionPlan,
  createGalSwarmRunApiEndpoints,
  createGalSwarmRunCreateResponse,
  createGalSwarmRunPlan,
  createGalSwarmStoredRun,
  createGalSwarmTopologyPlan,
  createGalSwarmWaveLedgerEnvelope,
  createGalSwarmWaveEvidenceLedger,
  defaultGalSwarmPreflightComputeProfiles,
  defaultGalSwarmProviderIntegrationProfiles,
  decideGalSwarmHotStartSlo,
  decideGalSwarmCapacity,
  detectGalSwarmWaveLeaseConflicts,
  evaluateGalSwarmBurstPreflight,
  formatGalSwarmTopologyAliasHelp,
  getGalSwarmWorkerRunnerLabels,
  highestRunnablePriority,
  isGalSwarmWaveLedgerEventType,
  listGalSwarmTopologyAliases,
  normalizeGalSwarmRunnerLabel,
  normalizeGalSwarmRunnerLabels,
  normalizeGalSwarmTopologyMode,
  normalizeGalSwarmWorkerDispatchRequest,
  normalizeGalSwarmWorkerIssues,
  orderGalSwarmTopologyTasks,
  planGalSwarmDecision,
  planGalSwarmDecisionFromForecast,
  rankGalSwarmProviders,
  routeGalSwarmTopology,
  scoreGalSwarmFleetPlacement,
  selectGalSwarmProvider,
  synthesizeGalSwarmWorkerDispatchFromObjective,
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

describe('GAL swarm run API contract', () => {
  it('creates a Stratus-backed dry-run plan', () => {
    const plan = createGalSwarmRunPlan({
      orgName: 'example-org',
      objective: 'Resolve release milestone issues',
      source: 'gal-code',
      mode: 'dry-run',
      target: {
        provider: 'stratus',
        computeProfileId: 'deepseek-v4-pro',
        desiredWorkers: 1,
        desiredComputeUnits: 1,
        ttlHours: 1,
        maxHourlyUsd: 5,
        serverlessEndpointId: 'deepseek-v4-pro',
      },
      workload: {
        tasks: 8,
        promptTokens: 120000,
        completionTokens: 60000,
        toolCalls: 120,
        workflowWaitSeconds: 1800,
        sandboxCount: 8,
      },
      correlationId: 'swarm-test',
    })

    expect(plan).toEqual(
      expect.objectContaining({
        runId: 'swarm-test',
        status: 'planned',
        serverlessFallbackRequired: true,
      }),
    )
    expect(plan.target).toEqual(
      expect.objectContaining({
        provider: 'stratus',
        computeProfileId: 'deepseek-v4-pro',
        serverlessEndpointId: 'deepseek-v4-pro',
      }),
    )
    expect(plan.stratusOperations.map((operation) => operation.workflow)).toContain('gpu-swarm-burst-run.yml')
  })

  it('accepts sandboxProvider without requiring the deprecated provider field', () => {
    const plan = createGalSwarmRunPlan({
      orgName: 'example-org',
      objective: 'Plan isolated sandbox capacity',
      source: 'api',
      mode: 'dry-run',
      target: {
        sandboxProvider: 'stratus',
        computeProfileId: 'gcp-l4-1x-qwen-smoke',
        desiredWorkers: 1,
        desiredComputeUnits: 1,
        ttlHours: 1,
        maxHourlyUsd: 5,
        serverlessEndpointId: 'serverless-glm-mini',
      },
      workload: {
        tasks: 1,
        promptTokens: 1000,
        completionTokens: 500,
        toolCalls: 2,
        workflowWaitSeconds: 30,
        sandboxCount: 1,
      },
      correlationId: 'swarm-sandbox-provider',
    })

    expect(plan.target.sandboxProvider).toBe('stratus')
    expect(plan.stratusOperations.find((operation) => operation.type === 'preflight')?.artifactName).toBe(
      'gpu-swarm-preflight-result-stratus',
    )
  })

  it('requires explicit approval for apply mode', () => {
    expect(() =>
      createGalSwarmRunPlan({
        orgName: 'example-org',
        objective: 'Start paid capacity',
        source: 'dashboard',
        mode: 'apply',
        approvalEvidenceUrl: 'https://github.com/example-org/gitops/milestone/20',
        target: {
          provider: 'stratus',
          computeProfileId: 'runpod-qwen3-coder-30b-fp8',
          desiredWorkers: 1,
          desiredComputeUnits: 1,
          ttlHours: 0.5,
          maxHourlyUsd: 20,
          serverlessEndpointId: '6gvdhn9e1h0n3v',
        },
        workload: {
          tasks: 25,
          promptTokens: 200000,
          completionTokens: 20000,
          toolCalls: 100,
          workflowWaitSeconds: 600,
          sandboxCount: 4,
        },
      }),
    ).toThrow('executionApproval.approved')
  })

  it('creates approval and preflight metadata for approved apply runs', () => {
    const plan = createGalSwarmRunPlan({
      orgName: 'example-org',
      objective: 'Start Stratus milestone swarm',
      source: 'gal-code',
      mode: 'apply',
      approvalEvidenceUrl: 'https://github.com/example-org/gitops/milestone/20',
      executionApproval: {
        approved: true,
        approvedBy: 'example-org',
      },
      target: {
        provider: 'stratus',
        computeProfileId: 'runpod-qwen3-coder-30b-fp8',
        desiredWorkers: 1,
        desiredComputeUnits: 1,
        ttlHours: 0.5,
        maxHourlyUsd: 20,
        serverlessEndpointId: '6gvdhn9e1h0n3v',
      },
      workload: {
        tasks: 25,
        promptTokens: 200000,
        completionTokens: 20000,
        toolCalls: 100,
        workflowWaitSeconds: 600,
        sandboxCount: 4,
      },
      correlationId: 'swarm-approved',
    })

    expect(plan.status).toBe('ready_for_apply')
    expect(plan.executionApproval).toMatchObject({
      approved: true,
      approvalEvidenceUrl: 'https://github.com/example-org/gitops/milestone/20',
      approvedBy: 'example-org',
    })
    expect(plan.preflightChecks.map((check) => check.id)).toContain('serverless-fallback')
  })

  it('accepts gal-cli as a first-class trigger source', () => {
    const plan = createGalSwarmRunPlan({
      orgName: 'example-org',
      objective: 'Plan a CLI-triggered swarm',
      source: 'gal-cli',
      mode: 'dry-run',
      target: {
        provider: 'stratus',
        computeProfileId: 'gcp-l4-1x-qwen-smoke',
        desiredWorkers: 1,
        desiredComputeUnits: 1,
        ttlHours: 1,
        maxHourlyUsd: 5,
        serverlessEndpointId: 'serverless-glm-mini',
      },
      workload: {
        tasks: 4,
        promptTokens: 10000,
        completionTokens: 5000,
        toolCalls: 12,
        workflowWaitSeconds: 90,
        sandboxCount: 2,
      },
    })

    expect(plan.source).toBe('gal-cli')
  })

  it('accepts gal-mcp as a first-class trigger source', () => {
    const plan = createGalSwarmRunPlan({
      orgName: 'example-org',
      objective: 'Plan an MCP-triggered swarm',
      source: 'gal-mcp',
      mode: 'dry-run',
      target: {
        provider: 'stratus',
        computeProfileId: 'gcp-l4-1x-qwen-smoke',
        desiredWorkers: 1,
        desiredComputeUnits: 1,
        ttlHours: 1,
        maxHourlyUsd: 5,
        serverlessEndpointId: 'serverless-glm-mini',
      },
      workload: {
        tasks: 2,
        promptTokens: 4000,
        completionTokens: 2000,
        toolCalls: 4,
        workflowWaitSeconds: 45,
        sandboxCount: 1,
      },
    })

    expect(plan.source).toBe('gal-mcp')
  })

  it('calibrates predicted swarm estimates from execution actuals', () => {
    const plan = createGalSwarmRunPlan({
      orgName: 'example-org',
      objective: 'Calibrate release work',
      source: 'gal-code',
      mode: 'dry-run',
      target: {
        provider: 'stratus',
        computeProfileId: 'gcp-l4-1x-qwen-smoke',
        desiredWorkers: 1,
        desiredComputeUnits: 1,
        ttlHours: 1,
        maxHourlyUsd: 5,
        serverlessEndpointId: 'serverless-glm-mini',
      },
      workload: {
        tasks: 3,
        promptTokens: 15000,
        completionTokens: 8000,
        toolCalls: 15,
        workflowWaitSeconds: 60,
        sandboxCount: 1,
      },
    })

    expect(createGalSwarmCalibrationSummary(plan, {
      durationSeconds: plan.predictedDurationSeconds * 2,
      promptTokens: 18000,
      completionTokens: 9000,
      toolCalls: 30,
      workflowWaitSeconds: 120,
      sandboxCount: 2,
    })).toMatchObject({
      durationRatio: 2,
      toolCallRatio: 2,
      workflowWaitRatio: 2,
      sandboxRatio: 2,
    })
  })

  it('decides drain actions and provider no-op commands from capacity observations', () => {
    const plan = createGalSwarmRunPlan({
      orgName: 'example-org',
      objective: 'Drain idle capacity',
      source: 'gal-code',
      mode: 'apply',
      approvalEvidenceUrl: 'https://github.com/example-org/gitops/milestone/20',
      executionApproval: {
        approved: true,
      },
      target: {
        provider: 'stratus',
        computeProfileId: 'gcp-l4-1x-qwen-smoke',
        capacityPolicyProfile: 'small-paid',
        desiredWorkers: 3,
        desiredComputeUnits: 3,
        ttlHours: 0.5,
        maxHourlyUsd: 20,
        serverlessEndpointId: 'serverless-glm-mini',
      },
      workload: {
        tasks: 3,
        promptTokens: 15000,
        completionTokens: 8000,
        toolCalls: 15,
        workflowWaitSeconds: 60,
        sandboxCount: 1,
      },
    })

    const decision = decideGalSwarmCapacity(plan, {
      activeWorkers: 3,
      queuedTokenSeconds: 0,
      tokensPerSecond: 120,
      latencyP95Ms: 10000,
      gpuUtilizationPercent: 12,
      memoryUtilizationPercent: 20,
      activeTasks: 0,
      queuedTasks: 0,
      errorRatePercent: 0,
      providerHealthy: true,
      elapsedSeconds: 300,
      spendUsd: 0.25,
      idleSeconds: 200,
      serverlessFallbackHealthy: true,
    })
    const actionPlan = createGalSwarmProviderActionPlan(plan, decision)

    expect(decision).toMatchObject({
      action: 'drain',
      reason: 'low_utilization',
      desiredWorkers: 2,
      drain: true,
    })
    expect(actionPlan).toMatchObject({
      executorMode: 'noop-dry-run',
      canApply: false,
      operation: {
        type: 'drain-workers',
        command: 'noop:stratus:drain:gcp-l4-1x-qwen-smoke:workers=2',
      },
    })
  })

  it('centralizes worker dispatch and stored-run DTO helpers for API adapters', () => {
    const plan = createGalSwarmRunPlan({
      orgName: 'example-org',
      objective: 'Dispatch worker issue fanout',
      source: 'api',
      mode: 'dry-run',
      target: {
        sandboxProvider: 'stratus',
        computeProfileId: 'gcp-l4-1x-qwen-smoke',
        desiredWorkers: 2,
        desiredComputeUnits: 1,
        ttlHours: 1,
        maxHourlyUsd: 5,
        serverlessEndpointId: 'serverless-glm-mini',
      },
      workload: {
        tasks: 2,
        promptTokens: 2000,
        completionTokens: 1000,
        toolCalls: 2,
        workflowWaitSeconds: 10,
        sandboxCount: 2,
      },
      correlationId: 'swarm-dto-test',
    })

    const dispatch = normalizeGalSwarmWorkerDispatchRequest({
      enabled: true,
      maxSessions: '3',
      runnerLabels: 'arc-linux-agents,agents-high-runc-x64,not-valid,agents-high-runc-x64',
      issues: [
        {
          repo: 'gal-run/gal-swarm',
          number: '42',
          title: 'Centralize swarm contracts',
          labels: ['sdk', 'swarm'],
        },
        { repository: '', issueNumber: 0, title: 'invalid' },
      ],
    })
    const run = createGalSwarmStoredRun(plan, {
      approvalEvidenceUrl: ' https://github.com/gal-run/gal-swarm/issues/42 ',
      createdAt: '2026-05-16T15:00:00.000Z',
    })
    const response = createGalSwarmRunCreateResponse(run)

    expect(dispatch).toEqual(expect.objectContaining({
      enabled: true,
      maxSessions: 3,
      runnerLabels: ['agents-standard-runc-x64', 'agents-high-runc-x64'],
      issues: [
        {
          repository: 'gal-run/gal-swarm',
          issueNumber: 42,
          title: 'Centralize swarm contracts',
          labels: ['sdk', 'swarm'],
        },
      ],
    }))
    expect(getGalSwarmWorkerRunnerLabels(dispatch!)).toEqual(['agents-standard-runc-x64', 'agents-high-runc-x64'])
    expect(clampGalSwarmWorkerSessionCount(dispatch?.maxSessions, dispatch?.issues.length ?? 0, 2)).toBe(1)
    expect(clampGalSwarmWorkerSessionCount(3, 0, 2)).toBe(0)
    expect(run).toEqual(expect.objectContaining({
      approvalEvidenceUrl: 'https://github.com/gal-run/gal-swarm/issues/42',
      createdAt: '2026-05-16T15:00:00.000Z',
      updatedAt: '2026-05-16T15:00:00.000Z',
    }))
    expect(response.endpoints).toEqual({
      dashboard: '/dashboard/swarm/swarm-dto-test',
      galCode: 'gal swarm status swarm-dto-test --org example-org',
      stratus: {
        pipelineWorkflow: 'gpu-swarm-pipeline.yml',
        preflightWorkflow: 'gpu-swarm-preflight.yml',
        burstStartWorkflow: 'gpu-swarm-burst-start.yml',
        burstRunWorkflow: 'gpu-swarm-burst-run.yml',
      },
    })
    expect(createGalSwarmRunApiEndpoints(plan).dashboard).toBe('/dashboard/swarm/swarm-dto-test')
  })

  it('normalizes worker dispatch inputs used by CLI and MCP adapters', () => {
    expect(normalizeGalSwarmRunnerLabel('agents-medium-vz-arm64')).toBe('agents-medium-runc-x64')
    expect(normalizeGalSwarmRunnerLabels(['agents-high-runc', 'bogus', 'agents-high-runc-x64'])).toEqual([
      'agents-high-runc-x64',
    ])
    expect(normalizeGalSwarmWorkerIssues({
      issues: [
        { repository: 'gal-run/gal-api', issue: '7', title: 'Expose swarm endpoint' },
        { repo: 'gal-run/gal-cli', number: '8' },
        { repository: 'gal-run/gal-api', issueNumber: -1, title: 'skip' },
      ],
    })).toEqual([
      { repository: 'gal-run/gal-api', issueNumber: 7, title: 'Expose swarm endpoint', labels: undefined, url: undefined },
      { repository: 'gal-run/gal-cli', issueNumber: 8, title: 'Issue #8', labels: undefined, url: undefined },
    ])
    expect(synthesizeGalSwarmWorkerDispatchFromObjective('gal-run', 'Create a smoke wave')).toMatchObject({
      enabled: true,
      runnerLabels: [GAL_SWARM_DEFAULT_RUNNER_LABELS[0]],
      issues: [{ repository: 'gal-run', issueNumber: 1, title: 'Create a smoke wave' }],
    })
  })

  it('owns portable wave ledger event contracts for network adapters', () => {
    const task = buildGalSwarmWaveLedgerTaskMetadata({
      id: 'task-1',
      state: 'running',
      agentId: 'gal.swarm.worker',
      correlationId: 'wave-300:task-1',
      parentTaskId: 'wave-300',
    })
    const envelope = createGalSwarmWaveLedgerEnvelope({
      id: 'event-1',
      eventType: 'artifact.recorded',
      occurredAt: '2026-05-16T15:00:00.000Z',
      waveId: 'wave-300',
      workerId: 'worker-1',
      task,
      evidence: [
        {
          url: 'https://github.com/gal-run/gal-swarm/actions/runs/1',
          label: 'unit tests',
          mediaType: 'text/uri-list',
        },
      ],
    })

    expect(isGalSwarmWaveLedgerEventType('artifact.recorded')).toBe(true)
    expect(isGalSwarmWaveLedgerEventType('task.persisted')).toBe(false)
    expect(envelope).toEqual(expect.objectContaining({
      schemaVersion: GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION,
      id: 'event-1',
      eventType: 'artifact.recorded',
      waveId: 'wave-300',
      workerId: 'worker-1',
    }))
    expect(envelope.task).toEqual({
      taskId: 'task-1',
      taskState: 'running',
      agentId: 'gal.swarm.worker',
      correlationId: 'wave-300:task-1',
      parentTaskId: 'wave-300',
    })
  })

  it('proves the 300-wave control plane remains dry-run blocked without evidence', () => {
    const stdout = execFileSync('node', ['scripts/proofs/wave-300-dry-run.mjs', '300-wave'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })
    const proof = JSON.parse(stdout)

    expect(proof.topology).toMatchObject({
      accepted: true,
      alias: '300-wave',
      topologyId: 'wave-300-control-plane',
      workerWaves: 300,
    })
    expect(proof.dispatchPlan).toMatchObject({
      mode: 'dry-run',
      status: 'planned',
      plannedWorkers: 300,
      providerExecutorMode: 'noop-dry-run',
      providerOperationDryRun: true,
      canApply: false,
    })
    expect(proof.dispatchPlan.command).toMatch(/^noop:/)
    expect(proof.evidenceLedger.expected).toEqual({
      workers: 300,
      verifiers: ['dispatch-plan', 'evidence-ledger', 'closeout-gate'],
      reconciler: 'wave-status-reconciler',
    })
    expect(proof.evidenceLedger.received).toEqual({
      workers: 0,
      verifiers: [],
      reconciler: null,
    })
    expect(proof.closeout).toMatchObject({
      status: 'blocked',
      reason: 'missing expected dry-run evidence',
    })
    expect(proof.closeout.missing).toContain('workers:300')
    expect(proof.closeout.missing).toContain('reconciler:wave-status-reconciler')
  })
})
