# GAL Vision: The Governance Layer for Agentic AI

## Problem

AI coding agents propose thousands of actions per session. Human review cannot scale.
Deterministic rules (OPA, Cedar, merge queues) catch obvious violations but can't learn.
Content safety classifiers (Llama Guard, ShieldGemma) answer the wrong question.

**Nobody has built a learned model that scores every agent action for governance review at machine speed.**

## Solution: GAL

A 500-parameter MLP that scores AI agent actions at 0.04ms — inline, on CPU, as a sidecar.

GAL answers: "Should this action proceed?" using structured process signals:

```
Agent proposes action → GAL scores (0.04ms) → clear | hold | feedback
```

## The Three-Layer Architecture

### Layer 1: Inline Triage (GAL MLP)
- 500 parameters, 0.04ms latency, CPU-only
- Scores EVERY action — never blocks, always advises
- 80-90% accuracy on governance decisions
- Output: clear / hold / uncertain

### Layer 2: Recursive Feedback Loop
When GAL is uncertain (confidence < 85%):

```
GAL: "Are you sure about this? Verify: (1) CI passing? (2) Approvals complete? (3) Security review?"
Agent: [re-checks] "Confirmed: CI is green, 2 approvals, no security concerns"
GAL: [re-scores] → Confidence now 94% → CLEAR
```

The agent does a deeper check. GAL re-scores. Loop until satisfied or escalated.
Maximum 3 rounds. Escalated cases go to human review.

### Layer 3: Deep LLM Review
Ambiguous or escalated cases routed to an LLM with full context at ~1.5s latency.
Catches the 10-20% that structured features alone miss: semantic risk, intent, CVE knowledge.

## The Governance Feedback Pattern

This is the key innovation beyond the model itself. Instead of blocking, GAL prompts:

1. **"Are you sure?"** — the universal governance question
2. Agent re-verifies specific concerns GAL identifies
3. The re-verification IS the deeper check
4. Confidence rises with verification

This mirrors how humans govern: we don't just say "no" — we ask "are you sure about X?"

## Swarm Benchmark

The definitive benchmark: a swarm of coding agents performing real tasks at scale.

### Design
- 10+ agents working concurrently on a complex multi-file project
- Half the agents have GAL governance active; half don't
- Compare: false-clears caught, false-holds blocked, latency overhead, human review time saved

### Metrics
| Metric | Without GAL | With GAL | Improvement |
|---|---|---|---|
| Unsafe actions executed | baseline | ↓ 80-90% | — |
| Safe actions blocked | — | minimal | — |
| Governance latency overhead | — | <0.1ms/action | — |
| Human review escalations | — | 10-20% of actions | — |
| Agent throughput (actions/min) | baseline | unchanged | — |

### What It Proves
- GAL catches real governance failures at scale, not just on 10 adversarial cases
- The 0.04ms overhead is imperceptible — agents run at full speed
- The feedback loop resolves most uncertain cases without human intervention
- Human review is reserved for genuinely ambiguous cases (10-20%)

## Governance Benchmark Standard

Since no standard exists, we define it:

### Categories
1. **Clean merge** — obviously safe, should clear at high confidence
2. **Legitimate hold** — clear risk signals, should hold at high confidence
3. **Adversarial malicious** — clean surface, malicious intent (requires semantic understanding)
4. **Adversarial benign** — bad surface, benign change (requires context)
5. **Process bypass** — admin override, emergency merge, skipped process
6. **Bot automation** — dependency bumps, automated changes
7. **Security critical** — sensitive paths, vulnerability fixes
8. **Large refactor** — high change volume
9. **Cultural variance** — norms differ by organization/region
10. **Ambiguous** — reasonable reviewers would disagree

### Scoring Dimensions (Petri-compatible)
- False-clear rate (critical failure)
- Excessive-hold rate (efficiency)
- Confidence calibration
- Adversarial robustness
- Evidence responsiveness
- Latency budget compliance

## Competitive Landscape

| Category | Player | GAL's Position |
|---|---|---|
| **Content Safety** | Llama Guard, ShieldGemma, WildGuard | Different problem — GAL doesn't compete here |
| **PR Prediction** | DeepPull, Joshi & Kahani | Different question — GAL is prescriptive, not descriptive |
| **Policy Engines** | OPA, Cedar, Jackson 2025 | GAL learns — these are deterministic rules |
| **Governance Platforms** | Credo AI | GAL is a model, not a platform — complementary |
| **Governance Models** | None published | GAL creates this category |

## Ralph Loop Integration

Ralph Loop is an autonomous Claude Code runner — it calls Claude Code in a loop to iteratively work on projects. The integration with GAL governance is natural:

```
Ralph Loop → runs Claude Code → proposes action → GAL scores → clear/hold/feedback
                                                                ↓ (feedback)
                                          "Are you sure about X?" → Ralph's Claude re-verifies
                                                                ↓
                                          GAL re-scores → satisfied → clear
```

### Integration Points

1. **GAL as a Ralph hook** — PreToolUse hook in Ralph's configuration runs GAL before every tool call
2. **Feedback loop** — When GAL returns "feedback" with a governance prompt, it's injected into Ralph's Claude Code session via `--append-system-prompt`
3. **Circuit breaker** — If GAL consistently blocks actions (3+ consecutive holds), Ralph's circuit breaker trips to prevent infinite loops
4. **Governance audit trail** — Every GAL decision is logged with timestamp, features, decision, and confidence for compliance

### Ralph + GAL Swarm

The ultimate benchmark: 10+ Ralph Loop instances running concurrently, half with GAL governance, half without. Each instance works on a real multi-file coding task. GAL governance is transparent — Ralph instances with GAL produce safer code with the same throughput.

## Roadmap

### Now (v0.2)
- [x] 8-feature structured governance MLP
- [x] GitHub PR review adapter (920 PRs, 38 repos, 6 regions)
- [x] GAL session export adapter (593 sessions)
- [x] Adversarial governance benchmark (10 cases)
- [x] Snorkel-style curation pipeline
- [x] Petri-compatible governance seeds + dimensions
- [x] Dual-license model (AGPL-3.0 + Enterprise)
- [ ] Recursive feedback loop
- [ ] Swarm benchmark
- [ ] RunPod GPU training

### Next (v0.3)
- [ ] Runtime governance sidecar (ONNX + agent integration)
- [ ] CVE database integration (external risk signals)
- [ ] 100+ adversarial cases via Petri pipeline
- [ ] Per-organization governance calibration
- [ ] arXiv publication

### Future (v1.0)
- [ ] Federated governance (org-specific fine-tuning)
- [ ] Multi-modal features (code diff embeddings)
- [ ] Integration with Claude Code, Cursor, Copilot, Codex
- [ ] Governance-as-a-service API
- [ ] Enterprise licensing revenue
