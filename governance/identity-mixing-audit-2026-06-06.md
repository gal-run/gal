# Identity-Mixing Audit (2026-06-06)

Companion to the GAL-Run Governance Charter. Rule #1 = **human and agent identities never mix.**
This enumerates every place an agent OR a builder/tool currently acts through a *human* credential
(a violation), and the agent identity that should replace it.

Legend: **HUMAN** = a person's credential/session · **AGENT** = a scoped machine credential ·
**MIX** = an agent/tool using a human credential (banned).

## A. Builder (Claude / this session) — the live violations

The biggest mixing this session was *me* operating through the founder's logged-in browser sessions
instead of agent/API identities. Each must be replaced with an agent credential.

| Action I took | Credential used | Verdict | Fix (agent identity) |
|---|---|---|---|
| Invited bot, navigated Slack channels | founder's **Slack web session** | **MIX** | Slack Admin/API with a scoped token; or founder issues a one-time invite, agents post via the bot (already AGENT) |
| Read RevenueCat dashboard | founder's **RC login** | **MIX** | `revenuecat.py` + RC **API key** (AGENT) — the API path already exists; stop using the console |
| Navigated App Store Connect | founder's **ASC session** (login failed) | **MIX (attempted)** | `store_ops` **ASC API key** (AGENT) — already built; never the console |
| Opened LangSmith deployment settings | founder's **LangSmith login** | **MIX** | deploy-scoped **service key** `lsv2_sk_…` (AGENT) — already used for deploys; stop using the UI |
| Read GCP Secret Manager | **github-action service account** | borderline-OK | a service identity, not the founder's login — but scope it to least-privilege (see C) |

**Principle reaffirmed:** the builder uses agent/API identities. Where a console has no API and sits
behind the founder's 2FA, that's a *gap to close with an agent credential* — not a license to log in
as the founder.

## B. Fleet agent credentials (these are correctly AGENT, with notes)

| Credential | Tier | Note / risk |
|---|---|---|
| GitHub **App** (`FLEET_APP_ID`) | AGENT ✓ | permission-scoped, no billing access. Good. |
| OpenClaw **Slack bot token** (`xoxb-…`) | AGENT ✓ | but **shared** by all agents (not per-agent isolated) and stored **plaintext** in `~/.openclaw/openclaw.json` on the founder's Mac (alongside app + gateway tokens) → **storage hygiene + isolation gap**. |
| ASC API key / Play SA / model keys | AGENT ✓ | service creds, in GCP SM + deployment env. Good. |
| DeepSeek / Gemini inference keys | AGENT ✓ | **spend-only** — cannot buy (provided funding can't auto-recharge: see C). |
| LangSmith deploy key `lsv2_sk_…` | AGENT ✓ | service/deploy key — confirm it is NOT the founder's personal key. |

## C. The money / funding audit (the top open gap)

A spend-only key is only spend-only if the funding can't auto-procure. **For every provider the fleet
can spend on, verify (founder action — billing is a HARD GATE):**

| Provider | Spend by | **Verify** |
|---|---|---|
| DeepSeek | inference key | card on file? auto-recharge OFF? hard cap? |
| Google / Gemini (GCP) | API key / SA | GCP billing account = founder card? budget alert + cap? |
| Anthropic | API key | postpaid w/ card? spend limit? |
| OpenAI | API key | card + auto-recharge? hard cap? |
| LangSmith / LangGraph | account | plan + 24/7 compute on founder card? |
| Vercel / Firebase | account | plan on founder card? |
| RevenueCat | API key | (read-mostly) plan billing? |

**Target:** one **ring-fenced, hard-capped** funding instrument for the whole agent platform
(auto-recharge OFF), **separate from the founder's/company main card**. Max real-money blast radius =
that capped pool. *Until verified, exposure is unbounded via auto-billing — this outranks any single
agent's permissions.*

## D. Remediation backlog (close the mixes)

1. **Stop builder-via-founder-session.** Route Slack/RC/LangSmith ops through agent APIs/keys (stores
   already done via `store_ops`). For console-only/2FA actions, mint an agent credential, don't log in
   as the founder.
2. **Ring-fence funding** (founder): verify/remove cards + auto-recharge per provider (table C); move
   to one capped instrument; record `max_$_exposure` per provider in the capability manifest.
3. **Secret hygiene:** move the OpenClaw plaintext tokens out of `~/.openclaw/openclaw.json` into a
   secret store; rotate; consider per-agent/per-department bot identities for isolation + attribution.
4. **Scope the CI/SM service account** to least-privilege (only the secrets it needs).
5. **Confirm** the LangSmith deploy key + any "service" key is not a founder personal credential.

Every item above is an instance of Rule #1 or the funding rule. Closing them turns "we don't mix
identities" from an intention into an audited, enforced boundary.

**Now enforced (deployed agents):** `docs/governance/capabilities.yaml` +
`scripts/check_capability_coverage.py` (a CI gate) machine-check that no *deployed* agent references a
human-tier identity, none can procure (`can_buy`/procurement verbs), and the funding pool can't
auto-recharge without a ring-fence. That covers section B (the fleet). Section A (the *builder* using
founder sessions) and section C (funding provisioning) remain discipline + founder actions — the gate
governs agents at CI, not the human at the console.
