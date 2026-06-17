"""Corpus builder: orchestrates the full curation pipeline.

Stages:
1. Collection (adapters pull raw data)
2. Deduplication (exact + feature + cross-source)
3. Quality filtering (heuristic + signal density + label audit)
4. Label aggregation (Snorkel label model)
5. Mixing (weighted interleave across sources)
6. Versioning (content-hash + manifest)

Output: a versioned, manifest-backed governance corpus ready for training.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .dedup import cross_source_dedup, deduplicate_events
from .label_model import label_model_pipeline
from .quality_filter import filter_pipeline
from .source_registry import build_registry

CORPUS_VERSION = "v0.2-dev"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-map", type=Path, help="JSON file mapping source_id -> file path")
    parser.add_argument("--source", action="append", dest="sources", default=[],
                        help="source_id=path pairs (repeatable)")
    parser.add_argument("--output-dir", type=Path, default=Path("data/curated/corpus"))
    parser.add_argument("--corpus-ref", default=f"gal-dataset://governance-decision/{CORPUS_VERSION}")
    parser.add_argument("--skip-dedup", action="store_true")
    parser.add_argument("--skip-filter", action="store_true")
    parser.add_argument("--skip-label-model", action="store_true")
    return parser.parse_args(argv)


def _load_events(path: Path, *, source_id: str = "") -> list[dict[str, Any]]:
    raw = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if source_id:
        raw = [_normalize_event(e, source_id) for e in raw]
    return raw


def _normalize_event(event: dict[str, Any], source_id: str) -> dict[str, Any]:
    """Normalize heterogeneous source formats into the common audit event schema.

    Session exports have: example_id, features, label
    GitHub adapter has: event_id, features, outcome, application, evidence_ref, split
    Training examples have: example_id, features, label
    """
    normalized: dict[str, Any] = {}

    # event_id
    normalized["event_id"] = event.get("event_id") or event.get("example_id") or f"{source_id}-unknown"

    # features (universal across all formats)
    normalized["features"] = event.get("features", {})

    # outcome / label
    if "outcome" in event:
        normalized["outcome"] = event["outcome"]
    elif "label" in event:
        normalized["outcome"] = {
            "decision": event["label"],
            "escalate_for_deeper_review": event["label"] == "hold_for_operator_review",
        }

    # metadata fields
    normalized["application"] = event.get("application", source_id)
    normalized["evidence_ref"] = event.get("evidence_ref", f"{source_id}://{normalized['event_id']}")
    normalized["split"] = event.get("split", "train")
    if "title" in event:
        normalized["title"] = event["title"]

    return normalized


def _write_events(events: list[dict[str, Any]], path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for e in events:
            f.write(json.dumps(e, sort_keys=True) + "\n")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _parse_source_map(args: argparse.Namespace) -> dict[str, Path]:
    """Resolve source files from CLI args, JSON map file, or auto-discovery."""
    # 1. Explicit source map file
    if args.source_map and args.source_map.exists():
        raw = json.loads(args.source_map.read_text(encoding="utf-8"))
        return {k: Path(v) for k, v in raw.items()}

    # 2. --source key=path pairs
    if args.sources:
        result: dict[str, Path] = {}
        for pair in args.sources:
            if "=" in pair:
                key, path_str = pair.split("=", 1)
                result[key.strip()] = Path(path_str.strip())
            else:
                path = Path(pair)
                key = path.stem.replace("_events", "").replace("_combined", "").replace("_enriched", "")
                result[key] = path
        return result

    # 3. Auto-discovery
    result: dict[str, Path] = {}
    session_train = Path("artifacts/gal-api-session-export-gal-run-live-100/train.jsonl")
    if session_train.exists():
        result["gal_session_exports"] = session_train
    gh_events = Path("tmp/live-github-pr-combined-events.jsonl")
    if gh_events.exists():
        result["github_pr_reviews"] = gh_events
    return result


def build_corpus(
    source_files: dict[str, Path],
    output_dir: Path,
    corpus_ref: str,
    *,
    skip_dedup: bool = False,
    skip_filter: bool = False,
    skip_label_model: bool = False,
) -> dict[str, Any]:
    """Run the full curation pipeline. Returns a build manifest."""
    registry = build_registry()
    output_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).isoformat()
    pipeline_log: list[dict[str, Any]] = []

    # ── Stage 1: Load and normalize all events ──
    all_events: dict[str, list[dict[str, Any]]] = {}
    total_raw = 0
    for source_id, path in source_files.items():
        if path.exists():
            events = _load_events(path, source_id=source_id)
            all_events[source_id] = events
            total_raw += len(events)

    if not all_events:
        return {"error": "No source files found", "sources_checked": list(source_files.values())}

    # ── Stage 2: Dedup ──
    if not skip_dedup:
        dedup_dir = output_dir / "stage-1-dedup"
        dedup_stats = cross_source_dedup(source_files, output_dir=dedup_dir)
        pipeline_log.append({"stage": "dedup", "stats": dedup_stats})
        # Reload deduped (re-normalize since deduped files contain raw events)
        all_events = {}
        for source_id in source_files:
            deduped_path = dedup_dir / f"{source_id}_deduped.jsonl"
            if deduped_path.exists():
                all_events[source_id] = _load_events(deduped_path, source_id=source_id)

    # ── Stage 3: Flatten and filter ──
    flattened: list[dict[str, Any]] = []
    for source_id, events in all_events.items():
        for e in events:
            e["_source_id"] = source_id
            flattened.append(e)

    if not skip_filter:
        flattened, filter_logs = filter_pipeline(flattened)
        pipeline_log.append({"stage": "quality_filter", "logs": filter_logs})

    # ── Stage 4: Label aggregation ──
    if not skip_label_model:
        all_lfs = []
        for src in registry.values():
            all_lfs.extend(src.labeling_functions)

        if all_lfs:
            label_result = label_model_pipeline(flattened, all_lfs)
            pipeline_log.append({
                "stage": "label_model",
                "lf_stats": label_result["lf_stats"],
                "decision_distribution": label_result["decision_distribution"],
                "high_confidence_pct": label_result.get("high_confidence_pct"),
                "low_confidence_pct": label_result.get("low_confidence_pct"),
                "average_confidence": label_result["average_confidence"],
            })
            # Attach probabilistic labels
            for ex, agg in zip(flattened, label_result["aggregated"]):
                ex["probabilistic_label"] = agg

    # ── Stage 4.5: Convert to training format ──
    for e in flattened:
        e.setdefault("example_id", e.get("event_id", f"unknown"))
        pl = e.get("probabilistic_label", {})
        if "label" not in e:
            e["label"] = pl.get("decision", e.get("outcome", {}).get("decision", "hold_for_operator_review"))

    # ── Stage 5: Split and write ──
    splits: dict[str, list[dict[str, Any]]] = {"train": [], "validation": [], "test": []}
    for e in flattened:
        split = e.get("split", "train")
        if split not in splits:
            split = "train"
        splits[split].append(e)

    hashes: dict[str, str] = {}
    label_counts: dict[str, dict[str, int]] = {}
    for split_name, events in splits.items():
        path = output_dir / f"{split_name}.jsonl"
        hashes[split_name] = _write_events(events, path)
        label_counts[split_name] = dict(Counter(
            e.get("probabilistic_label", {}).get("decision", "unknown") for e in events
        ))
        label_counts[split_name]["total"] = len(events)

    # ── Stage 6: Write manifest ──
    total_labeled = sum(v["total"] for v in label_counts.values())
    source_breakdown: dict[str, int] = Counter(e.get("_source_id", "unknown") for e in flattened)

    manifest = {
        "corpus_ref": corpus_ref,
        "corpus_version": CORPUS_VERSION,
        "build_timestamp": timestamp,
        "total_examples": total_labeled,
        "total_raw_input": total_raw,
        "sources": {
            sid: {
                "display_name": registry[sid].display_name if sid in registry else sid,
                "count": source_breakdown.get(sid, 0),
                "label_type": registry[sid].metadata.get("label_type", "unknown") if sid in registry else "unknown",
            }
            for sid in source_breakdown
        },
        "splits": {
            name: {
                "path": f"{name}.jsonl",
                "rows": info["total"],
                "label_counts": {k: v for k, v in info.items() if k != "total"},
                "sha256": hashes[name],
            }
            for name, info in label_counts.items()
        },
        "pipeline_log": pipeline_log,
        "label_quality": {
            "high_confidence_pct": pipeline_log[-1].get("high_confidence_pct") if pipeline_log else None,
            "low_confidence_pct": pipeline_log[-1].get("low_confidence_pct") if pipeline_log else None,
            "total_labeling_functions": sum(len(src.labeling_functions) for src in registry.values()),
            "active_sources": len(source_breakdown),
        },
    }

    manifest_path = output_dir / "corpus-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True))

    return manifest


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    source_files = _parse_source_map(args)

    if not source_files:
        print("No source files found. Provide --source-files or --source-map.", file=sys.stderr)
        print("Auto-discovered sources:", file=sys.stderr)
        discovered = _parse_source_map(None, None)
        for sid, path in discovered.items():
            print(f"  {sid}: {path} (exists: {path.exists()})", file=sys.stderr)
        return 2

    print(f"Building corpus from {len(source_files)} sources:", file=sys.stderr)
    for sid, path in source_files.items():
        print(f"  {sid}: {path}", file=sys.stderr)

    manifest = build_corpus(
        source_files=source_files,
        output_dir=args.output_dir,
        corpus_ref=args.corpus_ref,
        skip_dedup=args.skip_dedup,
        skip_filter=args.skip_filter,
        skip_label_model=args.skip_label_model,
    )

    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0 if "error" not in manifest else 1


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
