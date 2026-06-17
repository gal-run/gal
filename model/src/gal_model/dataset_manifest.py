"""Dataset manifest validation for GAL model training inputs."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from .constants import LABELS, MODEL_REF
from .dataset import load_examples
from .features import FEATURE_NAMES

MANIFEST_VERSION = "gal-dataset-manifest/v0"
TRAINING_SCHEMA_REF = "https://gal.run/schemas/model/training-example.schema.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def count_labels(examples: list[dict[str, Any]]) -> dict[str, int]:
    counts = {label: 0 for label in LABELS}
    for example in examples:
        counts[str(example["label"])] += 1
    return counts


def load_manifest(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path}: manifest must be a JSON object")
    return payload


def _split_path(manifest_path: Path, split: dict[str, Any]) -> Path:
    raw_path = split.get("path")
    if not isinstance(raw_path, str) or not raw_path:
        raise ValueError("split path is required")
    path = Path(raw_path)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError(f"split path {raw_path!r} must be relative to the manifest directory")
    return manifest_path.parent / path


def validate_manifest(path: Path) -> dict[str, Any]:
    manifest = load_manifest(path)
    errors: list[str] = []

    if manifest.get("manifest_version") != MANIFEST_VERSION:
        errors.append(f"manifest_version must be {MANIFEST_VERSION!r}")
    if manifest.get("schema_ref") != TRAINING_SCHEMA_REF:
        errors.append(f"schema_ref must be {TRAINING_SCHEMA_REF!r}")
    if manifest.get("model_ref") != MODEL_REF:
        errors.append(f"model_ref must be {MODEL_REF!r}")
    if manifest.get("feature_names") != FEATURE_NAMES:
        errors.append("feature_names must match the encoded feature contract")
    if manifest.get("advisory_only") is not True:
        errors.append("advisory_only must be true")
    if manifest.get("physical_action_allowed") is not False:
        errors.append("physical_action_allowed must be false")
    if manifest.get("hardware_commands_allowed") is not False:
        errors.append("hardware_commands_allowed must be false")

    splits = manifest.get("splits")
    split_results: dict[str, Any] = {}
    if not isinstance(splits, dict) or not splits:
        errors.append("splits must be a non-empty object")
    else:
        for split_name, split in sorted(splits.items()):
            if not isinstance(split_name, str) or not split_name:
                errors.append("split names must be non-empty strings")
                continue
            if not isinstance(split, dict):
                errors.append(f"{split_name}: split must be an object")
                continue
            try:
                data_path = _split_path(path, split)
                examples = load_examples(data_path)
                actual_rows = len(examples)
                actual_sha256 = sha256_file(data_path)
                actual_counts = count_labels(examples)
            except (OSError, ValueError, json.JSONDecodeError) as exc:
                errors.append(f"{split_name}: {exc}")
                continue

            expected_rows = split.get("rows")
            expected_sha256 = split.get("sha256")
            expected_counts = split.get("label_counts")
            if expected_rows != actual_rows:
                errors.append(f"{split_name}: rows {expected_rows!r} does not match {actual_rows}")
            if expected_sha256 != actual_sha256:
                errors.append(f"{split_name}: sha256 does not match dataset file")
            if expected_counts != actual_counts:
                errors.append(f"{split_name}: label_counts {expected_counts!r} does not match {actual_counts!r}")

            split_results[split_name] = {
                "path": data_path.as_posix(),
                "rows": actual_rows,
                "sha256": actual_sha256,
                "label_counts": actual_counts,
            }

    return {
        "manifest": path.as_posix(),
        "manifest_version": manifest.get("manifest_version"),
        "dataset_ref": manifest.get("dataset_ref"),
        "model_ref": manifest.get("model_ref"),
        "splits": split_results,
        "errors": errors,
        "passed": not errors,
    }
