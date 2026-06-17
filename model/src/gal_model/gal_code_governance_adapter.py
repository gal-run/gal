"""Convert gal-code governance ledgers into normalized audit events."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .audit_dataset_builder import AUDIT_EVENT_SCHEMA_REF, validate_audit_event, write_jsonl
from .constants import LABEL_TO_INDEX
from .dataset import validate_feature_payload
from .gal_api_session_export import assign_split, validate_split_ratios

ENTRY_REF = "gal-code://governance-ledger/v0"
REVIEW_REF = "gal-code://governance-review/v0"
REVIEW_FEEDBACK_TO_DECISION = {
    "correct": None,
    "too_strict": "clear_for_operator_review",
    "missed_risk": "hold_for_operator_review",
}


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--reviews", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--application", default="gal-code-governance")
    parser.add_argument("--train-ratio", type=int, default=80)
    parser.add_argument("--validation-ratio", type=int, default=10)
    parser.add_argument("--test-ratio", type=int, default=10)
    parser.add_argument("--reviewed-only", action="store_true")
    return parser.parse_args(argv)


def _read_text(path: Path) -> str:
    if path.as_posix() == "-":
        return sys.stdin.read()
    return path.read_text(encoding="utf-8")


def _resolve_jsonl_sources(path: Path, *, context: str) -> list[Path]:
    if path.as_posix() == "-":
        return [path]
    if path.is_file():
        return [path]
    if path.is_dir():
        sources = sorted(
            (source for source in path.rglob("*.jsonl") if source.is_file()),
            key=lambda source: (len(source.relative_to(path).parts), source.as_posix()),
        )
        if not sources:
            raise ValueError(f"{path}: no {context} JSONL files found")
        return sources
    raise ValueError(f"{path}: {context} source was not found")


def _source_labels(path: Path, *, context: str) -> list[str]:
    return [source.as_posix() for source in _resolve_jsonl_sources(path, context=context)]


def _string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _number(value: Any) -> float | None:
    return float(value) if isinstance(value, int | float) else None


def _bool(value: Any, *, default: bool = False) -> bool:
    return value if isinstance(value, bool) else default


def _dict(value: Any, *, context: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{context}: expected object")
    return value


def load_governance_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for source in _resolve_jsonl_sources(path, context="governance"):
        text = _read_text(source).strip()
        if not text:
            continue
        for line_number, line in enumerate(text.splitlines(), start=1):
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{source}:{line_number}: JSON parse error: {exc.msg}") from exc
            if not isinstance(item, dict):
                raise ValueError(f"{source}:{line_number}: expected object")
            kind = _string(item.get("entry_type"))
            if not kind:
                raise ValueError(f"{source}:{line_number}: entry_type is required")
            rows.append(item)

    if not rows:
        raise ValueError(f"{path}: no governance rows found")
    return rows


def load_review_rows(path: Path) -> dict[tuple[str, str], dict[str, Any]]:
    rows: dict[tuple[str, str], dict[str, Any]] = {}
    for source in _resolve_jsonl_sources(path, context="governance review"):
        text = _read_text(source).strip()
        if not text:
            continue
        for line_number, line in enumerate(text.splitlines(), start=1):
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{source}:{line_number}: JSON parse error: {exc.msg}") from exc
            if not isinstance(item, dict):
                raise ValueError(f"{source}:{line_number}: expected object")
            session_id = _string(item.get("session_id"))
            call_id = _string(item.get("call_id"))
            feedback = _string(item.get("feedback"))
            if not session_id:
                raise ValueError(f"{source}:{line_number}: session_id is required")
            if not call_id:
                raise ValueError(f"{source}:{line_number}: call_id is required")
            if feedback not in REVIEW_FEEDBACK_TO_DECISION:
                raise ValueError(
                    f"{source}:{line_number}: feedback must be one of {sorted(REVIEW_FEEDBACK_TO_DECISION)!r}"
                )
            reviewed_decision = _string(item.get("reviewed_decision"))
            if reviewed_decision is not None and reviewed_decision not in LABEL_TO_INDEX:
                raise ValueError(f"{source}:{line_number}: unsupported reviewed_decision {reviewed_decision!r}")
            key = (session_id, call_id)
            if key in rows:
                raise ValueError(f"{source}:{line_number}: duplicate review row for {session_id}/{call_id}")
            rows[key] = item
    if not rows:
        raise ValueError(f"{path}: no governance review rows found")
    return rows


def resolve_review_decision(review: dict[str, Any], original_decision: str) -> str:
    reviewed_decision = _string(review.get("reviewed_decision"))
    if reviewed_decision in LABEL_TO_INDEX:
        return reviewed_decision
    feedback = _string(review.get("feedback"))
    mapped = REVIEW_FEEDBACK_TO_DECISION.get(feedback)
    return original_decision if mapped is None else mapped


def convert_rows(
    rows: list[dict[str, Any]],
    *,
    ratios: dict[str, int],
    application: str,
    reviews: dict[tuple[str, str], dict[str, Any]] | None = None,
    reviewed_only: bool = False,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    events: list[dict[str, Any]] = []
    entry_counts = {"decision": 0, "result": 0, "other": 0}
    blocked = 0
    sessions: set[str] = set()
    review_feedback_counts = {key: 0 for key in REVIEW_FEEDBACK_TO_DECISION}
    reviewed_events = 0
    review_overrides = 0
    matched_review_keys: set[tuple[str, str]] = set()

    for index, row in enumerate(rows):
        kind = _string(row.get("entry_type")) or "other"
        if kind in entry_counts:
            entry_counts[kind] += 1
        else:
            entry_counts["other"] += 1
        if kind != "decision":
            continue

        session_id = _string(row.get("session_id"))
        if not session_id:
            raise ValueError(f"row {index}: session_id is required for decision rows")
        call_id = _string(row.get("call_id"))
        if not call_id:
            raise ValueError(f"row {index}: call_id is required for decision rows")
        decision = _string(row.get("decision"))
        if decision not in LABEL_TO_INDEX:
            raise ValueError(f"row {index}: unsupported decision {decision!r}")
        features = _dict(row.get("features"), context=f"row {index}.features")
        validate_feature_payload(features, context=f"row {index}.features")
        review_key = (session_id, call_id)
        review = reviews.get(review_key) if reviews is not None else None
        if reviewed_only and review is None:
            continue
        if review is not None:
            reviewed_events += 1
            matched_review_keys.add(review_key)
            feedback = _string(review.get("feedback"))
            if feedback in review_feedback_counts:
                review_feedback_counts[feedback] += 1
            final_decision = resolve_review_decision(review, decision)
            if final_decision != decision:
                review_overrides += 1
        else:
            final_decision = decision

        split = assign_split(f"{session_id}:{call_id}", ratios)
        sessions.add(session_id)
        if _bool(row.get("blocked")):
            blocked += 1

        event = {
            "event_id": f"gal-code-governance-{session_id}-{call_id}",
            "application": _string(row.get("application")) or application,
            "evidence_ref": _string(row.get("evidence_ref")) or f"gal://sessions/{session_id}/tool/{call_id}",
            "split": split,
            "features": features,
            "outcome": {
                "decision": final_decision,
                "escalate_for_deeper_review": _bool(
                    row.get("escalate_for_deeper_review"),
                    default=final_decision == "hold_for_operator_review",
                ),
            },
        }
        validate_audit_event(event, context=event["event_id"])
        events.append(event)

    if reviews:
        unmatched = sorted(f"{session_id}/{call_id}" for session_id, call_id in set(reviews) - matched_review_keys)
        if unmatched:
            raise ValueError(f"review rows did not match governance decisions: {unmatched!r}")

    summary = {
        "entries": len(rows),
        "decision_rows": entry_counts["decision"],
        "result_rows": entry_counts["result"],
        "other_rows": entry_counts["other"],
        "sessions": len(sessions),
        "blocked_decisions": blocked,
        "review_rows": len(reviews or {}),
        "reviewed_events": reviewed_events,
        "review_overrides": review_overrides,
        "review_feedback_counts": review_feedback_counts,
        "events": len(events),
    }
    return events, summary


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        ratios = validate_split_ratios(args.train_ratio, args.validation_ratio, args.test_ratio)
        rows = load_governance_rows(args.input)
        reviews = load_review_rows(args.reviews) if args.reviews else None
        events, summary = convert_rows(
            rows,
            ratios=ratios,
            application=args.application,
            reviews=reviews,
            reviewed_only=args.reviewed_only,
        )
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_jsonl(args.output, events)
    print(
        json.dumps(
            {
                "audit_event_schema_ref": AUDIT_EVENT_SCHEMA_REF,
                "governance_ledger_ref": ENTRY_REF,
                "governance_review_ref": REVIEW_REF if args.reviews else None,
                "input": args.input.as_posix(),
                "input_sources": _source_labels(args.input, context="governance"),
                "reviews": args.reviews.as_posix() if args.reviews else None,
                "review_sources": _source_labels(args.reviews, context="governance review") if args.reviews else [],
                "output": args.output.as_posix(),
                "application": args.application,
                "reviewed_only": args.reviewed_only,
                "split_ratios": ratios,
                **summary,
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
