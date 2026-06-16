# GAL Swarm Architecture

## Purpose

gal-swarm is the swarm orchestration layer for GPU-backed agent bursts in the
GAL Run ecosystem. It models the full lifecycle: plan, preflight, burst, run,
monitor, and drain. This document is the canonical architecture reference and
conforms to the [prompt-to-binary standard][1].

[1]: https://github.com/GravitonChips/prompt-to-binary

## Standards Conformance

gal-swarm adopts the prompt-to-binary standard as defined by
`GravitonChips/prompt-to-binary`. This architecture document consumes the
canonical contract without redefining it:

- The standard artifact ladder applies to every generated artifact produced by a
  swarm worker.
- Verification gates in the standard apply to all sandboxed execution.
- The SDK/framework boundary recognizes gal-swarm as an SDK consumer: swarm
  plans are *requirements*, swarm run requests are *source*, and preflight checks
  are *verification gates*.

```ptb.arch v0
{
  "id": "ARCH-gal-swarm-standard-adoption-001",
  "module": "gal-swarm",
  "kind": "sdk-consumer",
  "interfaces": [
    {
      "name": "plan_swarm_run",
      "input": "GalSwarmRunRequest",
      "output": "GalSwarmRunPlan"
    },
    {
      "name": "verify_swarm_standard",
      "input": "GalSwarmStandardManifest",
      "output": "PromptToBinarySpecIR"
    }
  ],
  "permissions": {
    "filesystem": "read-only",
    "network": false
  },
  "invariants": [
    "gal_swarm_does_not_own_http_routes",
    "swarm_plans_map_to_requirements_artifacts",
    "run_requests_map_to_source_artifacts",
    "preflight_and_closeout_checks_are_verification_gates"
  ]
}
```

## Role in the Standard

gal-swarm is an SDK: it defines the stable, machine-readable surface for
submitting swarm plans. It is not an artifact generator, does not own HTTP
routes, and does not own the toolchain or binary output of individual agents.
The Swarm HTTP API is a `gal-api` microservice that consumes this package's
contracts. The framework layer (verification gates, provenance, artifact
acceptance) resides in `GravitonChips/prompt-to-binary/framework`.

## Swarm Lifecycle

```
plan → preflight → burst → run → monitor → drain
```

### Plan
A `GalSwarmPlan` declares the objective, success criteria, constraints,
preferred provider profiles, compute budget, and approval evidence. Plans are
validated before any provider provisioning occurs.

### Preflight
Before compute is provisioned, gal-swarm runs preflight checks:
- Spend and compute-unit caps
- Telemetry and credential health
- Drain/shutdown policy
- First-test permissions
- Prediction readiness

This gate corresponds to the standard's artifact-ladder verification step.

### Burst
When preflight passes, the burst lease is requested. The swarm selects a
provider from the ranked candidate pool, provisions compute units, and admits
work.

### Run
Work is dispatched to lanes with bounded file leases, evidence expectations, and
deterministic lane dependencies. The topology layer routes work to
director/scope/worker/reviewer/reconciler/verifier roles.

### Monitor
Utilization, pressure, cost, latency, and error rate are continuously observed
to drive capacity decisions.

### Drain
When utilization drops below threshold or TTL expires, the swarm stops
admitting new work, drains in-progress lanes, and shuts down paid compute.

## AI Provider / Sandbox Provider Split

gal-swarm separates the inference backend from the execution infrastructure:

| Axis | Constants | Purpose |
|------|-----------|---------|
| AI Provider | `GAL_SWARM_AI_PROVIDERS` | Model endpoints, API keys, rate limits |
| Sandbox Provider | `GAL_SWARM_SANDBOX_PROVIDERS` | Isolated filesystem, deterministic environment, network controls |

This split is enforced at the contract level. A swarm plan must independently
select an AI provider and a sandbox provider; they are never conflated.

## Topology and Orchestration

gal-swarm uses a deterministic, provider-neutral topology layer:

- **Modes**: router, sequential, concurrent, graph, hierarchical, mixture,
  group_chat, forest, heavy. See
  [Governed Coding Swarm](../concepts/governed-coding-swarm.md) for the mode
  semantics and public alias mapping.
- **Fleet placement**: lane scoring by OS/arch requirements
- **Evidence ledger**: per-wave conflict detection, reconciliation, and closeout

## Provider Selection

Provider candidates are ranked by hourly cost, availability, startup/shutdown
latency, minimum billing, reliability, locality, and reservation requirements.
The selector picks the cheapest available provider within the swarm budget.

## Serverless Fallback

When self-hosted burst utilization falls below the fallback threshold, the
swarm routes remaining work to a declared serverless endpoint and drains paid
compute. This keeps gal-swarm provider-neutral while enabling automated
cost-savings transitions.

## Boundary

gal-swarm owns swarm plan contracts, worker-dispatch DTOs, stored-run DTOs,
runner-label normalization, wave-ledger event envelopes, prediction adapters,
utilization snapshots, compute profiles, provider selection, and
drain/shutdown policy.

It does not own concrete GPU provisioning (that is owned by
`@stratus/gpu-provider-*`), HTTP routes and persistence (owned by `gal-api`), UI
rendering (owned by `gal-dashboard`), CLI/MCP transport UX (owned by `gal-cli`
and `gal-mcp`), agent cards (owned by `gal-agents`), or generated artifact
verification (owned by the prompt-to-binary framework layer).
