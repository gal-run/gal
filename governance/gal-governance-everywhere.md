# GAL Governance Everywhere — architecture + open-core strategy

**Thesis:** one governance control plane (GAL) governs **every** agent runtime — OpenClaw,
Hermes, Claude Code, Codex, OpenShell, the LangGraph/LangSmith fleet, and gal-model — for
**people and agents alike**, with **human-in-the-loop on everything irreversible or
outward-facing**, while open-sourcing only the thin integration glue and keeping the
business logic closed.

This is not a new strategy — it is the **execution** of GAL's existing, CI-enforced
`cli/gal/governance/DEFINITION-OF-MOAT.md`. Drafted 2026-06-06. Builds on
[the charter](gal-run-governance-charter.md) + [the mixing audit](identity-mixing-audit-2026-06-06.md)
+ the now-enforced [capability gate](capabilities.yaml). Eventual home: `gal-run/cli/gal/governance/`.

---

## 1. The architecture: PEP / PDP (this is what makes "everywhere" + "open-core" the same decision)

Standard policy-enforcement split, mapped onto real `gal` primitives the recon confirmed exist:

```
   ANY runtime (OpenClaw · Hermes · Claude Code · Codex · OpenShell · LangGraph fleet · gal-model)
        │  before a consequential action, the runtime asks:  "may this agent do this?"
        ▼
   ┌─────────────────────────────┐        thin, OPEN-SOURCE adapter per runtime.
   │  PEP — Policy Enforcement    │        Does nothing but: call the PDP, emit an audit
   │  Point  (the only OSS part)  │        event, and INTERRUPT (wait for a human) when told.
   └──────────────┬──────────────┘        Exposes ZERO business logic.
                  │  POST /enforcement/check  {agent, capability, scope, action}
                  ▼
   ┌─────────────────────────────────────────────────────────────┐   PROPRIETARY / cloud.
   │  PDP — Policy Decision Point   (the moat, stays closed)       │   The value lives here.
   │  governance-svc  →  {allowed | audit | human_required, reason}│
   │   • policies (gal policy / governance-svc, Firestore)         │
   │   • CapabilityManifest (who may do what — the gate we built)  │
   │   • Agent Card contracts (gal-agents: identity/scope/auth)    │
   │   • gal-model (learned governance advisory)  ← moat, esp.     │
   │   • audit log (telemetry-svc governance_verdicts, append-only)│
   └─────────────────────────────────────────────────────────────┘
```

- **PEP** = a tiny client embedded in (or wrapping) each runtime. "Ask, audit, and interrupt
  if told." Open-sourcing it is pure adoption upside and leaks nothing.
- **PDP** = `governance-svc`'s `/enforcement/check` returning `{allowed, action: allowed|denied|audit, reason}`
  (already implemented), backed by policies + the CapabilityManifest + Agent Cards + gal-model + audit.
  This is the moat. Cloud-served at `api.gal.run` behind the gateway JWT.

Same decision, both goals: **the PEP is the "everywhere" surface AND the only thing we open-source.**

---

## 2. The open-core line — already your policy (`DEFINITION-OF-MOAT.md`), now applied

| | **Open-source (commodity glue — adoption)** | **Proprietary (the moat — closed/cloud)** |
|---|---|---|
| What | per-runtime **PEP adapters** + the **wire protocol** (`/enforcement/check` request/response) + a thin **SDK** | the **PDP**: governance-svc engine, policies, **CapabilityManifest** logic, **Agent Card contracts** schemas-as-served, **gal-model**, the audit/compliance store, the propose→approve rails |
| Moat-doc category | "coding agents / shells / automation = INTEGRATE" (commodity) | "policy+enforcement · governance contracts · cross-runtime capture+audit · governance decisioning (gal-model)" = BUILD |
| Why OSS / why closed | exposes no logic; every runtime adopts for free → distribution (the Claude-Code-ecosystem PLG wedge) | the decisioning, the normalized cross-runtime capture, the contracts, and gal-model are what nobody else builds — enterprises pay for this |

This is exactly *"as little open source as possible, still get the OSS benefit, don't expose
business logic."* It is **already CI-enforced** by `charters.py` (a `tier: core` repo must be
`moat: true`; a commodity rebuild is a drift violation). We are not redrawing the line — we
are shipping the adapters on the OSS side of a line that already exists.

> **Founder decision to confirm:** the line above (thin PEP + protocol OSS; engine + contracts
> + gal-model closed). My recommendation is to ratify it as-is — it matches your moat doc.

---

## 3. Governance everywhere — one PEP per runtime

Every runtime integrates the **same** way: a thin PEP that (a) calls `/enforcement/check`
before a consequential action, (b) emits an audit event, (c) **interrupts for a human** when
the PDP says `human_required`. Only the *embedding mechanism* differs per runtime.

| Runtime | PEP embedding mechanism | Notes |
|---|---|---|
| **LangGraph/LangSmith fleet** (our 28 agents) | a pre-tool node calling `/enforcement/check`; **`interrupt()`** on `human_required` | native HITL; checkpointer already configured. The seed — built first. |
| **Claude Code** | the existing **GAL hooks** (`gal hooks`/`gal enforce` install git + tool hooks) — "cross-runtime capture" is already moat | commodity runtime, governed by our hook. |
| **Codex** | same hook/shim pattern (GAL already treats Codex as INTEGRATE) | thin adapter. |
| **OpenClaw** | a PEP in the OpenClaw tool-dispatch path; today it's our Slack delivery identity too | already in the fleet; wrap its outbound. |
| **Hermes** | PEP wrapping its tool/runtime boundary | thin adapter. |
| **OpenShell** | PEP at the shell-exec boundary (a command is an action to check) | highest-risk surface → most actions `human_required`. |
| **gal-model** | governed **as a runtime** (it holds capability grants + is audited) — boundary only | the model *itself* is proprietary PDP brain, built **outside Claude Code** (see §6). |

The adapters are small and uniform precisely because the PDP holds all the logic — which is
what lets us be "everywhere" without forking the moat into N runtimes.

---

## 4. Human-in-the-loop — the safety spine (your fear, made structural)

An agent opening an OSS pull request, or messaging a real person, is **irreversible and
outward-facing**. Those never fire on an agent's own authority. HITL is the bridge from
today's "report-only, never acts" to *safe* autonomy.

**Three tiers, by consequence (reversibility × touches-people-or-the-world):**

1. **Autonomous** — safe, reversible, internal (reads, analysis, internal digests, private drafts). No human. *This is what lets the company run without you.*
2. **Human-in-the-loop** — outward/irreversible: **OSS contributions (any push/PR/comment to a public or external repo), any message to a person (email, Slack DM, external reply), publishing/posting.** The agent does the work, then **stops** and surfaces the exact artifact (the diff, the message text, the recipient) for **approve / edit / reject**. **Fail-closed** — no approval, no action.
3. **Founder-gated (HARD GATE)** — capital, legal, prod deploy, billing, security-rules, paying customers. Yours, above normal HITL.

**Mechanism:** `/enforcement/check` returns `audit` or **`human_required`**; the PEP enforces
it. On the LangGraph fleet that's **`interrupt()`** (the LangSmith HITL you meant — native,
checkpointer present); each other runtime has its equivalent pause. Approvals **queue** (they
never block on *you* specifically — any authorized human clears routine ones) and surface in
the LangGraph inbox **+ mirrored to Slack** for one-tap approval. Every interrupt + decision
(who/what/when) → the append-only audit log (charter control #4). **Which capabilities are
`human_required` is a PDP policy** — one auditable list, changed only via `gal propose`→`approve`
(an agent can't widen its own latitude).

**The starting "always needs a human" list (for you to ratify or tighten):**
OSS/external-repo contributions · any message to a human · publishing/posting · account or
permission changes · anything touching paying customers · spend that moves real money. *(The
capability manifest's verb allow-list already blocks procurement/execute outright; this layer
gates the *outward* `write`/`post`/`propose` verbs that reach the world.)*

---

## 5. Agents as members — on Scheduler **and** gal-run, alongside people

A person and an agent are both **members**; the agent is a governed NHI, not a second-class
script. The records already exist in GAL — we unify them:

| Layer | For a person | For an agent (NHI) | Status |
|---|---|---|---|
| **Identity / contract** | human account (owner/teammate) | **Agent Card** (gal-agents: identity, scope, auth, governance profile) | exists |
| **What it may do** | role/permissions | **CapabilityManifest grant** (the gate we built — agent/capability/scope/why/granted_by) | built (CI-enforced) |
| **Workforce / schedule** | employee profile + shifts (Scheduler) | **roster.yaml employee row** + shift trigger (Scheduler = workforce layer) | exists (roster gate) |
| **Join flow** | invite | **`gal join` / `gal fleet`** → Agent Card + manifest grant + roster row + HR hire | rails exist |
| **Governed by** | the PDP | the PDP (same `/enforcement/check`) | exists |

So "add an agent" = the same member-onboarding flow as a person: an Agent Card (gal-run), a
capability grant (governed), a Scheduler employee profile + shift (workforce), an HR hire
(approval-gated). People and agents, one membership model, one control plane.

---

## 6. The gal-model boundary (honest + strategy-aligned)

Your moat doc lists **gal-model as moat** ("learned governance advisory") — i.e. it belongs in
the **proprietary PDP core**, exactly where open-core wants it. That aligns with a hard limit
on my side: **I cannot develop/train/eval/serve gal-model via Claude Code** (Anthropic terms +
workspace AGENTS.md). The split:

- ✅ **I can govern the boundary** — treat gal-model as a governed runtime (it holds capability
  grants, its advisory verdicts are audited), define the PDP interface that *calls* it, and
  wire HITL/audit around it. This is application/contract code, not ML.
- ❌ **I cannot build the model** — its training/eval/serving happens **outside Claude Code**.

Net: gal-model stays a closed black box in the moat (where your strategy wants it); I integrate
governance *around* it, not the model itself.

---

## 7. Build plan (HARD-GATE aware; gal-model untouched)

> **Status 2026-06-06 — Phase 1 + 2 BUILT (local feature branches, nothing pushed to gal-run / deployed):**
> - **Phase 1 ✅** `gal capability validate` — a faithful Rust port of the Python gate, in
>   `gal-cli-rs` (branch `feat/capability-manifest-gate`); 19 Rust tests + the adversary kill-shot;
>   **verified equivalent to the Python gate on the real 28-graph fleet** (same exit 0, same warnings).
>   `gal capability propose` rides the existing `create_proposal` rails. Schema
>   `cli/gal/schemas/capability-manifest.schema.json` (branch `feat/capability-manifest-schema`)
>   validates the real manifest. `capabilities.yaml` gained the `apiVersion: gal/v1` / `kind:
>   CapabilityManifest` header + canonical-bool normalization. **GAL is now the enforcing authority.**
> - **Phase 2 ✅** `agent_toolkit/hitl.py` — the HITL gate: pure `human_required()` (the ratified
>   policy) + `human_gate()` that records-but-never-blocks on probation and `interrupt()`s when live
>   (fail-closed; langgraph lazy-imported). 15 tests. Report-only by default — nothing acts yet.
> - **Held for founder review before any push to gal-run / merge / deploy / go-live.**

**Phase 1 — the seed (buildable now, crosses NO gate; feature branches/worktrees only):**
Re-home the capability gate onto GAL (per the recon design):
- `cli/gal/schemas/capability-manifest.schema.json` (`apiVersion: gal/v1`, `kind: CapabilityManifest`).
- `gal capability validate` — a faithful **Rust port** of `check_capability_coverage.py::validate()`
  (deterministic rule-checking, NOT ML) in `gal-cli-rs`, carrying the 36 unit tests; wire it into `gal check`.
- Swap the qa-agent-platform CI step from the Python gate to `gal check validate --capability-manifest`.
- `capabilities.yaml` gains the `apiVersion`/`kind` header; charter + audit relocate to `cli/gal/governance/`.
- The propose→approve→approved-config→audit rails already exist — no new approval machinery.

**Phase 2 — HITL spine (buildable now, code only):** a reusable PEP node for the LangGraph
fleet that calls `/enforcement/check` and `interrupt()`s on `human_required`; the `human_required`
policy list; Slack approval mirror. Report-only/dry by default.

**Phase 3 — the universal PEP + protocol (the OSS surface):** factor the PEP into a thin
open-sourceable adapter + wire protocol + SDK; one adapter each for Claude Code / Codex /
OpenClaw / Hermes / OpenShell. Engine stays closed.

**Phase 4 — agents-as-members:** unify Agent Card + capability grant + roster row + Scheduler
profile behind one `gal join`/HR flow.

**GATED throughout (founder / not me):** pushing to gal-run or Scheduler-Systems orgs; any
`main` merge; deploying governance-svc; the first `gal approve set` blessing a manifest that
touches identities/funding; ring-fencing the funding pool; turning any agent from report-only
to live. **gal-model model-dev stays outside Claude Code.**

---

## Founder decisions queued
1. **Confirm the open-core line** (§2) — recommend ratify as-is (it's your moat doc).
2. **Ratify the HITL "always needs a human" list** (§4) — tighten if you want it stricter.
3. **Approve building Phase 1 + 2 now** (no gate crossed — feature branches, no push/deploy).
4. Standing gates unchanged: push to gal-run, prod deploy, billing/ring-fence, going live.
