"""Unified runtime-tagged audit/output contract for multi-agent governance.

This module lifts the historically out-of-band distinction between

  * per-tool-call governance *decisions* (``GovernanceAuditEntry`` today, emitted
    by gal-code's audit log), and
  * full session *output* / transcript records (the session archive stream),

into a single first-class, runtime-tagged envelope. Both record types share one
envelope and are discriminated by ``recordType``:

  * ``governance_decision`` -> ``decision`` body is a one-to-one lift of the
    legacy :class:`GovernanceAuditEntry` (toolName, toolCallNumber, toolInput,
    isError, durationMs, policyAction, policyReason, matchedPolicyId, toolOutput).
  * ``session_output`` -> ``output`` body carries the full transcript that the
    legacy normalized audit-event cannot hold (``turns`` array, outcome,
    tokenUsage, evalLabel). Raw transcript text (``toolInput``/``toolResult``/
    ``text``) is only retained when ``include_raw_content=True``; the default
    preserves the no-raw guarantee.

A ``runtimeType`` enum (claude-code | cursor | copilot | codex | gemini |
unknown) is additive: it is absent from the legacy contract, so every existing
``GovernanceAuditEntry`` validates unchanged.

Backward compatibility:
  * Two field renames (``orgId`` aliases ``orgName``; ``ts`` aliases
    ``timestamp``) are *alias-accepted on input*, so old payloads pass untouched.
  * :func:`lift_legacy_audit_entry` reuses
    :func:`session_audit_contract.validate_governance_audit_entry` unchanged
    (lossless) then wraps the result into the envelope.

The unified record is the *ingest* contract. For training, both record types
normalize down to the existing 8-feature ``validate_audit_event`` shape via the
per-runtime adapters, so no dataset code changes.
"""

from __future__ import annotations

from typing import Any

from .session_audit_contract import (
    _optional_string,
    _require_bool,
    _require_integer,
    _require_number,
    _require_string,
    validate_governance_audit_entry,
    validate_token_usage,
)

RUNTIME_RECORD_SCHEMA_REF = (
    "https://gal.run/schemas/model/runtime-record.schema.json"
)
RUNTIME_RECORD_RESPONSE_SCHEMA_REF = (
    "https://gal.run/schemas/model/runtime-record-response.schema.json"
)

SCHEMA_VERSION = "gal-runtime-record/v1"

RECORD_TYPE_GOVERNANCE_DECISION = "governance_decision"
RECORD_TYPE_SESSION_OUTPUT = "session_output"
VALID_RECORD_TYPES = (
    RECORD_TYPE_GOVERNANCE_DECISION,
    RECORD_TYPE_SESSION_OUTPUT,
)

# Additive: absent from the legacy contract, so existing entries validate
# unchanged. ``unknown`` is the safe default when a runtime is not declared.
RUNTIME_CLAUDE_CODE = "claude-code"
RUNTIME_CURSOR = "cursor"
RUNTIME_COPILOT = "copilot"
RUNTIME_CODEX = "codex"
RUNTIME_GEMINI = "gemini"
RUNTIME_UNKNOWN = "unknown"
VALID_RUNTIME_TYPES = (
    RUNTIME_CLAUDE_CODE,
    RUNTIME_CURSOR,
    RUNTIME_COPILOT,
    RUNTIME_CODEX,
    RUNTIME_GEMINI,
    RUNTIME_UNKNOWN,
)

# session_output.outcome vocabulary (the terminal state of a whole session).
VALID_SESSION_OUTCOMES = ("complete", "error")

# session_output.output.turns[].role vocabulary.
VALID_TURN_ROLES = ("user", "assistant", "tool", "system")

# evalLabel.decision mirrors the binary governance label, expressed in the
# operator-facing "clear" / "hold" shorthand used by the sidecar.
VALID_EVAL_DECISIONS = ("clear", "hold")

# Re-export so backward-compatible callers can keep importing from one place.
__all__ = [
    "RUNTIME_RECORD_SCHEMA_REF",
    "RUNTIME_RECORD_RESPONSE_SCHEMA_REF",
    "SCHEMA_VERSION",
    "RECORD_TYPE_GOVERNANCE_DECISION",
    "RECORD_TYPE_SESSION_OUTPUT",
    "VALID_RECORD_TYPES",
    "VALID_RUNTIME_TYPES",
    "VALID_SESSION_OUTCOMES",
    "VALID_TURN_ROLES",
    "VALID_EVAL_DECISIONS",
    "validate_governance_audit_entry",
    "validate_token_usage",
    "validate_runtime_record",
    "validate_runtime_record_response",
    "lift_legacy_audit_entry",
    "coerce_runtime_record_payload",
]


# ── envelope helpers ─────────────────────────────────────────────────────────


def _resolve_alias(payload: dict[str, Any], canonical: str, alias: str) -> Any:
    """Return ``payload[canonical]`` else ``payload[alias]`` (alias-accepted)."""
    if payload.get(canonical) is not None:
        return payload.get(canonical)
    return payload.get(alias)


def _validate_runtime_type(value: Any, *, context: str) -> str:
    # Additive + optional: absence is allowed and defaults to "unknown".
    if value is None:
        return RUNTIME_UNKNOWN
    runtime = _require_string(value, field="runtimeType", context=context)
    if runtime not in VALID_RUNTIME_TYPES:
        raise ValueError(
            f"{context}: runtimeType must be one of {VALID_RUNTIME_TYPES!r}"
        )
    return runtime


def _validate_envelope(record: dict[str, Any], *, context: str) -> dict[str, Any]:
    """Validate the shared envelope; returns the canonicalized envelope dict."""
    if not isinstance(record, dict):
        raise ValueError(f"{context}: runtime record must be an object")

    record_type = _require_string(
        record.get("recordType"), field="recordType", context=context
    )
    if record_type not in VALID_RECORD_TYPES:
        raise ValueError(
            f"{context}: recordType must be one of {VALID_RECORD_TYPES!r}"
        )

    org_id = _resolve_alias(record, "orgId", "orgName")
    timestamp = _resolve_alias(record, "ts", "timestamp")

    envelope: dict[str, Any] = {
        "schemaVersion": _optional_string(
            record.get("schemaVersion"), field="schemaVersion", context=context
        )
        or SCHEMA_VERSION,
        "recordType": record_type,
        "runtimeType": _validate_runtime_type(
            record.get("runtimeType"), context=context
        ),
        "id": _require_string(record.get("id"), field="id", context=context),
        "sessionId": _require_string(
            record.get("sessionId"), field="sessionId", context=context
        ),
        "orgId": _require_string(org_id, field="orgId", context=context),
        "ts": _require_string(timestamp, field="ts", context=context),
    }

    runtime_meta = record.get("runtimeMeta")
    if runtime_meta is not None:
        if not isinstance(runtime_meta, dict):
            raise ValueError(f"{context}: runtimeMeta must be an object when provided")
        envelope["runtimeMeta"] = runtime_meta

    return envelope


# ── governance_decision body ─────────────────────────────────────────────────


def _validate_decision_body(decision: Any, *, context: str) -> dict[str, Any]:
    """Validate the ``decision`` body (one-to-one lift of GovernanceAuditEntry)."""
    if not isinstance(decision, dict):
        raise ValueError(f"{context}: decision body must be an object")

    validated: dict[str, Any] = {
        "toolName": _require_string(
            decision.get("toolName"), field="toolName", context=context
        ),
        "toolCallNumber": _require_integer(
            decision.get("toolCallNumber"), field="toolCallNumber", context=context
        ),
        "isError": _require_bool(
            decision.get("isError"), field="isError", context=context
        ),
        "durationMs": _require_number(
            decision.get("durationMs"), field="durationMs", context=context
        ),
        "policyAction": _require_string(
            decision.get("policyAction"), field="policyAction", context=context
        ),
    }
    if validated["policyAction"] not in ("allowed", "denied", "audited"):
        raise ValueError(
            f"{context}: policyAction must be one of ('allowed', 'denied', 'audited')"
        )

    tool_input = decision.get("toolInput")
    if not isinstance(tool_input, dict):
        raise ValueError(f"{context}: toolInput must be an object")
    validated["toolInput"] = tool_input

    for field in ("policyReason", "matchedPolicyId", "toolOutput"):
        value = _optional_string(decision.get(field), field=field, context=context)
        if value is not None:
            validated[field] = value

    return validated


# ── session_output body ──────────────────────────────────────────────────────


def _validate_turn(
    turn: Any,
    *,
    context: str,
    include_raw_content: bool,
) -> dict[str, Any]:
    if not isinstance(turn, dict):
        raise ValueError(f"{context}: turn must be an object")

    validated: dict[str, Any] = {
        "turnNumber": _require_integer(
            turn.get("turnNumber"), field="turnNumber", context=context
        ),
        "role": _require_string(turn.get("role"), field="role", context=context),
    }
    if validated["role"] not in VALID_TURN_ROLES:
        raise ValueError(f"{context}: role must be one of {VALID_TURN_ROLES!r}")

    tool_name = _optional_string(turn.get("toolName"), field="toolName", context=context)
    if tool_name is not None:
        validated["toolName"] = tool_name

    latency_ms = turn.get("latencyMs")
    if latency_ms is not None:
        validated["latencyMs"] = _require_number(
            latency_ms, field="latencyMs", context=context
        )

    # Raw content is gated: prompt/response/transcript text and structured tool
    # inputs/results are only retained when explicitly opted in. This preserves
    # the no-raw guarantee that the downstream training event already enforces.
    if include_raw_content:
        if turn.get("toolInput") is not None:
            tool_input = turn.get("toolInput")
            if not isinstance(tool_input, dict):
                raise ValueError(f"{context}: toolInput must be an object")
            validated["toolInput"] = tool_input
        if turn.get("toolResult") is not None:
            validated["toolResult"] = turn.get("toolResult")
        text = _optional_string(turn.get("text"), field="text", context=context)
        if text is not None:
            validated["text"] = text

    return validated


def _validate_eval_label(eval_label: Any, *, context: str) -> dict[str, Any]:
    if not isinstance(eval_label, dict):
        raise ValueError(f"{context}: evalLabel must be an object")
    decision = _require_string(
        eval_label.get("decision"), field="decision", context=context
    )
    if decision not in VALID_EVAL_DECISIONS:
        raise ValueError(f"{context}: evalLabel.decision must be one of {VALID_EVAL_DECISIONS!r}")
    escalate = _require_bool(
        eval_label.get("escalate"), field="escalate", context=context
    )
    return {"decision": decision, "escalate": escalate}


def _validate_output_body(
    output: Any,
    *,
    context: str,
    include_raw_content: bool,
) -> dict[str, Any]:
    if not isinstance(output, dict):
        raise ValueError(f"{context}: output body must be an object")

    outcome = _require_string(output.get("outcome"), field="outcome", context=context)
    if outcome not in VALID_SESSION_OUTCOMES:
        raise ValueError(f"{context}: outcome must be one of {VALID_SESSION_OUTCOMES!r}")

    turns = output.get("turns")
    if not isinstance(turns, list):
        raise ValueError(f"{context}: turns must be an array")
    validated_turns = [
        _validate_turn(
            turn,
            context=f"{context}.turns[{index}]",
            include_raw_content=include_raw_content,
        )
        for index, turn in enumerate(turns)
    ]

    validated: dict[str, Any] = {
        "outcome": outcome,
        "turns": validated_turns,
    }

    if output.get("tokenUsage") is not None:
        validated["tokenUsage"] = validate_token_usage(
            output["tokenUsage"], context=f"{context}.tokenUsage"
        )
    if output.get("evalLabel") is not None:
        validated["evalLabel"] = _validate_eval_label(
            output["evalLabel"], context=f"{context}.evalLabel"
        )
    return validated


# ── public validators ────────────────────────────────────────────────────────


def validate_runtime_record(
    record: Any,
    *,
    context: str,
    include_raw_content: bool = False,
) -> dict[str, Any]:
    """Validate a single unified runtime record (envelope + typed body).

    Args:
        record: candidate record dict.
        context: error-context prefix.
        include_raw_content: when ``False`` (default), session_output turns drop
            raw transcript text (toolInput/toolResult/text), preserving the
            no-raw guarantee. The decision body never carries raw transcript text.
    """
    envelope = _validate_envelope(record, context=context)
    record_type = envelope["recordType"]

    if record_type == RECORD_TYPE_GOVERNANCE_DECISION:
        envelope["decision"] = _validate_decision_body(
            record.get("decision"), context=f"{context}.decision"
        )
    else:  # RECORD_TYPE_SESSION_OUTPUT
        envelope["output"] = _validate_output_body(
            record.get("output"),
            context=f"{context}.output",
            include_raw_content=include_raw_content,
        )
    return envelope


def validate_runtime_record_response(
    payload: Any,
    *,
    context: str,
    include_raw_content: bool = False,
) -> dict[str, Any]:
    """Validate a ``RuntimeRecordResponse`` whose records may mix types/runtimes."""
    if not isinstance(payload, dict):
        raise ValueError(f"{context}: runtime record response must be an object")

    records = payload.get("records")
    if not isinstance(records, list) or not records:
        raise ValueError(f"{context}: records must be a non-empty array")

    validated_records = [
        validate_runtime_record(
            record,
            context=f"{context}.records[{index}]",
            include_raw_content=include_raw_content,
        )
        for index, record in enumerate(records)
    ]
    total = _require_integer(payload.get("total"), field="total", context=context)
    limit = _require_integer(payload.get("limit"), field="limit", context=context)
    offset = _require_integer(payload.get("offset"), field="offset", context=context)

    if total < len(validated_records):
        raise ValueError(f"{context}: total cannot be smaller than records length")
    if limit < len(validated_records):
        raise ValueError(f"{context}: limit cannot be smaller than records length")

    validated: dict[str, Any] = {
        "records": validated_records,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
    if payload.get("tokenUsage") is not None:
        validated["tokenUsage"] = validate_token_usage(
            payload["tokenUsage"], context=f"{context}.tokenUsage"
        )
    return validated


# ── migration: legacy GovernanceAuditEntry -> unified envelope ────────────────


def lift_legacy_audit_entry(
    entry: Any,
    *,
    context: str = "legacy-audit-entry",
    runtime_type: str = RUNTIME_CLAUDE_CODE,
) -> dict[str, Any]:
    """Lift a legacy ``GovernanceAuditEntry`` into a unified governance_decision.

    Lossless: validation reuses
    :func:`session_audit_contract.validate_governance_audit_entry` unchanged,
    then the validated entry is wrapped into the envelope + decision body. The
    two renames (orgId<-orgName, ts<-timestamp) are applied here.
    """
    if runtime_type not in VALID_RUNTIME_TYPES:
        raise ValueError(f"{context}: runtime_type must be one of {VALID_RUNTIME_TYPES!r}")

    validated = validate_governance_audit_entry(entry, context=context)

    decision: dict[str, Any] = {
        "toolName": validated["toolName"],
        "toolCallNumber": validated["toolCallNumber"],
        "isError": validated["isError"],
        "durationMs": validated["durationMs"],
        "policyAction": validated["policyAction"],
        "toolInput": validated["toolInput"],
    }
    for field in ("policyReason", "matchedPolicyId", "toolOutput"):
        if field in validated:
            decision[field] = validated[field]

    return {
        "schemaVersion": SCHEMA_VERSION,
        "recordType": RECORD_TYPE_GOVERNANCE_DECISION,
        "runtimeType": runtime_type,
        "id": validated["id"],
        "sessionId": validated["sessionId"],
        "orgId": validated["orgName"],
        "ts": validated["timestamp"],
        "decision": decision,
    }


def coerce_runtime_record_payload(
    payload: Any,
    *,
    context: str,
    include_raw_content: bool = False,
) -> dict[str, Any]:
    """Accept a list of records, a response object, or a single bare record.

    Mirrors :func:`session_audit_contract.coerce_session_audit_payload` so callers
    can feed JSONL, a wrapped response, or one record interchangeably.
    """
    if isinstance(payload, list):
        validated_records = [
            validate_runtime_record(
                record,
                context=f"{context}[{index}]",
                include_raw_content=include_raw_content,
            )
            for index, record in enumerate(payload)
        ]
        if not validated_records:
            raise ValueError(f"{context}: no runtime records found")
        return {
            "records": validated_records,
            "total": len(validated_records),
            "limit": len(validated_records),
            "offset": 0,
        }
    if isinstance(payload, dict) and isinstance(payload.get("records"), list):
        return validate_runtime_record_response(
            payload, context=context, include_raw_content=include_raw_content
        )
    if isinstance(payload, dict):
        return {
            "records": [
                validate_runtime_record(
                    payload,
                    context=context,
                    include_raw_content=include_raw_content,
                )
            ],
            "total": 1,
            "limit": 1,
            "offset": 0,
        }
    raise ValueError(f"{context}: expected JSON object, array, or JSONL")
