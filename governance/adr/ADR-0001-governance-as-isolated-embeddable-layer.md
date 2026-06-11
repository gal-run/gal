# ADR-0001 — GAL is an isolated, embeddable governance layer (PEP/PDP), not a runtime or SDK

- Status: **Accepted** (founder decision, 2026-06-11)
- Deciders: Shay (founder), with verified codebase survey
- Extends: [`DEFINITION-OF-MOAT.md`](../DEFINITION-OF-MOAT.md) — this ADR is the *execution roadmap* for the moat the charter already declares.
- Related memory: `mcp-23376527` (decision), `mcp-6078b04` (OSS runtime research)

## Context

The enterprise had drifted into confusion about its own stack: `LangChain` / `LangGraph` /
`LangSmith` / `Langfuse` / `gal-agents` were used interchangeably with no clear layering, and
"is `gal-run` a runtime?" had no crisp answer. The strategic intent is settled: **migrate off
LangSmith, build on the best OSS, and integrate GAL governance deeply into those systems.**

The sharper question this ADR answers: GAL also ships a runtime and an SDK — so *what should GAL
be*? The market reality decides it. Agent **runtimes** (LangGraph Platform, Vercel, NVIDIA
harnesses) and **SDKs** (LangGraph, Claude Agent SDK, Google ADK, OpenAI Agents SDK, Microsoft
Agent Framework) are commoditizing fast, given away by well-funded incumbents to capture the model
spend above them. **Governance** — capability control, policy enforcement, HITL on
irreversible/outward actions, spend/risk gates, audit, and identity for non-human actors — is the
horizontal gap none of them solve. Owning a runtime/SDK is a knife-fight GAL cannot win and does
not need to. Owning the governance those all require makes GAL the layer they *embed*.

This is not a pivot. `DEFINITION-OF-MOAT.md` already codifies it (governance = moat;
runtimes/SDKs/eval-engines/observability = "integrate, do not rebuild") and CI already enforces it.
This ADR closes the gap between that written charter and the running code.

## Decision

**GAL is an isolated, embeddable governance layer — a portable Policy Decision Point (PDP) plus
thin Policy Enforcement Point (PEP) adapters and an open capability/Agent-Card spec — that plugs
into ANY agent runtime or SDK. The GAL-owned runtime and SDK are demoted to reference
integrations.** The model to emulate is **OPA (Open Policy Agent) for agents**: a standalone
decision engine with per-host enforcement hooks, integrated everywhere, owned by no host.

## Current state (verified 2026-06-11)

The PEP/PDP shape already exists — this is consolidation, not green-field:

| Piece | What it is | Disposition |
|---|---|---|
| `go-services/governance-svc` (Go) | PDP — `POST /enforcement/check`, `Policy{strict\|advisory\|disabled}`, `ToolPolicy{allow\|deny\|audit}`, runtime-agnostic decision model, no LLM coupling | **keep & isolate** (the core) |
| `gal-cli-rs` (Rust) | PEP — enforce/governance/hooks/audit/capture; cross-runtime; Claude Code Stop-hook | **keep** (reference PEP) |
| `gal-mcp` (MCP server) | PEP-over-MCP at `api.gal.run/mcp` — plugs into Claude Code, Cursor, Copilot, Codex, Gemini, Windsurf today | **keep** (the distribution wedge) |
| `cli/gal/governance` | the constitution: `DEFINITION-OF-MOAT.md`, `REGISTRY.yaml`, capability/charter schemas | **keep** (the spec home) |
| `core/gal-agents` (`@gal/agents`) | zero-dep SDK of governance *contracts* (Agent Card, capabilities, eval-gate); names ADK/OpenAI SDK as non-goals | **demote** to reference SDK |
| `gal-agents/runtime/langgraph` | one reference runtime on `deepagents`→LangGraph (the only LangGraph coupling; `governance.py` imports only `pydantic`) | **demote** to reference integration |
| `gal-code`, `gal-swarm` | a coding-agent fork; governed burst-compute | **demote** to integrate/infra |
| `gal-model` | learned governance advisory (ML) | **advisory only**, off the hard path; do not develop via Claude Code (Anthropic ML boundary) |

### The gap this ADR closes

Governance is real as artifacts but **governs nothing at runtime** today:
- **Three incompatible governance models** for the same concept: qa-agent-platform `agent_toolkit`
  (`capabilities.yaml` + `hitl.py`), `gal-agents` (`governance.py` `ActionClass` + `card.py`), and
  the `agent-network` Go structs. No shared schema.
- The intended single PDP (`governance-svc /enforcement/check`) is **called by nobody**.
- The audit hook (`agent_toolkit/governance.py`) is a permanent no-op (`GAL_GOVERNANCE_ENDPOINT`
  unset everywhere) and POSTs to `/v1/agent-runs`, a path the PDP does not serve.
- The runtime HITL gate is wired into **1 of 42** agents and lives only on an unmerged branch.

## Target architecture

```
agent runtimes & SDKs  (commodity — integrate)
  LangGraph · Claude Agent SDK · Google ADK · OpenAI Agents SDK · NVIDIA/harnesses
        │  each plugs in via a thin PEP adapter
        ▼
GAL governance (the moat — isolated, embeddable)
  PDP  — governance-svc /enforcement/check  (decide: allow/deny/audit)
  SPEC — capability manifest + Agent Card    (the open standard)
  PEP  — MCP server · Rust CLI hooks · per-SDK middleware  (enforce)
  advisory — gal-model (optional, off the hard path)
```

Distribution insight: the **MCP server is the wedge** — "governance over MCP" reaches every major
agent host with zero per-host engineering. No runtime/SDK vendor can match that reach, because each
of them *is* one host.

## Roadmap (executable)

1. **Converge to one contract.** Adopt one schema — the `capability-manifest` + Agent Card — as the
   single governance contract across qa-agent-platform, `gal-agents`, and `agent-network`. Merge the
   in-flight `gal capability validate` (gal-cli-rs) and the manifest schema off their worktrees to
   mainline as the canonical authority.
2. **Make the PDP real.** Finish `governance-svc.enforcementCheck` to evaluate real action rules
   (not enforcement-mode only); fix the PEP→PDP endpoint mismatch (`/v1/agent-runs` → `/enforcement/check`).
3. **Extract a standalone embeddable PDP.** Lift `governance-svc/{cmd,internal/domain,internal/store}`
   out of the 12-service Go monorepo; replace the Firestore-only policy store with a pluggable store
   behind the existing `store` interface; detach the `lib/` JWT+telemetry shims.
4. **Ship two reference PEP adapters first** (where we already have reach):
   - **MCP** — promote `gal-mcp` as the primary "governance over MCP" product.
   - **LangGraph** — harden qa-agent-platform `agent_toolkit` into the canonical LangGraph PEP that
     *calls* the PDP; then a **Claude Agent SDK** `PreToolUse` hook.
5. **Dogfood on our own fleet.** Wire the PEP into all 42 agents (not 1), set `GAL_GOVERNANCE_ENDPOINT`,
   and make the capability gate enforce at **runtime**, not just CI-lint. "If GAL can't keep itself
   from drifting with its own control plane, that's the loudest signal about the product." — the charter.
6. **Publish the spec.** Release the capability-manifest / Agent-Card schema as the open standard;
   open-core line is already drawn (spec + PDP + reference adapters open; management/multi-tenant
   control plane commercial).

## Consequences

- GAL stops competing on runtime/SDK and competes only where it can win and others won't build.
- The runtime question raised this session (self-hosted LangGraph vs LangSmith) becomes a *host*
  choice, not a strategy choice — GAL governs whichever host runs.
- Work is multi-repo and multi-session; this ADR is the contract the fleet executes against.

## Risks

- **PDP tenant coupling** — `governance-svc` is Firestore/org-coupled and lives in a monorepo; the
  decision *logic* is small and generic, but the extraction is the main lift (step 3).
- **Adapter sprawl** — mitigated by leading with MCP (one adapter, many hosts) before per-SDK code.
- **Spec adoption** — a governance spec only matters if hosts adopt it; dogfooding our own fleet (step 5)
  is the first proof, MCP reach is the second.

## References

Verified evidence: `gal-run/cli/gal/governance/{DEFINITION-OF-MOAT.md,REGISTRY.yaml}`;
`gal-run/backend/go-services/governance-svc/internal/domain/types.go`;
`gal-run/core/gal-agents/{README.md,package.json,src/managed-runtime.ts}`;
`gal-run/cli/gal-cli-rs/src/commands/governance.rs`; `gal-run/gal-cli/vendor/gal-mcp/src/tools/`;
Scheduler-Systems/qa-agent-platform `agent_toolkit/{governance.py,hitl.py,policy.py}`.
