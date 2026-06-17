"""Benchmark an Anthropic-compatible LLM baseline on GAL runtime cases."""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .api_contract import parse_inference_request
from .runtime_benchmark import load_cases, percentile, ratio

DEFAULT_BASE_URL = "https://api.deepseek.com/anthropic"
DEFAULT_MODEL = "deepseek-chat"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--model", default=os.environ.get("LLM_BASELINE_MODEL", DEFAULT_MODEL))
    parser.add_argument("--base-url", default=os.environ.get("ANTHROPIC_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--api-key", default=os.environ.get("ANTHROPIC_API_KEY"))
    parser.add_argument("--max-cases", type=int, default=40)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--output", type=Path)
    return parser.parse_args(argv)


def sample_cases(
    cases: list[dict[str, Any]],
    *,
    max_cases: int,
    seed: int,
) -> list[dict[str, Any]]:
    if max_cases <= 0 or len(cases) <= max_cases:
        return list(cases)

    valid = [case for case in cases if bool(case.get("expected", {}).get("schema_valid", True))]
    invalid = [case for case in cases if not bool(case.get("expected", {}).get("schema_valid", True))]
    groups: dict[str, list[dict[str, Any]]] = {}
    for case in valid:
        decision = str(case.get("expected", {}).get("decision", ""))
        groups.setdefault(decision, []).append(case)

    rng = random.Random(seed)
    for items in groups.values():
        rng.shuffle(items)
    rng.shuffle(invalid)

    result: list[dict[str, Any]] = []
    if groups:
        target_valid = max(max_cases - len(invalid), 1)
        decisions = sorted(groups)
        per_group = max(1, target_valid // max(len(decisions), 1))
        for decision in decisions:
            result.extend(groups[decision][:per_group])

        leftovers = [case for decision in decisions for case in groups[decision][per_group:]]
        rng.shuffle(leftovers)
        remaining = max_cases - len(result) - min(len(invalid), max_cases - len(result))
        if remaining > 0:
            result.extend(leftovers[:remaining])

    slots_left = max_cases - len(result)
    if slots_left > 0:
        result.extend(invalid[:slots_left])
    return result[:max_cases]


def _extract_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    candidates = [stripped]
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidates.append(stripped[start : end + 1])
    for candidate in candidates:
        try:
            payload = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return payload
    raise ValueError(f"unable to extract JSON object from response: {text[:300]!r}")


def parse_baseline_response(text: str) -> dict[str, Any]:
    payload = _extract_json_object(text)
    decision = payload.get("decision")
    if decision not in {"clear_for_operator_review", "hold_for_operator_review"}:
        raise ValueError(f"unsupported decision {decision!r}")
    confidence = payload.get("confidence")
    if not isinstance(confidence, (int, float)):
        raise ValueError("confidence must be numeric")
    confidence_value = max(0.0, min(1.0, float(confidence)))
    escalate = payload.get("escalate_for_deeper_review")
    if escalate is None:
        escalate = decision == "hold_for_operator_review" or confidence_value < 0.75
    if not isinstance(escalate, bool):
        raise ValueError("escalate_for_deeper_review must be boolean")
    return {
        "decision": decision,
        "confidence": confidence_value,
        "escalate_for_deeper_review": escalate,
        "request_id": payload.get("request_id"),
        "application": payload.get("application"),
        "evidence_ref": payload.get("evidence_ref"),
    }


def build_prompt(request: dict[str, Any]) -> tuple[str, str]:
    system = (
        "You are benchmarking a governance sidecar for GAL. "
        "Given a structured inference request, return JSON only. "
        "Required keys: decision, confidence, escalate_for_deeper_review, request_id, application, evidence_ref. "
        "Decision must be one of clear_for_operator_review or hold_for_operator_review. "
        "Use hold_for_operator_review when evidence is incomplete, approvals are incomplete, "
        "operator review is required, or risk indicators suggest caution. "
        "Confidence must be a float in [0,1]."
    )
    user = json.dumps(request, sort_keys=True)
    return system, user


def _messages_endpoint(base_url: str) -> str:
    return base_url.rstrip("/") + "/v1/messages"


def call_anthropic_compatible(
    *,
    base_url: str,
    api_key: str,
    model: str,
    system: str,
    user: str,
) -> tuple[str, float]:
    body = {
        "model": model,
        "max_tokens": 256,
        "temperature": 0,
        "system": system,
        "messages": [
            {
                "role": "user",
                "content": [{"type": "text", "text": user}],
            }
        ],
    }
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        _messages_endpoint(base_url),
        data=data,
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body_preview = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"baseline endpoint returned {exc.code}: {body_preview}") from exc
    latency_ms = (time.perf_counter() - started) * 1000.0
    content = payload.get("content")
    if not isinstance(content, list):
        raise ValueError("baseline response content must be a list")
    parts = []
    for item in content:
        if isinstance(item, dict) and item.get("type") == "text" and isinstance(item.get("text"), str):
            parts.append(item["text"])
    if not parts:
        raise ValueError("baseline response did not include text content")
    return "".join(parts).strip(), latency_ms


def run_baseline(
    cases: list[dict[str, Any]],
    *,
    base_url: str,
    api_key: str,
    model: str,
) -> dict[str, Any]:
    errors: list[str] = []
    case_results: list[dict[str, Any]] = []
    latency_values: list[float] = []
    expected_clear = 0
    expected_hold = 0
    false_clear = 0
    false_hold = 0
    true_hold = 0
    predicted_escalations = 0
    correct_escalations = 0
    audit_required = 0
    audit_present = 0
    valid_cases = 0
    invalid_cases = 0
    schema_rejections = 0

    for case in cases:
        case_id = str(case["case_id"])
        expected = case["expected"]
        should_be_valid = bool(expected.get("schema_valid", True))
        try:
            request = parse_inference_request(case["request"])
        except ValueError as exc:
            if should_be_valid:
                errors.append(f"{case_id}: valid request rejected locally: {exc}")
                case_results.append({"case_id": case_id, "passed": False, "error": str(exc)})
            else:
                invalid_cases += 1
                schema_rejections += 1
                case_results.append({"case_id": case_id, "schema_rejected": True, "passed": True})
            continue

        if not should_be_valid:
            invalid_cases += 1
            errors.append(f"{case_id}: invalid request was accepted locally")
            case_results.append({"case_id": case_id, "schema_rejected": False, "passed": False})
            continue

        valid_cases += 1
        expected_decision = str(expected["decision"])
        if expected_decision == "clear_for_operator_review":
            expected_clear += 1
        elif expected_decision == "hold_for_operator_review":
            expected_hold += 1
        else:
            errors.append(f"{case_id}: unsupported expected decision {expected_decision!r}")
            continue

        system, user = build_prompt(request)
        try:
            raw_text, latency_ms = call_anthropic_compatible(
                base_url=base_url,
                api_key=api_key,
                model=model,
                system=system,
                user=user,
            )
            prediction = parse_baseline_response(raw_text)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{case_id}: baseline failed: {exc}")
            case_results.append({"case_id": case_id, "passed": False, "error": str(exc)})
            continue

        latency_values.append(latency_ms)
        decision = str(prediction["decision"])
        confidence = float(prediction["confidence"])
        predicted_escalation = bool(prediction["escalate_for_deeper_review"])

        if expected_decision == "hold_for_operator_review" and decision == "clear_for_operator_review":
            false_clear += 1
        if expected_decision == "clear_for_operator_review" and decision == "hold_for_operator_review":
            false_hold += 1
        if expected_decision == "hold_for_operator_review" and decision == "hold_for_operator_review":
            true_hold += 1

        expected_escalation = expected.get("escalate_for_deeper_review")
        if isinstance(expected_escalation, bool) and predicted_escalation:
            predicted_escalations += 1
            if expected_escalation:
                correct_escalations += 1
        elif predicted_escalation:
            predicted_escalations += 1

        for field in expected.get("required_audit_fields", ["request_id", "application", "evidence_ref"]):
            if not isinstance(field, str):
                continue
            audit_required += 1
            value = prediction.get(field)
            if isinstance(value, str) and value:
                audit_present += 1

        case_results.append(
            {
                "case_id": case_id,
                "expected_decision": expected_decision,
                "decision": decision,
                "confidence": round(confidence, 6),
                "escalate_for_deeper_review": predicted_escalation,
                "latency_ms": round(latency_ms, 6),
                "passed": decision == expected_decision,
            }
        )

    false_clear_rate = ratio(false_clear, expected_hold)
    false_hold_rate = ratio(false_hold, expected_clear)
    operator_review_recall = ratio(true_hold, expected_hold)
    escalation_precision = ratio(correct_escalations, predicted_escalations, default=1.0)
    schema_rejection_rate = ratio(schema_rejections, invalid_cases, default=1.0)
    audit_metadata_completeness = ratio(audit_present, audit_required, default=1.0)
    passed_cases = sum(1 for case in case_results if case.get("passed") is True)

    return {
        "benchmark": "gal_native_runtime_governance_llm_baseline",
        "baseline_type": "anthropic_compatible_llm",
        "base_url": base_url,
        "model": model,
        "cases": len(cases),
        "valid_cases": valid_cases,
        "invalid_cases": invalid_cases,
        "accuracy": ratio(passed_cases, valid_cases),
        "false_clear_count": false_clear,
        "false_clear_rate": false_clear_rate,
        "false_hold_count": false_hold,
        "false_hold_rate": false_hold_rate,
        "operator_review_recall": operator_review_recall,
        "escalation_precision": escalation_precision,
        "schema_rejection_rate": schema_rejection_rate,
        "audit_metadata_completeness": audit_metadata_completeness,
        "p50_latency_ms": percentile(latency_values, 50.0),
        "p95_latency_ms": percentile(latency_values, 95.0),
        "case_results": case_results,
        "errors": errors,
        "advisory_only": True,
        "physical_action_allowed": False,
        "hardware_commands_allowed": False,
    }


def console_main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    if not args.api_key:
        print("ANTHROPIC_API_KEY or --api-key is required", file=sys.stderr)
        return 2
    cases = sample_cases(load_cases(args.cases), max_cases=args.max_cases, seed=args.seed)
    result = run_baseline(cases, base_url=args.base_url, api_key=args.api_key, model=args.model)
    output = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
    sys.stdout.write(output)
    return 0 if not result["errors"] else 1


if __name__ == "__main__":
    raise SystemExit(console_main())
