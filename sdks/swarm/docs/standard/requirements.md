# GAL Swarm Requirements

gal-swarm conforms to the [prompt-to-binary standard][1]. This document maps
gal-swarm features to the standard contract so that a future agent can verify
conformance without reading the gal-swarm implementation.

[1]: https://github.com/GravitonChips/prompt-to-binary

## REQ-SWARM-001: Swarm Plan Contract

Swarm plans must declare an objective, success criteria, constraints, and
approval evidence before any compute is provisioned.

- A `GalSwarmPlan` is the **requirements** artifact in the standard's artifact
  ladder.
- The plan is validated by `evaluateGalSwarmBurstPreflight` before provider
  selection.
- Approval evidence is required for apply-mode swarms (dry-run mode uses a
  separate path).

## REQ-SWARM-002: Preflight Gates

Preflight checks must run before compute provisioning begins. No provider API
calls may occur before preflight passes.

- Spend cap, compute-unit cap, telemetry health, credential health,
  drain/shutdown policy, first-test permissions, and prediction readiness are
  all checked.
- This corresponds to the standard's verification gate requirement.
- `evaluateGalSwarmBurstPreflight` is the final no-provider-call interlock.

## REQ-SWARM-003: Independent AI and Sandbox Providers

AI provider and sandbox provider must be independently selectable in every swarm
plan.

- `GAL_SWARM_AI_PROVIDERS` defines the inference backends.
- `GAL_SWARM_SANDBOX_PROVIDERS` defines the execution infrastructure.
- The deprecated `GAL_SWARM_PROVIDER_KINDS` union exists for migration but new
  code must use the split constants.

## REQ-SWARM-004: Provenance Record

Every swarm run must produce a provenance record containing at least: run ID,
dispatch ID, and workflow URL.

- Provenance is recorded before work is admitted and may be appended during the
  run lifecycle.
- This satisfies the standard's provenance requirement for every accepted
  artifact.

## REQ-SWARM-005: Sandbox Isolation

The sandbox provider must satisfy isolation requirements: isolated filesystem,
deterministic environment, and network controls.

- Every provider in `GAL_SWARM_SANDBOX_PROVIDERS` is expected to honor these
  constraints.
- The evidence ledger records per-worker sandbox identity and runtime evidence.

## REQ-SWARM-006: Drain on Low Utilization or TTL Expiry

Burst compute must drain when utilization falls below the shutdown threshold or
the swarm TTL expires.

- `decideGalSwarmCapacity` evaluates pressure against thresholds and emits
  scale/hold/drain/shutdown decisions.
- TTL is enforced at the plan level and re-evaluated at each decision interval.

## REQ-SWARM-007: Serverless Fallback

A serverless fallback endpoint must be available when a self-hosted burst cannot
start or must drain.

- Plans declare optional `serverlessEndpoints` and `serverlessFallback`.
- When measured or predicted self-hosted utilization falls below the fallback
  threshold, the decision becomes `route_serverless`.

## Acceptance Criteria

- A future agent can read this document and know that gal-swarm is an SDK
  consumer of the prompt-to-binary standard, not an artifact generator.
- A future agent can identify the artifact-ladder mapping: plans→requirements,
  run requests→source, preflight→verification gates.
- A future agent can verify that gal-swarm's provider split, provenance, and
  drain requirements align with the standard.
- A future agent can find the always-on test surface in
  `docs/standard/testing.md`.

```ptb.requirement v0
{
  "id": "REQ-gal-swarm-contract-surface-001",
  "intent": "GAL Swarm must expose a verifiable SDK contract for swarm plans, run requests, provider split, preflight gates, provenance, and drain decisions without owning generated artifact verification.",
  "inputs": [
    {
      "name": "swarm_plan",
      "type": "GalSwarmPlan"
    },
    {
      "name": "run_request",
      "type": "GalSwarmRunRequest"
    }
  ],
  "outputs": [
    {
      "name": "run_plan",
      "type": "GalSwarmRunPlan"
    },
    {
      "name": "verification_evidence",
      "type": "GalSwarmVerificationEvidence"
    }
  ],
  "constraints": [
    "swarm plans map to requirements artifacts",
    "run requests map to source artifacts",
    "preflight and closeout checks map to verification gates",
    "gal-swarm does not own generated artifact verification or HTTP route implementation"
  ],
  "verification": [
    {
      "gate": "gal_swarm_preflight_tests",
      "kind": "unit"
    },
    {
      "gate": "gal_swarm_topology_mode_tests",
      "kind": "unit"
    },
    {
      "gate": "gal_swarm_consumer_smoke",
      "kind": "package"
    }
  ]
}
```
