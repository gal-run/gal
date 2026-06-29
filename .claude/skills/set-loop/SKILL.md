---
name: set-loop
description: Use when the user wants to keep working toward a goal, run a recurring or autonomous loop, auto-drive a North Star to done, or set up a self-paced or scheduled loop that advances a goal's evals.
---

# Set Loop

## Overview

Turn *"keep working toward the goal"* into a **durable, persisted loop that auto-drives the North Star's
eval scores to passing** — built on the existing `/loop` runner, and stopped by the goal's own evals.
**A loop is the engine that moves the scores; it ends when the evals say done — never on a vibe, and
never never.** A loop with no measured stop condition isn't a loop, it's a runaway.

A loop has no meaning without a goal. set-loop drives a **North Star set with the `set-goal` skill** —
that North Star's eval suite **is** the stop condition. If none is set, set the goal first.

## Pick the mode first

- **Decisive** — if the user said "do what you think is best" / "you decide": pick the highest-leverage
  loop step and a sane cadence, state the reasoning in one line, persist, and launch. Don't stall.
- **Interactive** — otherwise confirm the step, cadence, and stop condition, then persist + launch.

## Every loop MUST have all five

1. **Target** — the North Star it drives. Its **eval suite IS the stop condition**: the loop ends when
   every eval passes.
2. **Step** — what ONE iteration does, tied to a named eval: *read the North Star → pick the
   highest-leverage non-gated failing eval/milestone → do the work → verify → re-score that eval.* If an
   iteration can't change a measured score, it's busywork, not a loop step.
3. **Cadence** — how the next iteration fires:
   - **self-paced** (default) — the agent schedules the next iteration when the current one finishes
     (Claude Code: `ScheduleWakeup`). Best for variable-length work toward a goal.
   - **interval** — a fixed schedule (cron) for polling external state that changes on its own clock.
4. **Stop condition** — a **re-runnable measurement, never a vibe.** The loop stops when: **all evals
   pass** (done — report it), OR **only gated items remain** (stop + surface the gate for a human), OR a
   **budget / round cap** is hit (report progress, don't grind on). Always exactly one of these.
5. **Guardrails** — ASK before any hard gate or unsafe/outward-facing action; **never relax a gate or
   fabricate an eval score to "make progress"**; **verify each iteration's claimed score before counting
   it** — a loop that trusts its own unverified output drifts away from the goal.

## Then pressure-test it — two standing checks

Before launching, the loop MUST pass BOTH:

1. **Convergence — does each iteration provably move a score?** Name the eval the step advances and the
   target. If you can't say which number goes up, the loop spins without converging.
   - ❌ "keep improving the docs" → ✅ "each iteration closes one onboarding-eval failure, re-runs it,
     and records the new success-rate."
2. **Termination — is the stop a measurement, not a feeling?** Two independent runners must agree it's
   done by re-running the evals. A loop you can't *prove* will stop is a runaway — fix the stop condition
   before launching.
   - ❌ "stop when it's good enough" → ✅ "stop when E1..En all pass their thresholds, or only gated
     milestones remain."

## Persist it + auto-launch

**Persist** the loop spec to the agent's durable **memory** — the same project memory the North Star
lives in — linked to the goal, so any future session can relaunch it: target, step, cadence, stop
condition, guardrails. Not repo files (a loop is not a code change).

**Auto-launch** the existing **`/loop`** runner with the step as the loop prompt, the chosen cadence,
and the stop condition. Loop prompt template:

> *"Read the North Star. Pick the highest-leverage non-gated failing eval or milestone. Do that work,
> verify it, re-score the eval. Stop and report when every eval passes; if only gated items remain, stop
> and surface the gate. ASK before any hard gate or unsafe action."*

Then tell the user: it's running, the cadence, the stop condition, and **how to cancel**.

## Relationship to /goal, set-goal, and /loop

- **set-goal** defines WHAT done is (the eval suite + the native `/goal` completion-condition).
  **set-loop** is the ENGINE that drives to it. Compose them: *set the goal, then set the loop.*
- set-loop **reuses `/loop`** for execution — it does not reinvent scheduling; it makes `/loop`
  goal-aware and **self-terminating on the evals**.
- It is **not** a fire-and-forget infinite agent: it is bounded by the goal's evals and the guardrails.

## Common mistakes

| Mistake | Fix |
|---|---|
| Loop with no stop / "just keep going" | A loop MUST terminate on a measurement: all evals pass, only gated items left, or a budget cap |
| Step not tied to an eval (busywork) | Each iteration must move a named eval score toward its threshold |
| Stop condition is a vibe ("good enough") | Make it the re-runnable evals — two runners agree it's done |
| No North Star set | A loop needs a target; run `set-goal` first — its evals are the stop condition |
| Relaxing a gate / faking a score to progress | Never — ASK at gates; verify each score before counting it |
| Reinventing a scheduler | Reuse `/loop`; set-loop only makes it goal-aware + self-terminating |
| Loop spec not persisted | Write it to memory so a future session can relaunch the loop |
| No cadence chosen | Pick self-paced (default) or interval; say which and why |
