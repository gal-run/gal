# Model Card: GAL Governance Decision v0

- Model ref: `gal-model://governance-decision/v0`
- Status: trainable baseline
- Architecture: PyTorch MLP baseline with `resnet_mlp` comparison candidate
- Intended use: advisory operator-review decision support
- Not intended for: hardware control, physical action approval, targeting,
  pursuit, engagement, or coercive surveillance

## Inputs

Normalized governance features derived from audited evidence. The current
normalized sources supported in this repo are:

- manifest-backed training JSONL;
- normalized audit events;
- GAL session audit log exports adapted through
  `gal_model.session_audit_adapter`;
- direct GAL API session audit exports through
  `gal_model.gal_api_session_export`;
- richer `TrainableTraceV1` exports adapted through
  `gal_model.trainable_trace_adapter`.

## Outputs

- `clear_for_operator_review`
- `hold_for_operator_review`

Responses remain advisory-only and include audit-preserving wrapper fields in
the checked-in inference response schema.

## Evaluation

The repo now includes:

- checkpoint metadata validation;
- dataset manifest validation;
- model evaluation CLI;
- latency benchmark CLI;
- GAL-native runtime governance benchmark with false-clear, recall, schema
  rejection, audit metadata, and p95 latency checks.

On the current fixture smoke path, both `mlp` and `resnet_mlp` pass accuracy,
runtime governance benchmark, and latency thresholds. The MLP remains the
preferred hot-path default until a larger audited dataset proves otherwise.

The default application embedding target is an ONNX Runtime CPU artifact
exported from the PyTorch checkpoint, with parity checks against the training
graph before promotion.

The older Phi-4 RunPod governance endpoint should be treated as retired for
inline use. It remained too cold-start-heavy and operationally brittle even
after a clean smoke redeploy attempt, so it is not the promotion baseline for
`gal-code`.

## Training And Artifacts

The RunPod handoff path is documented in `docs/runpod-training.md`.

Promotion requires:

- validated dataset manifest;
- export provenance recorded when the source came from GAL API session audit
  logs;
- successful CUDA preflight for paid GPU training runs;
- passing eval and runtime benchmark artifacts;
- advisory-only flags preserved;
- model card update with dataset/checkpoint/benchmark references.
- reviewed internal governance cases, not only weak-label governance ledgers.

External registry guidance:

- Hugging Face is the preferred external model-artifact registry, private first.
- Kaggle is acceptable for sanitized benchmark/model packaging, not internal
  telemetry or the canonical training corpus.
- Snowflake is the stronger fit if GAL later needs a governed private registry
  for reviewed datasets, model lineage, and RBAC-backed promotion state.

## Safety Boundary

The model may advise review routing. It must not approve action. Downstream
runtimes must preserve human review and explicit safety gates.
