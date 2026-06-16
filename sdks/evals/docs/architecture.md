# Architecture

`gal-evals` is a deterministic evaluation layer for agents and other structured
outputs. It is deliberately small and dependency-light.

## Why It Is Separate

Keeping evaluation logic in its own package prevents two problems:

1. Product agents (such as email triage) do not get hardcoded into a contract or
   runtime package.
2. The same report contract can gate every agent family through one shared
   scoring path.

## Concepts

Evaluation suite:
Structured test cases and gate thresholds for one task family.

Evaluation adapter:
A scorer-facing adapter that produces actual outputs for each test case. An
adapter can call a rule engine, a local runtime, or a recorded prediction file.

Evaluation report:
The immutable result object (`gal.evals.report.v1`) emitted by the runner. It is
plain JSON: callers can print it, store it, or feed it into their own dashboards.

Deployment gate:
A rule such as `overall >= 0.85` or `archive >= 0.90` that fails the run when the
evaluated version is too risky.

## Flow

```text
suite (JSON test cases + gates)
        |
        v
adapter.evaluateCase(case)  ->  actual output
        |
        v
runner  ->  scores each field, applies gates
        |
        v
gal.evals.report.v1  ->  stdout (or --output file)
```

## Example Vertical Slice

The first suite is email triage because it is high-noise and high-risk. The
fixture data is synthetic. Live credentials, OAuth, sessions, and mutations
belong in your own runtime infrastructure, not in this repo.
