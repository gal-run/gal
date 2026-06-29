# set-loop — a Claude Code skill

Turns *"keep working toward the goal"* into a **durable, persisted loop that auto-drives a North Star's
evals to passing** — built on Claude Code's [`/loop`](https://code.claude.com/docs/en/loop) runner and
**stopped by the goal's own evals**, not by a vibe.

**A loop is the engine that moves the eval scores.** It has all five parts before it launches —
target · step · cadence · stop condition · guardrails — and passes two checks:

- **Convergence** — each iteration provably moves a *named* eval's score toward its threshold (no
  busywork that changes no measurement).
- **Termination** — the stop is a *re-runnable measurement* (all evals pass, or only gated items
  remain), so two independent runners agree it's done. A loop you can't prove will stop is a runaway.

It **persists** the loop spec to memory (so any session can relaunch it) and **auto-launches** `/loop`
goal-aware and self-terminating.

## Pairs with [`set-goal`](../set-goal/)

`set-goal` defines **what done is** (the eval suite + the native `/goal` completion-condition).
`set-loop` is the **engine that drives to it**. Compose them: *set the goal, then set the loop.*

## Install

Copy `set-loop/` into your project's `.claude/skills/` (or your user-level `~/.claude/skills/`). Then
ask Claude Code to "keep working toward the goal" / "set up a loop" — the skill activates. Set a goal
first (`set-goal`); the loop's stop condition is that goal's eval suite.

## License

Part of [GAL](https://github.com/gal-run/gal) by Scheduler Systems Ltd. See the repo
[LICENSE](../../../LICENSE).
