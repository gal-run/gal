"""Convert archived GAL session output streams into normalized audit events."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .audit_dataset_builder import AUDIT_EVENT_SCHEMA_REF, validate_audit_event, write_jsonl

VALID_SPLITS = ("train", "validation", "test")
SUCCESSFUL_COMPLETE_REASONS = {"success", "completed", "complete"}

DESTRUCTIVE_SUBSTRINGS = (
    "rm -rf",
    "git reset --hard",
    "git checkout --",
    "kubectl delete",
    "terraform destroy",
)
EXTERNAL_NETWORK_SUBSTRINGS = (
    "curl ",
    "wget ",
    "ssh ",
    "scp ",
    "rsync ",
    "nmap ",
    "nc ",
    "http://",
    "https://",
)
EXTERNAL_STATE_CHANGE_SUBSTRINGS = (
    "git push",
    "gh issue create",
    "gh issue close",
    "gh issue comment",
    "gh pr create",
    "gh pr merge",
    "gh release create",
    "npm publish",
    "pnpm publish",
    "runpodctl pod create",
    "kubectl apply",
    "kubectl patch",
    "terraform apply",
)
CREDENTIAL_FAILURE_SUBSTRINGS = (
    "gh auth login",
    "not logged into any github",
    "populate the gh_token",
    "authentication required",
    "authorization",
    "unauthorized",
    "invalid token",
    "access denied",
)
INVALID_INVOCATION_SUBSTRINGS = (
    "requires a",
    "missing",
    "must provide",
    "unknown flag",
    "invalid argument",
    "path string",
)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--split", choices=VALID_SPLITS, default="train")
    parser.add_argument("--application", default="gal-session-archive")
    parser.add_argument("--org", default="unknown-org")
    parser.add_argument("--session-id", default="unknown-session")
    return parser.parse_args(argv)


def _read_text(path: Path) -> str:
    if path.as_posix() == "-":
        return sys.stdin.read()
    return path.read_text(encoding="utf-8")


def _string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _number(value: Any) -> float | None:
    return float(value) if isinstance(value, int | float) else None


def _bool(value: Any, *, default: bool = False) -> bool:
    return value if isinstance(value, bool) else default


def _contains_any(text: str | None, needles: tuple[str, ...]) -> bool:
    if not text:
        return False
    lowered = text.lower()
    return any(needle in lowered for needle in needles)


def _result_text(entry: dict[str, Any]) -> str:
    return _string(entry.get("result")) or _string(entry.get("error")) or ""


def _tool_input_subject(tool_name: str, tool_input: dict[str, Any]) -> str:
    if tool_name == "bash":
        return _string(tool_input.get("command")) or ""
    if tool_name in {"read_file", "write_file", "delete_file", "edit_file"}:
        return _string(tool_input.get("path")) or ""
    return json.dumps(tool_input, sort_keys=True, separators=(",", ":"))


def _server_timestamp_ms(entry: dict[str, Any]) -> float | None:
    value = entry.get("serverTimestamp")
    return _number(value)


def load_session_archive_entries(path: Path) -> list[dict[str, Any]]:
    text = _read_text(path).strip()
    if not text:
        raise ValueError(f"{path}: no archive entries found")

    entries: list[dict[str, Any]] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{line_number}: JSON parse error: {exc.msg}") from exc
        if not isinstance(item, dict):
            raise ValueError(f"{path}:{line_number}: expected object")
        if not isinstance(item.get("type"), str):
            raise ValueError(f"{path}:{line_number}: type is required")
        entries.append(item)

    if not entries:
        raise ValueError(f"{path}: no archive entries found")
    return entries


def normalized_event_from_archive_pair(
    call_entry: dict[str, Any],
    result_entry: dict[str, Any],
    *,
    index: int,
    split: str,
    application: str,
    org_name: str,
    session_id: str,
) -> dict[str, Any]:
    if split not in VALID_SPLITS:
        raise ValueError(f"split must be one of {VALID_SPLITS!r}")

    tool_name = _string(call_entry.get("toolName")) or "unknown"
    tool_use_id = _string(call_entry.get("toolUseId")) or _string(result_entry.get("toolUseId")) or f"tool-use-{index + 1}"
    tool_input = call_entry.get("toolInput")
    if not isinstance(tool_input, dict):
        tool_input = {}
    subject = _tool_input_subject(tool_name, tool_input)
    result_text = _result_text(result_entry)
    is_error = _bool(result_entry.get("isError"))

    destructive = tool_name == "delete_file" or _contains_any(subject, DESTRUCTIVE_SUBSTRINGS)
    external_network = tool_name == "webfetch" or _contains_any(subject, EXTERNAL_NETWORK_SUBSTRINGS)
    external_state_change = _contains_any(subject, EXTERNAL_STATE_CHANGE_SUBSTRINGS)
    credential_failure = _contains_any(result_text, CREDENTIAL_FAILURE_SUBSTRINGS)
    invalid_invocation = is_error and (
        tool_name == "write_file" and not _string(tool_input.get("path"))
        or _contains_any(result_text, INVALID_INVOCATION_SUBSTRINGS)
    )

    latency_ms: float | None = None
    call_ts = _server_timestamp_ms(call_entry)
    result_ts = _server_timestamp_ms(result_entry)
    if call_ts is not None and result_ts is not None and result_ts >= call_ts:
        latency_ms = result_ts - call_ts

    operator_review_required = (
        destructive
        or external_network
        or external_state_change
        or credential_failure
        or invalid_invocation
    )
    detection_count = sum(
        [
            1 if destructive else 0,
            1 if external_network else 0,
            1 if external_state_change else 0,
            1 if credential_failure else 0,
            1 if invalid_invocation else 0,
            1 if is_error else 0,
        ]
    )

    decision = "hold_for_operator_review" if operator_review_required else "clear_for_operator_review"
    event = {
        "event_id": f"session-archive-{org_name}-{session_id}-{tool_use_id}",
        "application": application,
        "evidence_ref": f"gal://sessions/{org_name}/{session_id}/archive/{tool_use_id}",
        "split": split,
        "features": {
            "people_present": False,
            "vehicles_present": False,
            "obstacles_present": False,
            "evidence_complete": bool(tool_name and tool_use_id),
            "operator_review_required": operator_review_required,
            "latency_measured": latency_ms is not None,
            "approval_refs_complete": bool(result_text),
            "detection_count": detection_count,
        },
        "outcome": {
            "decision": decision,
            "escalate_for_deeper_review": operator_review_required,
        },
    }
    validate_audit_event(event, context=event["event_id"])
    return event


def normalized_terminal_event_from_archive(
    entries: list[dict[str, Any]],
    *,
    split: str,
    application: str,
    org_name: str,
    session_id: str,
) -> dict[str, Any] | None:
    complete_entry = next((entry for entry in reversed(entries) if entry.get("type") == "complete"), None)
    error_entries = [
        entry
        for entry in entries
        if entry.get("type") == "error" and isinstance(entry.get("error"), str) and entry.get("error")
    ]
    complete_reason = _string(complete_entry.get("reason")) if isinstance(complete_entry, dict) else None

    terminal_failure = bool(error_entries)
    if complete_reason and complete_reason.lower() not in SUCCESSFUL_COMPLETE_REASONS:
        terminal_failure = True

    if not terminal_failure:
        return None

    detection_count = len(error_entries) + (1 if complete_reason else 0)
    event = {
        "event_id": f"session-archive-{org_name}-{session_id}-terminal",
        "application": application,
        "evidence_ref": f"gal://sessions/{org_name}/{session_id}/archive/terminal",
        "split": split,
        "features": {
            "people_present": False,
            "vehicles_present": False,
            "obstacles_present": False,
            "evidence_complete": complete_entry is not None,
            "operator_review_required": True,
            "latency_measured": False,
            "approval_refs_complete": complete_entry is not None,
            "detection_count": detection_count,
        },
        "outcome": {
            "decision": "hold_for_operator_review",
            "escalate_for_deeper_review": True,
        },
    }
    validate_audit_event(event, context=event["event_id"])
    return event


def convert_entries(
    entries: list[dict[str, Any]],
    *,
    split: str,
    application: str,
    org_name: str,
    session_id: str,
) -> list[dict[str, Any]]:
    tool_calls: dict[str, dict[str, Any]] = {}
    events: list[dict[str, Any]] = []

    for index, entry in enumerate(entries):
        event_type = _string(entry.get("type")) or "unknown"
        if event_type == "tool_call":
            tool_use_id = _string(entry.get("toolUseId"))
            if tool_use_id:
                tool_calls[tool_use_id] = entry
            continue
        if event_type != "tool_result":
            continue

        tool_use_id = _string(entry.get("toolUseId"))
        if not tool_use_id:
            continue
        call_entry = tool_calls.get(tool_use_id)
        if call_entry is None:
            continue
        events.append(
            normalized_event_from_archive_pair(
                call_entry,
                entry,
                index=index,
                split=split,
                application=application,
                org_name=org_name,
                session_id=session_id,
            )
        )

    terminal_event = normalized_terminal_event_from_archive(
        entries,
        split=split,
        application=application,
        org_name=org_name,
        session_id=session_id,
    )
    if terminal_event is not None:
        events.append(terminal_event)
    return events


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        entries = load_session_archive_entries(args.input)
        events = convert_entries(
            entries,
            split=args.split,
            application=args.application,
            org_name=args.org,
            session_id=args.session_id,
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
                "input": args.input.as_posix(),
                "output": args.output.as_posix(),
                "entries": len(entries),
                "events": len(events),
                "split": args.split,
                "application": args.application,
                "org": args.org,
                "session_id": args.session_id,
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
