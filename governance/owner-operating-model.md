# Owner Operating Model — how Shay owns the company without running it

**Shay is the enterprise OWNER, not the operator-of-last-resort.** This is the design that takes
him out of the operational loop: the agent org (board + C-suite officers) decides within an
owner-set mandate; escalation flows agent → officer → board → owner; only a small, bright-line set
ever reaches him. Built 2026-06-06. Enforced by `agent_toolkit/authority.py` over
[`delegation.yaml`](delegation.yaml); pairs with [`capabilities.yaml`](capabilities.yaml) (what each
agent may DO) and [`hitl.py`](../../agent_toolkit/hitl.py) (the pause that waits for the approver this
router names).

## The owner's entire footprint (this is all you do)
1. **Set the mandate once** — the risk envelope: spend limits, the weekly budget, the values
   (`delegation.yaml#mandate`). Amend rarely.
2. **Appoint / replace the board** — who governs. The board (`board_chair`, `audit_risk_director`,
   `growth_director`) produces THE investor update to you.
3. **Read the board's report** — you *receive* it; you don't approve operations.
4. **Hold the bright line** — the few owner-reserved decisions below. Agent-prepared, batched, one-tap.

Everything else is decided by the org you own — **not by you.**

## Who decides what (the delegation, live once you grant it)
| Decision | Decider (an agent officer) | Owner only when… |
|---|---|---|
| Spend | **CFO** (≤ officer limit) → board (≤ board limit) | above the board limit (bet-the-company). **Caps are $0/$0 as of 2026-06-06 — no spend is delegated yet; every spend authorization comes to you. Agents may PROPOSE spend; caps rise per-lane as agents earn tenure.** |
| Budget | **Board** (within your weekly cap) | changing the cap |
| Hire / fire | **HR** (within budget + scorecard) | changing the comp/headcount mandate |
| Merge to `main` | **CTO** (passes gate + tests, docs/schema/test class) | — |
| Deploy to prod | **CTO** (staging-verified, non-breaking, non-billing/security) | billing/security/paying-customer surface |
| Outward message / OSS contribution | **CEO / CTO** (routine, non-binding) | binding or to a paying customer |
| Go live (report-only → live) | **Board** (agent passed probation) | the initial "fleet goes live" |

## The bright line — always you, never delegable (`owner_reserved`)
Change the mandate · entity/cap-table/binding major contracts · bet-the-company spend · live
billing or pricing · the first security-rules (IDOR) prod deploy · appoint/replace the board.
These are force-detected by flags too, so a decision mislabeled as something smaller **cannot**
slip past — it still reaches you.

## The single act only you can do
The mandate ships **`status: proposed`** — *inert*. Every decision still routes to you (today's
behaviour) until **you flip `status: granted`**. That one act is the owner exercising ownership:
delegating your authority to the org you own. It is one-time; after it, the lanes above run
themselves and you drop out of them. (The standing HARD GATES — live billing, prod, security,
paying customers — stay near you because they're in `owner_reserved`; delegating *those* is a
separate, deliberate owner act per lane, never automatic.)

## When the loop ends
- **Now → weeks:** the operational drip (approve this PR, ratify that list) collapses — each lane
  gets an officer; you grant the mandate once.
- **Ongoing:** the trust ladder (`roster.yaml`: probation → tenure after clean reviews) shrinks the
  gated set as agents earn it; officers' limits rise on your sign-off.
- **End state:** your time on operations → near-zero. You own the company, set its mandate, appoint
  its board, read its reports, and hold a handful of bright-line levers. That is ownership — not a
  loop to escape, but the small, deliberate footprint of an owner.

> Safety note: nothing here removes a HARD GATE or activates delegation on its own. The mandate is
> inert until you grant it; owner-reserved is never delegable; default-deny escalates anything
> unrecognized up to you. The machine is built; the authority is yours to grant.

## How the mandate itself is protected (red-teamed 2026-06-06)
An adversarial pass found — and we then closed — every way an agent could route a money/billing
decision to itself instead of you: non-finite/negative spend amounts, falsy "billing" flags, and the
inert-mode leak all now fail closed to the owner (regression-tested). Two further protections:
- **Owner signature:** the router treats the mandate as live only when `status: granted` **and**
  `granted_by: shay` — a stray `status` flip alone stays inert.
- **The constitution can't be edited by an agent:** editing `docs/governance/**` is `change_mandate`
  (owner-reserved), explicitly carved out of the CTO's merge lane; CI pins the spend ceilings and the
  full bright-line set, so raising a cap or dropping a reserved item turns the build **red**.
- **Still owner/repo-admin to do (gated):** add `CODEOWNERS` (`/docs/governance/ @<owner>`) + branch
  protection requiring your review on those paths — belt-and-suspenders on top of the CI pins above.
- **Residual trust:** the router trusts the action's `kind`/flags, so high-risk flags
  (`touches_billing`, …) must be stamped by a trusted tool/classifier, not self-asserted by the
  deciding agent. That stamping is the one assumption the whole model rests on.
