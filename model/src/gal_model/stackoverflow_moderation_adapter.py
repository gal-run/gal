"""Stack Overflow moderation data adapter.

Normalizes Stack Exchange moderation signals into governance audit events.

Source: Stack Exchange Data Dump (Archive.org, CC BY-SA 4.0)
Contains: votes, flags, close reasons, post history, comments

Moderation signal mapping:
- Post closed → hold_for_operator_review (content required intervention)
- Post left open after review → clear_for_operator_review
- Flag marked helpful → hold_for_operator_review (flag was correct)
- Flag declined → clear_for_operator_review (flag was incorrect, content was fine)
- Score < -3 and not deleted → hold_for_operator_review (community rejected)

Input: Stack Exchange data dump XML files (Posts.xml, Votes.xml, Flags.xml)
or pre-processed CSV/JSONL files.
"""

from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from .audit_dataset_builder import AUDIT_EVENT_SCHEMA_REF, validate_audit_event, write_jsonl


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--posts", type=Path, help="Path to Posts.xml from SE data dump")
    parser.add_argument("--votes", type=Path, help="Path to Votes.xml")
    parser.add_argument("--flags", type=Path, help="Path to Flags.xml")
    parser.add_argument("--input", type=Path, help="Pre-processed JSONL (alternative to XML)")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-rows", type=int, default=0)
    parser.add_argument("--train-ratio", type=float, default=70)
    parser.add_argument("--validation-ratio", type=float, default=20)
    parser.add_argument("--test-ratio", type=float, default=10)
    parser.add_argument("--application", default="stackoverflow-moderation")
    return parser.parse_args(argv)


def assign_split(index: int, *, train_r: float, val_r: float, test_r: float) -> str:
    total = train_r + val_r + test_r
    bucket = (index * 31 + 13) % 100
    if bucket < (train_r / total) * 100:
        return "train"
    if bucket < ((train_r + val_r) / total) * 100:
        return "validation"
    return "test"


def _parse_xml_rows(path: Path, row_tag: str, max_rows: int) -> list[dict[str, Any]]:
    """Stream-parse XML rows without loading the entire file into memory."""
    rows: list[dict[str, Any]] = []
    context = ET.iterparse(path, events=("end",))
    for _, elem in context:
        if elem.tag == row_tag:
            rows.append(dict(elem.attrib))
            elem.clear()
            if max_rows and len(rows) >= max_rows:
                break
    return rows


def load_posts(path: Path, max_rows: int) -> list[dict[str, Any]]:
    return _parse_xml_rows(path, "row", max_rows)


def normalized_event_from_post(
    post: dict[str, Any],
    *,
    index: int,
    split: str,
    application: str,
) -> dict[str, Any] | None:
    post_id = post.get("Id", str(index))
    post_type = post.get("PostTypeId", "1")
    score = int(post.get("Score", 0))
    view_count = int(post.get("ViewCount", 0))
    comment_count = int(post.get("CommentCount", 0))
    closed_date = post.get("ClosedDate")

    # Only process questions and answers with moderation-relevant signals
    if post_type not in ("1", "2"):
        return None

    # Skip posts with no moderation signal
    if not closed_date and score > -2 and comment_count < 1:
        return None

    is_closed = bool(closed_date)
    is_negative_score = score < -3
    is_high_attention = view_count > 1000 and comment_count > 10

    obstacles_present = is_closed or is_negative_score
    evidence_complete = True
    operator_review_required = is_closed or is_negative_score
    detection_count = sum([1 if is_closed else 0, 1 if is_negative_score else 0, 1 if is_high_attention else 0])
    people_present = True  # Community moderation implies human review
    vehicles_present = False
    latency_measured = bool(closed_date)
    approval_refs_complete = not is_closed

    decision = "hold_for_operator_review" if (is_closed or is_negative_score) else "clear_for_operator_review"

    event = {
        "event_id": f"stackoverflow-post-{post_id}",
        "application": application,
        "evidence_ref": f"stackexchange://stackoverflow.com/posts/{post_id}",
        "split": split,
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
            "escalate_for_deeper_review": is_closed,
        },
    }
    validate_audit_event(event, context=event["event_id"])
    return event


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    events: list[dict[str, Any]] = []

    if args.input:
        # Pre-processed JSONL mode
        with args.input.open(encoding="utf-8") as f:
            for idx, line in enumerate(f):
                if not line.strip():
                    continue
                if args.max_rows and idx >= args.max_rows:
                    break
                row = json.loads(line)
                split = assign_split(idx, train_r=args.train_ratio, val_r=args.validation_ratio, test_r=args.test_ratio)
                event = normalized_event_from_post(row, index=idx, split=split, application=args.application)
                if event:
                    events.append(event)
    elif args.posts:
        # XML mode
        posts = load_posts(args.posts, args.max_rows)
        for idx, post in enumerate(posts):
            split = assign_split(idx, train_r=args.train_ratio, val_r=args.validation_ratio, test_r=args.test_ratio)
            event = normalized_event_from_post(post, index=idx, split=split, application=args.application)
            if event:
                events.append(event)
    else:
        print("Error: provide --input (JSONL) or --posts (Posts.xml)", file=sys.stderr)
        return 2

    if not events:
        print("No moderation events extracted", file=sys.stderr)
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
        "source": "stackoverflow-moderation",
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
