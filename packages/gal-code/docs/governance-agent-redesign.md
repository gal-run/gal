# GAL Code Governance Agent Redesign

GAL Code is the local execution surface for GAL's governance layer for coding agents. It should keep the fast TUI and server engine, but frame every session around policy, evidence, and closure readiness rather than only request-driven coding.

## Product Position

- GAL Code runs the coding session.
- GAL policy decides what the agent may do.
- GAL audit records what the agent actually did.
- GAL swarm execution scales compute through bounded, independently reviewable agent lanes.
- GAL dashboard becomes the approved source of truth once policy sync is authoritative.

The local TUI may show effective local policy today. It must not claim a dashboard-approved baseline until the runtime has a real evaluated policy snapshot with source, version, hash, trust state, and degraded/offline status.

## First TUI Slice

- Use GAL brand primitives from `gal.run`: black and white surfaces, neon green primary accent, compact terminal/status presentation.
- Replace the inherited welcome surface with an asymmetric cockpit: a status masthead, runtime fact lanes, and a narrower directive dock for the next governed action.
- No centered logo or stacked generic assistant welcome in the governance surface.
- No inherited OpenCode strings in visible governance copy.
- No prompt rail vocabulary in visible governance copy.
- The directive dock should name the next action under policy, show the shell gate separately, and keep policy/risk context adjacent to the input without making a blocking dashboard wall.
- Replace generic coding prompts with governance tasks: PR governance audit, release blockers, safe closeout, issue and runtime evidence.
- Add a Governance intelligence sidebar section using current local signals: effective policy baseline, approval queue, MCP health, LSP count, session diff, and branch/scope.
- Keep warning, error, success, and info colors distinct from the GAL brand accent so operational status stays readable.
- Keep the developer experience autonomous and light: governance is visible instrumentation and guardrails, not a blocking dashboard wall.

## Next Architecture Slices

1. Runtime governance ledger

   Record durable local events for tool calls, permission requests/replies, model calls, MCP health changes, config snapshots, policy evaluations, GALT decisions, and execution outcomes. Start observe-only before enforcement changes.

2. Approved policy snapshot evaluator

   Emit a canonical evaluated policy object after config load: sources, precedence, org identity, policy hash/version, managed/unmanaged status, provider/MCP/tool/permission provenance, and degraded/offline state. The TUI should read this object for baseline and policy-source labels.

3. GitHub-native review gate

   Attach repository owner/name, remote URL, default branch, current branch, commit, PR/issue, required checks, changed files, and test evidence to session context. Use that context to gate risky actions such as edit, write, bash, merge, deploy, and issue closure.

4. Governance swarm coordinator

   Represent parallel subagents as governed compute lanes with task scope, owned files, policy snapshot, evidence produced, and reconciliation status. The TUI should show swarm scale without hiding who changed what or which proof each lane produced.

## Design Rule

Every governance claim in the UI must map to a runtime fact. Until that fact exists, use words like "effective local baseline" or "runtime signal" instead of "approved baseline" or "dashboard policy".
