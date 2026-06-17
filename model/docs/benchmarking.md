# Benchmarking And Competitive Positioning

GAL is adjacent to safety classifiers, moderation APIs, and runtime guardrail
products, but it should not compete as a generic content moderation model. The
stronger position is application execution governance: a fast advisory model
that scores normalized evidence before an application, agent, or runtime crosses
a policy boundary.

The benchmark registry is checked in at
[`benchmarks/registry.json`](../benchmarks/registry.json).
The GAL-native benchmark runner is available as
`python -m gal_model.runtime_benchmark`.

## Position

GAL competes most directly with:

- runtime guardrail systems;
- agent safety monitors;
- application authorization and governance services;
- internal policy engines that decide whether an AI action should proceed,
  hold, or escalate.

GAL is only indirectly comparable to:

- generic input/output moderation APIs;
- text-only refusal classifiers;
- image safety classifiers;
- jailbreak-only detectors.

Those systems are still useful references, but beating them on generic content
moderation is not the core product goal.

## Baselines To Track

| System | Why It Matters | GAL Fit |
| --- | --- | --- |
| OpenAI Moderation API | Hosted multimodal moderation with calibrated scores | Reference for content safety, not action governance |
| Meta Llama Guard 4 | Open multimodal safety classifier aligned to MLCommons hazards | Open classifier baseline |
| NVIDIA NemoGuard / NeMo Guardrails | Enterprise safety model and guardrail framework | Enterprise guardrail baseline |
| AllenAI WildGuard | Open moderation model covering prompts, responses, jailbreaks, and refusals | Deep-review/moderation reference |
| Lakera Guard | Runtime security layer for prompt injection, leakage, and application defense | Product/runtime competitor |
| Google ShieldGemma 2 | Open image-safety classifier | Future multimodal reference, not v0 |

## Benchmark Tiers

### Tier 1: GAL-Native Runtime Governance

This is the benchmark we need to build and own. It should use normalized
application events and measure whether GAL makes the right advisory routing
decision.

Primary metrics:

- false clear rate;
- false hold rate;
- operator-review recall;
- escalation precision;
- p50 and p95 latency;
- schema rejection rate;
- audit metadata completeness.

This tier matters more than generic leaderboard performance because it measures
the real product contract.

### Tier 2: Agent-Safety References

Use these to prove that GAL's governance direction maps to known agent risk
surfaces:

- AgentHarm for harmful agent requests;
- SafeArena for web-agent misuse;
- R-Judge for multi-turn trace safety judgment;
- ILION-Bench v2 for proposed-action allow/block conformance.

These should inform schema evolution for future features such as tool
sensitivity, irreversible operation, approval boundary, data exfiltration risk,
and external communication.

### Tier 3: Content-Safety And Refusal References

Use these mostly for the deep-review lane:

- MLCommons AILuminate for general chat-system hazard benchmarking;
- WildGuardTest for prompt, response, jailbreak, and refusal classification;
- HarmBench for robust refusal and adversarial safety regression;
- Aegis, BeaverTails, HH-RLHF, and similar datasets for taxonomy and training
  references.

These do not replace the GAL-native dataset because they usually label text
content, not application actions with audit context.

## Promotion Gates

A GAL sidecar model should not be promoted just because it improves accuracy on
a small fixture. Promotion needs a versioned dataset manifest plus:

- no schema contract regressions;
- lower or equal false clear rate than the current production model;
- acceptable false hold rate for operator workload;
- p95 latency within the inline budget;
- stable confidence calibration;
- advisory-only response flags preserved;
- model-card update with benchmark and dataset refs.

The current fixture can prove that the code path works. It cannot prove that the
model is production-ready.

## Checked-In Smoke Runner

The fixture suite at
[`benchmarks/fixtures/runtime-governance-smoke.jsonl`](../benchmarks/fixtures/runtime-governance-smoke.jsonl)
exercises:

- clear advisory routing;
- hold advisory routing;
- invalid request rejection;
- escalation flag correctness;
- audit metadata preservation;
- p95 latency thresholding.

The smoke threshold intentionally keeps false-clear rate, false-hold rate,
operator-review recall, schema rejection, and audit metadata strict. Escalation
precision is tracked with a looser fixture threshold because the tiny smoke
dataset is not calibrated enough to prove that clear cases should avoid
low-confidence escalation.

Run it against the smoke-trained MLP:

```bash
make runtime-benchmark-smoke PYTHON=.venv/bin/python
```

Run it against the ResNet-like MLP candidate:

```bash
make runtime-benchmark-resnet-smoke PYTHON=.venv/bin/python
```

The production version of this benchmark should replace fixture cases with
manifest-backed audited application events and record the result in the model
card before promotion.

## Head-To-Head Workflow

Use the same runtime-case file for both systems.

1. Build a stratified sample from a larger live benchmark file:

```bash
make sample-runtime-cases \
  PYTHON=.venv/bin/python \
  RUNTIME_BENCHMARK=artifacts/gal-api-session-export-gal-run-live-25/runtime-benchmark.jsonl \
  RUNTIME_BENCHMARK_SAMPLE_OUTPUT=tmp/runtime-benchmark-live-25-sample40.jsonl \
  RUNTIME_BENCHMARK_SAMPLE_CASES=40
```

2. Run the current GAL sidecar checkpoint on that sample:

```bash
make runtime-benchmark-live \
  PYTHON=.venv/bin/python \
  LIVE_MODEL_PATH=artifacts/gal-api-session-export-gal-run-live-25-train-mlp/gal-governance-decision.pt \
  RUNTIME_BENCHMARK=tmp/runtime-benchmark-live-25-sample40.jsonl \
  RUNTIME_BENCHMARK_OUTPUT=tmp/ours-runtime.json
```

3. Run the comparison baseline on the same file. The baseline runner supports
   both OpenAI-compatible `/v1/chat/completions` endpoints and raw RunPod
   `/runsync` endpoints:

```bash
OPENAI_API_KEY=... \
make runpod-endpoint-preflight \
  PYTHON=.venv/bin/python \
  OPENAI_BASELINE_ENDPOINT=https://api.runpod.ai/v2/<id>/runsync \
  OPENAI_BASELINE_MODEL=microsoft/phi-4 \
  RUNPOD_PREFLIGHT_OUTPUT=tmp/runpod-preflight.json

OPENAI_API_KEY=... \
make openai-baseline-benchmark-live \
  PYTHON=.venv/bin/python \
  RUNTIME_BENCHMARK=tmp/runtime-benchmark-live-25-sample40.jsonl \
  OPENAI_BASELINE_ENDPOINT=https://api.runpod.ai/v2/<id>/runsync \
  OPENAI_BASELINE_MODEL=microsoft/phi-4 \
  OPENAI_BASELINE_OUTPUT=tmp/their-runtime.json
```

4. Produce a normalized summary:

```bash
make compare-benchmarks \
  PYTHON=.venv/bin/python \
  RUNTIME_BENCHMARK_OUTPUT=tmp/ours-runtime.json \
  OPENAI_BASELINE_OUTPUT=tmp/their-runtime.json \
  COMPARE_BENCHMARKS_OUTPUT=tmp/runtime-comparison.json
```

The comparison summary reports:

- decision match rate;
- false clear rate;
- false hold rate;
- operator-review recall;
- escalation precision;
- p50 and p95 latency;
- relative latency ratio.

For RunPod baselines, the preflight step is the intended guardrail. It fails
fast on dead endpoint ids, HTTP auth mismatches, and queue-only endpoints that
accept jobs but never produce a worker.

## Source Links

- OpenAI Moderation API: <https://openai.com/index/upgrading-the-moderation-api-with-our-new-multimodal-moderation-model/>
- Meta Llama Guard 4: <https://huggingface.co/meta-llama/Llama-Guard-4-12B>
- NVIDIA NemoGuard: <https://build.nvidia.com/nvidia/llama-3_1-nemoguard-8b-content-safety/modelcard>
- AllenAI WildGuard: <https://arxiv.org/abs/2406.18495>
- Lakera Guard: <https://docs.lakera.ai/guard>
- Google ShieldGemma 2: <https://ai.google.dev/gemma/docs/shieldgemma/model_card_2>
- MLCommons AILuminate: <https://mlcommons.org/ailuminate/safety/>
- AgentHarm: <https://huggingface.co/datasets/ai-safety-institute/AgentHarm>
- SafeArena: <https://safearena.github.io/>
- R-Judge: <https://rjudgebench.github.io/>
- ILION-Bench v2: <https://zenodo.org/records/18929841>
- HarmBench: <https://arxiv.org/abs/2402.04249>
