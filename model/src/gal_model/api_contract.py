"""Application-facing inference contract helpers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .constants import MODEL_REF
from .dataset import validate_feature_payload

INFERENCE_REQUEST_SCHEMA_REF = "https://gal.run/schemas/model/inference-request.schema.json"
INFERENCE_RESPONSE_SCHEMA_REF = "https://gal.run/schemas/model/inference-response.schema.json"


def parse_inference_request(payload: dict[str, Any]) -> dict[str, Any]:
    """Parse an application inference request.

    A bare feature object is accepted for local smoke-test compatibility.
    Real integrations should send the wrapped contract with request metadata.
    """
    if not isinstance(payload, dict):
        raise ValueError("inference request must be a JSON object")

    if "features" in payload:
        features = payload["features"]
        request = dict(payload)
    else:
        features = payload
        request = {"features": features}

    if not isinstance(features, dict):
        raise ValueError("inference request features must be an object")
    validate_feature_payload(features, context="inference request")

    model_ref = request.get("model_ref", MODEL_REF)
    if model_ref != MODEL_REF:
        raise ValueError(f"inference request model_ref {model_ref!r} does not match {MODEL_REF!r}")
    request["model_ref"] = model_ref

    for key in ("request_id", "application", "evidence_ref"):
        value = request.get(key)
        if value is not None and not isinstance(value, str):
            raise ValueError(f"inference request {key} must be a string")

    schema_ref = request.get("schema_ref")
    if schema_ref is not None and schema_ref != INFERENCE_REQUEST_SCHEMA_REF:
        raise ValueError(
            f"inference request schema_ref {schema_ref!r} does not match {INFERENCE_REQUEST_SCHEMA_REF!r}"
        )
    request.setdefault("schema_ref", INFERENCE_REQUEST_SCHEMA_REF)
    return request


def load_inference_request(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return parse_inference_request(payload)


def confidence_bucket(confidence: float) -> str:
    if confidence >= 0.9:
        return "high"
    if confidence >= 0.75:
        return "medium"
    return "low"


def build_inference_response(
    request: dict[str, Any],
    checkpoint: dict[str, Any],
    *,
    decision: str,
    confidence: float,
) -> dict[str, Any]:
    response: dict[str, Any] = {
        "schema_ref": INFERENCE_RESPONSE_SCHEMA_REF,
        "model_ref": checkpoint.get("model_ref", MODEL_REF),
        "architecture": checkpoint.get("architecture", "mlp"),
        "decision": decision,
        "confidence": round(confidence, 6),
        "calibration_bucket": confidence_bucket(confidence),
        "escalate_for_deeper_review": decision == "hold_for_operator_review" or confidence < 0.75,
        "policy_findings": [],
        "advisory_only": True,
        "physical_action_allowed": False,
        "hardware_commands_issued": False,
    }
    for key in ("request_id", "application", "evidence_ref"):
        value = request.get(key)
        if value is not None:
            response[key] = value
    return response
