# GAL Governance Decision: Human Annotation Protocol

**Study**: Inter-Annotator Agreement for Governance Decision Labeling
**Dataset**: GAL Governance Decision v0.2
**Version**: 2026-05-28

---

## 1. Task Description

You are participating in a human annotation study for the **GAL Governance Decision model**. This model decides whether an AI agent's action (from a GitHub pull request or a GAL session) should be "cleared for operator review" or "held for operator review."

Your task is to read each example's **8 governance features** and decide which label applies. There is no "right answer" -- we want your judgment. Three people will independently label each example, and we will measure how consistently humans agree.

Each example in the study comes from one of two sources:

- **GitHub PR reviews**: Actions taken by AI agents on pull requests in open-source repositories (e.g., kubernetes, python/cpython, rust-lang/rust).
- **GAL session exports**: Actions taken by AI agents inside the GAL (Governance-Aware Agentic Loop) application.

---

## 2. The 8 Governance Features

Each example has exactly 8 features that describe the governed action. Here is what they mean in plain language:

### Boolean features (true/false)

| # | Feature | When true, this means... | Plain-language cue |
|---|---------|--------------------------|--------------------|
| 1 | `approval_refs_complete` | All required approval references (e.g., linked issues, review threads, policy documents) are present in the evidence. | "All the paperwork is attached." |
| 2 | `evidence_complete` | The full evidence payload needed for scoring is present (logs, diffs, outputs). | "We have the full picture." |
| 3 | `latency_measured` | The application provided timing/performance evidence for this action. | "We know how long it took." |
| 4 | `obstacles_present` | Something blocking or risky was detected in the governed scene -- conflicting changes, merge conflicts, unresolved threads, etc. | "There's a blocker." |
| 5 | `operator_review_required` | Upstream policy says this action needs a human operator to review it before proceeding. | "Policy says a human must check." |
| 6 | `people_present` | People were detected in the governed scene (mentions, reviewers, assignees, affected users). | "There are people involved." |
| 7 | `vehicles_present` | A vehicle-or-motion-related entity was detected (CI runners, deployment pipelines, release trains). | "Something is in motion / being shipped." |

### Numeric feature

| # | Feature | Meaning | Plain-language cue |
|---|---------|---------|--------------------|
| 8 | `detection_count` | Count of how many normalized detections were raised by the governance sensors. 0 = nothing flagged, 1 = one thing flagged, 2 = two or more things flagged. | "How many red flags were raised." |

---

## 3. Decision Criteria

You must choose one of two labels for each example:

### `clear_for_operator_review`

Choose this when the evidence suggests **the action is safe to review** and does not need special handling. The agent can proceed to operator review without additional escalation.

**Typical profile:**
- Evidence is complete (`evidence_complete: true`)
- No obstacles present (`obstacles_present: false`)
- No upstream requirement for operator review (`operator_review_required: false`)
- Few or no detections (`detection_count: 0`)
- Approval references may or may not be complete

### `hold_for_operator_review`

Choose this when the evidence suggests **the action needs closer scrutiny** before it can proceed to operator review. Something about the governed scene is risky, incomplete, or policy-prohibited.

**Typical profile (any one of these may be sufficient):**
- Obstacles are present (`obstacles_present: true`)
- Operator review is required by policy (`operator_review_required: true`)
- Evidence is incomplete (`evidence_complete: false`)
- Multiple detections raised (`detection_count >= 1`)
- Approval references are missing (`approval_refs_complete: false`)
- People or vehicles are present in a sensitive context

### Important guidelines

- **No single feature is dispositive.** A hold case might have evidence complete but still have obstacles or policy requirements. A clear case might have detection_count=1 but all other signals benign.
- **Use your judgment on combinations.** For example:
  - `people_present: true` with `obstacles_present: false` and `evidence_complete: true` is often still clear -- people being present is not inherently risky.
  - `people_present: true` with `obstacles_present: true` and `evidence_complete: false` is a stronger hold signal.
- **When in doubt, hold.** The model's purpose is safety-conscious governance. If the evidence is ambiguous, err on the side of holding for operator review.
- **Consider the source.** GitHub PRs involve code changes to public repositories; GAL sessions involve AI agent tool calls. The same feature pattern may warrant different judgments by source context.

---

## 4. Example Annotations

### Example A: Clear case

```json
{
  "id": "github-pr-python/cpython-150491",
  "features": {
    "approval_refs_complete": false,
    "detection_count": 0,
    "evidence_complete": true,
    "latency_measured": true,
    "obstacles_present": false,
    "operator_review_required": false,
    "people_present": false,
    "vehicles_present": false
  },
  "source": "github_pr_reviews"
}
```

**Rater decision: clear_for_operator_review**

**Reasoning:** Evidence is complete, no obstacles detected, no upstream policy requiring operator review, and no people or vehicles involved. Detection count is zero. The only missing piece is `approval_refs_complete`, which is not sufficient on its own to hold. This is a straightforward clear case -- the action appears safe to proceed to operator review.

---

### Example B: Hold case

```json
{
  "id": "github-pr-kubernetes/kubernetes-137372",
  "features": {
    "approval_refs_complete": false,
    "detection_count": 0,
    "evidence_complete": false,
    "latency_measured": true,
    "obstacles_present": true,
    "operator_review_required": true,
    "people_present": true,
    "vehicles_present": false
  },
  "source": "github_pr_reviews"
}
```

**Rater decision: hold_for_operator_review**

**Reasoning:** Multiple signals point to holding. Obstacles are present (conflicts or blockers), operator review is required by upstream policy, evidence is incomplete (missing logs/diffs), and people are involved. The combination of obstacles + missing evidence + policy requirement makes this a clear hold -- the action needs closer human scrutiny before it can proceed.

---

### Example C: Hold case (GAL session)

```json
{
  "id": "session-archive-gal-run-63abd180-9ca5-4827-a237-9edaec6376ad-call_01_XzjQCH9t0IMSzbmwzL8R3683",
  "features": {
    "approval_refs_complete": true,
    "detection_count": 1,
    "evidence_complete": true,
    "latency_measured": true,
    "obstacles_present": false,
    "operator_review_required": true,
    "people_present": false,
    "vehicles_present": false
  },
  "source": "gal_session_exports"
}
```

**Rater decision: hold_for_operator_review**

**Reasoning:** Although evidence is complete and there are no obstacles, upstream policy requires operator review (`operator_review_required: true`), and there is one detection raised. In GAL session contexts, policy-mandated operator review combined with any detection count is sufficient reason to hold. The approval references are complete and nothing else is flagged, but the policy requirement overrides.

---

## 5. Answer Sheet Template

The answer sheet (`answer-sheet-template.md`) contains 50 rows, one per example. For each row:

1. **Enter your decision**: `clear_for_operator_review` or `hold_for_operator_review`
2. **Write brief reasoning** (1-3 sentences): Which features drove your decision and why.

---

## 6. Fleiss' Kappa Background

After all three raters complete their annotations, we will compute **Fleiss' Kappa** to measure inter-annotator agreement. This statistic tells us whether our labeling guidelines are clear enough for consistent human judgment.

Thresholds:

| Kappa | Agreement Level | Meaning |
|-------|-----------------|---------|
| < 0.40 | Poor | Guidelines need revision |
| 0.40 - 0.59 | Fair | Acceptable for weak labels |
| 0.60 - 0.79 | Substantial | Good for training data |
| >= 0.80 | Near-perfect | Publishable quality |

---

## 7. What to Annotate

Open `data/annotation-study/annotation-samples.jsonl` and read each line. Fill in your decisions and reasoning in the answer sheet (`data/annotation-study/answer-sheet-template.md`).

Do not look at the `current_label` field in the JSONL file until after you have completed your annotations -- this field contains the model's current label and would bias your judgment.

Estimated time: 30-60 minutes for 50 examples.

Thank you for contributing to governance AI quality.
