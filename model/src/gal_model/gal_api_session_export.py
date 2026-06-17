"""Export normalized GAL datasets from GAL API audit logs or session archives."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import Counter
from pathlib import Path
from typing import Any
from urllib import error, parse, request

from .audit_dataset_builder import (
    VALID_REVIEWER_STATUSES,
    VALID_SOURCE_LANES,
    build_dataset,
)
from .session_archive_adapter import (
    convert_entries as convert_archive_entries,
)
from .session_audit_contract import (
    validate_session_audit_log_response,
)
from .session_audit_adapter import convert_entries as convert_audit_entries

DEFAULT_API_BASE_URL = "http://localhost:3000"
DEFAULT_SPLITS = {"train": 80, "validation": 10, "test": 10}
DEFAULT_DISCOVER_LIMIT = 5
EXPORT_SUMMARY_VERSION = "gal-api-session-export/v0"
EXPORT_SUMMARY_SCHEMA_REF = (
    "https://gal.run/schemas/model/gal-api-session-export-summary.schema.json"
)
VALID_EXPORT_SOURCES = ("auto", "session_audit_log", "session_archive")
AUDIT_SOURCE_TYPE = "gal_api_session_audit_log"
ARCHIVE_SOURCE_TYPE = "gal_api_session_archive"
MIXED_SOURCE_TYPE = "gal_api_mixed_session_sources"
ARCHIVE_ELIGIBLE_STATUSES = {"TERMINATED", "FAILED", "COMPLETED"}
REQUEST_USER_AGENT = "gal-model-export/0.1 (curl-compatible)"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.getenv("GAL_API_BASE_URL", DEFAULT_API_BASE_URL))
    parser.add_argument("--org", required=True)
    parser.add_argument("--session-id", action="append", default=[])
    parser.add_argument("--session-ids-file", type=Path)
    parser.add_argument("--source", choices=VALID_EXPORT_SOURCES, default="auto")
    parser.add_argument("--discover-limit", type=int, default=DEFAULT_DISCOVER_LIMIT)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--dataset-ref", required=True)
    parser.add_argument("--application", default="gal-session-audit")
    parser.add_argument("--source-lane", choices=VALID_SOURCE_LANES, default="canonical_gal_structured_dataset")
    parser.add_argument("--reviewer-status", choices=VALID_REVIEWER_STATUSES, default="human_reviewed")
    parser.add_argument("--train-ratio", type=int, default=DEFAULT_SPLITS["train"])
    parser.add_argument("--validation-ratio", type=int, default=DEFAULT_SPLITS["validation"])
    parser.add_argument("--test-ratio", type=int, default=DEFAULT_SPLITS["test"])
    parser.add_argument("--token-env", default="GAL_AUTH_TOKEN")
    parser.add_argument("--page-limit", type=int, default=500)
    return parser.parse_args(argv)


def read_session_ids(explicit: list[str], session_ids_file: Path | None) -> list[str]:
    session_ids = [value.strip() for value in explicit if value.strip()]
    if session_ids_file is not None:
        session_ids.extend(
            line.strip() for line in session_ids_file.read_text(encoding="utf-8").splitlines() if line.strip()
        )
    if not session_ids:
        raise ValueError("at least one --session-id or --session-ids-file entry is required")
    seen: set[str] = set()
    ordered: list[str] = []
    for session_id in session_ids:
        if session_id in seen:
            continue
        seen.add(session_id)
        ordered.append(session_id)
    return ordered


def try_read_session_ids(explicit: list[str], session_ids_file: Path | None) -> list[str]:
    try:
        return read_session_ids(explicit, session_ids_file)
    except ValueError:
        return []


def validate_split_ratios(train_ratio: int, validation_ratio: int, test_ratio: int) -> dict[str, int]:
    ratios = {
        "train": train_ratio,
        "validation": validation_ratio,
        "test": test_ratio,
    }
    if any(value < 0 for value in ratios.values()):
        raise ValueError("split ratios must be non-negative")
    if sum(ratios.values()) != 100:
        raise ValueError("split ratios must sum to 100")
    return ratios


def assign_split(session_id: str, ratios: dict[str, int]) -> str:
    bucket = int(hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:8], 16) % 100
    if bucket < ratios["train"]:
        return "train"
    if bucket < ratios["train"] + ratios["validation"]:
        return "validation"
    return "test"


def _json_request(
    *,
    url: str,
    bearer_token: str,
    context: str,
) -> dict[str, Any]:
    req = request.Request(
        url,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {bearer_token}",
            "User-Agent": REQUEST_USER_AGENT,
        },
    )
    try:
        with request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise ValueError(f"{context}: GAL API returned {exc.code}: {body}") from exc
    except error.URLError as exc:
        raise ValueError(f"{context}: failed to reach GAL API: {exc.reason}") from exc


def _text_request(
    *,
    url: str,
    bearer_token: str,
    accept: str,
    context: str,
) -> str:
    req = request.Request(
        url,
        headers={
            "Accept": accept,
            "Authorization": f"Bearer {bearer_token}",
            "User-Agent": REQUEST_USER_AGENT,
        },
    )
    try:
        with request.urlopen(req, timeout=60) as response:
            return response.read().decode("utf-8")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise ValueError(f"{context}: GAL API returned {exc.code}: {body}") from exc
    except error.URLError as exc:
        raise ValueError(f"{context}: failed to reach GAL API: {exc.reason}") from exc


def _as_session_list_item(item: Any, *, context: str) -> dict[str, Any]:
    if not isinstance(item, dict):
        raise ValueError(f"{context}: expected object")
    session_id = item.get("id")
    if not isinstance(session_id, str) or not session_id:
        raise ValueError(f"{context}: session id is required")
    metadata = item.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    event_archive = metadata.get("eventArchive")
    if not isinstance(event_archive, dict):
        event_archive = {}
    return {
        "id": session_id,
        "status": item.get("status") if isinstance(item.get("status"), str) else None,
        "name": item.get("name") if isinstance(item.get("name"), str) else None,
        "projectContext": item.get("projectContext") if isinstance(item.get("projectContext"), str) else None,
        "createdAt": item.get("createdAt") if isinstance(item.get("createdAt"), str) else None,
        "toolCallCount": metadata.get("toolCallCount") if isinstance(metadata.get("toolCallCount"), int | float) else None,
        "eventArchive": {
            "storagePath": event_archive.get("storagePath") if isinstance(event_archive.get("storagePath"), str) else None,
            "eventCount": event_archive.get("eventCount") if isinstance(event_archive.get("eventCount"), int | float) else None,
            "archivedAt": event_archive.get("archivedAt") if isinstance(event_archive.get("archivedAt"), str) else None,
        },
    }


def discover_archived_sessions(
    *,
    base_url: str,
    org: str,
    bearer_token: str,
    limit: int,
) -> list[dict[str, Any]]:
    if limit <= 0:
        raise ValueError("discover_limit must be positive")
    discovered: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    cursor: str | None = None
    has_more = True
    page_size = min(limit, 100)

    while has_more and len(discovered) < limit:
        query_params = {"org": org, "limit": page_size}
        if cursor:
            query_params["cursor"] = cursor
        query = parse.urlencode(query_params)
        url = f"{base_url.rstrip('/')}/api/sessions?{query}"
        payload = _json_request(url=url, bearer_token=bearer_token, context=f"{org}:sessions")
        sessions = payload.get("sessions")
        if not isinstance(sessions, list):
            raise ValueError(f"{org}:sessions: expected sessions[]")

        for index, item in enumerate(sessions):
            session = _as_session_list_item(item, context=f"{org}:sessions[{index}]")
            if session["id"] in seen_ids:
                continue
            seen_ids.add(session["id"])
            if session["status"] not in ARCHIVE_ELIGIBLE_STATUSES:
                continue
            if not session["eventArchive"]["storagePath"]:
                continue
            discovered.append(session)
            if len(discovered) >= limit:
                break

        has_more = bool(payload.get("hasMore"))
        next_cursor = payload.get("cursor")
        if has_more:
            if not isinstance(next_cursor, str) or not next_cursor:
                raise ValueError(f"{org}:sessions: hasMore returned without a cursor")
            cursor = next_cursor
        else:
            cursor = None

    if not discovered:
        raise ValueError(f"{org}: no archived sessions discovered from /api/sessions")
    return discovered[:limit]


def fetch_session_audit_response(
    *,
    base_url: str,
    org: str,
    session_id: str,
    bearer_token: str,
    page_limit: int,
) -> dict[str, Any]:
    entries: list[dict[str, Any]] = []
    offset = 0
    total: int | None = None
    token_usage: dict[str, Any] | None = None

    while total is None or offset < total:
        query = parse.urlencode({"limit": page_limit, "offset": offset})
        url = f"{base_url.rstrip('/')}/api/orgs/{parse.quote(org)}/sessions/{parse.quote(session_id)}/audit-log?{query}"
        payload = _json_request(url=url, bearer_token=bearer_token, context=session_id)
        response = validate_session_audit_log_response(payload, context=f"{session_id}:response")
        page_entries = response["entries"]
        entries.extend(page_entries)

        total = response["total"]
        token_usage = response.get("tokenUsage", token_usage)
        if len(page_entries) == 0:
            break
        offset += len(page_entries)

    if not entries:
        raise ValueError(f"{session_id}: no audit entries returned")
    aggregated = {
        "entries": entries,
        "total": total or len(entries),
        "limit": max(page_limit, len(entries)),
        "offset": 0,
    }
    if token_usage is not None:
        aggregated["tokenUsage"] = token_usage
    return validate_session_audit_log_response(aggregated, context=f"{session_id}:aggregated")


def fetch_session_archive_entries(
    *,
    base_url: str,
    session_id: str,
    bearer_token: str,
) -> list[dict[str, Any]]:
    url = f"{base_url.rstrip('/')}/api/sessions/{parse.quote(session_id)}/archive"
    text = _text_request(
        url=url,
        bearer_token=bearer_token,
        accept="application/x-ndjson, application/json",
        context=f"{session_id}:archive",
    )
    entries: list[dict[str, Any]] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{session_id}:archive:{line_number}: JSON parse error: {exc.msg}") from exc
        if not isinstance(item, dict):
            raise ValueError(f"{session_id}:archive:{line_number}: expected object")
        entries.append(item)
    if not entries:
        raise ValueError(f"{session_id}: archive returned no entries")
    return entries


def _policy_action_counts(entries: list[dict[str, Any]]) -> dict[str, int]:
    counts = Counter(str(entry["policyAction"]) for entry in entries)
    return {action: int(counts.get(action, 0)) for action in ("allowed", "denied", "audited")}


def _merge_token_usage(
    summaries: list[dict[str, Any]],
) -> dict[str, Any] | None:
    merged: dict[str, Any] | None = None
    for summary in summaries:
        token_usage = summary.get("token_usage")
        if not isinstance(token_usage, dict):
            continue
        if merged is None:
            merged = {
                "totalInputTokens": 0,
                "totalOutputTokens": 0,
                "estimatedCost": 0.0,
            }
        merged["totalInputTokens"] += int(token_usage["totalInputTokens"])
        merged["totalOutputTokens"] += int(token_usage["totalOutputTokens"])
        merged["estimatedCost"] += float(token_usage["estimatedCost"])
        if "actualCostUsd" in token_usage:
            merged["actualCostUsd"] = float(merged.get("actualCostUsd", 0.0)) + float(
                token_usage["actualCostUsd"]
            )
    return merged


def build_export_summary(
    *,
    base_url: str,
    org: str,
    application: str,
    dataset_ref: str,
    source_lane: str,
    reviewer_status: str,
    ratios: dict[str, int],
    session_summaries: list[dict[str, Any]],
    session_source_mode: str,
) -> dict[str, Any]:
    source_types = sorted({str(item["source_type"]) for item in session_summaries})
    resolved_source_type = source_types[0] if len(source_types) == 1 else MIXED_SOURCE_TYPE
    policy_action_counts = {
        "allowed": sum(int(item["policy_action_counts"]["allowed"]) for item in session_summaries),
        "denied": sum(int(item["policy_action_counts"]["denied"]) for item in session_summaries),
        "audited": sum(int(item["policy_action_counts"]["audited"]) for item in session_summaries),
    }
    totals = {
        "sessions": len(session_summaries),
        "entries": sum(int(item["entries"]) for item in session_summaries),
        "events": sum(int(item["events"]) for item in session_summaries),
        "policy_action_counts": policy_action_counts,
        "error_count": sum(int(item["error_count"]) for item in session_summaries),
    }
    merged_token_usage = _merge_token_usage(session_summaries)
    if merged_token_usage is not None:
        totals["token_usage"] = merged_token_usage

    return {
        "summary_version": EXPORT_SUMMARY_VERSION,
        "schema_ref": EXPORT_SUMMARY_SCHEMA_REF,
        "source_type": resolved_source_type,
        "source_types": source_types,
        "session_source_mode": session_source_mode,
        "base_url": base_url.rstrip("/"),
        "org": org,
        "application": application,
        "dataset_ref": dataset_ref,
        "source_lane": source_lane,
        "reviewer_status": reviewer_status,
        "split_ratios": ratios,
        "sessions": session_summaries,
        "totals": totals,
        "advisory_only": True,
        "physical_action_allowed": False,
        "hardware_commands_allowed": False,
    }


def export_dataset_from_sessions(
    *,
    base_url: str,
    org: str,
    session_ids: list[str],
    output_dir: Path,
    dataset_ref: str,
    application: str,
    source_lane: str,
    reviewer_status: str,
    ratios: dict[str, int],
    bearer_token: str,
    page_limit: int,
    session_source_mode: str,
    discovered_sessions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    all_events: list[dict[str, Any]] = []
    session_summaries: list[dict[str, Any]] = []
    discovered_by_id = {
        str(item["id"]): item for item in (discovered_sessions or []) if isinstance(item, dict) and isinstance(item.get("id"), str)
    }

    for session_id in session_ids:
        split = assign_split(session_id, ratios)
        session_metadata = discovered_by_id.get(session_id, {})
        response: dict[str, Any] | None = None
        source_type = AUDIT_SOURCE_TYPE
        try_audit = session_source_mode in {"auto", "session_audit_log"}
        if try_audit:
            try:
                response = fetch_session_audit_response(
                    base_url=base_url,
                    org=org,
                    session_id=session_id,
                    bearer_token=bearer_token,
                    page_limit=page_limit,
                )
                entries = response["entries"]
                events = convert_audit_entries(entries, split=split, application=application)
            except ValueError as exc:
                if session_source_mode != "auto":
                    raise
                response = None
                entries = []
                events = []
                source_type = ARCHIVE_SOURCE_TYPE
                fallback_error = str(exc)
            else:
                fallback_error = None
        else:
            entries = []
            events = []
            fallback_error = None
            source_type = ARCHIVE_SOURCE_TYPE

        if source_type == ARCHIVE_SOURCE_TYPE:
            archive_entries = fetch_session_archive_entries(
                base_url=base_url,
                session_id=session_id,
                bearer_token=bearer_token,
            )
            entries = archive_entries
            events = convert_archive_entries(
                archive_entries,
                split=split,
                application=application,
                org_name=org,
                session_id=session_id,
            )

        all_events.extend(events)
        session_summary = {
            "session_id": session_id,
            "source_type": source_type,
            "entries": len(entries),
            "events": len(events),
            "split": split,
            "policy_action_counts": {
                "allowed": sum(1 for event in events if event["outcome"]["decision"] == "clear_for_operator_review"),
                "denied": sum(1 for event in events if event["outcome"]["decision"] == "hold_for_operator_review"),
                "audited": 0,
            },
            "error_count": sum(
                1
                for entry in entries
                if isinstance(entry, dict)
                and (
                    entry.get("isError") is True
                    or entry.get("type") == "error"
                )
            ),
            "token_usage_present": response.get("tokenUsage") is not None if response else False,
            **({"token_usage": response["tokenUsage"]} if response and response.get("tokenUsage") is not None else {}),
            **({"status": session_metadata["status"]} if session_metadata.get("status") else {}),
            **({"name": session_metadata["name"]} if session_metadata.get("name") else {}),
            **({"project_context": session_metadata["projectContext"]} if session_metadata.get("projectContext") else {}),
            **({"created_at": session_metadata["createdAt"]} if session_metadata.get("createdAt") else {}),
        }
        if source_type == ARCHIVE_SOURCE_TYPE:
            event_archive = session_metadata.get("eventArchive")
            if isinstance(event_archive, dict):
                if event_archive.get("eventCount") is not None:
                    session_summary["archive_event_count"] = int(event_archive["eventCount"])
                if event_archive.get("storagePath"):
                    session_summary["archive_storage_path"] = str(event_archive["storagePath"])
                if event_archive.get("archivedAt"):
                    session_summary["archive_archived_at"] = str(event_archive["archivedAt"])
            if fallback_error:
                session_summary["fallback_reason"] = fallback_error
        session_summaries.append(session_summary)

    if not all_events:
        raise ValueError("no normalized events produced from the selected sessions")

    summary = build_dataset(
        all_events,
        output_dir,
        dataset_ref=dataset_ref,
        source_lane=source_lane,
        reviewer_status=reviewer_status,
    )
    export_summary = build_export_summary(
        base_url=base_url,
        org=org,
        application=application,
        dataset_ref=dataset_ref,
        source_lane=source_lane,
        reviewer_status=reviewer_status,
        ratios=ratios,
        session_summaries=session_summaries,
        session_source_mode=session_source_mode,
    )
    export_summary_path = output_dir / "gal-api-export-summary.json"
    export_summary_path.write_text(json.dumps(export_summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    summary["org"] = org
    summary["base_url"] = base_url.rstrip("/")
    summary["sessions"] = session_summaries
    summary["split_ratios"] = ratios
    summary["source_export_summary"] = export_summary_path.as_posix()
    return summary


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        ratios = validate_split_ratios(args.train_ratio, args.validation_ratio, args.test_ratio)
        bearer_token = os.getenv(args.token_env)
        if not bearer_token:
            raise ValueError(f"{args.token_env} is required in the environment")
        discovered_sessions: list[dict[str, Any]] | None = None
        session_ids = try_read_session_ids(args.session_id, args.session_ids_file)
        if not session_ids:
            discovered_sessions = discover_archived_sessions(
                base_url=args.base_url,
                org=args.org,
                bearer_token=bearer_token,
                limit=args.discover_limit,
            )
            session_ids = [str(item["id"]) for item in discovered_sessions]
        summary = export_dataset_from_sessions(
            base_url=args.base_url,
            org=args.org,
            session_ids=session_ids,
            output_dir=args.output_dir,
            dataset_ref=args.dataset_ref,
            application=args.application,
            source_lane=args.source_lane,
            reviewer_status=args.reviewer_status,
            ratios=ratios,
            bearer_token=bearer_token,
            page_limit=args.page_limit,
            session_source_mode=args.source,
            discovered_sessions=discovered_sessions,
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
