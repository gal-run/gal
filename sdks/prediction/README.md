# GAL Prediction

Private-first execution forecasting contracts for GAL.

`gal-prediction` answers a question before `gal-swarm` spends burst compute:

> Is this one-hour self-hosted run worth starting, and what should run first?

Before a first paid burst, `evaluateGalPredictionBurstReadiness` acts as the
prediction-side preflight gate. It checks release-task readiness, blocked work
ratio, confidence, context fit, billable cluster minutes, and spend caps before
swarm is allowed to attempt provider startup.

The first model gates are deliberately split:

- `zai-org/glm-4-9b-chat-hf` on GCP L4 Spot is the tool-call smoke.
- `Qwen/Qwen2.5-Coder-7B-Instruct` on GCP L4 Spot is the coding smoke.

`defaultGalPredictionPreflightModelCapabilityProfiles()` and
`defaultGalPredictionPreflightThroughputProfiles()` publish those defaults. They
are startup and routing evidence only; they must not be treated as proof that a
small model can solve release-heavy enterprise issues.

## Boundary

`-run/gal-prediction` owns:

- token, tool-call, CI, and wall-clock forecasts
- execution trace calibration
- GitHub dependency-map ingestion
- executor and sandbox requirement forecasting
- model throughput and token-capacity forecasting
- running cluster utilization decisions from provider/runtime telemetry
- task dependency maps
- critical-path analysis
- CI-bound, blocked, and parallelizable task classification
- capacity recommendations for short self-hosted bursts
- serverless fallback recommendations when self-hosted utilization is too low

It does not execute tasks, dispatch durable queue work, define agents, or start
provider workers.

Product boundaries:

- `@gal/agents` defines agents and capabilities
- `@gal/agent-network` defines connections between agents
- `@gal/swarm` controls temporary burst compute
- `-run/gal-prediction` forecasts whether burst compute is worth starting

## First Policy

The first release is deterministic by design. It uses declared task shape,
dependency edges, expected tokens, tool profiles, CI profiles, and blocker
probability to produce a forecast.

Learned prediction can be added later from GAL execution traces. The contract is
useful before ML exists.

## Trace Calibration

`-run/gal-prediction` can calibrate task estimates from historical GAL execution
traces. The calibration path records actual token usage, tool calls, CI
runtime/queue time, reruns, failures, and blockers, then aggregates them
deterministically. The forecast schema stays stable so `@gal/swarm` consumers do
not need to change when calibration improves.

## GitHub Dependency Maps

`-run/gal-prediction` can ingest GitHub-shaped dependency nodes for issues, pull
requests, workflow checks, releases, deployment gates, and external services.
It converts those nodes into forecast tasks, preserving cross-repo dependency
edges and classifying blockers before `@gal/swarm` starts burst compute.

## Executors And Sandboxes

Forecasts include execution requirements: backend, executor mode, expected
parallel agents, tool-call budget, hosted-runtime needs, and sandbox constraints
such as isolation level, allowed repos, secrets, networks, tools, filesystem,
deployment, CPU, memory, and disk requirements.

Kimi K2.6 Agent Swarm is modeled as a hosted compound executor, not a normal
single model call. GAL can route suitable tasks to it while still keeping
permissions, dependency maps, CI/deploy gates, and cost decisions in GAL.

## Model Throughput And Runtime Monitoring

Forecast requests can include model throughput profiles for a specific provider,
GPU type, GPU count, context window, concurrent request limit, prefill/decode
token throughput, cold-start time, image pull time, model-cache hit probability,
model hydration time, startup budget, drain time, shutdown time, minimum
billable time, and hourly cost. Forecasts then include per-task token capacity
and an aggregate cluster-capacity forecast:

- expected prefill, decode, and reasoning seconds
- expected runtime minutes
- context-window fit
- planned cluster minutes including expected startup, drain, and shutdown
- billable cluster minutes
- token utilization and projected cost

While a swarm is running, provider adapters should feed
`calculateGalPredictionClusterUtilization` with a runtime snapshot containing
active/busy/idle workers, queue depth, running requests, token throughput, GPU
utilization, GPU memory utilization, queue wait time, and provider status. The
function returns `scale_up`, `hold`, `drain`, or `shutdown`.

When `serverlessFallback` is configured on the forecast request or utilization
options, prediction can return `route_serverless`. That means useful work still
exists, but self-hosted capacity is no longer efficient enough to keep warm.
Stratus should route new work to the declared serverless endpoint while
`@gal/swarm` drains and shuts down the self-hosted burst.

Provider integration notes:

- RunPod Pods expose runtime GPU utilization and memory utilization through the
  GraphQL pod runtime shape.
- Crusoe exposes VM metrics through its monitoring token and metrics timeseries
  API, including DCGM GPU metrics when the watch agent is installed.
- In-cluster model metrics such as vLLM queue depth, request count, and
  prefill/decode token throughput should be sampled by the swarm runtime and
  merged with provider lifecycle status before calling the utilization function.

## Example

```ts
import {
  calculateGalPredictionClusterUtilization,
  forecastGalExecution,
  GAL_PREDICTION_REQUEST_SCHEMA_VERSION,
} from '-run/gal-prediction'

const h200Profile = {
  id: 'runpod-h200-8x-glm-5-fp8',
  modelId: 'glm-5-fp8',
  provider: 'runpod',
  gpuType: 'NVIDIA H200 SXM',
  gpuCount: 8,
  maxContextTokens: 200000,
  maxConcurrentRequests: 64,
  prefillTokensPerSecond: 60000,
  decodeTokensPerSecond: 2500,
  reasoningTokensPerSecond: 2500,
  coldStartSeconds: 900,
  drainSeconds: 600,
  shutdownSeconds: 180,
  minBillableSeconds: 3600,
  hourlyCostUsd: 34.48,
}

const forecast = forecastGalExecution({
  schemaVersion: GAL_PREDICTION_REQUEST_SCHEMA_VERSION,
  requestId: 'release-window-1',
  horizonMinutes: 60,
  maxWorkers: 8,
  workerStartupMinutes: 4,
  targetUtilization: 0.7,
  throughputProfiles: [h200Profile],
  tasks: [
    {
      id: 'release-validation',
      title: 'Run release validation',
      kind: 'ci_cd',
      priority: 10,
      dependsOn: [],
      expectedInputTokens: 3000,
      expectedOutputTokens: 1000,
      expectedReasoningTokens: 1000,
      baseExecutionMinutes: 5,
      toolProfiles: [{ toolKind: 'github', expectedCalls: 6, expectedWallClockMinutes: 4, blockingProbability: 0.2 }],
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
    },
  ],
})

console.log(forecast.capacity.action)
console.log(forecast.capacity.clusterCapacity?.projectedCostUsd)

const utilization = calculateGalPredictionClusterUtilization(
  {
    profileId: h200Profile.id,
    observedAt: new Date().toISOString(),
    activeWorkers: 8,
    busyWorkers: 7,
    idleWorkers: 1,
    queuedRequests: 18,
    runningRequests: 64,
    inputTokensPerSecond: 52000,
    outputTokensPerSecond: 1900,
    reasoningTokensPerSecond: 1100,
    gpuUtilizationRatio: 0.91,
    gpuMemoryUtilizationRatio: 0.82,
    queueWaitSeconds: 45,
    providerStatus: 'running',
  },
  h200Profile,
)

console.log(utilization.action)
```

See [`docs/first-burst-preflight.md`](docs/first-burst-preflight.md) for the
100-point startup checklist used before the first paid GPU burst.
