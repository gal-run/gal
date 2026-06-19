# GAL Swarm Role Cards

`@gal/agents` exports three governed swarm role cards for 300-wave ledger work:

- `GAL_SWARM_WORKER_AGENT_CARD` (`gal.swarm.worker`) executes a bounded work item.
- `GAL_SWARM_VERIFIER_AGENT_CARD` (`gal.swarm.verifier`) verifies the worker result and evidence without committing changes.
- `GAL_SWARM_RECONCILER_AGENT_CARD` (`gal.swarm.reconciler`) reconciles worker and verifier results into a final ledger disposition or bounded follow-up task.

Each card requires:

- `parentWaveId`, `parentTaskId`, and `ledgerEntryId` correlation on task input.
- Terminal evidence artifacts such as `evidence.json`, `verification.md`, or `reconciliation.md`.
- A clean worktree before edits or verification.
- Explicit `allowedRepos` and `allowedPathGlobs` ownership bounds from the parent wave.
- Background-session-capable execution through `gal_code_background_session` or equivalent queue-backed runtime.

The cards define identities and governance contracts only. Swarm dispatch,
ledger storage, retry policy, queue ownership, and runtime execution remain in
the owning swarm or product runtime packages.
