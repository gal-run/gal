# set-goal — a Claude Code skill

Turns a vague *"let's set a goal"* into a **durable North Star defined as a suite of
measured evaluations**, then emits it as a native [`/goal`](https://code.claude.com/docs/en/goal)
completion-condition so the agent works toward it until the evals pass.

**A goal is the set of evals that prove it's done.** Each criterion carries five parts —
what it measures · metric · threshold · how-to-run · current score — and the goal only
passes two checks before it's accepted:

- **Altitude** — the North Star is an *enduring* state, not a one-time event (a launch is
  a campaign nested under it, not the goal).
- **Measurability** — two independent runners get the *same* score (no judgment-word
  criteria like "secure" or "done").

## Install

Copy `set-goal/` into your project's `.claude/skills/` (or your user-level
`~/.claude/skills/`). Then just ask Claude Code to "set a goal" — the skill activates.

## Does it actually help?

We benchmarked the skill the way you'd test code — 3 goal-setting scenarios × 3
configurations × 3 runs (27 cells), each output graded against 8 objective assertions by
an independent grader, with isolated memory:

| Configuration | Goal quality (mean of 8 assertions, n=9) |
|---|---|
| No skill (plain Claude) | 46% (±25%) |
| Current skill | **92% (±6%)** |

Goal quality roughly **doubles (46% → 92%)**, the lift concentrates on the traps an
unaided model walks into (altitude 33%→92%, measurability 25%→88%), and run-to-run
variance collapses (±25% → ±6%) — it doesn't just set better goals, it sets them
*reliably*.

📖 **Full write-up, methodology, and a live case study:**
[Eval-driven development with Claude Code's /goal — gal.run/blog](https://gal.run/blog/claude-code-goal-eval-driven-development)

## License

Part of [GAL](https://github.com/gal-run/gal) by Scheduler Systems Ltd. See the repo
[LICENSE](../../../LICENSE).
