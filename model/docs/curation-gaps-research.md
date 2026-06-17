# Curation Gaps: Research and Recommendations

Last updated: 2026-05-28

## Current State

| Metric | GAL | Competitor Standard | Gap |
|---|---|---|---|
| Training examples | 1,111 | 10K-87K | 10-80x |
| Label validation | 50-example LLM audit | 3+ human raters per example | No human validation |
| Inter-annotator agreement | None | Fleiss' Kappa, majority vote | No measurement |
| Active learning loop | None | Uncertainty sampling | No review pipeline |
| Cultural diversity audit | None | Global-MMLU, geographic distribution | 100% Western repos |
| Quality scoring | Heuristic filters | Learned quality model (DataRater) | Rule-based only |

## Gap 1: Noise-Robust Training

**What competitors do:** ShieldGemma uses 3 human raters with majority vote. CleanLab recommends out-of-sample predicted probabilities with confident learning.

**What we should do:**
1. Run CleanLab on all 1,111 training examples with 5-fold cross-validation to get out-of-sample `pred_probs`
2. `find_label_issues(labels, pred_probs, return_indices_ranked_by='self_confidence')` → ranked list of suspicious examples
3. For the top 20 most suspicious: human review (or LLM judge review)
4. Retrain with cleaned labels
5. Report label noise estimate in the paper

**Key paper:** Northcutt et al., "Confident Learning: Estimating Uncertainty in Dataset Labels," JAIR 2021.
**Key insight:** CleanLab works at 40-70% noise levels with small datasets. Our 96% LLM-audit agreement suggests noise is low, but that's an LLM estimate, not ground truth.

## Gap 2: Inter-Annotator Agreement

**What competitors do:** 3 human raters per example, majority vote, Fleiss' Kappa for agreement.

**What we should do:**
1. Select 50 diverse examples (25 clear, 25 hold, stratified by source)
2. Have 3 people independently label them (clear_for_operator_review / hold_for_operator_review)
3. Compute Fleiss' Kappa
4. If Kappa < 0.6: refine labeling guidelines
5. If Kappa >= 0.6: use majority vote as ground truth labels
6. Report Kappa in the paper

**Thresholds:**
- Kappa < 0.4: poor agreement — labeling guidelines need work
- 0.4-0.6: moderate — acceptable for weak labels
- 0.6-0.8: substantial — good for training data
- > 0.8: near-perfect — publishable

**Cost estimate:** 50 examples × 3 raters × 2 min/example = 5 person-hours.

## Gap 3: Active Learning Loop

**What competitors do:** Uncertainty sampling — query examples where model is least confident. Iterative: label → retrain → query → repeat.

**What we should do:**
1. Run the Snorkel label model on all training data → per-example confidence scores
2. Query the 20 examples with lowest label confidence
3. Human reviews these 20
4. Replace weak labels with human labels
5. Retrain, re-evaluate
6. Repeat until label confidence plateaus

**Key technique:** CUAL (Continual Uncertainty-aware Active Learner, 2024) shows effective uncertainty estimation even at 2.5% labeling budget using feature reconstruction error.

**For GAL specifically:**
- Use `probabilistic_label.confidence` from our label model as the uncertainty signal
- Use disagreement across labeling functions as a secondary signal
- Target: 50-100 human-reviewed examples in the training set

## Gap 4: Production Curation Patterns

**What industry does (2024-2025):**

Risk-tiered governance is the dominant pattern:
- **Tier 1 (Low risk):** Internal tools, human-in-the-loop → lightweight logging
- **Tier 2 (Medium):** Customer-facing assist → full tracing, golden-set checks
- **Tier 3 (High):** Regulated domains, partial autonomy → enhanced testing, staged rollout
- **Tier 4 (Critical):** Medical, credit → board approval, real-time monitoring

GAL naturally fits Tier 1-2 for AI coding agent governance.

**Key metrics from industry:**
| Metric | Why |
|---|---|
| Outcome lift | Did the model improve decision quality? |
| Retention | Do users stay on the governed path? |
| Safety incidents | Override/rollback rates |
| MTTR | Time to recover from false clear |
| Cost per task | Including human review cost |

**60-day governance sprint pattern** (from AWS/Forbes/GoodData):
- Weeks 1-2: Define tiers, decision rights, default controls
- Weeks 3-4: Instrument pilot with full evidence capture
- Weeks 5-6: Progressive rollout, first audit pack

## Gap 5: Cultural and Geographic Bias

**The problem:** Our training data comes from GitHub PRs on repos dominated by Western contributors (rust-lang, golang, kubernetes, python/cpython, etc.) and GAL session data (Western company). Review cultures vary significantly by geography — what's "acceptable" in one culture may be "risky" in another.

**What research shows:**
- Global-MMLU (2024): 84.9% of geographic knowledge in benchmarks is US/Europe
- World Wide Dishes (2024): Models underperform on non-US regions
- Toxicity-Rabbit-Hole (2024): 193 countries, 1,023 ethnic groups — bias auditing at scale

**What we should do:**
1. Audit current training data for geographic diversity of repositories
2. Add repos from non-Western governance cultures (Japan, China, India, Brazil, Africa)
3. Compute per-region accuracy on the test set
4. Document bias in the model card
5. Target: no single region > 70% of training examples

**Key repos to add for diversity:**
- Alibaba, Baidu, Tencent (China)
- LINE, Rakuten, Mercari (Japan)
- Infosys, TCS open-source (India)
- VTEX, Nubank (Brazil)

## Gap 6: Quality Scoring Beyond Heuristics

**What competitors do:** DataRater (DeepMind, 2025) uses meta-learning to estimate per-example training value. Up to 46.6% net compute gain by discarding low-value examples.

**What we should do (simpler, appropriate for our scale):**
1. Score each training example on:
   - Label confidence (from Snorkel label model)
   - Feature completeness (all 8 features present)
   - Source reliability (session > GitHub > third-party)
   - Reviewer count (GitHub PRs with multiple reviewers > single reviewer)
2. Compute composite quality score
3. Filter or weight by quality score during training
4. This is effectively a learned version of our heuristic signal_density filter

## Implementation Priority

| Priority | Gap | Effort | Impact |
|---|---|---|---|
| 1 | CleanLab noise audit + label cleaning | 2 hours | High — paper needs this |
| 2 | Inter-annotator agreement (3 raters × 50) | 5 person-hours | High — paper credibility |
| 3 | Cultural bias audit + diverse repos | 3 hours | Medium — paper improvement |
| 4 | Active learning loop | 4 hours | Medium — ongoing pipeline |
| 5 | Quality scoring (composite) | 2 hours | Low — nice-to-have |
| 6 | Production metrics framework | 3 hours | Low — future deployment |

## References

- Northcutt et al. "Confident Learning: Estimating Uncertainty in Dataset Labels." JAIR, 2021.
- Ahadi et al. "Optimal Labeler Assignment and Sampling for Active Learning." arXiv:2512.12870, 2025.
- Rios et al. "CUAL: Continual Uncertainty-aware Active Learner." arXiv:2412.09701, 2024.
- Global-MMLU. "Understanding and Addressing Cultural and Linguistic Biases." arXiv:2412.03304, 2024.
- DataRater. "Meta-Learned Dataset Curation." NeurIPS, 2025.
- Forbes. "Scaling AI with Governance, Trust and Data Discipline." Oct 2025.
- AWS. "Governing the ML Lifecycle at Scale, Part 4." 2025.
- EU AI Act. Enforcement beginning 2025.
