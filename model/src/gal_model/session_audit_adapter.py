"""Convert GAL session audit logs into normalized model audit events."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .audit_dataset_builder import AUDIT_EVENT_SCHEMA_REF, validate_audit_event, write_jsonl
from .session_audit_contract import (
    SESSION_AUDIT_LOG_RESPONSE_SCHEMA_REF,
    coerce_session_audit_payload,
)

VALID_SPLITS = ("train", "validation", "test")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--split", choices=VALID_SPLITS, default="train")
    parser.add_argument("--application", default="gal-session-audit")
    return parser.parse_args(argv)


def _read_text(path: Path) -> str:
    if path.as_posix() == "-":
        return sys.stdin.read()
    return path.read_text(encoding="utf-8")


def load_session_audit_entries(path: Path) -> list[dict[str, Any]]:
    return load_session_audit_payload(path)["entries"]


def load_session_audit_payload(path: Path) -> dict[str, Any]:
    text = _read_text(path).strip()
    if not text:
        raise ValueError(f"{path}: no audit entries found")

    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        entries: list[dict[str, Any]] = []
        for line_number, line in enumerate(text.splitlines(), start=1):
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_number}: JSON parse error: {exc.msg}") from exc
            entries.append(item)
        return coerce_session_audit_payload(entries, context=path.as_posix())

    return coerce_session_audit_payload(payload, context=path.as_posix())


def _string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _number(value: Any) -> float | None:
    return float(value) if isinstance(value, int | float) else None


def _entry_id(entry: dict[str, Any], index: int) -> str:
    return _string(entry.get("id")) or f"audit-entry-{index + 1}"


def _org_name(entry: dict[str, Any]) -> str:
    return _string(entry.get("orgName")) or "unknown-org"


def _session_id(entry: dict[str, Any]) -> str:
    return _string(entry.get("sessionId")) or "unknown-session"


def normalized_event_from_session_audit_entry(
    entry: dict[str, Any],
    *,
    index: int,
    split: str,
    application: str,
) -> dict[str, Any]:
    if split not in VALID_SPLITS:
        raise ValueError(f"split must be one of {VALID_SPLITS!r}")

    entry_id = _entry_id(entry, index)
    org_name = _org_name(entry)
    session_id = _session_id(entry)
    policy_action = _string(entry.get("policyAction")) or "allowed"
    tool_name = _string(entry.get("toolName")) or "unknown"
    is_error = bool(entry.get("isError"))
    duration_ms = _number(entry.get("durationMs"))
    matched_policy_id = _string(entry.get("matchedPolicyId"))
    policy_reason = _string(entry.get("policyReason"))

    operator_review_required = policy_action in {"denied", "audited"} or is_error
    evidence_complete = bool(tool_name and policy_action and duration_ms is not None)
    approval_refs_complete = policy_action == "allowed" or bool(matched_policy_id or policy_reason)
    detection_count = sum(
        [
            1 if policy_action in {"denied", "audited"} else 0,
            1 if is_error else 0,
            1 if matched_policy_id else 0,
            1 if policy_reason else 0,
        ]
    )

    decision = "hold_for_operator_review" if operator_review_required else "clear_for_operator_review"
    event = {
        "event_id": f"session-audit-{org_name}-{session_id}-{entry_id}",
        "application": application,
        "evidence_ref": f"gal://sessions/{org_name}/{session_id}/audit-log/{entry_id}",
        "split": split,
        "features": {
            "people_present": False,
            "vehicles_present": False,
            "obstacles_present": False,
            "evidence_complete": evidence_complete,
            "operator_review_required": operator_review_required,
            "latency_measured": duration_ms is not None,
            "approval_refs_complete": approval_refs_complete,
            "detection_count": detection_count,
        },
        "outcome": {
            "decision": decision,
            "escalate_for_deeper_review": operator_review_required,
        },
    }
    validate_audit_event(event, context=event["event_id"])
    return event


def convert_entries(
    entries: list[dict[str, Any]],
    *,
    split: str,
    application: str,
) -> list[dict[str, Any]]:
    return [
        normalized_event_from_session_audit_entry(
            entry,
            index=index,
            split=split,
            application=application,
        )
        for index, entry in enumerate(entries)
    ]


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        payload = load_session_audit_payload(args.input)
        entries = payload["entries"]
        events = convert_entries(entries, split=args.split, application=args.application)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_jsonl(args.output, events)
    print(
        json.dumps(
            {
                "audit_event_schema_ref": AUDIT_EVENT_SCHEMA_REF,
                "response_schema_ref": SESSION_AUDIT_LOG_RESPONSE_SCHEMA_REF,
                "input": args.input.as_posix(),
                "output": args.output.as_posix(),
                "entries": len(entries),
                "events": len(events),
                "split": args.split,
                "application": args.application,
                "token_usage_present": payload.get("tokenUsage") is not None,
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
