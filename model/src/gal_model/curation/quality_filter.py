"""Quality filtering and label auditing for governance events.

Filters:
1. Heuristic — remove empty/incomplete events
2. Signal density — remove examples with no governance signal
3. CleanLab — detect likely mislabeled examples
4. Outlier detection — remove events with extreme feature values
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np

REQUIRED_FIELDS = {"event_id", "features", "split", "application"}
MIN_SIGNAL_FEATURES = 1  # At least one non-zero boolean feature


def heuristic_filter(events: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Remove events that fail basic quality checks."""
    kept: list[dict[str, Any]] = []
    removed: dict[str, int] = Counter()

    for e in events:
        # Check required fields
        missing = REQUIRED_FIELDS - set(e.keys())
        if missing:
            removed["missing_fields"] += 1
            continue

        features = e.get("features", {})
        if not isinstance(features, dict) or not features:
            removed["empty_features"] += 1
            continue

        # Check for valid split
        split = e.get("split", "")
        if split not in ("train", "validation", "test"):
            removed["invalid_split"] += 1
            continue

        kept.append(e)

    stats = {
        "filter": "heuristic",
        "input": len(events),
        "output": len(kept),
        "removed": dict(removed),
    }
    return kept, stats


def signal_density_filter(events: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Remove events where all boolean features are false — no governance signal present.

    An event where every feature is 0/false has no governance-relevant information.
    """
    kept: list[dict[str, Any]] = []
    removed_no_signal = 0

    bool_features = [
        "people_present", "vehicles_present", "obstacles_present",
        "evidence_complete", "operator_review_required", "latency_measured",
        "approval_refs_complete",
    ]

    for e in events:
        features = e.get("features", {})
        active_count = sum(1 for k in bool_features if features.get(k))
        if active_count < MIN_SIGNAL_FEATURES:
            removed_no_signal += 1
            continue
        kept.append(e)

    stats = {
        "filter": "signal_density",
        "input": len(events),
        "output": len(kept),
        "removed": {"no_signal": removed_no_signal},
    }
    return kept, stats


def label_audit(
    events: list[dict[str, Any]],
    *,
    model=None,
    n_folds: int = 5,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Use CleanLab to find likely mislabeled examples.

    Requires out-of-sample predicted probabilities, obtained via cross-validation.
    Falls back gracefully if no model is provided (returns events unchanged).
    """
    if model is None:
        return events, {"filter": "label_audit", "note": "no model provided, skipping", "input": len(events), "output": len(events)}

    try:
        from cleanlab.filter import find_label_issues
    except ImportError:
        return events, {"filter": "label_audit", "note": "cleanlab not installed, skipping", "input": len(events), "output": len(events)}

    from .label_model import apply_labeling_functions
    from .source_registry import build_registry

    # Get weak labels from labeling functions
    registry = build_registry()
    all_lfs = []
    for src in registry.values():
        all_lfs.extend(src.labeling_functions)

    if not all_lfs:
        return events, {"filter": "label_audit", "note": "no labeling functions available, skipping", "input": len(events), "output": len(events)}

    votes, _, abstains = apply_labeling_functions(events, all_lfs)
    weak_labels = np.array([
        int(np.median(votes[i][votes[i] >= 0])) if (votes[i] >= 0).any() else 0
        for i in range(len(events))
    ])

    # Cross-validated predicted probabilities
    from sklearn.model_selection import cross_val_predict
    from sklearn.linear_model import LogisticRegression

    features = np.array([
        [
            float(e["features"].get("people_present", False)),
            float(e["features"].get("vehicles_present", False)),
            float(e["features"].get("obstacles_present", False)),
            float(e["features"].get("evidence_complete", True)),
            float(e["features"].get("operator_review_required", False)),
            float(e["features"].get("latency_measured", False)),
            float(e["features"].get("approval_refs_complete", False)),
            e["features"].get("detection_count", 0),
        ]
        for e in events
    ])

    if len(events) < n_folds * 3:
        return events, {"filter": "label_audit", "note": f"too few examples ({len(events)}) for {n_folds}-fold CV, skipping", "input": len(events), "output": len(events)}

    clf = LogisticRegression(max_iter=1000)
    pred_probs = cross_val_predict(clf, features, weak_labels, cv=n_folds, method="predict_proba")

    label_issues = find_label_issues(
        labels=weak_labels,
        pred_probs=pred_probs,
        return_indices_ranked_by="self_confidence",
    )

    # Mark suspicious examples
    flagged = set(label_issues)
    for i, e in enumerate(events):
        e["label_quality"] = {
            "suspicious": i in flagged,
            "weak_label": "hold_for_operator_review" if weak_labels[i] == 1 else "clear_for_operator_review",
        }

    stats = {
        "filter": "label_audit",
        "tool": "cleanlab",
        "input": len(events),
        "suspicious_labels": int(len(label_issues)),
        "suspicious_pct": round(len(label_issues) / len(events) * 100, 1),
    }
    return events, stats


def filter_pipeline(
    events: list[dict[str, Any]],
    *,
    model=None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Run the full quality filter pipeline. Returns (kept_events, filter_logs)."""
    filter_logs: list[dict[str, Any]] = []

    events, stats = heuristic_filter(events)
    filter_logs.append(stats)

    events, stats = signal_density_filter(events)
    filter_logs.append(stats)

    events, stats = label_audit(events, model=model)
    filter_logs.append(stats)

    return events, filter_logs
