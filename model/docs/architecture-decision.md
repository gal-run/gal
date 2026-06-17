# Architecture Decision: Fast Advisory Sidecar

Status: accepted for v0/v1 direction.

`gal-model` should be optimized first as a fast advisory sidecar that other
models, agents, and application runtimes can call inline. The goal is not to
make GAL the largest reasoning model in the system. The goal is to make GAL a
low-latency governance scorer with a stable contract, conservative outputs, and
a path to hardware-friendly deployment.

## What We Learned

- GAL may be used as a secondary model by other models, so inference latency is
  a first-class requirement.
- The current input shape is structured governance evidence, not raw text,
  images, video, or flight-control data.
- For structured/tabular evidence, simple neural architectures remain strong
  baselines. A tuned MLP, ResNet-like MLP, or small FT-Transformer is a better
  next step than a large language-model architecture.
- OpenMythos and recurrent-depth transformers are interesting for latent
  reasoning and adaptive compute, but they should be a research lane, not the
  first inline GAL architecture.
- Taalas-style model-specific silicon is strategically relevant because it
  shows the value of fixed, specialized inference graphs. GAL should be shaped
  so it can eventually be frozen, quantized, compiled, and served at very low
  latency.

## Decision

Keep `gal-model://governance-decision/v0` as the small PyTorch MLP baseline.
The next production-oriented architecture should be a fixed-shape, quantization
friendly scorer over normalized governance features.

Preferred progression:

```text
v0: MLP governance classifier
v1: ResNet-like MLP or small FT-Transformer over typed evidence features
v1.5: quantization-aware, fixed-shape inference profile
v2-research: recurrent-depth evidence refinement if data proves the need
```

The hot path should remain:

```text
deterministic checks -> fast neural scorer -> conservative advisory decision
```

Larger or slower reasoning should sit behind escalation, not inside the default
inline call path.

The application-facing integration shape is documented in
[`docs/application-integration-architecture.md`](application-integration-architecture.md).
Benchmarking and competitive positioning are documented in
[`docs/benchmarking.md`](benchmarking.md).

## Output Contract Direction

The current output classes are:

- `clear_for_operator_review`
- `hold_for_operator_review`

Future evaluation should consider adding a third class:

- `escalate_for_deeper_review`

That class lets the fast model stay conservative. It can decline ambiguous
cases without pretending to solve every governance decision locally.

All outputs remain advisory. The model must not approve physical action or
command hardware.

## Candidate Architectures

| Candidate | Fit for current data | Latency profile | Hardware readiness | Role |
| --- | --- | --- | --- | --- |
| MLP | Strong baseline for structured features | Excellent | Excellent | Current v0 |
| ResNet-like MLP | Stronger baseline with skip connections | Excellent | Excellent | Preferred v1 candidate |
| Small FT-Transformer | Useful if feature interactions become complex | Good | Moderate | v1 candidate if metrics justify it |
| OpenMythos/RDT-inspired model | Interesting for adaptive latent reasoning | Variable | Lower until fixed and simplified | Research only |
| Full autoregressive LLM | Poor fit for current structured evidence | Poor for inline use | Poor for this repo | Out of scope |

## Research Notes

- OpenMythos: https://github.com/kyegomez/OpenMythos
  - Useful idea: latent recurrent refinement and adaptive compute.
  - Do not adopt wholesale for the inline sidecar. It is an autoregressive
    language-model architecture with recurrent loops, attention, MoE routing,
    and dynamic behavior that is excessive for current GAL evidence.
- Taalas: https://taalas.com
  - Useful idea: model-specific specialization rewards fixed graphs,
    quantization, and stable deployment contracts.
  - Treat as a deployment north star, not a dependency.
- Tabular deep learning reference:
  https://arxiv.org/abs/2106.11959
  - Use MLP-like and FT-Transformer baselines before more complex architectures.

## Completed in This Update

- The training-example schema now types every governance feature explicitly.
- The dataset manifest schema and validator now make training inputs
  checksumed, label-counted, and versioned.
- The ResNet-like MLP candidate is implemented and included in smoke
  evaluation and benchmark targets.
- The application-facing inference request/response wrapper is now represented
  in checked-in schemas and CLI output.
- Competitive baselines and benchmark suites are tracked in a checked-in
  registry.
- The GAL-native runtime governance benchmark now runs against both MLP and
  ResNet-like MLP smoke checkpoints and gates false clears, false holds,
  operator-review recall, schema rejection, audit metadata, and p95 latency.
- A normalized audit-event dataset builder now emits train/validation/test
  JSONL, runtime benchmark cases, a dataset manifest, and a build summary.
- A GAL session-audit adapter now converts per-tool governance audit logs into
  normalized audit events without copying raw tool inputs or outputs.
- RunPod training scripts now package the repo and train/evaluate both sidecar
  architectures from a manifest-backed dataset.
- Inference now validates checkpoint metadata before loading model weights.
- Evaluation now reports accuracy, confidence, confusion matrix, per-label
  recall, and advisory-only safety flags.
- Benchmarking now reports single-example and batched fixed-shape inference
  latency.
- Application integration is documented separately so real products can wire
  the model through adapters, deterministic checks, escalation, and audit.

## Next Work

1. Add a quantization-readiness track before changing to a larger model family.
2. Export real audited application events into the normalized audit-event
   format and run the builder to produce a versioned dataset.
3. Compare MLP vs ResNet-like MLP on a real train/validation/test split instead
   of the smoke fixture.
4. Evaluate the existing Phi-4 LoRA model as the deep-review escalation lane.
5. Replace the runtime benchmark fixture suite with audited application events
   and publish results in the model card.
