# GAL Definition of Moat — and the anti-drift gate

GAL exists to be the **governance control plane for AI agents**: *who is allowed to
run what, did it pass the gates, who approved the mutation, is it compliant, did it
drift.* Everything else is data plane that mature products already own.

This doc is the policy the charter checker (`governance/charters.py`) and CI enforce.
It is dogfood: we govern our own org with our own control plane.

## What is the moat (BUILD)
A repo is moat (`moat: true`, eligible for `tier: core`) only if it is one of:
- **Policy + enforcement** — defining and *enforcing* what agents may do (gal-mcp, governance-svc, gal-cli-rs, gal-sandbox).
- **Constitution / root-of-trust** — si-bootstrap.
- **Governance contracts** — agent cards, task/eval-gate/report schemas, interop profiles (gal-agents, agent-network, gal-evals *gate*).
- **Cross-runtime capture + audit** — hooks that observe/govern output from any runtime.
- **Governance-specific decisioning/proof** — gal-model (learned advisory), gal-benchmark (proof), gal-swarm/gal-prediction (governed dispatch).

## What is NOT the moat (INTEGRATE / BUNDLE — do not rebuild)
If a capability maps to any of these commodity categories, it must be `tier: integrate`
with `integrates:` naming the product we use instead — or it is rejected:
- Evals / scoring → DeepEval, openevals, Ragas
- Observability / tracing → OpenTelemetry, Langfuse (self-host), LangSmith
- Computer/browser/IDE/terminal automation → Anthropic computer-use, Playwright, node-pty
- Coding agents → Claude Code, Cursor, Codex
- Model serving / generic ML infra, generic terminal/UI shells, feature-flag/entitlement UIs

Rationale: rebuilding these is a permanent treadmill behind better-funded teams and
dilutes the only thing nobody else will build. Bundle self-hosted OSS for a cheaper
default; integrate the proprietary leaders for customers who already use them.

## The four tiers
| Tier | Meaning | Requirement |
|------|---------|-------------|
| `core` | governance moat or required infra | `moat: true` (except explicitly-tagged required infra, e.g. marketing site) |
| `integrate` | commodity capability | `integrates: <product>` set; retire the rebuild, keep only the thin governance hook |
| `experimental` | governance-relevant research, pre-production | `review_by: <future date>`; off the production critical path |
| `archive` | off-mission / superseded | read-only; do not depend on it |

## The anti-drift gate (how we don't drift again)
1. **Every repo MUST carry `.gal/charter.yaml`** matching its registry entry. CI fails without one.
2. **`tier: core` requires `moat: true`.** A core claim that isn't moat is a drift violation.
3. **New repos / major new capabilities require an approved charter before first merge.**
   If the capability is a commodity category above, the charter must justify why no
   integration/bundle works — approved only by the **moat guardian**.
4. **Quarterly re-attestation.** An `experimental` charter past its `review_by`, or any
   charter whose reality diverged from its tier, surfaces as a **drift alert** in
   gal-dashboard. Drift is a tracked item, not a vibe.
5. **Enforced by our own stack**, not willpower:
   - `si-bootstrap`: a "governance-first / no commodity rebuild" pillar.
   - `governance-svc`: a policy rule evaluating charters across the org.
   - `gal-cli-rs` hook + the `charter-check` CI: block merges lacking a valid charter
     or adding a known commodity-rebuild dependency without an approved exception.

> If GAL can't keep itself from drifting with its own control plane, that's the loudest
> possible signal about the product. If it can, that's the best demo we have.
