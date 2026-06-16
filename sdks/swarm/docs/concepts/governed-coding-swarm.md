# Governed Coding Swarm

GAL Swarm should behave like a governed coding engine, not a generic agent chat
room. The developer gives one objective; GAL chooses the execution topology,
places bounded workers on the right fleet, reconciles their outputs, and returns
evidence. GAL adopts the public Swarms taxonomy and coordination patterns as
input aliases, but it does not run or depend on the Swarms Python runtime.

## Default Flow

1. Scope the objective, repositories, risk, and closeout criteria.
2. Build a task graph with explicit dependencies and file or ownership bounds.
3. Route the graph into a topology: sequential, concurrent, graph,
   hierarchical, mixture, group chat, forest, heavy, or router.
4. Place each lane on the cheapest capable runner class.
5. Require every lane to publish evidence before reconciliation.
6. Reconcile worker outputs into one coherent diff, PR, or handoff.
7. Verify tests, CI, runtime proof, and approvals before marking complete.

## Hot-Start Dispatch SLO

The governed swarm can target a real 300-sandbox wave, but millisecond startup
only means admission to workers that are already warm. The operational formula
is:

```text
milliseconds = admission to pre-warmed runner
```

It never means cold VM or pod provisioning. A cold path may still be correct,
but it is reported as `cold_provision`, not as millisecond dispatch.

The hot-start contract distinguishes three outcomes:

- `dispatch_hot`: the GitHub/Stratus warm pool has enough idle or allocatable
  pre-warmed capacity to absorb the full target wave and keep the warm idle
  target.
- `scale_warm_pool`: the wave can still be admitted onto warm workers, but warm
  spare capacity is below target and Stratus/GitOps should refill the pool.
- `cold_provision`: no hot capacity can satisfy the request, or observed
  dispatch latency exceeds the target, so Stratus must provision new capacity
  outside the millisecond SLO.

For the current Ferrari-scale target, `desiredConcurrentSandboxes` and
`targetConcurrentSandboxes` are both 300. The SLO is valid only when
`warmIdleWorkers + warmAllocatableWorkers >= 300`; otherwise GitHub and Stratus
must reason about cold provisioning instead of hot dispatch.

## Topology Semantics

- `router`: default mode; selects the topology from task count, dependency
  shape, risk, evidence needs, and fleet availability.
- `sequential`: one narrow lane for simple work.
- `concurrent`: independent lanes with no shared file ownership.
- `graph`: dependency-aware DAG for multi-step coding and release work.
- `hierarchical`: director, bounded workers, reviewer, reconciler, verifier.
- `mixture`: several independent proposals with an aggregator decision.
- `group_chat`: bounded deliberation only; never the default execution path.
- `forest`: multiple specialist teams under a single evidence ledger.
- `heavy`: high-risk or release-critical work with redundant review and proof.

## Public Swarms Aliases

Public Swarms names are normalized into GAL-native modes before routing.
They are compatibility aliases into GAL primitives, not runtime engines or
separate orchestration implementations.
Client surfaces should read topology aliases from `@gal/swarm` instead of
copying this section. `listGalSwarmTopologyAliases()` returns the compact
serializable alias catalog with canonical GAL mappings, and
`formatGalSwarmTopologyAliasHelp(prefix?)` formats the same catalog as stable
human-readable help text.

- Existing workflow names map directly: `SequentialWorkflow` to `sequential`,
  `ConcurrentWorkflow` to `concurrent`, `GraphWorkflow` to `graph`,
  `HierarchicalSwarm` to `hierarchical`, `MixtureOfAgents` to `mixture`,
  `GroupChat` to `group_chat`, `ForestSwarm` to `forest`, and `HeavySwarm` to
  `heavy`.
- Router names `SwarmRouter`, `MultiAgentRouter`, `AgentRouter`, and
  `ModelRouter` map to `router`; `SkillOrchestra` also maps to `router`
  because GAL owns native capability selection.
- Dynamic organization names `AgentRearrange` and `SwarmRearrange` map to
  `graph`; `PlannerWorkerSwarm`, `HybridHierarchicalClusterSwarm`, and `HHCS`
  map to `hierarchical`; `HierarchicalStructuredCommunicationFramework` maps
  to the same governed hierarchy; `Tree` and `TreeAgent` map to `forest`.
- Auto-selection names `AutoSwarmBuilder` and `auto` map to GAL auto routing.
- Decision names `MajorityVoting`, `MoA`, `SelfMoASeq`, `LLMCouncil`, and
  `BatchedGridWorkflow` map to `mixture`; `CouncilAsAJudge`,
  `CouncilOfJudges`, `AdvisorSwarm`, `PlannerGeneratorEvaluator`,
  `PeerReviewProcess`, `TrialSimulation`, `AdvancedResearch`, and `MALT` map
  to `heavy`; `DebateWithJudge`, `OneOnOneDebate`, `ExpertPanelDiscussion`,
  `RoundTableDiscussion`, `MediationSession`, `BrainstormingSession`,
  `CouncilMeeting`, `MentorshipSession`, `NegotiationSession`, and
  `SocialAlgorithms` map to `group_chat`.
- Sequential session names such as `InterviewSeries` map to `sequential`.
- Distribution or tabular processing names `RoundRobin`,
  `RoundRobinSwarm`, `SpreadSheetSwarm`, and `SpreadsheetSwarm` map to
  `concurrent`.
- Social topology names map to the closest governed primitive:
  `Broadcast`/`broadcast` to `group_chat`,
  `PyramidSwarm`/`pyramid_swarm` to `hierarchical`, and
  `CircularSwarm`/`circular_swarm`, `grid_swarm`, `MeshSwarm`/`mesh_swarm`,
  `OneToOne`/`one_to_one`, and `StarSwarm`/`star_swarm` to `graph`.

## Fleet Placement

The scheduler should prefer the smallest capable worker:

- Linux x64 lanes for builds, tests, API, and infrastructure coding.
- macOS/arm64 lanes for Apple, UI, desktop, and visual verification work.
- Kali/security lanes for security review and adversarial validation.
- GPU/model-serving bursts only when prediction and budget gates justify them.
- Serverless fallback for low-utilization tail work.

## Governance Rules

- Workers get bounded ownership, not global authority.
- File conflicts are blocked or escalated before edit overlap.
- Risky actions require approval evidence.
- Review and reconciliation are separate lanes for non-trivial swarms.
- The evidence ledger must contain diffs, tests, CI/runtime proof, and any
  remaining blockers.
- Issues are not closed by worker lanes unless closure proof is explicit and
  current.

## Wave Evidence Ledger

The collaboration ledger is the shared proof surface for large governed waves.
`GalSwarmWaveEvidenceLedger` supports the current Ferrari-scale target of 300
sandboxes while staying lightweight and provider-neutral.

Each worker entry records:

- lane and worker identity
- role, risk, task ids, and assigned repositories
- exclusive or shared file lease boundaries
- proof artifacts such as diffs, commits, PRs, issue comments, logs, traces, or
  screenshots
- test evidence and runtime evidence
- worker-reported conflicts and reconciliation readiness

The reconciler records accepted and rejected workers, resolved conflicts, proof
artifacts, test/runtime evidence, and closeout readiness. High and critical risk
waves require reconciler proof before closeout; worker evidence alone is not
enough.

`summarizeGalSwarmWaveEvidence()` is the local closeout gate. It reports missing
proof/test/runtime evidence, overlapping exclusive file leases, unresolved
blocker conflicts, unsatisfied closeout criteria, and missing reconciler proof.
`detectGalSwarmWaveLeaseConflicts()` can be used earlier to reject overlapping
file ownership before workers edit the same path.

## Developer Experience

The developer should rarely pick a mode. GAL should default to `router`, explain
the selected topology, and expose manual mode selection only for expert runs or
debugging.
