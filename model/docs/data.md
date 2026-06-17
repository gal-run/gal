# Data

Training data is JSONL. Each row is one normalized governance example.

The full dataset sourcing and RunPod training direction is documented in
[`docs/dataset-strategy.md`](dataset-strategy.md).
Dataset manifests use
[`schemas/dataset-manifest.schema.json`](../schemas/dataset-manifest.schema.json)
and can be validated with `python -m gal_model.validate_data --manifest <path>`.

Required fields:

- `example_id`
- `features`
- `label`

The feature object uses repository-neutral fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `people_present` | boolean | Normalized evidence reports people in the governed scene. |
| `vehicles_present` | boolean | Normalized evidence reports vehicles in the governed scene. |
| `obstacles_present` | boolean | Normalized evidence reports obstacles in the governed scene. |
| `evidence_complete` | boolean | Required evidence is present for advisory scoring. |
| `operator_review_required` | boolean | Upstream policy requires operator review for this example. |
| `latency_measured` | boolean | The application repo provided latency/evaluation evidence. |
| `approval_refs_complete` | boolean | Required approval-reference metadata is present. |
| `detection_count` | number | Count of normalized detections, clamped by the encoder for v0. |

The schema is intentionally strict. Application repos own raw domain evidence
and must convert it into this stable feature contract before training or
inference.

Do not store application secrets, raw private media, customer records, aircraft
serial numbers, personal identifiers, or physical-test approval documents in
this repo.

Public datasets should be imported only through controlled adapters. They are
bootstrap and evaluation inputs, not the canonical GAL production dataset.
