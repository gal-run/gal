# RunPod Training

`gal-model` has a no-spend RunPod handoff path. This repo does not create pods
or serverless endpoints by itself. A paid RunPod launch should happen only from
an approved runtime or operator workflow.

## Inputs

Use the normalized audit-event path:

```bash
python -m gal_model.audit_dataset_builder \
  --events redacted-audit-events.jsonl \
  --output-dir artifacts/governance-v0.1 \
  --dataset-ref gal-dataset://governance-decision/v0/governance-v0.1 \
  --source-lane canonical_gal_structured_dataset \
  --reviewer-status human_reviewed
```

If the source is GAL per-session governance audit logs, first convert the API
response or JSONL export:

```bash
python -m gal_model.session_audit_adapter \
  --input session-audit-log.json \
  --output redacted-audit-events.jsonl \
  --split train
```

The GAL API session audit route is:

```text
GET /api/orgs/:orgName/sessions/:sessionId/audit-log
```

The adapter does not copy raw tool inputs or outputs into the model dataset. It
uses policy action, duration, error status, and audit IDs to create normalized
features and evidence references.

If you already have GAL API access, export and build the dataset in one step:

```bash
GAL_AUTH_TOKEN=... \
python -m gal_model.gal_api_session_export \
  --base-url https://api.gal.run \
  --org gal-run \
  --source auto \
  --discover-limit 5 \
  --output-dir artifacts/governance-v0.1 \
  --dataset-ref gal-dataset://governance-decision/v0/governance-v0.1
```

The exporter assigns each session deterministically to `train`, `validation`,
or `test`, then prefers `GET /api/orgs/:orgName/sessions/:sessionId/audit-log`.
When that feature is unavailable in production, `--source auto` falls back to
`GET /api/sessions/:sessionId/archive` and emits weak labels from redacted tool
event pairs. It then writes the dataset manifest, runtime benchmark cases, and
`gal-api-export-summary.json`.

## Bundle

Build a portable bundle:

```bash
bash scripts/runpod/build_training_bundle.sh
```

Plan the paid pod creation without spending:

```bash
bash scripts/runpod/create_sidecar_pod.sh
```

Create the pod only with the explicit spend gate:

```bash
CONFIRM_RUNPOD_SPEND=YES bash scripts/runpod/create_sidecar_pod.sh --create
```

Build a self-contained job bundle with both code and a prepared dataset:

```bash
DATASET_DIR=artifacts/governance-v0.1 \
OUT=dist/gal-model-runpod-job-bundle.tar.gz \
bash scripts/runpod/build_training_job_bundle.sh
```

The job bundle contains:

- repo code and schemas;
- dataset splits plus `dataset-manifest.json`;
- any export provenance files in the dataset directory;
- `runpod-job-manifest.json`;
- `RUNPOD_COMMAND.sh`.

On RunPod or another approved GPU/CPU worker, unpack the bundle next to the
dataset output and run:

```bash
DATASET_MANIFEST=dataset-manifest.json \
TRAIN_DATASET=train.jsonl \
EVAL_DATASET=validation.jsonl \
TEST_DATASET=test.jsonl \
RUNTIME_BENCHMARK=runtime-benchmark.jsonl \
OUTPUT_ROOT=artifacts/gal-sidecar-runpod \
bash scripts/runpod/train_gal_sidecar.sh
```

If you built the self-contained job bundle, unpack it and run:

```bash
tar -xzf gal-model-runpod-job-bundle.tar.gz
bash RUNPOD_COMMAND.sh
```

On a new paid pod, run the CUDA-only gate first:

```bash
STOP_AFTER_CUDA_PREFLIGHT=1 bash RUNPOD_COMMAND.sh
```

That must pass before dependency installation, dataset work, or training. It
verifies actual CUDA tensor allocation and synchronization rather than trusting
`nvidia-smi` alone.

The training script validates the manifest, trains `mlp` and `resnet_mlp`,
runs evaluation, runs the GAL-native runtime benchmark, and writes
`artifact-manifest.json`.

For a no-spend local proof, use:

```bash
make runpod-local-e2e-smoke PYTHON=.venv/bin/python
```

## Promotion

Do not promote a checkpoint from RunPod unless:

- the dataset manifest validates;
- false clear rate is at or below the current production model;
- operator-review recall passes the promotion threshold;
- p95 runtime benchmark latency is within the inline budget;
- advisory-only flags are preserved;
- the model card records dataset, checkpoint, eval, and benchmark artifact refs.
