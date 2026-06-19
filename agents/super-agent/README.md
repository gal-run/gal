# Super-Agent: Meta-Reasoning Orchestration Layer

The super-agent is not another peer agent. It is a **higher-order control plane**
that reasons about agents, decomposes intent, selects execution topologies,
spawns sub-agents dynamically, and synthesizes results.

## Canonical Docs

This repository is now treated as the separate research home for recursive
capability synthesis and the chicken-and-egg bootstrap problem.

- [docs/chicken-and-egg.md](docs/chicken-and-egg.md)
- [docs/recursive.md](docs/recursive.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/requirements.md](docs/requirements.md)
- [docs/adr/0001-recursive-capability-synthesis-boundary.md](docs/adr/0001-recursive-capability-synthesis-boundary.md)
- [SPEC.md](SPEC.md)

The repository stays under the `si-bootstrap` constitution and verifier. It
does not replace that root of trust.

## Architecture

```
                    ┌─────────────┐
                    │   Intent    │  Human or upstream system
                    └──────┬──────┘
                           │
                           ▼
              ┌────────────────────────┐
              │    META-REASONING      │
              │                        │
              │  "Should I spawn       │
              │   agents for this?     │
              │   What topology?       │
              │   Which models?        │
              │   What's the risk?"    │
              └────────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │    DECOMPOSER          │
              │                        │
              │  Task → Subtask DAG    │
              │  Dependency graph      │
              │  MECE decomposition    │
              │  Parallelism detection │
              └────────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │    TOPOLOGY ROUTER     │
              │                        │
              │  DAG metrics →         │
              │  parallel width,       │
              │  critical path,        │
              │  coupling score        │
              │       ↓                │
              │  Route to:             │
              │  τ_P (parallel)        │
              │  τ_S (sequential)      │
              │  τ_H (hierarchical)    │
              │  τ_X (hybrid)          │
              └────────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │    AGENT FACTORY       │
              │                        │
              │  Sub-agent = {         │
              │    instruction,        │
              │    context,            │
              │    tools,              │
              │    model               │
              │  }                     │
              │                        │
              │  On-the-fly creation   │
              │  with task-specific    │
              │  configuration         │
              └────────────┬───────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌────────┐  ┌────────┐  ┌────────┐
         │Agent A │  │Agent B │  │Agent C │
         └───┬────┘  └───┬────┘  └───┬────┘
             │            │            │
             └────────────┼────────────┘
                          │
                          ▼
              ┌────────────────────────┐
              │    AGGREGATOR          │
              │                        │
              │  Collect sub-results   │
              │  Verify consistency    │
              │  Resolve conflicts     │
              │  Synthesize output     │
              └────────────┬───────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │    VERIFIER GATE       │
              │                        │
              │  → si-bootstrap        │
              │    constitution check  │
              │    mandatory pass      │
              └────────────┬───────────┘
                           │
                           ▼
                       Result
```

## Key Innovations

### 1. Meta-Reasoning (Deliberation-First)

Before any agent is spawned, the super-agent deliberates:
- Is multi-agent warranted? (complexity threshold check)
- What topology fits the task shape?
- What's the estimated cost/latency trade-off?
- Are there safety concerns requiring human-in-the-loop?
- Has a similar task been done before? (memory lookup)

This prevents unnecessary multi-agent overhead for simple tasks.

### 2. Dynamic Topology Selection

Four canonical topologies, selected automatically:

| Topology | When | Behavior |
|---|---|---|
| **τ_P (Parallel)** | Independent subtasks | All run concurrently, results merged post-hoc |
| **τ_S (Sequential)** | Linear dependencies | Subtasks execute in order, each receiving prior context |
| **τ_H (Hierarchical)** | Complex decomposition | Lead agent decomposes, sub-agents report back |
| **τ_X (Hybrid)** | Mixed DAG | DAG partitioned into parallel groups connected sequentially |

Selection algorithm: O(|V|+|E|) analysis of task DAG metrics (parallelism width, critical path depth, inter-subtask coupling).

### 3. On-the-Fly Sub-Agent Creation

Every sub-agent is instantiated as a tuple `(Instruction, Context, Tools, Model)`:
- **Instruction**: Task-specific system prompt
- **Context**: Only relevant code/docs — not full repo context
- **Tools**: Only tools needed for the task (principle of least privilege)
- **Model**: Selected per-task (cheapest model that can handle it)

No predefined agent roles. Agents are created, executed, and destroyed per task.

### 4. Result Aggregation with Verification

Results from sub-agents are aggregated with:
- Consistency checking across parallel outputs
- Conflict resolution (contradictory changes detected)
- Synthesis into a coherent final result
- Mandatory constitution compliance check before output

## Compliance with si-bootstrap

The super-agent is Layer 1 in the ladder. It must prove:
- **G1 (Human Sovereignty):** Every spawned sub-agent has a halt path. Destructive actions require consent gate.
- **G2 (Alignment Stability):** Meta-reasoning must not optimize against oversight.
- **G3 (Resource Bounds):** Total sub-agent compute stays within declared caps.
- **G4 (Transparent Operation):** All spawn/destroy/aggregate events are logged and hash-chained.
- **G5 (Verifiable Compliance):** Verifier gate is mandatory and unbypassable.

## Reference Implementation

The current Rust bootstrap is still a planning-first reference implementation,
but it now includes a mandatory bootstrap verifier gate anchored to the active
`si-bootstrap` constitution hash, a hash-chained run event log, and a matching
gRPC surface over the same persisted runtime state:

```bash
cargo test
cargo run -- execute "review test and deploy this service in parallel"
cargo run -- execute "delete production credentials and transfer billing ownership immediately" --require-consent
cargo run -- status run-000001
cargo run -- approve run-000002
cargo run -- halt run-000001
cargo run -- serve 127.0.0.1:50051
```

The CLI prints JSON run records and persists local state under `.super-agent/state.json`.
The gRPC server uses the same state file by default. Override it with
`SUPER_AGENT_STATE_PATH=/path/to/state.json` when you need an isolated runtime.

The bootstrap currently covers:
- intent complexity classification
- explicit task decomposition into structured subtasks with dependency edges
- single-agent passthrough plans for low-complexity requests
- multi-agent orchestration plans for medium-and-up requests with staged execution groups
- topology selection from DAG metrics derived from the explicit subtask graph
- bootstrap verifier decisions of `allow`, `require consent`, or `deny`
- local `execute` / `status` / `approve` / `halt` lifecycle state for planned runs
- hash-chained event logging for plan creation, decomposition, verifier checks, consent grants, and operator halts
- a real `tonic` gRPC service surface for `Execute`, `Status`, and `Halt` against the persisted bootstrap runtime

Still pending:
- dynamic sub-agent creation and execution beyond planning
- result aggregation and actual downstream execution once a run reaches `Ready`
- integration with an external agent-dispatch backend and a broader compliance test suite

## Plan Output Shape

`execute` and `status` now expose the orchestration model directly in the JSON run
record:

- `plan.execution_model`: `SingleAgentPassthrough` or `MultiAgentOrchestration`
- `plan.subtasks`: structured work units with `id`, `domains`, `depends_on`, and `preferred_agent`
- `plan.execution_stages`: topological batches that show which subtasks can run together
- `plan.metrics`: DAG metrics computed from the explicit dependency graph, not heuristic-only estimates

For example, a low-complexity request such as `fix typo` yields a one-subtask
passthrough plan, while a medium request such as `review, test, and deploy this
service in parallel` yields a staged multi-agent plan where deploy waits on the
review and test subtasks.

## gRPC Surface

The bootstrap now ships a `SuperAgent` gRPC service implemented with `tonic`.
It is intentionally narrow and exposes only the persisted runtime lifecycle:

```protobuf
service SuperAgent {
  rpc Execute(ExecuteRequest) returns (ExecuteResponse);
  rpc Status(StatusRequest) returns (StatusResponse);
  rpc Halt(HaltRequest) returns (HaltResponse);
}
```

`Execute` accepts an intent string plus an explicit `require_consent` flag and
returns the same run record shape that the CLI persists locally. `Status` and
`Halt` look up or mutate that same record by `run_id`.

The source proto lives at [src/proto/super_agent.proto](src/proto/super_agent.proto).
Run `cargo run -- serve 127.0.0.1:50051` to expose the service locally.

## Next

- [ ] SPEC.md — full component specifications
- [ ] Explicit task decomposition and agent factory
- [ ] Integration with an external agent-dispatch backend
- [ ] Aggregation, verifier gate, and compliance test suite against si-bootstrap
