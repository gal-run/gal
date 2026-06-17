# Agent OS: Declarative Agent Runtime

The Agent OS is the **runtime environment** for autonomous agent systems. It is the
layer between high-level orchestration and the raw agent dispatch — providing
persistent infrastructure, governance enforcement, and self-improvement loops.

## Architecture

```
                         ┌─────────────────┐
                         │  Intent / Goal   │
                         └────────┬────────┘
                                  │
                                  ▼
                    ┌─────────────────────────┐
                    │    ORCHESTRATOR          │
                    │    (meta-reasoning)      │
                    └────────────┬────────────┘
                                 │
                                 ▼
 ┌───────────────────────────────────────────────────────────────┐
 │                        AGENT OS                              │
 │                                                               │
 │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
 │  │ Worker   │  │ Memory   │  │ Governance│  │ Self-Improve │ │
 │  │ Pool     │  │ Store    │  │ Engine    │  │ Loop         │ │
 │  │          │  │          │  │          │  │              │ │
 │  │ - Leases │  │ - Vector │  │ - Policy  │  │ - Run→Audit │ │
 │  │ - HB     │  │ - KV     │  │ - OPA     │  │ - Learn     │ │
 │  │ - Retry  │  │ - Graph  │  │ - Audit   │  │ - Improve   │ │
 │  │ - DLQ    │  │ - Episodic│  │ - Verify  │  │ - Deploy    │ │
 │  └──────────┘  └──────────┘  └──────────┘  └──────────────┘ │
 │                                                               │
 │  ┌──────────────────────────────────────────────────────────┐│
 │  │              CONSTITUTION VERIFIER GATE                  ││
 │  │              (constitution-layer compliance)             ││
 │  └──────────────────────────────────────────────────────────┘│
 └───────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   Agent Dispatch Layer  │
                    │   (pluggable backend)   │
                    └─────────────────────────┘
```

## Key Capabilities

### 1. Worker Pool Management
Long-lived agent workers with leases, heartbeats, retries, and dead-letter queues.
Not ephemeral per-task agents — persistent workers that maintain context across
tasks. This is the "OS process" model for agents.

### 2. Persistent Memory
Four memory stores shared across all agents:
- **Vector DB**: Semantic similarity for task history, code patterns
- **KV Store**: Configuration, secrets (encrypted), feature flags
- **Graph DB**: Codebase dependency graphs, agent relationship graphs
- **Episodic Store**: Full session transcripts for learning and audit

### 3. Governance Engine
Policy enforcement as a runtime primitive. OPA-style policy rules that gate
every agent action, resource allocation, and memory access. Policies are
declarative and version-controlled.

### 4. Self-Improvement Loop
```
Run → Audit → Learn → Improve → Deploy → Repeat
```
- **Run**: Execute tasks via the orchestrator
- **Audit**: Analyze results, detect failures, measure quality
- **Learn**: Extract patterns, update model preferences, refine heuristics
- **Improve**: Update policies, topology weights, model routing
- **Deploy**: Push improvements to running system without restart

### 5. Declarative Manifests
Everything is YAML: agent systems, task definitions, worker pools, policies,
memory schemas, improvement pipelines. No imperative code at the runtime layer
— the OS interprets manifests.

## Compliance (Constitution Layer)

The Agent OS sits above an immutable si-bootstrap layer. It must prove:
- **G1 (Human Sovereignty):** All worker operations have halt paths
- **G2 (Alignment Stability):** Self-improvement loop proves convergence
- **G3 (Resource Bounds):** Worker pool respects compute/financial caps
- **G4 (Transparent Operation):** All memory operations are audit-logged
- **G5 (Verifiable Compliance):** Every manifest change is verified

## What Agent OS is NOT
- NOT a model training system
- NOT a replacement for the orchestrator (it hosts it)
- NOT an agent itself — it's infrastructure
- NOT a chat interface or user-facing product

## Reference Implementation

Current Rust bootstrap usage:

```bash
cargo test
cargo run -- plan examples/system-manifest.yaml --active-leases 2 --queued-tasks 2
cargo run -- apply examples/system-manifest.yaml --state /tmp/agent-os-runtime.json --active-leases 2 --queued-tasks 2
```

`cargo test` verifies the manifest planner, persisted runtime state, and worker lifecycle basics. `cargo run -- plan examples/system-manifest.yaml --active-leases ... --queued-tasks ...` loads the reference manifest, applies an explicit utilization snapshot, and prints the projected reconcile result as formatted JSON. `cargo run -- apply ... --state ...` loads or creates a saved runtime-state file, reconciles the worker pool toward the manifest, persists the updated runtime plus its last scaling decision, and verifies the resulting state.

Current bootstrap coverage:
- A versioned manifest envelope (`apiVersion`, `kind`, `metadata`, `spec`) for the bootstrap runtime declaration
- Declarative `SystemManifest` parsing for worker-pool, memory, governance, and self-improvement settings
- A structured reconcile result with explicit `observe`, `observed_after`, `scaling`, `diff`, `plan`, `apply`, and `verify` sections
- Worker runtime basics: pool seeding, task claiming, heartbeat renewal, stale-worker reaping, retry tracking, revive/scale/drain transitions, and dead-letter handling
- Utilization-aware scaling from bootstrap `active_leases` / `queued_tasks` inputs, bounded by manifest caps and thresholds
- A persisted runtime-state loop for `apply` / `reconcile`, including manifest compatibility checks, saved JSON state snapshots, and last scaling decision metadata across runs
- A checked-in reference manifest plus a minimal CLI entrypoint for exercising both dry-run planning and real apply reconciliation

Still pending:
- Persistent implementations for memory stores, governance policy evaluation, and self-improvement execution
- Additional manifest kinds and deeper schema validation beyond the current bootstrap envelope
- Integration with a pluggable dispatch backend and the upstream orchestrator runtime

## Reconcile Loop

Dry-run against an empty runtime:

```bash
cargo run -- plan examples/system-manifest.yaml --now 1700000000
```

Dry-run against an existing saved runtime:

```bash
cargo run -- plan examples/system-manifest.yaml --state /tmp/agent-os-runtime.json --now 1700000060
```

Dry-run with an explicit burst signal:

```bash
cargo run -- plan examples/system-manifest.yaml --active-leases 2 --queued-tasks 2 --now 1700000090
```

Persisted apply / reconcile:

```bash
cargo run -- apply examples/system-manifest.yaml --state /tmp/agent-os-runtime.json --now 1700000120
# alias:
cargo run -- reconcile examples/system-manifest.yaml --state /tmp/agent-os-runtime.json --now 1700000180
```

Scale down with an explicit idle snapshot:

```bash
cargo run -- apply examples/system-manifest.yaml --state /tmp/agent-os-runtime.json --active-leases 0 --queued-tasks 0 --now 1700000240
```

The state file stores the last applied manifest metadata, the worker pool snapshot, and the last scaling decision. Reusing the same state file across runs lets the bootstrap reconcile loop revive failed workers, seed missing workers, scale up on queued demand, and drain excess capacity instead of always starting from an empty runtime.

## Next
- [ ] SPEC.md — full component specifications
- [ ] Manifest schema definitions
- [ ] Expand the Rust reference implementation beyond planning and worker lifecycle basics
- [ ] Integration with a dispatch backend and the orchestrator
