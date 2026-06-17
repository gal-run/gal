# External Registries

Use external registries selectively.

## Hugging Face

Use Hugging Face as the preferred external registry for promoted GAL model
artifacts:

- PyTorch checkpoint;
- ONNX artifact;
- runtime metadata;
- model card;
- benchmark summaries that do not expose internal data.

Recommended default: private model repository.

Do not treat Hugging Face as the canonical store for reviewed internal
governance datasets.

## Kaggle

Use Kaggle only for sanitized external-facing material:

- a private or public model page for the artifact bundle;
- a benchmark notebook;
- a public comparison kernel;
- non-sensitive benchmark outputs.

Do not use Kaggle as the primary GAL training-data registry.

The repo now supports staging a Kaggle Models bundle with generated
`model-metadata.json` and `model-instance-metadata.json`, but that path should
only contain sanitized artifacts.

## Snowflake

Snowflake is the better fit for the private data plane if GAL needs a managed
system of record for reviewed datasets, lineage, and governed model promotion.

That matches Snowflake's current ML surface:

- Datasets for immutable dataset versions;
- Model Registry for model versions and metadata;
- lineage across datasets and models inside the same governance plane.

That makes Snowflake a stronger candidate than Kaggle for:

- reviewed governance telemetry;
- reproducible train/validation/test bundles;
- role-based access to model and dataset history;
- production governance over model promotion records.

This repo does not add a Snowflake integration yet. That would be a
deployment-specific data-platform choice and should be wired only when there is
an actual Snowflake account, schema, and RBAC plan for GAL.

## Commands

Dry-run Hugging Face publish planning:

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
