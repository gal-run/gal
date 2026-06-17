"""Build a reviewed GAL governance dataset bundle from gal-code session ledgers."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .audit_dataset_builder import (
    DEFAULT_BENCHMARK_SPLITS,
    VALID_REVIEWER_STATUSES,
    VALID_SOURCE_LANES,
    VALID_SPLITS,
    build_dataset,
    write_jsonl,
)
from .gal_api_session_export import validate_split_ratios
from .gal_code_governance_adapter import (
    AUDIT_EVENT_SCHEMA_REF,
    ENTRY_REF,
    REVIEW_REF,
    _source_labels,
    convert_rows,
    load_governance_rows,
    load_review_rows,
)

SUMMARY_VERSION = "gal-code-reviewed-dataset-bundle/v0"
DEFAULT_SOURCE_LANE = "gal_code_governance_ledger_reviewed"
DEFAULT_REVIEWER_STATUS = "human_reviewed"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--reviews", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--dataset-ref", required=True)
    parser.add_argument("--application", default="gal-code-governance-reviewed")
    parser.add_argument("--source-lane", choices=VALID_SOURCE_LANES, default=DEFAULT_SOURCE_LANE)
    parser.add_argument("--reviewer-status", choices=VALID_REVIEWER_STATUSES, default=DEFAULT_REVIEWER_STATUS)
    parser.add_argument("--benchmark-splits", nargs="+", choices=VALID_SPLITS, default=list(DEFAULT_BENCHMARK_SPLITS))
    parser.add_argument("--train-ratio", type=int, default=80)
    parser.add_argument("--validation-ratio", type=int, default=10)
    parser.add_argument("--test-ratio", type=int, default=10)
    return parser.parse_args(argv)


def build_reviewed_dataset_bundle(
    *,
    ledger_path: Path,
    reviews_path: Path,
    output_dir: Path,
    dataset_ref: str,
    application: str,
    ratios: dict[str, int],
    source_lane: str,
    reviewer_status: str,
    benchmark_splits: tuple[str, ...],
) -> dict[str, object]:
    rows = load_governance_rows(ledger_path)
    reviews = load_review_rows(reviews_path)
    events, adapter_counts = convert_rows(
        rows,
        ratios=ratios,
        application=application,
        reviews=reviews,
        reviewed_only=True,
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    events_path = output_dir / "audit-events.jsonl"
    write_jsonl(events_path, events)

    adapter_summary = {
        "audit_event_schema_ref": AUDIT_EVENT_SCHEMA_REF,
        "governance_ledger_ref": ENTRY_REF,
        "governance_review_ref": REVIEW_REF,
        "input": ledger_path.as_posix(),
        "input_sources": _source_labels(ledger_path, context="governance"),
        "reviews": reviews_path.as_posix(),
        "review_sources": _source_labels(reviews_path, context="governance review"),
        "output": events_path.as_posix(),
        "application": application,
        "reviewed_only": True,
        "split_ratios": ratios,
        **adapter_counts,
    }
    adapter_summary_path = output_dir / "adapter-summary.json"
    adapter_summary_path.write_text(json.dumps(adapter_summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    dataset_summary = build_dataset(
        events,
        output_dir,
        dataset_ref=dataset_ref,
        source_lane=source_lane,
        reviewer_status=reviewer_status,
        benchmark_splits=benchmark_splits,
    )
    dataset_summary_path = output_dir / "build-summary.json"

    summary = {
        "summary_version": SUMMARY_VERSION,
        "dataset_ref": dataset_ref,
        "source_lane": source_lane,
        "reviewer_status": reviewer_status,
        "application": application,
        "reviewed_only": True,
        "events_path": events_path.as_posix(),
        "adapter_summary": adapter_summary_path.as_posix(),
        "dataset_build_summary": dataset_summary_path.as_posix(),
        "dataset_manifest": dataset_summary["dataset_manifest"],
        "runtime_benchmark": dataset_summary["runtime_benchmark"],
        "benchmark_splits": list(benchmark_splits),
        "split_ratios": ratios,
        "input_sources": adapter_summary["input_sources"],
        "review_sources": adapter_summary["review_sources"],
        "events": adapter_counts["events"],
        "reviewed_events": adapter_counts["reviewed_events"],
        "review_overrides": adapter_counts["review_overrides"],
    }
    summary_path = output_dir / "reviewed-dataset-summary.json"
    summary_path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return summary


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        ratios = validate_split_ratios(args.train_ratio, args.validation_ratio, args.test_ratio)
        summary = build_reviewed_dataset_bundle(
            ledger_path=args.input,
            reviews_path=args.reviews,
            output_dir=args.output_dir,
            dataset_ref=args.dataset_ref,
            application=args.application,
            ratios=ratios,
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
