# Managed-Agent Evaluation UI

This document records the intended `gal-dashboard` ownership boundary for
managed-agent deployment and evaluation. `gal-dashboard` should be the place
where users configure, test, compare, and promote managed agents.
Product-specific agents, including email triage backed by a Gmail connector,
should be templates or selected Agent Cards, not hardcoded dashboard behavior.

## Ownership Boundary

`gal-dashboard` owns the operator experience:

- list registered managed agents and candidate versions;
- create a new version from an Agent Card, runtime ref, connector refs, policy,
  and vault refs;
- select the required evaluation suite;
- start eval runs through `gal-api`;
- render report summaries, failed cases, expected/actual diffs, and suggestions;
- show deployment gate state and block promotion when `gal-api` says gates fail;
- show dry-run and approval-gated runtime state before any mutating action.

`gal-dashboard` should not run eval scoring locally, hold Gmail secrets, call
live inbox APIs directly, or decide promotion independently from `gal-api`.

## First User Flow

1. User opens `/managed-agents`.
2. User selects a deployment template such as Email triage.
3. Dashboard fills an Agent Card ref, task type, connector refs, vault refs,
   policy ref, and required eval suites from the template.
4. User saves or reuses the managed-agent definition.
5. User registers a version with a runtime ref and provider-neutral connector
   payload.
6. User starts an evaluation run.
7. A worker claims the eval work packet and submits a `gal.evals.report.v1`
   snapshot back to `gal-api`.
8. Dashboard shows gate state and promotion availability from the API.
9. User reviews the report summary or edits the candidate configuration.
10. Dashboard enables promotion only when the API reports required gates passed.
11. Runtime starts in dry-run or approval-gated mode before live mutation.

## API Integration

The dashboard API client should cover managed-agent endpoints owned by
`gal-api`, not bake Gmail instructions into background sessions. The first
`/managed-agents` route uses definition, version, eval queue, claim, and
promotion calls; report submission is worker-facing but still part of the same
contract:

```http
GET  /api/managed-agents/:orgName
POST /api/managed-agents/:orgName
POST /api/managed-agents/:orgName/:agentId/versions
POST /api/managed-agents/:orgName/:agentId/versions/:version/eval-runs
GET  /api/managed-agents/:orgName/:agentId/versions/:version/eval-runs/:runId
POST /api/managed-agents/:orgName/:agentId/versions/:version/eval-runs/:runId/claim
POST /api/managed-agents/:orgName/:agentId/versions/:version/eval-runs/:runId/report
POST /api/managed-agents/:orgName/:agentId/versions/:version/promote
```

The dashboard should render `gal.evals.report.v1` snapshots produced by
`gal-evals` and stored by `gal-api`.

## Relationship To Existing Pages

The current dashboard already has:

- an Agents page for detected/local agent surfaces;
- a Sessions page with background, interactive, queue, observability,
  credentials, and swarm views;
- credential-oriented UI that can become a reference point for vault-bound
  connector setup.

Managed-agent deployment is a dedicated flow under the Agents area. Sessions
remain the runtime observability surface after a version is deployed or
evaluated.

The first implementation is a dedicated `/managed-agents` route linked from the
main dashboard navigation. It provides template selection, definition saving,
version registration, eval queueing, work-packet claim preview, and promotion
actions. It does not replace the existing Agents page, which remains the
detected coding-agent catalog.

## Report Rendering Requirements

The report view should show:

- suite ID, suite version, agent ID, task type, and candidate version;
- overall score and per-metric scores;
- gate pass/fail state from `gal-api`;
- failed cases with expected and actual field values;
- missing predictions, unknown case IDs, and adapter errors;
- links to the immutable report snapshot and candidate version;
- clear blocked/passed promotion state.

For email triage backed by Gmail, render synthetic or redacted case fields only.
Real subject lines, bodies, OAuth tokens, and mailbox identifiers should not be
displayed in generic eval views unless a separate sensitive-data viewer is
designed.

## Email Triage Dogfood

Email triage is the first template because mailbox triage is noisy, high-volume,
and easy to get wrong. Its initial connector ref can point at Gmail, but the
dashboard flow must stay provider-neutral. It should prove that the platform can:

- evaluate before deployment;
- expose mistakes as field-level mismatches;
- support correction loops without code changes in `gal-agents`;
- keep credentials and live inbox access inside `gal-api`/runtime boundaries;
- use the same deployment path future non-email agents will use.

The email template currently preselects `gal.ops-triage.email.v1`, Gmail
connector metadata, vault refs, policy refs, and dry-run runner refs. Suggested
labels and richer adapter defaults are follow-up configuration. The template
must still flow through the same managed-agent version, eval run, report, and
promotion APIs as every other agent.

## UI States

The managed-agent page should include these states before implementation is
considered complete:

- empty state with no registered managed agents;
- draft version with missing connector or vault reference;
- eval run queued/running;
- eval passed and promotion available;
- eval failed with actionable case failures;
- promoted version with deployment status;
- dry-run mode active;
- approval-gated mode active;
- runtime error or stale report state.

The initial `/managed-agents` page covers template selection, definition
creation, version registration, eval queueing, work-packet claim preview, gate
state, and promotion actions. Remaining product work should add version history,
persisted eval-run lists, richer report rendering, runtime deployment status,
and sensitive-data-safe report detail views.
