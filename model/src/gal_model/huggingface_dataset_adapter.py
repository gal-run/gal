"""HuggingFace dataset adapter: normalizes HF datasets into governance audit events.

**NOT FOR TRAINING.** This adapter is retained for reference and smoke testing only.
Datasets like google/civil_comments classify content toxicity, not governance
decisions. Training GAL on this data undermines the paper's thesis.

See docs/legal-review.md and docs/data-audit.md for the full rationale.

Original purpose: load HF datasets (google/civil_comments) with toxicity labels
and map to governance features. Retained for reference.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .audit_dataset_builder import AUDIT_EVENT_SCHEMA_REF, validate_audit_event, write_jsonl

SUPPORTED_DATASETS = {
    "google/civil_comments": "civil_comments",
}

TOXICITY_FIELDS = ["toxicity", "severe_toxicity", "obscene", "threat", "insult", "identity_attack"]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", required=True, choices=list(SUPPORTED_DATASETS),
                        help="HuggingFace dataset name")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-rows", type=int, default=0)
    parser.add_argument("--train-ratio", type=float, default=70)
    parser.add_argument("--validation-ratio", type=float, default=20)
    parser.add_argument("--test-ratio", type=float, default=10)
    parser.add_argument("--application", default="huggingface-dataset")
    return parser.parse_args(argv)


def assign_split(index: int, *, train_r: float, val_r: float, test_r: float) -> str:
    total = train_r + val_r + test_r
    bucket = (index * 31 + 13) % 100
    if bucket < (train_r / total) * 100:
        return "train"
    if bucket < ((train_r + val_r) / total) * 100:
        return "validation"
    return "test"


def load_civil_comments(max_rows: int) -> list[dict[str, Any]]:
    """Load google/civil_comments dataset via the datasets library."""
    try:
        from datasets import load_dataset
    except ImportError:
        print("Error: 'datasets' library required. Install: pip install datasets", file=sys.stderr)
        sys.exit(2)

    ds = load_dataset("google/civil_comments", split="train", streaming=True)
    rows: list[dict[str, Any]] = []
    for i, example in enumerate(ds):
        if max_rows and i >= max_rows:
            break
        rows.append(example)
    return rows


def toxicity_score(row: dict[str, Any]) -> float:
    scores = [float(row.get(f, 0) or 0) for f in TOXICITY_FIELDS]
    return max(scores)


def normalized_event_from_civil_comment(
    row: dict[str, Any],
    *,
    index: int,
    split: str,
    application: str,
) -> dict[str, Any]:
    comment_id = f"civil-comments-{index}"
    text = row.get("text", "")
    score = toxicity_score(row)
    is_toxic = score > 0.5
    is_severe = any(float(row.get(f, 0) or 0) > 0.5 for f in ["severe_toxicity", "threat", "identity_attack"])

    obstacles_present = is_toxic
    evidence_complete = bool(text and text.strip())
    operator_review_required = is_severe
    detection_count = sum(1 for f in TOXICITY_FIELDS if float(row.get(f, 0) or 0) > 0.5)
    vehicles_present = True
    people_present = False
    latency_measured = True
    approval_refs_complete = not is_severe

    decision = "hold_for_operator_review" if is_severe or score > 0.8 else (
        "clear_for_operator_review" if score < 0.3 else "hold_for_operator_review"
    )

    event = {
        "event_id": f"hf-civil-comments-{comment_id}",
        "application": application,
        "evidence_ref": f"hf://google/civil_comments/{comment_id}",
        "split": split,
        "title": text[:200] if text else "",
        "features": {
            "people_present": people_present,
            "vehicles_present": vehicles_present,
            "obstacles_present": obstacles_present,
            "evidence_complete": evidence_complete,
            "operator_review_required": operator_review_required,
            "latency_measured": latency_measured,
            "approval_refs_complete": approval_refs_complete,
            "detection_count": detection_count,
        },
        "outcome": {
            "decision": decision,
            "escalate_for_deeper_review": is_severe,
        },
    }
    validate_audit_event(event, context=event["event_id"])
    return event


LOADERS = {
    "civil_comments": load_civil_comments,
}


EVENT_BUILDERS = {
    "civil_comments": normalized_event_from_civil_comment,
}


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    dataset_key = SUPPORTED_DATASETS[args.dataset]
    loader = LOADERS.get(dataset_key)
    builder = EVENT_BUILDERS.get(dataset_key)

    if not loader or not builder:
        print(f"No loader/builder for dataset key: {dataset_key}", file=sys.stderr)
        return 2

    print(f"Loading {args.dataset} ...", file=sys.stderr)
    rows = loader(args.max_rows)
    if not rows:
        print("No rows loaded", file=sys.stderr)
        return 1

    events: list[dict[str, Any]] = []
    for idx, row in enumerate(rows):
        split = assign_split(idx, train_r=args.train_ratio, val_r=args.validation_ratio, test_r=args.test_ratio)
        event = builder(row, index=idx, split=split, application=args.application)
        events.append(event)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_jsonl(args.output, events)

    splits: dict[str, int] = {}
    decisions: dict[str, int] = {}
    for e in events:
        splits[e["split"]] = splits.get(e["split"], 0) + 1
        decisions[e["outcome"]["decision"]] = decisions.get(e["outcome"]["decision"], 0) + 1

    print(json.dumps({
        "audit_event_schema_ref": AUDIT_EVENT_SCHEMA_REF,
        "source": args.dataset,
        "output": args.output.as_posix(),
        "events": len(events),
        "splits": splits,
        "decisions": decisions,
        "application": args.application,
    }, indent=2, sort_keys=True))
    return 0


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
