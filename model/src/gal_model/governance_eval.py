"""Governance EVAL ENGINE: stored session_output -> scored governance records.

This module turns a *stored* session-output payload (the shape persisted by the
telemetry service ``/session-outputs`` endpoint) into a compact, queryable set of
**scored governance records**. It is the last mile of the runtime-governance
pipeline:

    raw transcript  ->  unified runtime records  ->  8-feature events  ->  SCORE

The first three stages are owned by :mod:`multi_agent_runtime_adapters` and
:mod:`multi_agent_audit_contract` and are *consumed* here, not reimplemented:

  * ``RUNTIME_ADAPTERS`` dispatch by ``runtimeType`` (claude-code / codex
    implemented; cursor / copilot / gemini raise ``NotImplementedError`` with a
    documented target contract). We guard for both the missing-adapter and the
    not-implemented cases so an unsupported runtime is a *clean skip*, never a
    crash.
  * ``normalized_events_from_runtime_records`` derives one 8-feature event per
    record. We always run with ``include_raw_content=False`` so no prompt /
    command / tool-output text ever survives into a record, and the normalized
    events are pure booleans + ints regardless.
  * the governance sidecar (:func:`governance_sidecar.load_governance_sidecar`)
    scores each event. The model is loaded lazily and optionally: if no
    checkpoint is present the engine degrades to ``model_loaded: false`` with a
    clear error rather than crashing — mirroring the sidecar HTTP service.

The result is a NO-RAW, advisory-only governance verdict per tool call plus a
session-level roll-up. The two label vocabularies are reconciled here:

  * the sidecar / 8-feature events use the long form
    ``clear_for_operator_review`` / ``hold_for_operator_review``;
  * the session-level ``evalLabel`` uses the operator shorthand
    ``clear`` / ``hold`` (the contract's :data:`VALID_EVAL_DECISIONS`).

``evaluate_session_output`` is a pure function of its input, never mutates the
caller's record, and never raises on a single malformed record — per-record
problems are collected into ``error`` fields so a batch of mixed-quality records
degrades gracefully. The no-raw guarantee is *asserted* on the way out
(:func:`_assert_no_raw_leak`) so a regression that lets transcript text leak
fails loudly here instead of silently shipping content downstream.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Callable

from .audit_dataset_builder import reject_disallowed_keys

# ── field sanitization (no-raw defense in depth) ─────────────────────────────
# toolName / recordId are structural metadata copied from the transcript, so an
# adversarial tool_use block could try to smuggle a secret through them. Cap
# their length and mask secret-shaped substrings before they enter a record.
_MAX_TOOL_NAME = 64
_MAX_RECORD_ID = 128
# Largest string leaf the no-raw guard tolerates anywhere in a scored result.
# Metadata fields (ids/names/labels/short error messages) are well under this;
# free-form transcript text (prompts/commands/outputs) is not.
_MAX_STRING_LEAF = 1024
_SECRET_PATTERNS = [
    re.compile(p)
    for p in (
        r"sk-[A-Za-z0-9]{16,}",
        r"gh[pousr]_[A-Za-z0-9]{20,}",
        r"AKIA[0-9A-Z]{16}",
        r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+",
        r"AIza[0-9A-Za-z_\-]{30,}",
        r"xox[baprs]-[A-Za-z0-9-]{10,}",
        r"(?:sk|rk|pk)_live_[A-Za-z0-9]{10,}",
    )
]


def _mask_secrets(s: str) -> str:
    for pat in _SECRET_PATTERNS:
        s = pat.sub("[REDACTED]", s)
    return s


def _safe_meta(value: Any, cap: int) -> Any:
    """Bound + secret-mask a metadata string field. Non-strings pass through."""
    if not isinstance(value, str):
        return value
    return _mask_secrets(value)[:cap]
from .multi_agent_audit_contract import (
    RECORD_TYPE_GOVERNANCE_DECISION,
    RECORD_TYPE_SESSION_OUTPUT,
    RUNTIME_UNKNOWN,
    VALID_RUNTIME_TYPES,
)
from .multi_agent_runtime_adapters import (
    RUNTIME_ADAPTERS,
    normalized_events_from_runtime_records,
)

# Long-form (sidecar / event) <-> short-form (evalLabel) label vocabularies.
LABEL_HOLD_LONG = "hold_for_operator_review"
LABEL_CLEAR_LONG = "clear_for_operator_review"
LABEL_HOLD_SHORT = "hold"
LABEL_CLEAR_SHORT = "clear"
VALID_LONG_DECISIONS = (LABEL_CLEAR_LONG, LABEL_HOLD_LONG)

DEFAULT_APPLICATION = "gal-governance-eval"
DEFAULT_SPLIT = "test"


# ── label-vocabulary reconciliation ─────────────────────────────────────────


def _long_to_short(decision: str) -> str:
    """Map a sidecar/event long-form decision to the evalLabel shorthand."""
    return LABEL_HOLD_SHORT if decision == LABEL_HOLD_LONG else LABEL_CLEAR_SHORT


# ── no-raw guarantee ─────────────────────────────────────────────────────────


def _assert_string_leaves_bounded(node: Any, *, path: str = "result") -> None:
    """Recursively assert every string leaf is bounded in length.

    Metadata fields (ids, names, labels, short error messages) are short;
    free-form transcript text (prompts, commands, tool outputs) is not. A long
    string leaf means raw content regressed in under an allowed key name.
    """
    if isinstance(node, str):
        assert len(node) <= _MAX_STRING_LEAF, (
            f"no-raw guard: string leaf at {path} is {len(node)} chars "
            f"(> {_MAX_STRING_LEAF}); free-form transcript text may have leaked"
        )
    elif isinstance(node, dict):
        for k, v in node.items():
            _assert_string_leaves_bounded(v, path=f"{path}.{k}")
    elif isinstance(node, (list, tuple)):
        for i, v in enumerate(node):
            _assert_string_leaves_bounded(v, path=f"{path}[{i}]")


def _assert_no_raw_leak(result: dict[str, Any]) -> None:
    """Fail loudly if a scored result ever carries raw transcript content.

    Two independent checks (both implemented here):
      1. :func:`audit_dataset_builder.reject_disallowed_keys` recursively rejects
         the content/message/prompt/response/raw/secret/token key family — the
         same gate the training-event layer enforces (key-name blacklist).
      2. :func:`_assert_string_leaves_bounded` caps the length of every string
         leaf, so free-form transcript text cannot hide under an allowed key
         name. (Secret-shaped substrings in metadata fields like ``toolName`` /
         ``recordId`` are separately masked at record-build time via
         :func:`_safe_meta`.)

    This is a guard, not input validation: a violation means the eval engine
    itself regressed, so it raises ``AssertionError`` rather than returning an
    error record.
    """
    reject_disallowed_keys(result, context="governance-eval-result")
    _assert_string_leaves_bounded(result)


# ── scoring a single stored session_output ───────────────────────────────────


def _score_decision_record(
    record: dict[str, Any],
    event: dict[str, Any],
    sidecar: dict[str, Any],
    tool_call_ordinal: int,
) -> dict[str, Any]:
    """Score one governance_decision record against its derived event.

    Returns a compact scored-decision dict (NO raw content). ``score`` is invoked
    with ``event["features"]`` — the 8-feature dict — exactly as the sidecar HTTP
    service does; ``encode_features`` runs inside ``score``.

    ``toolName`` / ``recordId`` are structural metadata copied from the
    transcript and are length-capped + secret-masked before they enter the
    record. ``toolCallNumber`` is the true 1-based tool-call ordinal computed
    here (the adapter's ``decision.toolCallNumber`` is a conversational
    turn-sequence index, not a tool-call ordinal); ``turnSeq`` preserves that
    adapter value for traceability.
    """
    decision_body = record.get("decision", {})
    features = event["features"]
    scored = sidecar["score"](features, "")

    predicted = scored.get("decision")
    ground_truth = event["outcome"]["decision"]
    return {
        "recordId": _safe_meta(record.get("id"), _MAX_RECORD_ID),
        "recordType": RECORD_TYPE_GOVERNANCE_DECISION,
        "toolName": _safe_meta(decision_body.get("toolName"), _MAX_TOOL_NAME),
        "toolCallNumber": tool_call_ordinal,
        "turnSeq": decision_body.get("toolCallNumber"),
        "policyAction": decision_body.get("policyAction"),
        "isError": decision_body.get("isError"),
        "features": dict(features),
        "predicted": predicted,
        "decisionShort": _long_to_short(predicted) if predicted else None,
        "confidence": scored.get("confidence"),
        "satisfied": scored.get("satisfied"),
        "needsFeedback": scored.get("needs_feedback"),
        "latencyMs": scored.get("latency_ms"),
        "groundTruth": ground_truth,
        "match": predicted == ground_truth,
        "advisoryOnly": True,
    }


def _aggregate_session_eval(
    scored_decisions: list[dict[str, Any]],
    output_event: dict[str, Any] | None,
) -> dict[str, Any]:
    """Roll per-decision verdicts into a session-level evalLabel.

    Session holds when ANY scored decision holds, OR when the session_output
    event itself resolved to hold (e.g. terminal outcome == error). ``escalate``
    mirrors ``hold`` per the contract's evalLabel shape. ``confidence`` is the
    aggregate-min confidence over decisions (weakest link), or the output
    event's score when there are no decisions.
    """
    hold_count = sum(1 for d in scored_decisions if d.get("predicted") == LABEL_HOLD_LONG)
    clear_count = sum(1 for d in scored_decisions if d.get("predicted") == LABEL_CLEAR_LONG)
    # Decisions whose scoring failed carry no "predicted" — count them as errors,
    # NOT as clear (a failed true-hold must never inflate the clear rate).
    error_count = len(scored_decisions) - hold_count - clear_count
    output_holds = bool(
        output_event is not None
        and output_event["outcome"]["decision"] == LABEL_HOLD_LONG
    )
    # A scoring error is treated conservatively as a reason to escalate.
    any_hold = hold_count > 0 or output_holds or error_count > 0

    confidences = [d["confidence"] for d in scored_decisions if isinstance(d.get("confidence"), int | float)]
    session_confidence = min(confidences) if confidences else None

    return {
        "decision": LABEL_HOLD_SHORT if any_hold else LABEL_CLEAR_SHORT,
        "escalate": any_hold,
        "confidence": session_confidence,
        "counts": {
            "decisions": len(scored_decisions),
            "hold": hold_count,
            "clear": clear_count,
            "error": error_count,
            "outputHold": output_holds,
        },
    }


def evaluate_session_output(
    record: dict[str, Any],
    sidecar: dict[str, Any] | None = None,
    *,
    application: str = DEFAULT_APPLICATION,
    split: str = DEFAULT_SPLIT,
    model_path: str | Path | None = None,
    satisfaction_threshold: float = 0.85,
) -> dict[str, Any]:
    """Score a single stored session_output payload into governance verdicts.

    Args:
        record: a stored session-output payload (the telemetry-svc
            ``/session-outputs`` record shape)::

                {
                  "runtimeType": "claude-code",
                  "sessionId": "...",
                  "orgId": "...",
                  "transcript": [<jsonl line dict>, ...],   # pre-parsed lines
                  ...
                }

            ``transcript`` may also be provided as ``transcriptLines`` or
            ``lines``; each entry is one parsed JSONL object (a dict).
        sidecar: an already-loaded sidecar context
            (``{"score", "govern", "metadata"}`` — e.g. from
            :func:`governance_sidecar.load_governance_sidecar`, or a fake for
            tests). When ``None`` the real sidecar is loaded lazily; a missing /
            unloadable checkpoint degrades to a clear error rather than crashing.
        application / split: forwarded to the event-normalization step.
        model_path / satisfaction_threshold: forwarded to the lazy sidecar load.

    Returns:
        A compact, NO-RAW scored result::

            {
              "sessionId", "runtimeType", "orgId",
              "scoredDecisions": [ {recordId, toolName, predicted, confidence, ...}, ... ],
              "sessionEval": {"decision": "clear|hold", "escalate": bool,
                              "confidence": float|None, "counts": {...}},
              "tokenUsage": {...} | None,
              "modelRef": str | None,
              "error": str | None,   # present only on a per-record failure
            }

        On a malformed / unsupported record the function still returns this shape
        with ``error`` set and empty ``scoredDecisions`` — it never raises.
    """
    session_id = record.get("sessionId") if isinstance(record, dict) else None
    org_id = record.get("orgId") if isinstance(record, dict) else None
    runtime_type = record.get("runtimeType") if isinstance(record, dict) else None

    def _failure(message: str) -> dict[str, Any]:
        out = {
            "sessionId": session_id,
            "runtimeType": runtime_type,
            "orgId": org_id,
            "scoredDecisions": [],
            "sessionEval": {
                "decision": LABEL_HOLD_SHORT,
                "escalate": True,
                "confidence": None,
                "counts": {"decisions": 0, "hold": 0, "clear": 0, "error": 0, "outputHold": True},
            },
            "tokenUsage": None,
            "modelRef": None,
            "error": message,
        }
        _assert_no_raw_leak(out)
        return out

    # ── validate the stored payload shape ────────────────────────────────────
    if not isinstance(record, dict):
        return _failure("session_output record must be a JSON object")
    if not runtime_type:
        return _failure("record is missing runtimeType")
    if runtime_type not in VALID_RUNTIME_TYPES:
        return _failure(f"unknown runtimeType {runtime_type!r}")
    if runtime_type == RUNTIME_UNKNOWN:
        return _failure("runtimeType 'unknown' has no adapter")

    adapter: Callable[..., list[dict[str, Any]]] | None = RUNTIME_ADAPTERS.get(runtime_type)
    if adapter is None:
        return _failure(f"no adapter registered for runtime {runtime_type!r}")

    entries = record.get("transcript")
    if entries is None:
        entries = record.get("transcriptLines")
    if entries is None:
        entries = record.get("lines")
    if not isinstance(entries, list) or not entries:
        return _failure("record is missing a non-empty transcript list")
    if not all(isinstance(item, dict) for item in entries):
        return _failure("every transcript entry must be a JSON object")

    eval_session_id = session_id or "unknown-session"
    eval_org_id = org_id or "unknown-org"

    # ── adapt -> records (reusing the existing parser; NO raw retained) ───────
    try:
        records = adapter(
            entries,
            org_id=eval_org_id,
            session_id=eval_session_id,
            include_raw_content=False,
        )
    except NotImplementedError:
        return _failure(f"runtime {runtime_type!r} adapter is not implemented")
    except (ValueError, KeyError, TypeError) as exc:
        return _failure(f"failed to adapt transcript: {exc}")

    # ── records -> 8-feature events (reusing the existing helper) ─────────────
    try:
        events = normalized_events_from_runtime_records(
            records, split=split, application=application
        )
    except (ValueError, KeyError, TypeError) as exc:
        return _failure(f"failed to normalize events: {exc}")

    # Pair each record with its event by list position (same order, 1:1).
    if len(events) != len(records):  # defensive: contract guarantees 1:1
        return _failure("record/event count mismatch")

    # ── load the sidecar lazily/optionally ───────────────────────────────────
    if sidecar is None:
        try:
            from .governance_sidecar import load_governance_sidecar

            sidecar = load_governance_sidecar(
                model_path=model_path,
                satisfaction_threshold=satisfaction_threshold,
            )
        except Exception as exc:  # noqa: BLE001 - degrade, never crash a batch
            return _failure(f"governance model unavailable: {exc}")

    model_ref = None
    metadata = sidecar.get("metadata") if hasattr(sidecar, "get") else None
    if isinstance(metadata, dict):
        model_ref = metadata.get("model_ref")

    # ── score each governance_decision; capture the session_output event ──────
    scored_decisions: list[dict[str, Any]] = []
    output_event: dict[str, Any] | None = None
    token_usage: dict[str, Any] | None = None
    tool_call_ordinal = 0
    for rec, event in zip(records, events):
        if rec["recordType"] == RECORD_TYPE_GOVERNANCE_DECISION:
            tool_call_ordinal += 1
            try:
                scored_decisions.append(
                    _score_decision_record(rec, event, sidecar, tool_call_ordinal)
                )
            except Exception as exc:  # noqa: BLE001 - one bad call never aborts the rest
                scored_decisions.append(
                    {
                        "recordId": _safe_meta(rec.get("id"), _MAX_RECORD_ID),
                        "recordType": RECORD_TYPE_GOVERNANCE_DECISION,
                        "toolCallNumber": tool_call_ordinal,
                        "error": _safe_meta(f"scoring failed: {exc}", _MAX_STRING_LEAF),
                    }
                )
        elif rec["recordType"] == RECORD_TYPE_SESSION_OUTPUT:
            output_event = event
            usage = rec.get("output", {}).get("tokenUsage")
            if isinstance(usage, dict):
                token_usage = dict(usage)

    session_eval = _aggregate_session_eval(scored_decisions, output_event)

    result = {
        "sessionId": eval_session_id,
        "runtimeType": runtime_type,
        "orgId": eval_org_id,
        "scoredDecisions": scored_decisions,
        "sessionEval": session_eval,
        "tokenUsage": token_usage,
        "modelRef": model_ref,
        "error": None,
    }
    _assert_no_raw_leak(result)
    return result


def evaluate_session_outputs(
    records: list[dict[str, Any]],
    sidecar: dict[str, Any] | None = None,
    *,
    application: str = DEFAULT_APPLICATION,
    split: str = DEFAULT_SPLIT,
    model_path: str | Path | None = None,
    satisfaction_threshold: float = 0.85,
) -> list[dict[str, Any]]:
    """Score a batch of stored session_output payloads.

    Loads the sidecar at most once and reuses it across the batch (so a single
    checkpoint load serves every record). A model-load failure is surfaced
    per-record via :func:`evaluate_session_output`'s ``error`` field — the batch
    never aborts. Pure function of the input list.
    """
    if not isinstance(records, list):
        raise ValueError("expected a JSON array of session_output records")

    # Attempt one shared model load up front (only if not injected). If it fails,
    # we leave ``sidecar`` as None and let each record degrade to a clear error.
    shared = sidecar
    if shared is None:
        try:
            from .governance_sidecar import load_governance_sidecar

            shared = load_governance_sidecar(
                model_path=model_path,
                satisfaction_threshold=satisfaction_threshold,
            )
        except Exception:  # noqa: BLE001 - per-record error surfaces the reason
            shared = None

    results: list[dict[str, Any]] = []
    for record in records:
        results.append(
            evaluate_session_output(
                record,
                shared,
                application=application,
                split=split,
                model_path=model_path,
                satisfaction_threshold=satisfaction_threshold,
            )
        )
    return results


# ── CLI ──────────────────────────────────────────────────────────────────────


def _load_input(path: Path | None) -> Any:
    if path is None or path.as_posix() == "-":
        text = sys.stdin.read()
    else:
        text = path.read_text(encoding="utf-8")
    text = text.strip()
    if not text:
        raise ValueError("no input: expected a JSON array of session_output records")
    return json.loads(text)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="GAL governance EVAL ENGINE — score stored session_output records."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=None,
        help="JSON array of session_output records (stdin if omitted or '-').",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Write scored JSON here (stdout if omitted).",
    )
    parser.add_argument("--model-path", type=Path, default=None, help="GAL checkpoint (auto-detected if omitted).")
    parser.add_argument("--application", default=DEFAULT_APPLICATION)
    parser.add_argument("--split", default=DEFAULT_SPLIT, choices=("train", "validation", "test"))
    parser.add_argument("--satisfaction-threshold", type=float, default=0.85)
    parser.add_argument("--pretty", action="store_true", default=True)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    try:
        payload = _load_input(args.input)
    except (ValueError, json.JSONDecodeError, OSError) as exc:
        print(json.dumps({"error": f"invalid input: {exc}"}, sort_keys=True), file=sys.stderr)
        return 2

    # Accept either a JSON array or a single bare record.
    if isinstance(payload, dict):
        records = [payload]
    elif isinstance(payload, list):
        records = payload
    else:
        print(json.dumps({"error": "input must be a JSON array or object"}, sort_keys=True), file=sys.stderr)
        return 2

    results = evaluate_session_outputs(
        records,
        model_path=args.model_path,
        application=args.application,
        split=args.split,
        satisfaction_threshold=args.satisfaction_threshold,
    )

    model_loaded = any(r.get("modelRef") for r in results)
    envelope = {
        "service": "gal-governance-eval",
        "version": "v0",
        "model_loaded": model_loaded,
        "advisory_only": True,
        "physical_action_allowed": False,
        "hardware_commands_issued": False,
        "results": results,
    }

    indent = 2 if args.pretty else None
    rendered = json.dumps(envelope, indent=indent, sort_keys=True)
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    else:
        print(rendered)
    return 0


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
