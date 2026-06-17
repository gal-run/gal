"""Dataset loader for text-augmented governance examples.

Loads enriched audit events that carry text embeddings alongside
structured features, producing a combined feature tensor.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import torch
from torch.utils.data import TensorDataset

from .constants import LABEL_TO_INDEX
from .dataset import validate_example_contract
from .features import encode_features


def load_enriched_examples(path: Path) -> list[dict[str, Any]]:
    examples: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_number}: JSON parse error: {exc.msg}") from exc
            if not isinstance(item, dict):
                raise ValueError(f"{path}:{line_number}: expected object")
            item.setdefault("example_id", item.get("event_id", f"{path}:{line_number}"))
            if "label" not in item and "outcome" in item:
                item["label"] = item["outcome"]["decision"]
            validate_example_contract(item, context=f"{path}:{line_number}")
            examples.append(item)
    if not examples:
        raise ValueError(f"{path}: no examples found")
    return examples


def tensor_dataset_from_enriched_examples(
    examples: list[dict[str, Any]],
    *,
    embedding_dim: int | None = None,
) -> TensorDataset:
    struct_features = [encode_features(ex["features"]) for ex in examples]
    struct_tensor = torch.tensor(struct_features, dtype=torch.float32)

    text_field = None
    for field in ("title_embedding", "body_embedding"):
        if field in examples[0]:
            text_field = field
            break

    if text_field is None:
        raise ValueError("No text embedding field found in enriched examples")

    if embedding_dim is None:
        embedding_dim = examples[0].get(f"{text_field.replace('_embedding', '_embedding_dim')}", len(examples[0][text_field]))

    text_features = torch.tensor(
        [ex[text_field][:embedding_dim] for ex in examples],
        dtype=torch.float32,
    )

    combined = torch.cat([struct_tensor, text_features], dim=1)
    labels = torch.tensor(
        [LABEL_TO_INDEX[ex["label"]] for ex in examples], dtype=torch.long
    )
    return TensorDataset(combined, labels)
