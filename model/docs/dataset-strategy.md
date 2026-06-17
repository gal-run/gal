# Dataset Strategy

GAL should not start from a generic public safety dataset as its canonical
training set. Public datasets are useful bootstrap and evaluation inputs, but
the production model needs normalized GAL governance examples with the same
request, feature, label, latency, and audit shape used by real integrations.

## Decision

Train the fast sidecar model from scratch on GAL-normalized structured
governance events.

Do not train a large general language model from scratch for v0. Use public
datasets to improve coverage, calibrate risk categories, and evaluate the
optional deep-review lane. The inline model should learn the narrow GAL decision
surface:

```text
normalized application evidence -> advisory governance decision
```

## Dataset Lanes

### Lane 1: Canonical GAL Structured Dataset

This is the dataset that should train the fast MLP or ResNet-like MLP sidecar.
It uses the schema in [`schemas/training-example.schema.json`](../schemas/training-example.schema.json)
and keeps application-specific raw evidence outside this repo.

Every trainable dataset should be accompanied by a manifest matching
[`schemas/dataset-manifest.schema.json`](../schemas/dataset-manifest.schema.json).
The manifest records the dataset URI, schema/model refs, encoded feature order,
source lanes, reviewer status, split checksums, row counts, and label counts.
The checked-in builder consumes normalized audit events matching
[`schemas/audit-event.schema.json`](../schemas/audit-event.schema.json).

Each row should include:

- Stable `example_id`.
- Strict `features` object matching the encoder contract.
- Advisory `label`.
- Optional provenance metadata kept outside the feature tensor, such as
  source application, dataset version, reviewer decision, evidence reference,
  and policy version.

Initial target size:

- 500 to 2,000 hand-reviewed rows for a meaningful first baseline.
- 5,000 to 20,000 rows for a useful internal v1.
- Larger only after the labels are stable and evaluation catches regressions.

The label balance should include clear cases, hold cases, incomplete-evidence
cases, and ambiguous cases that require operator review. Quality matters more
than volume for this model because the input is fixed-shape and narrow.

### Lane 2: Public Content-Safety Datasets

These datasets are useful for taxonomy mapping, negative examples, refusal
behavior evaluation, and optional deep-review fine-tuning. They are not a direct
replacement for GAL's structured event dataset.

Candidates to map through a controlled adapter:

- Anthropic `hh-rlhf`: helpful/harmless preference and red-team subsets.
- PKU `BeaverTails` and `PKU-SafeRLHF`: human-labeled safety alignment data.
- NVIDIA `Aegis-AI-Content-Safety-Dataset-2.0`: content-safety labels and
  taxonomy coverage.
- AllenAI `WildGuardMix`: prompt and prompt-response safety data, gated by
  responsible-use conditions.

Use these for the Phi-4 or similar deep-review lane before using them for the
fast sidecar. If imported for the sidecar, only import derived neutral features
and high-level labels, never raw harmful instructions as first-class fixtures in
this repo.

### Lane 3: Public Agent-Safety Benchmarks

These are closer to real application governance because they include agent
actions, tool use, execution safety, or multi-step context. They should start as
evaluation and adapter-design references, not bulk training sources.

Candidates:

- ILION-Bench v2: execution safety gate scenarios with proposed actions and
  allow/block labels.
- SafeArena: web-agent misuse benchmark with paired safe and harmful tasks.
- AgentHarm: agent harmfulness benchmark released by the UK AI Safety Institute.
- R-Judge: multi-turn agent interaction records with safety labels and risk
  descriptions.

These datasets can help define richer future features such as proposed action
type, tool sensitivity, approval boundary, data exfiltration risk, irreversible
operation, and external communication. Those features should be added through a
schema version bump, not hidden in text prompts.

## Public Dataset Fit

No public dataset reviewed so far is a clean direct fit for GAL v0.

| Dataset family | Useful for | Not sufficient because |
| --- | --- | --- |
| Content safety / RLHF | Deep-review behavior and risk taxonomy | Labels text responses, not application evidence contracts |
| Agent safety benchmarks | Action-risk evaluation and schema design | Usually benchmark-sized and not shaped like GAL production events |
| Web or computer-use benchmarks | Integration test design | Often measure task success rather than governance authorization |
| Internal GAL audit events | Canonical sidecar training | Requires review workflow, label QA, and dataset versioning |

## RunPod Training Shape

RunPod is useful for training and benchmarking once the dataset is versioned.
The job should be stateless and artifact-oriented:

```text
versioned dataset URI
  -> RunPod training image
  -> checkpoint
  -> training summary
  -> eval report
  -> latency benchmark
  -> model card update
```

Recommended job contract:

- Input dataset URI: object storage path or mounted volume.
- Input dataset manifest: schema version, row count, label distribution,
  source lanes, reviewer status, and checksum. Validate this with
  `python -m gal_model.validate_data --manifest <manifest>`.
- Output directory: checkpoint, `training-summary.json`, evaluation report,
  benchmark report, and artifact manifest.
- Promotion gate: accuracy, per-label recall, calibration, advisory safety
  flags, and latency threshold must pass before a model URI is promoted.

The RunPod job should not embed private datasets in the image. It should fetch a
versioned dataset, train, write artifacts, and exit.

## First Practical Training Plan

1. Export normalized, redacted audit events from application repos or the GAL
   runtime, then run `python -m gal_model.audit_dataset_builder`.
2. Produce `governance-v0.1-train.jsonl`, `governance-v0.1-val.jsonl`, and
   `governance-v0.1-test.jsonl` with checksums and label distribution.
3. Train the current MLP from scratch on RunPod and locally on the same dataset.
4. Train the ResNet-like MLP candidate on the same split.
5. Compare accuracy, per-label recall, confidence calibration, and p95 latency.
6. Keep the smaller/faster model unless the larger candidate wins on hard
   review cases without violating latency.
7. Evaluate the Phi-4 LoRA deep-review lane separately; do not let it block the
   fast sidecar baseline.

## Audit Dataset Builder

The builder intentionally accepts only normalized audit events. Raw prompts,
messages, media, customer data, secrets, and private evidence must stay in the
owning application or audit store.

GAL per-session governance audit logs can be adapted first with
`python -m gal_model.session_audit_adapter`. The adapter reads the response
shape from `GET /api/orgs/:orgName/sessions/:sessionId/audit-log` or equivalent
JSONL exports and emits normalized audit events without copying tool inputs or
outputs into the model dataset.

For opt-in richer runtime traces, prefer the older closed-loop
`TrainableTraceV1` export from `gal-api/scripts/model-training/export-traces.ts`
and adapt it with `python -m gal_model.trainable_trace_adapter`. That keeps the
stronger redaction/export boundary from the previous governance lane while
feeding the new fixed-shape sidecar dataset.

For immediate internal dogfood, governed `gal-code` runs now emit per-session
ledger files under `.gal/code/governance/`. Adapt those rows with
`python -m gal_model.gal_code_governance_adapter`. This lane emits
`gal_code_governance_ledger_weak_labels`: useful for review queues,
miscalibration analysis, and bootstrap retraining, but still `pending_review`
until humans confirm whether the sidecar made the right call.

For direct GAL API exports, use
`python -m gal_model.gal_api_session_export` with a session ID list or archive
discovery plus a `GAL_AUTH_TOKEN`. In production today, the exporter should run
in `--source auto` mode: it first tries the per-session audit-log route, then
falls back to `GET /api/sessions/:sessionId/archive` when the
`tool-governance` feature is disabled. The archive fallback emits
`gal_session_archive_weak_labels`, not canonical reviewed labels, and should
stay `pending_review` until humans verify the weak-label heuristics.

```bash
python -m gal_model.audit_dataset_builder \
  --events /path/to/redacted-audit-events.jsonl \
  --output-dir artifacts/governance-v0.1 \
  --dataset-ref gal-dataset://governance-decision/v0/governance-v0.1 \
  --source-lane canonical_gal_structured_dataset \
  --reviewer-status human_reviewed
```

The output directory contains:

- `train.jsonl`, `validation.jsonl`, and `test.jsonl` when those splits exist;
- `runtime-benchmark.jsonl` built from validation and test events;
- `dataset-manifest.json` for `gal_model.validate_data`;
- `build-summary.json` for training job logs.

## Source Links

- Anthropic HH-RLHF: <https://huggingface.co/datasets/Anthropic/hh-rlhf>
- BeaverTails: <https://github.com/PKU-Alignment/beavertails>
- NVIDIA Aegis 2.0: <https://huggingface.co/datasets/nvidia/Aegis-AI-Content-Safety-Dataset-2.0>
- WildGuardMix: <https://huggingface.co/datasets/allenai/wildguardmix>
- ILION-Bench v2: <https://zenodo.org/records/18929841>
- SafeArena: <https://safearena.github.io/>
- AgentHarm: <https://huggingface.co/datasets/ai-safety-institute/AgentHarm>
- R-Judge: <https://rjudgebench.github.io/>
