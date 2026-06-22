---
name: set-goal
description: Use when the user wants to set, define, choose, align on, or revisit a goal, North Star, objective, milestone, or direction to work toward for a project.
---

# Set Goal

## Overview

Turn a vague "let's set a goal" into a **durable North Star defined as a suite of measured evaluations** the work can be steered by — and persist it so it survives future sessions. **A goal is the set of evals that prove it's done.** Measured evals are everything: a goal whose done-criteria aren't re-runnable measured evals (metric + threshold), and that isn't written to memory, is not set — it's a passing thought you can't score.

## Pick the mode first

- **Decisive** — if the user said "do what you think is best" / "you decide" / "whatever": pick the single highest-leverage goal, state your reasoning in one line, commit, and persist. Do not stall with a survey.
- **Interactive** — otherwise present 2–4 candidate goals with a clear recommendation (recommended first) and 1–3 clarifying questions. **Persist only after the user picks.**

## Every goal MUST have all four

**A goal IS its eval suite.** The point of a goal is to know — repeatably, by measurement, not by vibe — whether you've arrived and how far you have to go. If a done-criterion can't be re-run to produce a number or a pass/fail, it cannot steer the work and it is not a real criterion. Before writing any criterion, ask the framing question: *"What do we need properly evaluated — and how is it scored?"*

1. **North Star** — ONE sentence. The outcome, not the activity.
2. **The eval suite — the definition of done, written as measured evaluations.** NOT a prose checklist. Each criterion is one **re-runnable eval**, stated with all five parts:
   - **what it measures** (the question) · **metric** (the number or signal) · **threshold** (the pass condition) · **how to run** (the command / agent / check that *produces* the score) · **current score** (where it stands now, so progress and regression are visible).
   "Done" = **every eval passes its threshold.** A criterion you can't run again next week and re-score is not a done-criterion — rewrite it until it is.
   - ❌ "secure" / "better docs" / "fast" → unmeasurable vibes.
   - ✅ "**onboarding eval**: a no-context agent clones → builds → runs a check; metric = success-rate × time-to-first-success; threshold = N/N in <15 min; run = `<command/agent>`; score = ✗ (not yet run)."
   - ✅ "**security eval**: re-run the audit; metric = # reachable critical/high findings; threshold = 0; run = `<audit command>`; score = 22 open."
   Prefer evals you can **automate and re-run** (a script, a CI check, a dispatched agent) over one-time manual inspection — an eval that only ever runs once can't catch regression.
3. **Milestones** — the ordered path that moves the eval scores from where they are to passing. Each milestone should name *which eval(s) it moves and to what*.
4. **Gates** — which milestones need a human's sign-off before proceeding. Carry your project's standing **hard gates** — the irreversible or externally-visible actions a human must approve (production deploys, releases, merges to the main branch, anything touching live customers, money, credentials, or security-sensitive config) — and mark which milestones hit them.

## Then pressure-test it — two standing checks

Before committing, the goal MUST pass BOTH. Ask them out loud every time:

1. **Altitude — is it high-level enough to be LONG-RUNNING?** The North Star must name an **enduring state you keep satisfying**, not a one-time event you cross once. Test: *"after the next big milestone ships, does this goal still steer the work?"* If shipping X (a launch, a v1, a migration) would **complete** the North Star, then **X is a campaign/milestone, not the North Star** — lift the North Star up one level to the durable state X serves and **nest X under it** as the current campaign.
   - ❌ "Launch a clean v1" — expires the day it ships.
   - ✅ "the project *is and stays* a trusted, adoptable release" — with "ship clean v1" as the current campaign beneath it.
   - Structure it as three tiers: **enduring North Star → current campaign (time-boxed) → the eval suite**.

2. **Measurability — are the evals measurable ENOUGH?** Each eval must score the **same for two independent runners**. Test each: *"would two competent people, same day, running the how-to-run, get the same number?"* If the metric hinges on a human-judgment word — `reachable`, `confirmed`, `success`, `unresolved`, `clean`, `good`, `done` — that is a **judgment seam**: either pin the exact adjudication rule INTO the eval (the decision procedure, who/what decides) or replace the metric with a **zero-judgment command / check** that emits the score. An eval only you can score is not measured — it's an opinion.

## Make each eval ROBUST (every eval must pass this rubric)

A vibe with a number bolted on is still a vibe. Reject any eval that fails ANY of these:
- **Runnable now, or baselined:** the *how-to-run* executes TODAY and prints a score, OR a milestone builds the harness AND a first run records a **real** current-score. **Never leave the whole suite at ✗ "not yet run" and call the goal set** — establish a real baseline number first.
- **Reproducible:** pin what makes the score comparable run-to-run — fixed env/image/versions, lockfile commit, fixed inputs.
- **Deterministic:** fixed seed/fixtures + explicit reset. Flake = an invalid eval; prove non-flakiness with a pass-rate-over-N-runs eval, not luck-once.
- **Threshold justified:** tie the pass number to evidence (a measured baseline, an SLA, a stated user expectation). If you're guessing, label it `provisional` and add a milestone to calibrate it.
- **Regression-wired:** prefer an automated re-run (script / CI check / dispatched agent) with an owner/alert on failure, over one-time manual inspection.

## Emit the native /goal condition (so the goal can actually be SET)

The eval suite is the durable record. To make the agent *work toward it*, also set it as the agent's **native completion-condition** (in Claude Code, the built-in `/goal`). **You cannot set it yourself — the user types it.** So **always finish by emitting a ready-to-paste completion-condition string** for the user to drop in:
- One scoreable block a fast-model evaluator can judge **from the transcript** (it can't run commands itself — so phrase done as something the agent's reported eval output demonstrates): *"DONE only when every eval passes its threshold, shown with evidence: E1 = <metric> ≥/= <threshold>; E2 = …; …"*
- Append the method + guardrail: *"…work <how>; ASK before anything unsafe or any hard gate; keep working until all evals pass or stopped."*
- Point to the eval-suite record for per-eval detail.
- Tell the user: **type `/goal ` then paste** (it replaces any active goal).

## Persist it — to memory, not the repo

The goal goes in the agent's durable **memory**, never as repo files/commits/PRs (a goal is not a code change). Resolve the canonical project memory directory and **update the existing goal record there** rather than creating a duplicate under a transient slug. If none exists, create one at the project root the user actually works from, with the four sections above; convert relative dates to absolute; add a one-line pointer in the memory index.

## Common mistakes

| Mistake | Fix |
|---|---|
| Goal is an activity ("work on docs") | State the outcome ("self-hostable in <10 min") |
| North Star expires when a milestone ships ("launch v1", "migrate X") | Not long-running — lift to the enduring state it serves; nest the launch/milestone as the current campaign |
| Eval hinges on a judgment word (`reachable`/`confirmed`/`success`) | Judgment seam — pin the adjudication rule or replace with a zero-judgment command; two runners MUST get the same score |
| Done is a vibe ("secure", "fast", "good docs") | Make each a **re-runnable eval**: what it measures · metric · threshold · how-to-run · current score |
| Criterion can't be re-scored later | If you can't run it again next week and get a number, it isn't a done-criterion — rewrite it |
| Eval is one-time manual inspection | Prefer an automatable, re-runnable check (script / CI / dispatched agent) so it catches regression |
| Milestone doesn't move a named eval | Tie every milestone to the eval(s) it advances and the target score |
| Whole suite left at ✗ "not yet run" | Not measured yet — build the harness + record a REAL baseline before calling the goal set |
| Threshold is a guessed number | Tie it to evidence (baseline/SLA/user expectation), or mark `provisional` + a calibration milestone |
| No native completion-condition emitted | Always emit the ready-to-paste `/goal` condition — the memory record alone doesn't drive work |
| Forgot the standing hard gates | Always tag gated milestones; ask a human before crossing them |
