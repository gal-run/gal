"""Source registry: registers every governance data source with metadata and labeling functions.

Each source defines:
- provenance metadata (origin, collection method, license)
- labeling functions (heuristics that vote on clear/hold per example)
- feature mapping (how raw fields map to the 8 governance features)

The registry is the single source of truth for what's in the corpus.
"""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

LabelingFunction = Callable[[dict[str, Any]], dict[str, Any] | None]
"""A labeling function inspects a raw example and returns a vote dict or None (abstain).

Returns: {"decision": "clear_for_operator_review", "confidence": 0.85, "lf_name": "gh_merged_approved"}
Returns None if the LF abstains (can't determine a vote for this example).
"""


@dataclass
class SourceConfig:
    """Configuration for one governance data source."""

    source_id: str
    display_name: str
    description: str
    source_type: str  # "api", "local_export", "public_dataset", "archive"
    license_info: str
    collection_method: str
    labeling_functions: list[LabelingFunction] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


# ── Labeling functions ────────────────────────────────────────────────────


def _lf_github_merged_approved(example: dict[str, Any]) -> dict[str, Any] | None:
    outcome = example.get("outcome", {})
    if outcome.get("decision") == "clear_for_operator_review":
        return {"decision": "clear_for_operator_review", "confidence": 0.85, "lf_name": "github_merged_approved"}
    return None


def _lf_github_changes_requested(example: dict[str, Any]) -> dict[str, Any] | None:
    outcome = example.get("outcome", {})
    if outcome.get("escalate_for_deeper_review"):
        return {"decision": "hold_for_operator_review", "confidence": 0.80, "lf_name": "github_changes_requested"}
    return None


def _lf_session_auto_clear(example: dict[str, Any]) -> dict[str, Any] | None:
    features = example.get("features", {})
    if not features.get("operator_review_required"):
        return {"decision": "clear_for_operator_review", "confidence": 0.90, "lf_name": "session_auto_clear"}
    return None


def _lf_session_flag(example: dict[str, Any]) -> dict[str, Any] | None:
    features = example.get("features", {})
    if features.get("operator_review_required") or features.get("obstacles_present"):
        return {"decision": "hold_for_operator_review", "confidence": 0.85, "lf_name": "session_flag"}
    return None


def _lf_evidence_incomplete(example: dict[str, Any]) -> dict[str, Any] | None:
    features = example.get("features", {})
    if not features.get("evidence_complete") and not features.get("approval_refs_complete"):
        return {"decision": "hold_for_operator_review", "confidence": 0.75, "lf_name": "evidence_incomplete"}
    return None


def _lf_all_clear(example: dict[str, Any]) -> dict[str, Any] | None:
    features = example.get("features", {})
    if (
        features.get("evidence_complete")
        and features.get("approval_refs_complete")
        and not features.get("operator_review_required")
        and not features.get("obstacles_present")
    ):
        return {"decision": "clear_for_operator_review", "confidence": 0.70, "lf_name": "all_clear"}
    return None


def _lf_detection_threshold(example: dict[str, Any]) -> dict[str, Any] | None:
    features = example.get("features", {})
    count = features.get("detection_count", 0)
    if count > 10:
        return {"decision": "hold_for_operator_review", "confidence": 0.60, "lf_name": "detection_threshold"}
    return None


def _lf_bots_only(example: dict[str, Any]) -> dict[str, Any] | None:
    features = example.get("features", {})
    if features.get("vehicles_present") and not features.get("people_present"):
        return {"decision": "hold_for_operator_review", "confidence": 0.55, "lf_name": "bots_only"}
    return None


def _lf_toxicity_high_score(example: dict[str, Any]) -> dict[str, Any] | None:
    features = example.get("features", {})
    if features.get("detection_count", 0) >= 4:
        return {"decision": "hold_for_operator_review", "confidence": 0.85, "lf_name": "toxicity_high_score"}
    return None


def _lf_toxicity_clean(example: dict[str, Any]) -> dict[str, Any] | None:
    features = example.get("features", {})
    if features.get("detection_count", 0) == 0 and not features.get("obstacles_present"):
        return {"decision": "clear_for_operator_review", "confidence": 0.75, "lf_name": "toxicity_clean"}
    return None


def _lf_moderation_closed(example: dict[str, Any]) -> dict[str, Any] | None:
    outcome = example.get("outcome", {})
    if outcome.get("escalate_for_deeper_review"):
        return {"decision": "hold_for_operator_review", "confidence": 0.80, "lf_name": "moderation_closed"}
    return None


def _lf_community_approved(example: dict[str, Any]) -> dict[str, Any] | None:
    features = example.get("features", {})
    outcome = example.get("outcome", {})
    if features.get("people_present") and not outcome.get("escalate_for_deeper_review"):
        return {"decision": "clear_for_operator_review", "confidence": 0.65, "lf_name": "community_approved"}
    return None


# ── Registry ──────────────────────────────────────────────────────────────


def build_registry() -> dict[str, SourceConfig]:
    """Build the full source registry with all governance data sources."""
    registry: dict[str, SourceConfig] = {}

    registry["github_pr_reviews"] = SourceConfig(
        source_id="github_pr_reviews",
        display_name="GitHub Pull Request Reviews",
        description="Closed PRs from high-signal open-source repos with disciplined review cultures",
        source_type="api",
        license_info="Repository-specific open-source licenses",
        collection_method="GitHub REST API via github_pr_review_adapter.py",
        labeling_functions=[
            _lf_github_merged_approved,
            _lf_github_changes_requested,
            _lf_evidence_incomplete,
            _lf_all_clear,
            _lf_detection_threshold,
            _lf_bots_only,
        ],
        metadata={
            "repos": [
                "rust-lang/rust",
                "python/cpython",
                "golang/go",
                "kubernetes/kubernetes",
                "nodejs/node",
                "tensorflow/tensorflow",
                "django/django",
            ],
            "label_type": "weak (merge/close proxy)",
            "adapter_module": "gal_model.github_pr_review_adapter",
        },
    )

    registry["gal_session_exports"] = SourceConfig(
        source_id="gal_session_exports",
        display_name="GAL Production Session Exports",
        description="Governance decisions from production GAL API sessions",
        source_type="local_export",
        license_info="Proprietary (GAL production data)",
        collection_method="gal_api_session_export.py → artifacts/",
        labeling_functions=[
            _lf_session_auto_clear,
            _lf_session_flag,
            _lf_evidence_incomplete,
            _lf_all_clear,
            _lf_detection_threshold,
            _lf_bots_only,
        ],
        metadata={
            "export_sources": ["gal-run-live", "gal-run-live-25", "gal-run-live-100"],
            "label_type": "weak (automated decision)",
            "adapter_module": "gal_model.gal_api_session_export",
        },
    )

    registry["kaggle_toxicity"] = SourceConfig(
        source_id="kaggle_toxicity",
        display_name="Kaggle Jigsaw Toxicity Classification",
        description="Wikipedia talk page comments with toxicity labels, adapted for governance signal",
        source_type="public_dataset",
        license_info="CC0 / Kaggle competition terms",
        collection_method="kagglehub download → kaggle_toxicity_adapter.py",
        labeling_functions=[
            _lf_toxicity_high_score,
            _lf_toxicity_clean,
            _lf_evidence_incomplete,
            _lf_detection_threshold,
        ],
        metadata={
            "dataset": "jigsaw-toxic-comment-classification-challenge",
            "available_rows": 1_800_000,
            "governance_relevant_rows_estimate": 0,
            "training_status": "DEPRECATED — toxicity is not governance. See docs/legal-review.md",
            "label_type": "DEPRECATED",
        },
    )

    registry["huggingface_code_review"] = SourceConfig(
        source_id="huggingface_code_review",
        display_name="HuggingFace Public Datasets (Civil Comments + Code)",
        description="google/civil_comments and related datasets with toxicity/quality labels",
        source_type="public_dataset",
        license_info="Apache 2.0 / dataset-specific",
        collection_method="datasets library → huggingface_dataset_adapter.py",
        labeling_functions=[
            _lf_toxicity_high_score,
            _lf_toxicity_clean,
            _lf_evidence_incomplete,
            _lf_detection_threshold,
        ],
        metadata={
            "datasets": ["google/civil_comments"],
            "available_rows": 2_000_000,
            "governance_relevant_rows_estimate": 0,
            "training_status": "DEPRECATED — content safety is not governance. See docs/legal-review.md",
            "label_type": "DEPRECATED",
        },
    )

    registry["stackoverflow_moderation"] = SourceConfig(
        source_id="stackoverflow_moderation",
        display_name="Stack Overflow Moderation Decisions",
        description="Flag outcomes, close votes, and review queue actions from Stack Exchange data dumps",
        source_type="archive",
        license_info="CC BY-SA 4.0 (Stack Exchange data dumps)",
        collection_method="Archive.org download → stackoverflow_moderation_adapter.py",
        labeling_functions=[
            _lf_moderation_closed,
            _lf_community_approved,
            _lf_evidence_incomplete,
            _lf_detection_threshold,
        ],
        metadata={
            "source": "Stack Exchange Data Dump (Archive.org)",
            "available_rows": "all moderation actions on Stack Overflow",
            "governance_relevant_rows_estimate": 50_000,
            "label_type": "weak (moderation outcome → governance mapping)",
        },
    )

    return registry


def registry_summary(registry: dict[str, SourceConfig]) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "sources": len(registry),
        "total_lfs": sum(len(s.labeling_functions) for s in registry.values()),
        "by_source_type": defaultdict(int),
        "by_label_type": defaultdict(int),
        "potential_rows_estimate": 0,
    }
    for src in registry.values():
        summary["by_source_type"][src.source_type] += 1
        summary["by_label_type"][src.metadata.get("label_type", "unknown")] += 1
        summary["potential_rows_estimate"] += src.metadata.get(
            "governance_relevant_rows_estimate", 0
        )
    summary["by_source_type"] = dict(summary["by_source_type"])
    summary["by_label_type"] = dict(summary["by_label_type"])
    return summary


def console_main() -> None:
    import sys

    registry = build_registry()
    output = {
        "registry_version": "v0.2-dev",
        "summary": registry_summary(registry),
        "sources": {
            sid: {
                "display_name": s.display_name,
                "source_type": s.source_type,
                "labeling_functions": [lf.__name__ for lf in s.labeling_functions],
                "metadata": s.metadata,
            }
            for sid, s in registry.items()
        },
    }
    print(json.dumps(output, indent=2, sort_keys=True))


if __name__ == "__main__":
    console_main()
