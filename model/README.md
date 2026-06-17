# GAL Model

Deep-learning governance model for GAL.

This repo is singular on purpose: it is the home for the first canonical learned
GAL model, not a registry of many model contracts.

## Model Type

The initial model is a supervised governance decision model:

```text
governance evidence -> learned advisory decision
```

It is not a computer-vision detector like YOLO and it is not a flight-control
model. It consumes normalized evidence from product or experiment repos and
predicts review outcomes.

Initial output classes:

- `clear_for_operator_review`
- `hold_for_operator_review`

The model is advisory. It must not approve physical action or command hardware.

## Current Architecture

`gal-model://governance-decision/v0` is a small PyTorch MLP over structured
governance features. This is the first trainable baseline so the repo has a real
deep-learning path:

- JSONL training examples;
- feature encoder;
- PyTorch network;
- training CLI;
- dataset manifest validation CLI;
- inference CLI;
- evaluation and latency benchmark CLIs;
- model card;
- smoke tests.

Later versions should keep the inline sidecar path fast and fixed-shape before
moving to larger architectures. The current architecture direction is documented
in [`docs/architecture-decision.md`](docs/architecture-decision.md): compare the
current MLP with the ResNet-like MLP candidate, treat OpenMythos-style recurrent
depth as research, and keep Taalas-style specialization as a deployment north
star.

Application integration is documented in
[`docs/application-integration-architecture.md`](docs/application-integration-architecture.md).
Dataset sourcing and RunPod training direction is documented in
[`docs/dataset-strategy.md`](docs/dataset-strategy.md).
Benchmarking and competitive positioning are documented in
[`docs/benchmarking.md`](docs/benchmarking.md).
RunPod handoff is documented in [`docs/runpod-training.md`](docs/runpod-training.md).

## Development

Use a Python environment with PyTorch installed.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
make validate PYTHON=.venv/bin/python
```

Run inference after the training smoke:

```bash
make infer-smoke PYTHON=.venv/bin/python
```

Evaluate and benchmark the trained smoke model:

```bash
make eval-smoke PYTHON=.venv/bin/python
make bench-smoke PYTHON=.venv/bin/python
```

Export the trained smoke model to an ONNX Runtime sidecar artifact:

```bash
make onnx-export-smoke PYTHON=.venv/bin/python
make onnx-infer-smoke PYTHON=.venv/bin/python
```

Validate the fixture dataset manifest, build the RunPod bundle, or train the
ResNet-like MLP candidate:

```bash
make session-audit-adapter-smoke PYTHON=.venv/bin/python
make trainable-trace-adapter-smoke PYTHON=.venv/bin/python
make build-dataset-smoke PYTHON=.venv/bin/python
make runpod-bundle-smoke PYTHON=.venv/bin/python
make runpod-job-bundle-smoke PYTHON=.venv/bin/python
make runpod-local-e2e-smoke PYTHON=.venv/bin/python
make data-smoke PYTHON=.venv/bin/python
make train-resnet-smoke PYTHON=.venv/bin/python
```

Export a real dataset from GAL API session audit logs or the production archive
fallback:

```bash
GAL_AUTH_TOKEN=... make gal-api-session-export \
  PYTHON=.venv/bin/python \
  GAL_API_BASE_URL=https://api.gal.run \
  GAL_API_ORG=gal-run \
  GAL_API_EXPORT_SOURCE=auto \
  GAL_API_DISCOVER_LIMIT=5
```

That export writes both `dataset-manifest.json` and
`gal-api-export-summary.json`, so the dataset has a checked provenance artifact
before it is packed for RunPod. In production today, `auto` will fall back to
session archives when the `tool-governance` audit-log feature is disabled, and
it marks the dataset as `gal_session_archive_weak_labels` plus
`pending_review`.

For richer opt-in training data exported from the older governance closed loop,
adapt `TrainableTraceV1` NDJSON into normalized audit events:

```bash
python -m gal_model.trainable_trace_adapter \
  --input /path/to/trainable-traces.ndjson \
  --output /path/to/trainable-trace-events.jsonl
```

For immediate internal dogfood capture from governed `gal-code` runs, adapt the
local governance ledger into normalized audit events:

```bash
python -m gal_model.gal_code_governance_adapter \
  --input /path/to/.gal/code/governance/session-id.jsonl \
  --output /path/to/gal-code-governance-events.jsonl
```

Those rows are weak labels by design. They are useful for review queues,
calibration, and bootstrap datasets, but they should stay `pending_review`
until a human validates whether the sidecar made the right call.

When operators review those governance decisions, layer the review records over
the same ledger and emit a reviewed-only dataset:

```bash
python -m gal_model.build_reviewed_governance_dataset \
  --input /path/to/.gal/code/governance/ \
  --reviews /path/to/governance-reviews/ \
  --output-dir /path/to/gal-code-governance-reviewed-dataset \
  --dataset-ref gal-dataset://governance-decision/v0/gal-code-reviewed
```

Both `--input` and `--reviews` may point to a single JSONL file or a directory
tree of `*.jsonl` files, so the adapter can ingest a whole `.gal/code/governance`
capture without first concatenating sessions by hand.

Use `gal_code_governance_ledger_reviewed` plus `human_reviewed` when building a
manifest-backed dataset from those events. That reviewed lane is now the
preferred next-step source for threshold tuning and promotion gates.

The reviewed bundle command writes:

- `audit-events.jsonl`
- `adapter-summary.json`
- `dataset-manifest.json`
- `build-summary.json`
- `reviewed-dataset-summary.json`

So the ledger-to-training handoff is now one command, not an operator-side
sequence of adapter and dataset-builder calls.

For external registries, keep the split strict:

- Hugging Face for promoted model artifacts, ideally private first;
- Kaggle for sanitized benchmark/model packaging only;
- Snowflake, if adopted later, for the private reviewed dataset and lineage
  plane rather than public artifact sharing.

Dry-run a private Hugging Face upload plan:

```bash
python -m gal_model.build_publish_bundle \
  --artifact-dir tmp/onnx-export-smoke \
  --output-dir tmp/publish-bundle
python -m gal_model.publish_huggingface \
  --folder tmp/publish-bundle \
  --repo-id your-org/gal-governance-decision \
  --visibility private
```

Stage a Kaggle Models bundle without publishing:

```bash
python -m gal_model.publish_kaggle_model \
  --source-dir tmp/publish-bundle \
  --staging-dir tmp/kaggle-model-bundle \
  --owner-slug your-kaggle-handle \
  --model-slug gal-governance-decision \
  --title "GAL Governance Decision" \
  --instance-slug onnx-sidecar \
  --framework onnx
```

See `docs/external-registries.md` for the full rationale and Snowflake note.

Export a trained checkpoint for CPU-sidecar integration in `gal-code`:

```bash
python -m gal_model.onnx_export \
  --model tmp/train-smoke/gal-governance-decision.pt \
  --output-dir tmp/onnx-export-smoke \
  --dataset data/fixtures/civil_scene_safety.jsonl
python -m gal_model.onnx_infer \
  --model tmp/onnx-export-smoke/gal-governance-decision.onnx \
  --artifact tmp/onnx-export-smoke/runtime-artifact.json \
  --example data/fixtures/inference_request.json
```

Plan a paid pod without creating it:

```bash
bash scripts/runpod/create_sidecar_pod.sh
```

Run the GAL-native runtime governance benchmark:

```bash
make runtime-benchmark-smoke PYTHON=.venv/bin/python
```

For a real head-to-head comparison on the same case set:

```bash
make sample-runtime-cases \
  PYTHON=.venv/bin/python \
  RUNTIME_BENCHMARK=artifacts/gal-api-session-export-gal-run-live-25/runtime-benchmark.jsonl \
  RUNTIME_BENCHMARK_SAMPLE_OUTPUT=tmp/runtime-benchmark-live-25-sample40.jsonl \
  RUNTIME_BENCHMARK_SAMPLE_CASES=40

make runtime-benchmark-live \
  PYTHON=.venv/bin/python \
  LIVE_MODEL_PATH=artifacts/gal-api-session-export-gal-run-live-25-train-mlp/gal-governance-decision.pt \
  RUNTIME_BENCHMARK=tmp/runtime-benchmark-live-25-sample40.jsonl \
  RUNTIME_BENCHMARK_OUTPUT=tmp/ours-runtime.json

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

make compare-benchmarks \
  PYTHON=.venv/bin/python \
  RUNTIME_BENCHMARK_OUTPUT=tmp/ours-runtime.json \
  OPENAI_BASELINE_OUTPUT=tmp/their-runtime.json \
  COMPARE_BENCHMARKS_OUTPUT=tmp/runtime-comparison.json
```

The OpenAI-compatible baseline runner supports both plain
`/v1/chat/completions` endpoints and raw RunPod `/runsync` endpoints. For
RunPod baselines, use `make runpod-endpoint-preflight` first to catch dead
endpoint ids and queue-only endpoints before launching a full case set.

The older Phi-4 RunPod governance lane is no longer the inline reference path.
The live endpoint was broken, and a fresh smoke endpoint on the same lane still
failed a full 300-second preflight. Keep it out of the hot path unless it is
reintroduced as an explicitly asynchronous or deep-review system.

## Boundary

Application repos own their experiment context. A downstream application repo
references this model through integration configuration, while that
application's hardware profile, experiment configuration, evidence, and
approval data stay in that repo.
