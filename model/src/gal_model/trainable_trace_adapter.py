"""Convert GAL TrainableTraceV1 exports into normalized audit events."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .audit_dataset_builder import AUDIT_EVENT_SCHEMA_REF, write_jsonl
from .gal_api_session_export import assign_split, validate_split_ratios
from .session_archive_adapter import convert_entries as convert_archive_entries


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--application", default="gal-trainable-trace")
    parser.add_argument("--train-ratio", type=int, default=80)
    parser.add_argument("--validation-ratio", type=int, default=10)
    parser.add_argument("--test-ratio", type=int, default=10)
    return parser.parse_args(argv)


def _read_text(path: Path) -> str:
    if path.as_posix() == "-":
        return sys.stdin.read()
    return path.read_text(encoding="utf-8")


def _string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _coerce_trace(item: Any, *, context: str) -> dict[str, Any]:
    if not isinstance(item, dict):
        raise ValueError(f"{context}: expected object")

    organization_id = _string(item.get("organizationId"))
    if not organization_id:
        raise ValueError(f"{context}: organizationId is required")

    session = item.get("session")
    if not isinstance(session, dict):
        raise ValueError(f"{context}: session object is required")
    session_id = _string(session.get("id"))
    if not session_id:
        raise ValueError(f"{context}: session.id is required")

    events = item.get("events")
    if not isinstance(events, list) or not events:
        raise ValueError(f"{context}: events[] is required")
    for index, event in enumerate(events):
        if not isinstance(event, dict):
            raise ValueError(f"{context}: events[{index}] must be an object")
        if not isinstance(event.get("type"), str):
            raise ValueError(f"{context}: events[{index}].type is required")

    return item


def load_trainable_traces(path: Path) -> list[dict[str, Any]]:
    text = _read_text(path).strip()
    if not text:
        raise ValueError(f"{path}: no trainable traces found")

    traces: list[dict[str, Any]] = []
    if text.startswith("["):
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}: JSON parse error: {exc.msg}") from exc
        if not isinstance(payload, list):
            raise ValueError(f"{path}: expected array")
        for index, item in enumerate(payload):
            traces.append(_coerce_trace(item, context=f"{path}[{index}]"))
    else:
        for line_number, line in enumerate(text.splitlines(), start=1):
            if not line.strip():
                continue
            try:
                item = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"{path}:{line_number}: JSON parse error: {exc.msg}") from exc
            traces.append(_coerce_trace(item, context=f"{path}:{line_number}"))

    if not traces:
        raise ValueError(f"{path}: no trainable traces found")
    return traces


def convert_traces(
    traces: list[dict[str, Any]],
    *,
    ratios: dict[str, int],
    application: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    events: list[dict[str, Any]] = []
    summaries: list[dict[str, Any]] = []

    for trace in traces:
        organization_id = str(trace["organizationId"])
        session = trace["session"]
        session_id = str(session["id"])
        split = assign_split(session_id, ratios)
        trace_events = convert_archive_entries(
            trace["events"],
            split=split,
            application=application,
            org_name=organization_id,
            session_id=session_id,
        )
        events.extend(trace_events)
        summaries.append(
            {
                "organization_id": organization_id,
                "session_id": session_id,
                "project_context": _string(session.get("projectContext")),
                "trace_id": _string(trace.get("traceId")),
                "source_events_path": (
                    trace.get("source", {}).get("eventsPath")
                    if isinstance(trace.get("source"), dict)
                    else None
                ),
                "entries": len(trace["events"]),
                "events": len(trace_events),
                "split": split,
            }
        )

    return events, summaries


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        ratios = validate_split_ratios(args.train_ratio, args.validation_ratio, args.test_ratio)
        traces = load_trainable_traces(args.input)
        events, summaries = convert_traces(traces, ratios=ratios, application=args.application)
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
                "traces": len(traces),
                "events": len(events),
                "application": args.application,
                "split_ratios": ratios,
                "trace_summaries": summaries,
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
