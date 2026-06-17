# Market Requirements Document: GAL Governance

**Version:** 1.0  
**Date:** May 2026  
**Author:** Scheduler Systems Ltd  
**Status:** Draft for Customer Review  

---

## 1. Executive Summary

AI coding agents (Claude Code, Cursor, GitHub Copilot, Codex) propose thousands of file edits, shell commands, and configuration changes per session. Human review cannot scale. Fully autonomous execution introduces unacceptable risk. The market needs a third option: **automated governance scoring** that runs inline, on CPU, at sub-millisecond latency.

**GAL** (Governance Agentic Layer) is the first learned governance model for AI agent oversight. An 866-parameter MLP, trained on over 1,500 real governance decisions from GitHub pull requests and production GAL deployments, scores every agent action — clear for operator review, or hold for operator review — at 0.04ms. GAL matches the accuracy of billion-parameter LLMs (90% on adversarial governance cases) at 35,900x lower latency and zero API cost. It runs on CPU as a sidecar, works on air-gapped networks, and is open-source (AGPL-3.0 with Enterprise licensing available).

## 2. Market Problem

### 2.1 The Governance Gap

| Today | The Problem |
|---|---|
| **No governance** | AI agents execute every action blindly. Risky changes go undetected. |
| **Human-in-the-loop** | Reviewing thousands of agent actions is impossible. Bottleneck at human cadence. |
| **Deterministic rules** | "CI passes + 1 approval = merge" catches obvious failures but can't learn from patterns. |
| **LLM-as-judge** | Sending every action to a cloud LLM for review costs ~$30/1,000 actions and adds 1.5s latency per action. |

### 2.2 Who Feels This Pain

- **Engineering teams** using AI coding agents who need safety without velocity loss
- **Security/compliance teams** who need proof that AI-generated changes were reviewed
- **Platform teams** who need a governance layer that integrates with existing CI/CD and code review workflows
- **Organizations on air-gapped networks** who cannot use cloud-based governance solutions

## 3. Target Customer Profile

### Primary: AI-Native Engineering Organizations

- 50+ developers using AI coding agents daily
- Existing CI/CD and code review infrastructure
- Compliance requirements (SOC 2, ISO 27001, FedRAMP)
- Need governance that doesn't slow development

### Secondary: Regulated Industries

- Defense/aerospace (air-gapped networks)
- Financial services (audit trail requirements)
- Healthcare (HIPAA compliance)
- Need on-premise, air-gap-compatible governance

## 4. Product Requirements

### 4.1 Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| **FR-1** | Score every agent action as "clear" or "hold" at sub-millisecond latency | P0 |
| **FR-2** | Operate as a CPU sidecar with no network dependency | P0 |
| **FR-3** | Provide confidence scores with every decision | P0 |
| **FR-4** | Generate governance prompts for uncertain actions ("are you sure?" feedback loop) | P1 |
| **FR-5** | Detect out-of-distribution inputs (adversarial feature gaming defense) | P1 |
| **FR-6** | Produce an immutable audit trail of all governance decisions | P1 |
| **FR-7** | Support per-organization fine-tuning on local review data | P2 |
| **FR-8** | Integrate with Claude Code, Cursor, Copilot, and Codex runtimes | P2 |
| **FR-9** | Generate compliance reports (SOC 2, ISO 27001 evidence) | P2 |
| **FR-10** | Support air-gapped deployment (7KB model checkpoint, no external calls) | P2 |

### 4.2 Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| **NFR-1** | Inference latency | < 1ms per action |
| **NFR-2** | Model size | < 10KB checkpoint |
| **NFR-3** | Accuracy (standard test) | > 99% |
| **NFR-4** | False-clear rate (adversarial) | < 35% (inline) + LLM review catches remainder |
| **NFR-5** | False-hold rate | < 1% |
| **NFR-6** | Throughput | > 50,000 actions/second |
| **NFR-7** | Deployment complexity | Single file + Python package |
| **NFR-8** | Availability | 99.9% (local process, no network dependency) |

## 5. Competitive Landscape

| Category | Solutions | GAL's Advantage |
|---|---|---|
| **Content Safety** | Llama Guard, ShieldGemma, WildGuard | Different problem. GAL governs actions, not content. |
| **Policy Engines** | OPA, Cedar, AWS IAM | Deterministic rules can't learn. GAL learns from decisions. |
| **PR Prediction** | DeepPull, academic models | Descriptive (will it merge?). GAL is prescriptive (should it proceed?). |
| **Governance Platforms** | Credo AI | Compliance at program level. GAL governs at action level. |
| **LLM-as-Judge** | Custom DeepSeek/GPT prompts | 35,900x slower. $30/1K actions. Requires cloud. |
| **Nothing** | — | No learned governance model exists. GAL creates the category. |

## 6. Success Metrics

| Metric | Baseline | Target |
|---|---|---|
| Governance coverage | 0% (blind) | 100% of agent actions scored |
| Human review reduction | 100% of actions | 41% flagged, 59% auto-cleared |
| Agent throughput impact | — | < 0.1% overhead |
| False-clear rate | 100% (blind) | < 35% inline + LLM review |
| Label quality (human agreement) | N/A | > 85% |
| Deployment time | N/A | < 1 hour |
| Air-gap compatibility | N/A | Yes (7KB checkpoint) |

## 7. Go-to-Market

### Phase 1: Case Study (Current)
- First enterprise customer pilot
- Shadow mode deployment alongside existing workflows
- Collect calibration data on customer's actual decisions
- Produce anonymized case study

### Phase 2: Early Access (Q3 2026)
- 3-5 design partners across industries
- Enterprise licensing available
- Fine-tuning pipeline for per-customer calibration
- Integration guides for major agent runtimes

### Phase 3: General Availability (Q4 2026)
- Self-serve deployment
- Managed cloud option for non-air-gapped customers
- Compliance reporting module
- Governance benchmark leaderboard

## 8. Pricing Model

Inspired by YOLO/Ultralytics dual-license model:

| Tier | Price | Includes |
|---|---|---|
| **Community (AGPL-3.0)** | Free | Model weights, adapters, benchmarks. Must open-source derivative works. |
| **Enterprise** | Contact us | Permissive license. Fine-tuning support. SLAs. Compliance reports. |
| **Managed Cloud** | Usage-based | Hosted governance API. No deployment required. Dashboard + audit trail. |

## 9. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| LLM providers add built-in governance | High | GAL is model-agnostic, runs locally, works on air-gap. Differentiate on deployment flexibility. |
| Competitor releases governance model | Medium | First-mover advantage. Build benchmark standard. Open-source creates ecosystem lock-in. |
| 8-feature model is gameable | Medium | OOD detector + adversarial training. Generalized architecture with text understanding. |
| Enterprise customers want SLAs | Low | Build managed cloud offering. Partner with deployment infrastructure providers. |
| Training data bias (Western repos) | Medium | Geographic diversity program. Per-customer calibration pipeline. Document limitations. |

## 10. References

- GAL Governance Model: github.com/gal-run/gal-model
- GAL Benchmarks: github.com/gal-run/gal-benchmark
- Governance Position Paper: docs/paper.md
- Enterprise Case Study: docs/case-study.md
- Legal Review: docs/legal-review.md
- Data Audit: docs/data-audit.md
