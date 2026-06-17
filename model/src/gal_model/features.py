"""Feature encoding for normalized governance examples."""

from __future__ import annotations

from typing import Any

RAW_FEATURE_NAMES = [
    "people_present",
    "vehicles_present",
    "obstacles_present",
    "evidence_complete",
    "operator_review_required",
    "latency_measured",
    "approval_refs_complete",
    "detection_count",
]

FEATURE_NAMES = [
    "people_present",
    "vehicles_present",
    "obstacles_present",
    "evidence_complete",
    "operator_review_required",
    "latency_measured",
    "approval_refs_complete",
    "detection_count_norm",
]


def bool_feature(features: dict[str, Any], key: str, *, default: bool = False) -> float:
    value = features.get(key, default)
    if not isinstance(value, bool):
        raise ValueError(f"{key} must be boolean")
    return 1.0 if value else 0.0


def encode_features(features: dict[str, Any]) -> list[float]:
    """Encode normalized governance features into the v0 tensor order."""
    detection_count = features.get("detection_count", 0)
    if not isinstance(detection_count, int | float):
        raise ValueError("detection_count must be numeric")
    detection_count_norm = max(0.0, min(float(detection_count) / 20.0, 1.0))

    return [
        bool_feature(features, "people_present"),
        bool_feature(features, "vehicles_present"),
        bool_feature(features, "obstacles_present"),
        bool_feature(features, "evidence_complete", default=True),
        bool_feature(features, "operator_review_required"),
        bool_feature(features, "latency_measured"),
        bool_feature(features, "approval_refs_complete"),
        detection_count_norm,
    ]


def encode_augmented_features(
    features: dict[str, Any],
    text_embedding: list[float] | None = None,
) -> list[float]:
    """Encode governance features concatenated with semantic text embedding."""
    base = encode_features(features)
    if text_embedding:
        base.extend(text_embedding)
    return base
