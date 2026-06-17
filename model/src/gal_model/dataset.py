"""Dataset loading for GAL model training."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import torch
from torch.utils.data import TensorDataset

from .constants import LABEL_TO_INDEX
from .features import RAW_FEATURE_NAMES, encode_features


def validate_feature_payload(features: dict[str, Any], *, context: str) -> None:
    expected_features = set(RAW_FEATURE_NAMES)
    actual_features = set(features)
    missing = sorted(expected_features - actual_features)
    extra = sorted(actual_features - expected_features)
    if missing:
        raise ValueError(f"{context}: missing features {missing!r}")
    if extra:
        raise ValueError(f"{context}: unsupported features {extra!r}")
    encode_features(features)


def validate_example_contract(item: dict[str, Any], *, context: str) -> None:
    """Validate one normalized governance training example."""
    if not isinstance(item.get("example_id"), str):
        raise ValueError(f"{context}: example_id is required")
    features = item.get("features")
    if not isinstance(features, dict):
        raise ValueError(f"{context}: features object is required")
    validate_feature_payload(features, context=context)
    label = item.get("label")
    if label not in LABEL_TO_INDEX:
        raise ValueError(f"{context}: unsupported label {label!r}")


def load_examples(path: Path) -> list[dict[str, Any]]:
    examples: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{line_number}: JSON parse error: {exc.msg}") from exc
        if not isinstance(item, dict):
            raise ValueError(f"{path}:{line_number}: expected object")
        validate_example_contract(item, context=f"{path}:{line_number}")
        examples.append(item)
    if not examples:
        raise ValueError(f"{path}: no examples found")
    return examples


def tensor_dataset_from_examples(examples: list[dict[str, Any]]) -> TensorDataset:
    encoded = [encode_features(item["features"]) for item in examples]
    labels = [LABEL_TO_INDEX[item["label"]] for item in examples]
    return TensorDataset(
        torch.tensor(encoded, dtype=torch.float32),
        torch.tensor(labels, dtype=torch.long),
    )
