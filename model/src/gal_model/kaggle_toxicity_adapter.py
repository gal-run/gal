"""Kaggle Jigsaw Toxicity adapter: maps toxicity labels to governance audit events.

**NOT FOR TRAINING.** This adapter is retained for reference and smoke testing only.
Toxicity classification is NOT governance decision-making. Training GAL on toxicity
data undermines the paper's thesis that governance decisions are structurally
separable from content safety.

See docs/legal-review.md and docs/data-audit.md for the full rationale.

Use GitHub PR reviews and GAL session exports as training data.
Use the synthetic governance scenario generator (issue #14) for scale.

Original purpose: map Jigsaw toxicity labels (toxic, severe_toxic, obscene,
threat, insult, identity_hate) to governance features. Retained for reference.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .audit_dataset_builder import AUDIT_EVENT_SCHEMA_REF, validate_audit_event, write_jsonl

TOXICITY_FIELDS = ["toxic", "severe_toxic", "obscene", "threat", "insult", "identity_hate"]


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Kaggle train.csv path (downloaded via kagglehub)")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-rows", type=int, default=0, help="Max rows to process (0 = all)")
    parser.add_argument("--train-ratio", type=float, default=70)
    parser.add_argument("--validation-ratio", type=float, default=20)
    parser.add_argument("--test-ratio", type=float, default=10)
    parser.add_argument("--application", default="kaggle-jigsaw-toxicity")
    return parser.parse_args(argv)


def assign_split(index: int, *, train_r: float, val_r: float, test_r: float) -> str:
    total = train_r + val_r + test_r
    bucket = (index * 31 + 13) % 100
    if bucket < (train_r / total) * 100:
        return "train"
    if bucket < ((train_r + val_r) / total) * 100:
        return "validation"
    return "test"


def toxicity_score(row: dict[str, Any]) -> float:
    """Aggregate toxicity signals into a single [0,1] score."""
    scores = [float(row.get(f, 0)) for f in TOXICITY_FIELDS]
    return max(scores)


def normalized_event_from_toxicity(
    row: dict[str, Any],
    *,
    index: int,
    split: str,
    application: str,
) -> dict[str, Any]:
    comment_id = row.get("id", f"kaggle-jigsaw-{index}")
    comment_text = row.get("comment_text", "")
    score = toxicity_score(row)
    is_toxic = score > 0.5
    is_severe = any(float(row.get(f, 0)) > 0.5 for f in ["severe_toxic", "threat", "identity_hate"])

    # Map toxicity to governance features
    obstacles_present = is_toxic
    evidence_complete = bool(comment_text.strip())
    operator_review_required = is_severe
    detection_count = sum(1 for f in TOXICITY_FIELDS if float(row.get(f, 0)) > 0.5)
    # Toxicity models are automated vehicles; human review is implicit in the dataset label
    vehicles_present = True
    people_present = False
    latency_measured = True
    approval_refs_complete = not is_severe

    decision = "hold_for_operator_review" if is_severe or score > 0.8 else (
        "clear_for_operator_review" if score < 0.3 else "hold_for_operator_review"
    )

    event = {
        "event_id": f"kaggle-jigsaw-{comment_id}",
        "application": application,
        "evidence_ref": f"kaggle://jigsaw-toxic-comment-classification/{comment_id}",
        "split": split,
        "title": comment_text[:200] if comment_text else "",
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


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    if not args.input.exists():
        print(f"Input file not found: {args.input}", file=sys.stderr)
        print("Download with: python -c \"import kagglehub; kagglehub.dataset_download('julian3833/jigsaw-toxic-comment-classification-challenge')\"", file=sys.stderr)  # noqa: E501
        return 2

    import csv

    events: list[dict[str, Any]] = []
    with args.input.open(encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader):
            if args.max_rows and idx >= args.max_rows:
                break
            split = assign_split(idx, train_r=args.train_ratio, val_r=args.validation_ratio, test_r=args.test_ratio)
            event = normalized_event_from_toxicity(row, index=idx, split=split, application=args.application)
            events.append(event)

    if not events:
        print("No events extracted", file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_jsonl(args.output, events)

    splits: dict[str, int] = {}
    decisions: dict[str, int] = {}
    for e in events:
        splits[e["split"]] = splits.get(e["split"], 0) + 1
        decisions[e["outcome"]["decision"]] = decisions.get(e["outcome"]["decision"], 0) + 1

    print(json.dumps({
        "audit_event_schema_ref": AUDIT_EVENT_SCHEMA_REF,
        "source": "kaggle-jigsaw-toxicity",
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
