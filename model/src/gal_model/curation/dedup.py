"""Deduplication for governance events across heterogeneous sources.

Three levels:
1. Exact — identical event_id or evidence_ref
2. Feature-vector — same 8-feature vector within floating-point tolerance
3. Cross-source — same evidence appears in multiple sources (e.g., same PR in GitHub adapter AND session export)
"""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from pathlib import Path
from typing import Any


def _feature_hash(features: dict[str, Any]) -> str:
    ordered = {k: features.get(k, 0) for k in sorted(features)}
    for k, v in ordered.items():
        if isinstance(v, float):
            ordered[k] = round(v, 6)
    return hashlib.sha256(json.dumps(ordered, sort_keys=True).encode()).hexdigest()[:16]


def _event_id_hash(event: dict[str, Any]) -> str:
    eid = event.get("event_id", "")
    ref = event.get("evidence_ref", "")
    return hashlib.sha256(f"{eid}|{ref}".encode()).hexdigest()[:16]


def deduplicate_events(
    events: list[dict[str, Any]],
    *,
    on_id: bool = True,
    on_features: bool = True,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    stats: dict[str, Any] = {
        "input_count": len(events),
        "removed_exact_id": 0,
        "removed_feature_dup": 0,
        "output_count": len(events),
    }
    if not events:
        return events, stats

    if on_id:
        seen_ids: set[str] = set()
        unique: list[dict[str, Any]] = []
        for e in events:
            h = _event_id_hash(e)
            if h in seen_ids:
                stats["removed_exact_id"] += 1
                continue
            seen_ids.add(h)
            unique.append(e)
        events = unique

    if on_features:
        seen_features: set[str] = set()
        unique = []
        for e in events:
            fh = _feature_hash(e.get("features", {}))
            if fh in seen_features:
                stats["removed_feature_dup"] += 1
                continue
            seen_features.add(fh)
            unique.append(e)
        events = unique

    stats["output_count"] = len(events)
    return events, stats


def cross_source_dedup(
    source_files: dict[str, Path],
    *,
    output_dir: Path,
) -> dict[str, Any]:
    """Deduplicate events across multiple source files."""
    output_dir.mkdir(parents=True, exist_ok=True)
    stats: dict[str, Any] = {"sources": {}, "cross_source_duplicates": 0}

    source_priority = ["gal_session_exports", "gal_session_archive", "gal_code_governance", "github_pr_reviews"]

    global_ids: dict[str, str] = {}
    all_events: dict[str, list[dict[str, Any]]] = {}

    for source_id, path in source_files.items():
        if not path.exists():
            continue
        events = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
        all_events[source_id] = events

    # Process in priority order
    for source_id in source_priority:
        if source_id not in all_events:
            continue
        kept = []
        for e in all_events[source_id]:
            h = _event_id_hash(e)
            if h in global_ids and global_ids[h] != source_id:
                stats["cross_source_duplicates"] += 1
                existing_priority = source_priority.index(global_ids[h]) if global_ids[h] in source_priority else 999
                if source_priority.index(source_id) < existing_priority:
                    global_ids[h] = source_id
                continue
            global_ids[h] = source_id
            kept.append(e)
        stats["sources"][source_id] = {
            "input": len(all_events[source_id]),
            "output": len(kept),
            "removed": len(all_events[source_id]) - len(kept),
        }

    # Handle remaining sources
    for source_id in all_events:
        if source_id in source_priority and source_id in stats["sources"]:
            continue
        kept = []
        for e in all_events[source_id]:
            h = _event_id_hash(e)
            if h in global_ids:
                stats["cross_source_duplicates"] += 1
                continue
            global_ids[h] = source_id
            kept.append(e)
        stats["sources"][source_id] = {
            "input": len(all_events[source_id]),
            "output": len(kept),
            "removed": len(all_events[source_id]) - len(kept),
        }

    # Write deduplicated output
    for source_id in all_events:
        out_path = output_dir / f"{source_id}_deduped.jsonl"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        kept = [
            e for e in all_events[source_id]
            if _event_id_hash(e) in global_ids and global_ids[_event_id_hash(e)] == source_id
        ]
        with out_path.open("w", encoding="utf-8") as f:
            for e in kept:
                f.write(json.dumps(e, sort_keys=True) + "\n")

    return stats
