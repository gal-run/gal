"""Build GAL model datasets from normalized audit events."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from .api_contract import INFERENCE_REQUEST_SCHEMA_REF
from .constants import LABEL_TO_INDEX, MODEL_REF
from .dataset import validate_example_contract, validate_feature_payload
from .dataset_manifest import MANIFEST_VERSION, TRAINING_SCHEMA_REF, count_labels, sha256_file
from .features import FEATURE_NAMES

AUDIT_EVENT_SCHEMA_REF = "https://gal.run/schemas/model/audit-event.schema.json"
DEFAULT_BENCHMARK_SPLITS = ("validation", "test")
VALID_SPLITS = ("train", "validation", "test")
VALID_SOURCE_LANES = (
    "canonical_gal_structured_dataset",
    "gal_code_governance_ledger_weak_labels",
    "gal_code_governance_ledger_reviewed",
    "gal_session_archive_weak_labels",
    "github_pr_review_weak_labels",
    "huggingface_public_dataset",
    "kaggle_toxicity_weak_labels",
    "public_content_safety_adapter",
    "stackoverflow_moderation_weak_labels",
    "public_agent_safety_adapter",
    "synthetic_fixture",
)
VALID_REVIEWER_STATUSES = ("fixture_smoke", "human_reviewed", "pending_review")
AUDIT_EVENT_KEYS = {"event_id", "application", "evidence_ref", "split", "features", "outcome", "title", "title_embedding", "title_embedding_dim", "title_embedding_model"}
OUTCOME_KEYS = {"decision", "escalate_for_deeper_review"}

DISALLOWED_KEYS = {
    "api_key",
    "auth_token",
    "content",
    "customer",
    "image",
    "media",
    "message",
    "messages",
    "password",
    "payload",
    "private_key",
    "prompt",
    "raw",
    "raw_evidence",
    "response",
    "secret",
    "token",
    "video",
}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--events", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--dataset-ref", required=True)
    parser.add_argument("--source-lane", choices=VALID_SOURCE_LANES, default="canonical_gal_structured_dataset")
    parser.add_argument("--reviewer-status", choices=VALID_REVIEWER_STATUSES, default="human_reviewed")
    parser.add_argument("--benchmark-splits", nargs="+", choices=VALID_SPLITS, default=list(DEFAULT_BENCHMARK_SPLITS))
    return parser.parse_args(argv)


def reject_disallowed_keys(value: Any, *, context: str) -> None:
    if isinstance(value, dict):
        for key, inner in value.items():
            normalized_key = str(key).lower()
            if normalized_key in DISALLOWED_KEYS:
                raise ValueError(f"{context}: disallowed raw or sensitive field {key!r}")
            reject_disallowed_keys(inner, context=f"{context}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            reject_disallowed_keys(item, context=f"{context}[{index}]")


def load_audit_events(path: Path) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{line_number}: JSON parse error: {exc.msg}") from exc
        if not isinstance(event, dict):
            raise ValueError(f"{path}:{line_number}: expected object")
        validate_audit_event(event, context=f"{path}:{line_number}")
        events.append(event)
    if not events:
        raise ValueError(f"{path}: no audit events found")
    return events


def _require_string(event: dict[str, Any], key: str, *, context: str) -> str:
    value = event.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"{context}: {key} is required")
    return value


def validate_audit_event(event: dict[str, Any], *, context: str) -> None:
    reject_disallowed_keys(event, context=context)
    extra_event_keys = sorted(set(event) - AUDIT_EVENT_KEYS)
    if extra_event_keys:
        raise ValueError(f"{context}: unsupported audit event fields {extra_event_keys!r}")
    _require_string(event, "event_id", context=context)
    _require_string(event, "application", context=context)
    _require_string(event, "evidence_ref", context=context)
    split = _require_string(event, "split", context=context)
    if split not in VALID_SPLITS:
        raise ValueError(f"{context}: split must be one of {VALID_SPLITS!r}")

    features = event.get("features")
    if not isinstance(features, dict):
        raise ValueError(f"{context}: features object is required")
    validate_feature_payload(features, context=context)

    outcome = event.get("outcome")
    if not isinstance(outcome, dict):
        raise ValueError(f"{context}: outcome object is required")
    extra_outcome_keys = sorted(set(outcome) - OUTCOME_KEYS)
    if extra_outcome_keys:
        raise ValueError(f"{context}: unsupported outcome fields {extra_outcome_keys!r}")
    decision = outcome.get("decision")
    if decision not in LABEL_TO_INDEX:
        raise ValueError(f"{context}: unsupported outcome.decision {decision!r}")
    escalation = outcome.get("escalate_for_deeper_review", decision == "hold_for_operator_review")
    if not isinstance(escalation, bool):
        raise ValueError(f"{context}: outcome.escalate_for_deeper_review must be boolean")


def training_example_from_event(event: dict[str, Any]) -> dict[str, Any]:
    example = {
        "example_id": event["event_id"],
        "features": event["features"],
        "label": event["outcome"]["decision"],
    }
    validate_example_contract(example, context=str(event["event_id"]))
    return example


def runtime_case_from_event(event: dict[str, Any]) -> dict[str, Any]:
    decision = event["outcome"]["decision"]
    escalation = event["outcome"].get("escalate_for_deeper_review", decision == "hold_for_operator_review")
    return {
        "case_id": event["event_id"],
        "request": {
            "schema_ref": INFERENCE_REQUEST_SCHEMA_REF,
            "request_id": event["event_id"],
            "application": event["application"],
            "evidence_ref": event["evidence_ref"],
            "model_ref": MODEL_REF,
            "features": event["features"],
        },
        "expected": {
            "schema_valid": True,
            "decision": decision,
            "escalate_for_deeper_review": escalation,
            "required_audit_fields": ["request_id", "application", "evidence_ref"],
        },
    }


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.write_text(
        "".join(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n" for row in rows),
        encoding="utf-8",
    )


def build_dataset(
    events: list[dict[str, Any]],
    output_dir: Path,
    *,
    dataset_ref: str,
    source_lane: str,
    reviewer_status: str,
    benchmark_splits: tuple[str, ...] = DEFAULT_BENCHMARK_SPLITS,
) -> dict[str, Any]:
    if not dataset_ref.startswith("gal-dataset://"):
        raise ValueError("dataset_ref must start with gal-dataset://")
    if source_lane not in VALID_SOURCE_LANES:
        raise ValueError(f"source_lane must be one of {VALID_SOURCE_LANES!r}")
    if reviewer_status not in VALID_REVIEWER_STATUSES:
        raise ValueError(f"reviewer_status must be one of {VALID_REVIEWER_STATUSES!r}")

    output_dir.mkdir(parents=True, exist_ok=True)
    split_examples: dict[str, list[dict[str, Any]]] = defaultdict(list)
    runtime_cases: list[dict[str, Any]] = []
    benchmark_split_set = set(benchmark_splits)

    for event in events:
        validate_audit_event(event, context=str(event.get("event_id", "event")))
        split = str(event["split"])
        split_examples[split].append(training_example_from_event(event))
        if split in benchmark_split_set:
            runtime_cases.append(runtime_case_from_event(event))

    if not runtime_cases:
        raise ValueError("no runtime benchmark cases produced; choose benchmark splits that contain events")

    split_manifest: dict[str, dict[str, Any]] = {}
    for split in VALID_SPLITS:
        examples = split_examples.get(split, [])
        if not examples:
            continue
        data_path = output_dir / f"{split}.jsonl"
        write_jsonl(data_path, examples)
        split_manifest[split] = {
            "path": data_path.name,
            "rows": len(examples),
            "sha256": sha256_file(data_path),
            "label_counts": count_labels(examples),
        }

    runtime_benchmark_path = output_dir / "runtime-benchmark.jsonl"
    write_jsonl(runtime_benchmark_path, runtime_cases)

    manifest = {
        "advisory_only": True,
        "dataset_ref": dataset_ref,
        "feature_names": FEATURE_NAMES,
        "hardware_commands_allowed": False,
        "manifest_version": MANIFEST_VERSION,
        "model_ref": MODEL_REF,
        "physical_action_allowed": False,
        "reviewer_status": reviewer_status,
        "schema_ref": TRAINING_SCHEMA_REF,
        "source_lanes": [source_lane],
        "splits": split_manifest,
    }
    manifest_path = output_dir / "dataset-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    summary = {
        "audit_event_schema_ref": AUDIT_EVENT_SCHEMA_REF,
        "dataset_manifest": manifest_path.as_posix(),
        "dataset_ref": dataset_ref,
        "events": len(events),
        "runtime_benchmark": runtime_benchmark_path.as_posix(),
        "runtime_benchmark_cases": len(runtime_cases),
        "splits": split_manifest,
    }
    summary_path = output_dir / "build-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return summary


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        events = load_audit_events(args.events)
        summary = build_dataset(
            events,
            args.output_dir,
            dataset_ref=args.dataset_ref,
            source_lane=args.source_lane,
            reviewer_status=args.reviewer_status,
            benchmark_splits=tuple(args.benchmark_splits),
        )
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
