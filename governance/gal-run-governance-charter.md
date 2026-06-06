# GAL-Run Governance Charter

**What GAL-run is for:** to control *which agent can access what, why* — so a human stays in
control of everything and can never be outsmarted by agents. Not "smarter agents" — **provable
human control**: least-privilege, justified, auditable, revocable, killable, with humans in a tier
agents cannot climb into.

*(Canonical home: the gal-run governance repo. Drafted 2026-06-06 alongside the fleet it first
governs. Enforcement lives where the agents run — e.g. `qa-agent-platform/roster.yaml` +
`scripts/check_roster_coverage.py`.)*

---

## Rule #1 (cardinal) — Human and agent identities NEVER mix

Every identity is **either** a human **or** an agent. One credential lives in exactly one tier,
and every action is attributable to exactly one tier. The only legal connection between tiers is
**issuance** (a human creates/revokes an agent credential) — never a shared login, never
"borrowing a session."

| | **Human identity** | **Agent identity (NHI)** |
|---|---|---|
| Belongs to | a *person* | a *software process* |
| Auth by | password+2FA / passkey (only the person has it) | a scoped credential *issued by a human* (service-account key, API sub-key, app/bot token, short-lived token) |
| Carries | ownership, billing/payment, approval, grant/revoke, legal accountability | **only the capabilities granted — nothing more** |
| Can buy / grant / own / approve? | yes | **never** |
| Cost | paid seats | free / cheap |
| Lifecycle | the person's | created, scoped, audited, **revoked at will** by a human |
| Blast radius | the person's full authority | confined to itself |

- A human identity **OWNS and ISSUES** an agent identity (your GitHub login owns the GitHub *App*).
- **Accountability always chains up**: every agent action → (1) the agent identity that did it +
  (2) the human who owns/granted it. No unowned agents.
- The **founder's human identity is the top of the tree and is never given to an agent.**

**Mixing — all banned:** an agent (or a builder/tool session) acting through a human's session or
credentials; a shared account a human and agent both log into; an agent posting *as* a human;
agent credentials stored inside/derivable from a human credential. *(This binds the builder too:
use agent/API identities, never the founder's sessions.)*

---

## The primitive — a capability grant

Everything is one of these, declared and enforced:
> `{ agent, capability, scope, WHY (justification), granted_by (human), expires, revocable }`

Default-deny + least-privilege: an agent holds *exactly* its grants. It cannot acquire a new
credential, widen a scope, self-grant, or escalate at runtime. New capability = explicit, justified,
human-approved, expiring, revocable.

---

## The five structural controls that make "never outsmarted" true

Control must be **structural, not behavioral** (an instruction an agent could ignore won't do):

1. **Trust-domain separation** — the human/control-plane lives where agents cannot reach (separate
   creds, separate infra). Agents can't read master keys, edit policy, or approve their own grants.
2. **Capability confinement** — the agent's runtime contains exactly its grants; no self-grant, no
   escalation. (Why an inference key can't buy tokens: the *capability* isn't there.)
3. **Mediated escalation** — anything beyond a grant goes through a human-approval gate the agent
   can't bypass. It *proposes*; it never *approves* — for itself or another agent.
4. **Tamper-evident audit** — every capability use logged to an append-only store agents can't alter.
   The human always has ground truth, not the agents' word.
5. **Default-deny + universal kill switch** — least-privilege by default; the human halts the whole
   fleet instantly from outside the agents' reach (`AGENTS_DISABLED`).

---

## Money — spend-only, never procure; ring-fenced funding

- Agents get **spend-only** capabilities (an inference key spends a balance) — **never** procurement,
  billing, payment, or capital. Buying capacity / changing a plan / moving money is a **HARD GATE**
  (founder-only). An agent may *propose* "we're low, top up" — it never *does* it.
- **A spend-only capability is only spend-only if the funding can't auto-procure.** Govern *both*
  ends. The manifest records per provider:
  > `{ provider, funding_instrument, auto_recharge: off, max_$_exposure, ring_fenced: yes }`
- **Funding rules:** one **ring-fenced, hard-capped** instrument for the whole agent platform
  (vendor/prepaid card with a fixed cap, **auto-recharge OFF**) — **separate from the founder's /
  company's main card**. Per-agent budgets enforced internally (CFO + budget cap). Max real-money
  blast radius = that one capped pool, never the founder's card.
- **Two budget layers, don't confuse them:** the **token salary cap** (`team_token_budget`, ~5.54M
  tokens/wk ≈ ~$5–10/mo of model spend) bounds *model* tokens only. The *real* recurring money is
  **managed-deployment compute (24/7) + provider billing** — bound those at the funding instrument.

---

## Identity ≠ seat (cost reconciliation)

"Every agent has its own account" = its own **isolated machine identity**, NOT a paid human seat and
NOT a shared founder login. Isolation without per-seat cost: GitHub App / installation token, Google
service account / free Cloud Identity, model inference sub-key, Slack App bot token. Per-service map:

| Service | Human identity (founder, top tier) | Agent identity (scoped) | Money |
|---|---|---|---|
| GitHub | login (owns org + billing) | GitHub **App** / installation token | — |
| Google | Workspace account | **service account** / free Cloud Identity | — |
| Models (DeepSeek…) | account login (owns the card) | **inference sub-key** (spend-only) | ring-fenced pool, **not founder card** |
| Slack | membership | Slack **App** bot token | — |
| LangSmith | account (owns deploy + billing) | deployment + scoped key | flat 24/7 compute = real cost |

---

## How the fleet maps onto this today (first governed manifest)

- **Identity model:** agents run as `app[bot]`/service creds (GitHub App, OpenClaw Slack bot, ASC API
  key) — good. **Gap:** the *builder* (Claude) used the founder's logged-in sessions this session
  (Slack/RC/App Store/LangSmith/GCP) — a Rule-#1 violation; see the mixing audit + replace with agent
  identities/APIs.
- **Capability/HR:** `roster.yaml` is the first capability/employment registry (role, grade, salary,
  scorecard, `hire: pending_hr_approval`); `check_roster_coverage.py` is a hard gate (no deploy without
  a row). HR hire = approval-gated to the founder.
- **Capability manifest (NEW, enforced):** `docs/governance/capabilities.yaml` declares every deployed
  agent's agent-tier identities + grants (capability/scope/why/granted_by) + ring-fenced funding.
  `scripts/check_capability_coverage.py` is a CI gate that FAILS the build on a human-identity reference
  (Rule #1), any `can_buy`/procurement verb (spend-only), a missing grant (default-deny), or an
  auto-recharging non-ring-fenced pool. **The two cardinal rules are now machine-checked, not just
  written** (19 unit tests; green on all 28 graphs).
- **Kill switch / budget:** `AGENTS_DISABLED` + `per_run_token_ceiling: 50000` + per-agent salary.
  **To build:** fleet-burn ≥ cap → flips `AGENTS_DISABLED` (auto clock-out).
- **Money:** verify/remove the card + auto-recharge on every provider (founder); move to one
  ring-fenced capped instrument. **This is the top open governance gap.**

---

## Build backlog (turning this charter into enforced reality)

1. ✅ **Capability manifest + CI gate** — `capabilities.yaml` + `check_capability_coverage.py` enforce
   Rule #1 (tier separation, non-empty human set, human-issuance chain, human-only `granted_by` / no
   self-grant), spend-only (allow-listed verbs + real-boolean `can_buy`), the `report_only` probation
   posture, `revocable`, least-privilege scope, and coverage — at PR/CI time. Adversarially verified
   (2026-06-06): a combined human-credential + auto-recharge + self-grant bypass that previously passed
   is now caught with 18 distinct errors. **Still TODO:** push the SAME check to the *runtime boundary*
   (an agent holds only its manifest grants at execution, not merely at CI); enforce an `expires`
   lifecycle; and add an attested NHI catalog so a human credential can't be mislabeled `tier: agent`.
2. **Budget-cap enforcement** — burn ≥ cap → `AGENTS_DISABLED`.
3. **Ring-fence funding** (founder) + record max-$ exposure per provider.
4. **Tamper-evident audit log** of every capability use (agents can't alter).
5. **Close the mixing violations** (see the companion mixing audit) — agent identities replace human
   sessions everywhere, starting with the builder's.
