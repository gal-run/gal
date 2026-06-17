"""Validation helpers for GAL session audit log payloads."""

from __future__ import annotations

from typing import Any

SESSION_AUDIT_LOG_RESPONSE_SCHEMA_REF = (
    "https://gal.run/schemas/model/session-audit-log-response.schema.json"
)
VALID_POLICY_ACTIONS = ("allowed", "denied", "audited")


def _require_string(value: Any, *, field: str, context: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{context}: {field} must be a non-empty string")
    return value


def _optional_string(value: Any, *, field: str, context: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError(f"{context}: {field} must be a string when provided")
    return value


def _require_bool(value: Any, *, field: str, context: str) -> bool:
    if not isinstance(value, bool):
        raise ValueError(f"{context}: {field} must be boolean")
    return value


def _require_number(value: Any, *, field: str, context: str) -> float:
    if not isinstance(value, int | float) or isinstance(value, bool):
        raise ValueError(f"{context}: {field} must be numeric")
    numeric_value = float(value)
    if numeric_value < 0:
        raise ValueError(f"{context}: {field} must be non-negative")
    return numeric_value


def _require_integer(value: Any, *, field: str, context: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError(f"{context}: {field} must be an integer")
    if value < 0:
        raise ValueError(f"{context}: {field} must be non-negative")
    return value


def validate_token_usage(payload: Any, *, context: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError(f"{context}: tokenUsage must be an object")

    validated = {
        "totalInputTokens": _require_integer(
            payload.get("totalInputTokens"), field="totalInputTokens", context=context
        ),
        "totalOutputTokens": _require_integer(
            payload.get("totalOutputTokens"), field="totalOutputTokens", context=context
        ),
        "estimatedCost": _require_number(payload.get("estimatedCost"), field="estimatedCost", context=context),
    }

    actual_cost = payload.get("actualCostUsd")
    if actual_cost is not None:
        validated["actualCostUsd"] = _require_number(actual_cost, field="actualCostUsd", context=context)

    tokens_by_model = payload.get("tokensByModel")
    if tokens_by_model is not None:
        if not isinstance(tokens_by_model, dict):
            raise ValueError(f"{context}: tokensByModel must be an object when provided")
        validated_tokens_by_model: dict[str, Any] = {}
        for model_name, model_usage in tokens_by_model.items():
            model_context = f"{context}.tokensByModel[{model_name!r}]"
            _require_string(model_name, field="model name", context=model_context)
            if not isinstance(model_usage, dict):
                raise ValueError(f"{model_context}: model usage must be an object")
            validated_tokens_by_model[model_name] = {
                "inputTokens": _require_integer(
                    model_usage.get("inputTokens"), field="inputTokens", context=model_context
                ),
                "outputTokens": _require_integer(
                    model_usage.get("outputTokens"), field="outputTokens", context=model_context
                ),
                "cacheReadTokens": _require_integer(
                    model_usage.get("cacheReadTokens"), field="cacheReadTokens", context=model_context
                ),
                "cacheCreationTokens": _require_integer(
                    model_usage.get("cacheCreationTokens"),
                    field="cacheCreationTokens",
                    context=model_context,
                ),
                "costUsd": _require_number(model_usage.get("costUsd"), field="costUsd", context=model_context),
            }
        validated["tokensByModel"] = validated_tokens_by_model

    return validated


def validate_governance_audit_entry(entry: Any, *, context: str) -> dict[str, Any]:
    if not isinstance(entry, dict):
        raise ValueError(f"{context}: audit entry must be an object")

    validated = {
        "id": _require_string(entry.get("id"), field="id", context=context),
        "sessionId": _require_string(entry.get("sessionId"), field="sessionId", context=context),
        "orgName": _require_string(entry.get("orgName"), field="orgName", context=context),
        "toolName": _require_string(entry.get("toolName"), field="toolName", context=context),
        "isError": _require_bool(entry.get("isError"), field="isError", context=context),
        "durationMs": _require_number(entry.get("durationMs"), field="durationMs", context=context),
        "policyAction": _require_string(entry.get("policyAction"), field="policyAction", context=context),
        "timestamp": _require_string(entry.get("timestamp"), field="timestamp", context=context),
        "toolCallNumber": _require_integer(
            entry.get("toolCallNumber"), field="toolCallNumber", context=context
        ),
    }

    tool_input = entry.get("toolInput")
    if not isinstance(tool_input, dict):
        raise ValueError(f"{context}: toolInput must be an object")
    validated["toolInput"] = tool_input

    if validated["policyAction"] not in VALID_POLICY_ACTIONS:
        raise ValueError(
            f"{context}: policyAction must be one of {VALID_POLICY_ACTIONS!r}"
        )

    tool_output = _optional_string(entry.get("toolOutput"), field="toolOutput", context=context)
    if tool_output is not None:
        validated["toolOutput"] = tool_output

    policy_reason = _optional_string(entry.get("policyReason"), field="policyReason", context=context)
    if policy_reason is not None:
        validated["policyReason"] = policy_reason

    matched_policy_id = _optional_string(
        entry.get("matchedPolicyId"), field="matchedPolicyId", context=context
    )
    if matched_policy_id is not None:
        validated["matchedPolicyId"] = matched_policy_id

    return validated


def validate_session_audit_log_response(payload: Any, *, context: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError(f"{context}: session audit response must be an object")

    entries = payload.get("entries")
    if not isinstance(entries, list) or not entries:
        raise ValueError(f"{context}: entries must be a non-empty array")

    validated_entries = [
        validate_governance_audit_entry(entry, context=f"{context}.entries[{index}]")
        for index, entry in enumerate(entries)
    ]
    total = _require_integer(payload.get("total"), field="total", context=context)
    limit = _require_integer(payload.get("limit"), field="limit", context=context)
    offset = _require_integer(payload.get("offset"), field="offset", context=context)

    if total < len(validated_entries):
        raise ValueError(f"{context}: total cannot be smaller than entries length")
    if limit < len(validated_entries):
        raise ValueError(f"{context}: limit cannot be smaller than entries length")

    validated = {
        "entries": validated_entries,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
    if payload.get("tokenUsage") is not None:
        validated["tokenUsage"] = validate_token_usage(payload["tokenUsage"], context=f"{context}.tokenUsage")
    return validated


def coerce_session_audit_payload(payload: Any, *, context: str) -> dict[str, Any]:
    if isinstance(payload, list):
        validated_entries = [
            validate_governance_audit_entry(entry, context=f"{context}[{index}]")
            for index, entry in enumerate(payload)
        ]
        if not validated_entries:
            raise ValueError(f"{context}: no audit entries found")
        return {
            "entries": validated_entries,
            "total": len(validated_entries),
            "limit": len(validated_entries),
            "offset": 0,
        }
    if isinstance(payload, dict) and isinstance(payload.get("entries"), list):
        return validate_session_audit_log_response(payload, context=context)
    if isinstance(payload, dict):
        return {
            "entries": [validate_governance_audit_entry(payload, context=context)],
            "total": 1,
            "limit": 1,
            "offset": 0,
        }
    raise ValueError(f"{context}: expected JSON object, array, or JSONL")
