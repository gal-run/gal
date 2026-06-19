# GAL Swarm Testing Standard

This document is the local GAL Swarm answer to what is tested at all times. It
maps the canonical prompt-to-binary testing standard to this package's actual
contracts, test files, proof scripts, and release evidence.

## Always-On Checks

Every change that affects `@gal/swarm` contracts, planning behavior, topology,
provider selection, evidence, docs, or package exports must keep these checks
passing:

1. `npm run type-check`
2. `npm test`
3. `npm run build`
4. `npm run smoke:consumer`

Release or proof-related changes must also run:

1. `npm run proof:startup-latency`
2. `npm run proof:wave-300`

The standard-adoption surface must remain verifiable by the canonical
prompt-to-binary framework:

```sh
python3 /path/to/prompt-to-binary/framework/verify.py \
  --root . \
  --manifest docs/standard.manifest.json
```

## Required Test Surface

| Area | Required coverage | Current evidence |
| --- | --- | --- |
| Public contracts | Schema version, exported constants, provider split, hot-start contracts, topology contracts, evidence contracts, run API contracts | `src/swarm-planning.test.ts`, `src/swarm-run-api.test.ts`, `src/swarm-topology.test.ts`, `src/swarm-evidence.test.ts` |
| Planning and preflight | Spend cap, compute-unit cap, telemetry, credentials, approvals, prediction readiness, provider ranking, serverless fallback | `src/swarm-planning.test.ts` |
| Architecture modes | router, sequential, concurrent, graph, hierarchical, mixture, group_chat, forest, heavy, plus public aliases | `src/swarm-topology.test.ts` |
| Hot-start SLO | Provider-neutral import and run-plan bootstrap budget, with no live provider capacity claim | `src/swarm-hot-start.test.ts`, `npm run proof:startup-latency` |
| Evidence ledger | Worker evidence, file leases, conflicts, reconciler proof, closeout blocking, high-risk closeout requirements | `src/swarm-evidence.test.ts` |
| Run API contract | Request validation, provider resolution, dry-run/apply operation planning, provenance, deprecated provider shim | `src/swarm-run-api.test.ts` |
| Consumer package surface | Packed package exports and basic downstream import/use path | `npm run smoke:consumer` |
| 300-wave proof | Dry-run control-plane topology alias, run plan, provider noop operation, evidence expectations, blocked closeout | `npm run proof:wave-300` |

## Non-Claims

These checks do not claim live GPU capacity, cold cluster startup latency, live
300-sandbox admission, or production HTTP route ownership.

- GAL Swarm owns package contracts and provider-neutral planning.
- The Swarm HTTP API is owned by the `gal-api` microservice.
- Live provider provisioning is owned by Stratus/provider adapters.
- Individual generated artifact verification is owned by the
  prompt-to-binary framework layer.
- The 300-wave proof is a dry-run control-plane proof. It verifies planning,
  noop provider operation shape, ledger expectations, and closeout blocking; it
  does not prove that 300 live sandboxes started.
- The 300-wave proof does not require the no-op provider command to fan out 300
  workers. Provider command worker count is capacity-action evidence, not
  evidence of 300 live worker admission.

## Evidence Requirements

Verification evidence must identify:

- command name and full argument list
- branch and commit
- CI workflow name or local command output
- generated proof JSON when a proof script runs
- package tarball smoke result when `npm run smoke:consumer` runs
- skipped tool or provider dependency, with the authoritative follow-up proof
  location

Tool-gated skips are allowed only when the missing dependency is outside this
package's provider-neutral contract. A skipped live provider check must not be
reported as a passed live-provider proof.

## Changing The Test Surface

Adding, renaming, weakening, or retiring a required check is a standard change.
The change must update this document, `docs/standard.manifest.json` when the
canonical docs surface changes, and an ADR when the rationale needs to survive
future maintenance.

```ptb.requirement v0
{
  "id": "REQ-gal-swarm-testing-surface-001",
  "intent": "GAL Swarm must define and preserve its always-on testing surface for package contracts, topology modes, evidence, run API behavior, proof scripts, and consumer exports.",
  "inputs": [
    {
      "name": "testing_standard",
      "type": "MarkdownDocument"
    },
    {
      "name": "package_scripts",
      "type": "PackageJsonScripts"
    }
  ],
  "outputs": [
    {
      "name": "verification_evidence",
      "type": "GalSwarmVerificationEvidence"
    }
  ],
  "constraints": [
    "type-check, tests, build, and consumer smoke remain always-on for package changes",
    "architecture mode behavior remains covered by topology tests",
    "proof scripts state dry-run and provider-neutral scope accurately",
    "live provider capacity is never claimed from dry-run evidence"
  ],
  "verification": [
    {
      "gate": "gal_swarm_type_check",
      "kind": "typescript"
    },
    {
      "gate": "gal_swarm_vitest_suite",
      "kind": "unit"
    },
    {
      "gate": "gal_swarm_consumer_smoke",
      "kind": "package"
    },
    {
      "gate": "gal_swarm_proof_scripts",
      "kind": "proof"
    }
  ]
}
```
