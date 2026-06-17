"""Compare two runtime benchmark result files on the same case set."""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--left", type=Path, required=True)
    parser.add_argument("--right", type=Path, required=True)
    parser.add_argument("--left-label", default="left")
    parser.add_argument("--right-label", default="right")
    parser.add_argument("--output", type=Path)
    return parser.parse_args(argv)


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _decision_match_rate(payload: dict[str, Any]) -> float | None:
    case_results = payload.get("case_results")
    if not isinstance(case_results, list):
        return None
    judged = [
        item for item in case_results
        if isinstance(item, dict) and isinstance(item.get("expected_decision"), str)
    ]
    if not judged:
        return None
    passed = sum(1 for item in judged if bool(item.get("passed")))
    return passed / len(judged)


def _extract_summary(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "benchmark": payload.get("benchmark"),
        "cases": payload.get("cases"),
        "decision_match_rate": _decision_match_rate(payload),
        "false_clear_rate": payload.get("false_clear_rate"),
        "false_hold_rate": payload.get("false_hold_rate"),
        "operator_review_recall": payload.get("operator_review_recall"),
        "escalation_precision": payload.get("escalation_precision"),
        "p50_latency_ms": payload.get("p50_latency_ms"),
        "p95_latency_ms": payload.get("p95_latency_ms"),
        "errors": len(payload.get("errors", [])) if isinstance(payload.get("errors"), list) else None,
    }


def _is_valid_for_latency(summary: dict[str, Any]) -> bool:
    errors = summary.get("errors")
    p50 = _to_float(summary.get("p50_latency_ms"))
    p95 = _to_float(summary.get("p95_latency_ms"))
    return errors == 0 and p50 is not None and p95 is not None and p50 > 0 and p95 > 0


def _latency_ratio(faster: float | None, slower: float | None) -> float | None:
    if faster is None or slower is None or faster <= 0:
        return None
    return slower / faster


def _to_float(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not math.isnan(float(value)):
        return float(value)
    return None


def compare_payloads(
    left_payload: dict[str, Any],
    right_payload: dict[str, Any],
    *,
    left_label: str,
    right_label: str,
) -> dict[str, Any]:
    left = _extract_summary(left_payload)
    right = _extract_summary(right_payload)
    left_p50 = _to_float(left["p50_latency_ms"])
    left_p95 = _to_float(left["p95_latency_ms"])
    right_p50 = _to_float(right["p50_latency_ms"])
    right_p95 = _to_float(right["p95_latency_ms"])
    left_latency_valid = _is_valid_for_latency(left)
    right_latency_valid = _is_valid_for_latency(right)

    faster_label = None
    slower_label = None
    if left_latency_valid and right_latency_valid and left_p50 is not None and right_p50 is not None and left_p50 != right_p50:
        faster_label = left_label if left_p50 < right_p50 else right_label
        slower_label = right_label if faster_label == left_label else left_label

    return {
        "left_label": left_label,
        "right_label": right_label,
        left_label: left,
        right_label: right,
        "latency_ratio_p50": (
            _latency_ratio(min(left_p50, right_p50), max(left_p50, right_p50))
            if left_latency_valid and right_latency_valid and left_p50 is not None and right_p50 is not None and left_p50 != right_p50
            else 1.0 if left_latency_valid and right_latency_valid and left_p50 is not None and right_p50 is not None else None
        ),
        "latency_ratio_p95": (
            _latency_ratio(min(left_p95, right_p95), max(left_p95, right_p95))
            if left_latency_valid and right_latency_valid and left_p95 is not None and right_p95 is not None and left_p95 != right_p95
            else 1.0 if left_latency_valid and right_latency_valid and left_p95 is not None and right_p95 is not None else None
        ),
        "faster_label": faster_label,
        "slower_label": slower_label,
    }


def console_main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    summary = compare_payloads(
        _load_json(args.left),
        _load_json(args.right),
        left_label=args.left_label,
        right_label=args.right_label,
    )
    output = json.dumps(summary, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
    sys.stdout.write(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(console_main())
