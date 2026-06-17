"""Run the GAL-native runtime governance benchmark."""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path
from typing import Any

import torch

from .api_contract import build_inference_response, parse_inference_request
from .checkpoint import load_model_from_checkpoint
from .constants import INDEX_TO_LABEL
from .device import VALID_DEVICE_CHOICES, resolve_device, synchronize_device
from .features import encode_features


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--max-false-clear-rate", type=float, default=1.0)
    parser.add_argument("--max-false-hold-rate", type=float, default=1.0)
    parser.add_argument("--min-operator-review-recall", type=float, default=0.0)
    parser.add_argument("--min-escalation-precision", type=float, default=0.0)
    parser.add_argument("--max-p95-latency-ms", type=float, default=1000.0)
    parser.add_argument("--min-schema-rejection-rate", type=float, default=0.0)
    parser.add_argument("--min-audit-metadata-completeness", type=float, default=0.0)
    parser.add_argument("--device", choices=VALID_DEVICE_CHOICES, default="cpu")
    parser.add_argument("--warmup-iterations", type=int, default=5)
    return parser.parse_args(argv)


def load_cases(path: Path) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            case = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{line_number}: JSON parse error: {exc.msg}") from exc
        if not isinstance(case, dict):
            raise ValueError(f"{path}:{line_number}: expected object")
        if not isinstance(case.get("case_id"), str):
            raise ValueError(f"{path}:{line_number}: case_id is required")
        if not isinstance(case.get("request"), dict):
            raise ValueError(f"{path}:{line_number}: request object is required")
        if not isinstance(case.get("expected"), dict):
            raise ValueError(f"{path}:{line_number}: expected object is required")
        cases.append(case)
    if not cases:
        raise ValueError(f"{path}: no benchmark cases found")
    return cases


def ratio(numerator: int, denominator: int, *, default: float = 0.0) -> float:
    return round(numerator / denominator, 6) if denominator else default


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(math.ceil((pct / 100.0) * len(ordered)) - 1, len(ordered) - 1))
    return round(ordered[index], 6)


def _expected_schema_valid(expected: dict[str, Any]) -> bool:
    value = expected.get("schema_valid", True)
    if not isinstance(value, bool):
        raise ValueError("expected.schema_valid must be boolean")
    return value


def run_benchmark(
    model: torch.nn.Module,
    checkpoint: dict[str, Any],
    cases: list[dict[str, Any]],
    *,
    device: torch.device,
    warmup_iterations: int = 5,
) -> dict[str, Any]:
    errors: list[str] = []
    case_results: list[dict[str, Any]] = []
    latency_values: list[float] = []

    valid_cases = 0
    invalid_cases = 0
    schema_rejections = 0
    expected_clear = 0
    expected_hold = 0
    false_clear = 0
    false_hold = 0
    true_hold = 0
    predicted_escalations = 0
    correct_escalations = 0
    audit_required = 0
    audit_present = 0
    warmed_up = False

    for case in cases:
        case_id = str(case["case_id"])
        expected = case["expected"]
        if not isinstance(expected, dict):
            errors.append(f"{case_id}: expected must be an object")
            continue

        should_be_valid = _expected_schema_valid(expected)
        try:
            request = parse_inference_request(case["request"])
        except ValueError as exc:
            if should_be_valid:
                errors.append(f"{case_id}: valid request rejected: {exc}")
            else:
                invalid_cases += 1
                schema_rejections += 1
                case_results.append({"case_id": case_id, "schema_rejected": True, "passed": True})
            continue

        if not should_be_valid:
            invalid_cases += 1
            errors.append(f"{case_id}: invalid request was accepted")
            case_results.append({"case_id": case_id, "schema_rejected": False, "passed": False})
            continue

        expected_decision = expected.get("decision")
        if not isinstance(expected_decision, str):
            errors.append(f"{case_id}: expected.decision is required for valid cases")
            continue

        valid_cases += 1
        if expected_decision == "clear_for_operator_review":
            expected_clear += 1
        elif expected_decision == "hold_for_operator_review":
            expected_hold += 1
        else:
            errors.append(f"{case_id}: unsupported expected decision {expected_decision!r}")
            continue

        tensor = torch.tensor([encode_features(request["features"])], dtype=torch.float32, device=device)
        if not warmed_up:
            with torch.no_grad():
                for _ in range(max(warmup_iterations, 1)):
                    warmup_logits = model(tensor)
                    warmup_probabilities = torch.softmax(warmup_logits, dim=1)[0]
                    torch.argmax(warmup_probabilities).item()
            synchronize_device(device)
            warmed_up = True
        synchronize_device(device)
        started = time.perf_counter()
        with torch.no_grad():
            logits = model(tensor)
            probabilities = torch.softmax(logits, dim=1)[0]
            index = int(torch.argmax(probabilities).item())
        synchronize_device(device)
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        latency_values.append(elapsed_ms)

        decision = INDEX_TO_LABEL[index]
        response = build_inference_response(
            request,
            checkpoint,
            decision=decision,
            confidence=float(probabilities[index].item()),
        )

        if expected_decision == "hold_for_operator_review" and decision == "clear_for_operator_review":
            false_clear += 1
        if expected_decision == "clear_for_operator_review" and decision == "hold_for_operator_review":
            false_hold += 1
        if expected_decision == "hold_for_operator_review" and decision == "hold_for_operator_review":
            true_hold += 1

        expected_escalation = expected.get("escalate_for_deeper_review")
        if expected_escalation is not None and not isinstance(expected_escalation, bool):
            errors.append(f"{case_id}: expected.escalate_for_deeper_review must be boolean")
            expected_escalation = None
        predicted_escalation = bool(response["escalate_for_deeper_review"])
        if predicted_escalation:
            predicted_escalations += 1
            if expected_escalation is True:
                correct_escalations += 1

        required_audit_fields = expected.get(
            "required_audit_fields",
            ["request_id", "application", "evidence_ref"],
        )
        if not isinstance(required_audit_fields, list) or not all(
            isinstance(item, str) for item in required_audit_fields
        ):
            errors.append(f"{case_id}: expected.required_audit_fields must be a string array")
            required_audit_fields = []
        for field in required_audit_fields:
            audit_required += 1
            if isinstance(response.get(field), str) and response[field]:
                audit_present += 1

        case_results.append(
            {
                "case_id": case_id,
                "expected_decision": expected_decision,
                "decision": decision,
                "confidence": response["confidence"],
                "escalate_for_deeper_review": predicted_escalation,
                "latency_ms": round(elapsed_ms, 6),
                "passed": decision == expected_decision,
            }
        )

    false_clear_rate = ratio(false_clear, expected_hold)
    false_hold_rate = ratio(false_hold, expected_clear)
    operator_review_recall = ratio(true_hold, expected_hold)
    escalation_precision = ratio(correct_escalations, predicted_escalations, default=1.0)
    schema_rejection_rate = ratio(schema_rejections, invalid_cases, default=1.0)
    audit_metadata_completeness = ratio(audit_present, audit_required, default=1.0)

    return {
        "benchmark": "gal_native_runtime_governance",
        "model_ref": checkpoint["model_ref"],
        "architecture": checkpoint.get("architecture", "mlp"),
        "cases": len(cases),
        "warmup_iterations": max(warmup_iterations, 1),
        "valid_cases": valid_cases,
        "invalid_cases": invalid_cases,
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
        "device": str(device),
    }


def apply_thresholds(result: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    checks = {
        "max_false_clear_rate": result["false_clear_rate"] <= args.max_false_clear_rate,
        "max_false_hold_rate": result["false_hold_rate"] <= args.max_false_hold_rate,
        "min_operator_review_recall": result["operator_review_recall"] >= args.min_operator_review_recall,
        "min_escalation_precision": result["escalation_precision"] >= args.min_escalation_precision,
        "max_p95_latency_ms": result["p95_latency_ms"] <= args.max_p95_latency_ms,
        "min_schema_rejection_rate": result["schema_rejection_rate"] >= args.min_schema_rejection_rate,
        "min_audit_metadata_completeness": (
            result["audit_metadata_completeness"] >= args.min_audit_metadata_completeness
        ),
        "no_case_errors": not result["errors"],
    }
    result["thresholds"] = {
        "max_false_clear_rate": args.max_false_clear_rate,
        "max_false_hold_rate": args.max_false_hold_rate,
        "min_operator_review_recall": args.min_operator_review_recall,
        "min_escalation_precision": args.min_escalation_precision,
        "max_p95_latency_ms": args.max_p95_latency_ms,
        "min_schema_rejection_rate": args.min_schema_rejection_rate,
        "min_audit_metadata_completeness": args.min_audit_metadata_completeness,
    }
    result["checks"] = checks
    result["passed"] = all(checks.values())
    return result


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    runtime_device = resolve_device(args.device)
    model, checkpoint = load_model_from_checkpoint(args.model, device=args.device)
    cases = load_cases(args.cases)
    result = apply_thresholds(
        run_benchmark(
            model,
            checkpoint,
            cases,
            device=runtime_device,
            warmup_iterations=args.warmup_iterations,
        ),
        args,
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["passed"] else 1


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
