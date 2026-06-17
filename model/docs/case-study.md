# GAL Enterprise Case Study: AI Agent Governance in Production

## Customer Profile

Full-stack and embedded SW engineering organization. Development spans air-gapped networks
and internet-connected environments. Uses AI coding agents (Claude Code, Copilot) for
development acceleration across the full lifecycle.

## The Problem

AI coding agents propose thousands of actions per session — file writes, shell commands,
API calls, configuration changes. Without governance, every action executes blindly.
Human review can't scale to thousands of actions. The choice is: block AI agents entirely,
or let them run ungoverned. Neither is acceptable.

## The Solution: GAL Governance Layer

GAL is an 866-parameter governance model that scores EVERY agent action at sub-millisecond
latency on CPU. It runs as a sidecar alongside the agent, invisible to the developer.

```
Agent proposes action → GAL scores (0.04ms) → clear/hold/feedback → Agent continues or verifies
```

## Development Lifecycle Coverage

### 1. Code Review — Automated Governance Scoring

**Current state:** Human reviewers approve/request-changes on PRs. Average review latency: hours to days.

**With GAL:** Every file write scored inline. Risk signals detected before PR creation.

| Action | Without GAL | With GAL |
|---|---|---|
| Write new file with telemetry code | Executed blindly | **HOLD** — no human review, evidence incomplete |
| Write unit test for existing function | Executed blindly | **CLEAR** — safe, focused change |
| Modify auth handler | Executed blindly | **HOLD** — security-sensitive path |
| Fix typo in README | Executed blindly | **CLEAR** — trivial, safe |

**Result:** 41.8% of actions flagged for review. Human reviewers focus on flagged actions only.

### 2. Unit Testing — Test Adequacy Scoring

**Current state:** Tests run in CI. Pass/fail. No scoring of test quality.

**With GAL:** Test execution scored for coverage signals.

| Signal | GAL Feature | What It Means |
|---|---|---|
| Tests passing | `evidence_complete` | CI evidence present |
| New test files | `detection_count` | Change scope measured |
| Test-only changes | `obstacles_present=false` | Low risk change |
| No test changes with logic changes | `evidence_complete=false` | **HOLD** — untested logic change |

### 3. CI/CD — Governance Gates

**Current state:** Deterministic gates — "merge if CI passes + 1 approval."

**With GAL:** Learned governance gate — "merge if CI passes + GAL scores clear + 1 approval."

GAL catches patterns deterministic rules miss:
- CI passing but no human reviewer → HOLD
- CI passing but 18 files changed → HOLD (review required due to size)
- CI passing, 2 approvals, 1 file typo fix → CLEAR (fast-track)

### 4. Architecture Compliance

**Current state:** Manual architecture review. Inconsistent.

**With GAL:** Structured evidence from architecture decisions scored for compliance.

| Decision | GAL Scoring |
|---|---|
| New microservice with design doc + review | CLEAR — evidence complete, human review |
| Ad-hoc database schema change, no review | HOLD — no evidence, no review |
| API breaking change with migration plan | CLEAR — evidence complete, plan exists |

### 5. Static Code Analysis — Integration Pattern

GAL integrates with existing static analysis tools. The 8 governance features capture
the PROCESS around static analysis, not the analysis itself:

- `evidence_complete` — were lint/SAST/semgrep run?
- `obstacles_present` — did any checks fail?
- `detection_count` — how many issues found?

### 6. Legacy Code Refactoring

GAL scores refactoring risk by change volume and process quality:

| Refactor | detection_count | GAL Decision |
|---|---|---|
| Extract method, 3 files, with tests | 3 | CLEAR |
| Rewrite module, 50 files, no tests | 50 | **HOLD** |
| Rename variable, 1 file, with review | 1 | CLEAR |

## Air-Gapped Deployment

GAL runs entirely on CPU with no network dependencies. The 7KB model checkpoint
can be transferred to air-gapped networks via physical media. No cloud API calls.
No data exfiltration risk.

## Measurable Impact

| Metric | Without GAL | With GAL |
|---|---|---|
| Actions reviewed by human per session | 0 (blind) | 42% (focused) |
| Governance latency per action | 0ms | 0.04ms |
| False-clears (risky action executed) | Unknown | 25-33% caught by inline model, remainder caught by LLM review |
| Deployment mode | N/A | CPU sidecar, air-gap compatible |
| Model size | N/A | 7KB checkpoint |

## Getting Started

```bash
# Install GAL sidecar
pip install gal-model

# Run governance on your agent
gal-govern --model gal-model://governance-decision/v1 --watch
```

## Next Steps

1. **Pilot deployment:** GAL in shadow mode on customer's development workflow
2. **Calibration:** Fine-tune on customer's actual review decisions
3. **Production:** GAL in enforce mode with feedback loop
4. **Case study publication:** Anonymized results with customer approval
