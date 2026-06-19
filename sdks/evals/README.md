# gal-evals

A small, deterministic, rule-based evaluation framework for agents and other
structured outputs. It lets you define evaluation **suites** as JSON test cases,
score outputs against expected values with field-level metrics, and apply
**deployment gates** (e.g. `overall >= 0.85`) that decide whether a version is
safe to ship.

`gal-evals` is intentionally LLM-free: scoring is pure, deterministic, and
reproducible. An *adapter* turns each test case into an actual output (a rule
engine, a recorded prediction, or any function you write), and the runner scores
those outputs and produces a structured report on stdout.

## Concepts

- **Suite** — a set of structured test cases, the fields to score, and gate
  thresholds for one task family (`suites/*.json`).
- **Adapter** — produces actual outputs for each case. Ships with two
  deterministic example adapters: `email-rules` (label / task / archive triage)
  and an email-reply quality checker.
- **Report** — an immutable `gal.evals.report.v1` result object with per-metric
  scores, per-field expected/actual diffs, suggestions, and an overall gate
  pass/fail.

## Install

```bash
npm install
```

## Build & test

```bash
npm run build
npm test
```

## Run a suite

```bash
npm run eval:email
# or directly:
node dist/cli/evaluate.js --suite suites/email-triage.json --adapter email-rules
```

The report is written to stdout. Pass `--output report.json` to also write the
full JSON report to a local file. The process exit code is `0` when all gates
pass and `1` otherwise, so it slots straight into CI.

## Defining your own suite

A suite is JSON with `fields` (what to score), `gates` (thresholds), and `cases`
(input + expected). See `suites/email-triage.json` for a complete example and
`src/core/types.ts` for the full schema.

## Writing an adapter

An adapter implements `GalEvalAdapter`:

```ts
import type { GalEvalAdapter } from '@gal-run/gal-evals'

export const myAdapter: GalEvalAdapter = {
  id: 'my-adapter',
  async evaluateCase(testCase, suite) {
    // return the actual output to score against testCase.expected
    return { label: 'work', createTask: true, archive: false }
  },
}
```

See `docs/architecture.md` for the design and `docs/data-and-privacy.md` for the
fixture data policy.

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
