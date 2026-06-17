"""Per-runtime normalization adapters into the unified runtime-record contract.

Each adapter maps one runtime's native session-output transcript into the
:mod:`multi_agent_audit_contract` unified envelope. Two record types are
produced:

  * ``governance_decision`` records (one per tool call) carrying the policy
    verdict, and
  * one ``session_output`` record per session carrying the full transcript
    (``turns`` array), the terminal outcome (complete/error), token usage, and an
    eval label.

Both record types normalize down to the existing 8-feature training event via
:func:`normalized_events_from_runtime_records`, so the dataset/builder code is
unchanged. This parallels :mod:`session_audit_adapter` /
:mod:`session_archive_adapter` in structure.

Implemented runtimes:
  * ``claude-code`` (:func:`adapt_claude_code_transcript`) — reads a real Claude
    Code transcript JSONL (one JSON object per line). Each line has a top-level
    ``type`` (``assistant`` | ``user`` | ``system`` | ``attachment`` | ``summary``
    | …) and the conversation payload nested under ``message``. Tool calls are
    ``tool_use`` blocks inside an assistant ``message.content`` list; tool results
    are ``tool_result`` blocks inside a user ``message.content`` list. Token usage
    lives under ``message.usage``.
  * ``codex`` (:func:`adapt_codex_transcript`) — reads a Codex CLI rollout JSONL
    (one JSON object per line; ``type`` in function_call / function_call_output /
    message / turn_complete / error).

Stubbed runtimes (clear contract, raise NotImplementedError):
  * ``cursor`` (:func:`adapt_cursor_transcript`)
  * ``copilot`` (:func:`adapt_copilot_transcript`)
  * ``gemini`` (:func:`adapt_gemini_transcript`)

A new runtime needs only a thin ``adapt_<runtime>_transcript`` here plus the one
enum value already present in :mod:`multi_agent_audit_contract`.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from .audit_dataset_builder import (
    AUDIT_EVENT_SCHEMA_REF,
    validate_audit_event,
    write_jsonl,
)
from .multi_agent_audit_contract import (
    RECORD_TYPE_GOVERNANCE_DECISION,
    RECORD_TYPE_SESSION_OUTPUT,
    RUNTIME_CLAUDE_CODE,
    RUNTIME_CODEX,
    RUNTIME_COPILOT,
    RUNTIME_CURSOR,
    RUNTIME_GEMINI,
    SCHEMA_VERSION,
    VALID_RUNTIME_TYPES,
    validate_runtime_record,
    validate_token_usage,
)
from .session_archive_adapter import (
    CREDENTIAL_FAILURE_SUBSTRINGS,
    DESTRUCTIVE_SUBSTRINGS,
    EXTERNAL_NETWORK_SUBSTRINGS,
    EXTERNAL_STATE_CHANGE_SUBSTRINGS,
    INVALID_INVOCATION_SUBSTRINGS,
    SUCCESSFUL_COMPLETE_REASONS,
    _contains_any,
)

VALID_SPLITS = ("train", "validation", "test")


# ── shared helpers ───────────────────────────────────────────────────────────


def _string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def _number(value: Any) -> float | None:
    return float(value) if isinstance(value, int | float) and not isinstance(value, bool) else None


def _parse_rfc3339_ms(value: Any) -> float | None:
    """Parse an RFC3339 timestamp into epoch milliseconds, or ``None``.

    Claude Code timestamps use a trailing ``Z`` (e.g. ``2026-06-02T07:23:51.102Z``);
    :func:`datetime.fromisoformat` accepts the offset form, so ``Z`` is rewritten.
    """
    text = _string(value)
    if text is None:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.timestamp() * 1000.0


def _read_text(path: Path) -> str:
    if path.as_posix() == "-":
        return sys.stdin.read()
    return path.read_text(encoding="utf-8")


def load_transcript_lines(path: Path) -> list[dict[str, Any]]:
    """Load a runtime transcript JSONL into a list of dict events."""
    text = _read_text(path).strip()
    if not text:
        raise ValueError(f"{path}: no transcript entries found")
    entries: list[dict[str, Any]] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path}:{line_number}: JSON parse error: {exc.msg}") from exc
        if not isinstance(item, dict):
            raise ValueError(f"{path}:{line_number}: expected object")
        entries.append(item)
    if not entries:
        raise ValueError(f"{path}: no transcript entries found")
    return entries


def _policy_action_for(*, is_error: bool, risky: bool) -> str:
    """Derive a weak-label policyAction from risk heuristics.

    gal-code emits an explicit policyAction; native runtime transcripts do not,
    so we weak-label: risky -> audited, error -> denied, else allowed.
    """
    if risky:
        return "audited"
    if is_error:
        return "denied"
    return "allowed"


def _subject_text(tool_name: str, tool_input: dict[str, Any]) -> str:
    if tool_name.lower() in {"bash", "shell", "run_terminal_cmd", "execute"}:
        return _string(tool_input.get("command")) or _string(tool_input.get("cmd")) or ""
    if "path" in tool_input:
        return _string(tool_input.get("path")) or ""
    return json.dumps(tool_input, sort_keys=True, separators=(",", ":"))


def _risk_flags(subject: str, result_text: str, *, is_error: bool, tool_name: str) -> dict[str, bool]:
    destructive = "delete" in tool_name.lower() or _contains_any(subject, DESTRUCTIVE_SUBSTRINGS)
    external_network = "fetch" in tool_name.lower() or _contains_any(subject, EXTERNAL_NETWORK_SUBSTRINGS)
    external_state_change = _contains_any(subject, EXTERNAL_STATE_CHANGE_SUBSTRINGS)
    credential_failure = _contains_any(result_text, CREDENTIAL_FAILURE_SUBSTRINGS)
    invalid_invocation = is_error and _contains_any(result_text, INVALID_INVOCATION_SUBSTRINGS)
    return {
        "destructive": destructive,
        "external_network": external_network,
        "external_state_change": external_state_change,
        "credential_failure": credential_failure,
        "invalid_invocation": invalid_invocation,
    }


def _envelope(
    *,
    record_type: str,
    runtime_type: str,
    record_id: str,
    org_id: str,
    session_id: str,
    ts: str,
) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "recordType": record_type,
        "runtimeType": runtime_type,
        "id": record_id,
        "sessionId": session_id,
        "orgId": org_id,
        "ts": ts,
    }


# ── generic tool-call/result pairing -> unified records ───────────────────────


def _records_from_paired_calls(
    *,
    runtime_type: str,
    org_id: str,
    session_id: str,
    calls: list[dict[str, Any]],
    terminal_outcome: str,
    token_usage: dict[str, Any] | None,
    include_raw_content: bool,
    text_turns: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Build governance_decision records + one session_output record.

    Each item in ``calls`` is a normalized dict:
        {tool_name, tool_use_id, tool_input(dict), result_text(str),
         is_error(bool), latency_ms(float|None), call_number(int), ts(str)}

    ``text_turns`` is an optional list of assistant/user text turns to interleave
    into the session_output transcript so the "full session output" is real:
        {turn_number(int), role("assistant"|"user"|"system"), text(str)}
    Latency is *measured* only when ``latency_ms`` is not None; an unmeasured call
    keeps ``durationMs`` at ``0.0`` (schema requires a number) but flags
    ``runtimeMeta.latencyMeasured = False`` so the event layer can tell them apart.
    """
    records: list[dict[str, Any]] = []
    turns: list[dict[str, Any]] = []
    any_hold = False

    for call in calls:
        tool_name = call["tool_name"]
        tool_input = call["tool_input"]
        result_text = call["result_text"]
        is_error = call["is_error"]
        subject = _subject_text(tool_name, tool_input)
        flags = _risk_flags(subject, result_text, is_error=is_error, tool_name=tool_name)
        risky = any(flags.values())
        policy_action = _policy_action_for(is_error=is_error, risky=risky)
        if policy_action in {"denied", "audited"} or is_error:
            any_hold = True

        latency_ms = call["latency_ms"]
        latency_measured = latency_ms is not None

        decision: dict[str, Any] = {
            "toolName": tool_name,
            "toolCallNumber": call["call_number"],
            "isError": is_error,
            "durationMs": float(latency_ms) if latency_measured else 0.0,
            "policyAction": policy_action,
            "toolInput": tool_input if include_raw_content else {},
        }
        if risky:
            triggered = sorted(name for name, hit in flags.items() if hit)
            decision["policyReason"] = "risk heuristics: " + ", ".join(triggered)
            decision["matchedPolicyId"] = f"weak-label-{triggered[0]}"

        decision_record = _envelope(
            record_type=RECORD_TYPE_GOVERNANCE_DECISION,
            runtime_type=runtime_type,
            record_id=f"{session_id}-{call['tool_use_id']}",
            org_id=org_id,
            session_id=session_id,
            ts=call["ts"],
        )
        # The unmeasured/measured state is carried out-of-band in runtimeMeta
        # (a passthrough envelope field) because durationMs must always be a
        # number; the event layer reads this to set latency_measured honestly.
        decision_record["runtimeMeta"] = {"latencyMeasured": latency_measured}
        decision_record["decision"] = decision
        records.append(
            validate_runtime_record(
                decision_record,
                context=decision_record["id"],
                include_raw_content=include_raw_content,
            )
        )

        turn: dict[str, Any] = {
            "turnNumber": call["call_number"],
            "role": "tool",
            "toolName": tool_name,
        }
        if latency_measured:
            turn["latencyMs"] = float(latency_ms)
        if include_raw_content:
            turn["toolInput"] = tool_input
            turn["toolResult"] = result_text
        turns.append(turn)

    # Interleave assistant/user text turns so the session_output transcript is the
    # real "full session output" rather than tool calls only. Turns are ordered by
    # their turnNumber so text and tool turns stay in conversational order.
    for text_turn in text_turns or []:
        emitted: dict[str, Any] = {
            "turnNumber": text_turn["turn_number"],
            "role": text_turn["role"],
        }
        if include_raw_content and text_turn.get("text"):
            emitted["text"] = text_turn["text"]
        turns.append(emitted)
    turns.sort(key=lambda t: t["turnNumber"])

    outcome = terminal_outcome if terminal_outcome in {"complete", "error"} else "complete"
    if outcome == "error":
        any_hold = True

    output: dict[str, Any] = {
        "outcome": outcome,
        "turns": turns,
        "evalLabel": {
            "decision": "hold" if any_hold else "clear",
            "escalate": any_hold,
        },
    }
    if token_usage is not None:
        output["tokenUsage"] = token_usage

    # Prefer the last real timestamp seen (call or text turn); fall back to epoch.
    candidate_ts = [c["ts"] for c in calls if c.get("ts")]
    candidate_ts += [t["ts"] for t in (text_turns or []) if t.get("ts")]
    session_ts = candidate_ts[-1] if candidate_ts else "1970-01-01T00:00:00.000Z"

    session_record = _envelope(
        record_type=RECORD_TYPE_SESSION_OUTPUT,
        runtime_type=runtime_type,
        record_id=f"{session_id}-output",
        org_id=org_id,
        session_id=session_id,
        ts=session_ts,
    )
    session_record["output"] = output
    records.append(
        validate_runtime_record(
            session_record,
            context=session_record["id"],
            include_raw_content=include_raw_content,
        )
    )
    return records


# ── claude-code adapter ──────────────────────────────────────────────────────


def _tool_result_text(content: Any) -> str:
    """Flatten a Claude Code tool_result ``content`` into plain text.

    ``content`` is either a string or a list of blocks ``{"type":"text","text":…}``
    (and occasionally other block types whose ``text`` we best-effort collect).
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict):
                text = _string(block.get("text"))
                if text:
                    parts.append(text)
            elif isinstance(block, str):
                parts.append(block)
        return "\n".join(parts)
    if isinstance(content, dict):
        return _string(content.get("text")) or ""
    return ""


def adapt_claude_code_transcript(
    entries: list[dict[str, Any]],
    *,
    org_id: str,
    session_id: str,
    include_raw_content: bool = False,
) -> list[dict[str, Any]]:
    """Adapt a real Claude Code transcript JSONL into unified runtime records.

    Real Claude Code transcripts are one JSON object per line with a top-level
    ``type`` (``assistant`` | ``user`` | ``system`` | ``attachment`` | ``summary``
    | …). The conversation payload is nested under ``message``:

      * assistant lines: ``message.content`` is a list of blocks. Tool calls are
        ``{"type":"tool_use","id":"toolu_…","name":"Bash","input":{…}}`` blocks;
        assistant text is ``{"type":"text","text":…}`` blocks. Token usage is
        under ``message.usage``.
      * user lines: ``message.content`` is a list (or a plain string). Tool
        results are ``{"type":"tool_result","tool_use_id":"toolu_…","content":…,
        "is_error":bool}`` blocks; user text is a plain string or ``text`` blocks.

    Tool calls and their matching results are paired by id into one
    governance_decision per call. Assistant/user text becomes session_output
    turns. ``durationMs`` is derived from the timestamp delta between the tool_use
    line and its matching tool_result line; when unmeasurable it is left
    unmeasured (latency_measured=False).
    """
    calls_by_id: dict[str, dict[str, Any]] = {}
    ordered: list[str] = []
    text_turns: list[dict[str, Any]] = []
    terminal_outcome = "complete"
    call_number = 0
    turn_seq = 0

    for entry in entries:
        etype = _string(entry.get("type")) or ""
        message = entry.get("message")
        line_ts = _string(entry.get("timestamp"))
        line_ts_ms = _parse_rfc3339_ms(line_ts)

        if etype == "assistant" and isinstance(message, dict):
            content = message.get("content")
            blocks = content if isinstance(content, list) else []
            for block in blocks:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type")
                if btype == "tool_use":
                    tool_use_id = _string(block.get("id")) or f"call-{call_number + 1}"
                    call_number += 1
                    turn_seq += 1
                    tool_input = block.get("input")
                    if not isinstance(tool_input, dict):
                        tool_input = {}
                    calls_by_id[tool_use_id] = {
                        "tool_name": _string(block.get("name")) or "unknown",
                        "tool_use_id": tool_use_id,
                        "tool_input": tool_input,
                        "result_text": "",
                        "is_error": False,
                        "latency_ms": None,
                        "call_number": turn_seq,
                        "ts": line_ts or "1970-01-01T00:00:00.000Z",
                        "_call_ts_ms": line_ts_ms,
                    }
                    ordered.append(tool_use_id)
                elif btype == "text":
                    text = _string(block.get("text"))
                    if text:
                        turn_seq += 1
                        text_turns.append({
                            "turn_number": turn_seq,
                            "role": "assistant",
                            "text": text,
                            "ts": line_ts,
                        })

        elif etype == "user" and isinstance(message, dict):
            content = message.get("content")
            if isinstance(content, str):
                if content.strip():
                    turn_seq += 1
                    text_turns.append({
                        "turn_number": turn_seq,
                        "role": "user",
                        "text": content,
                        "ts": line_ts,
                    })
            elif isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    btype = block.get("type")
                    if btype == "tool_result":
                        tool_use_id = _string(block.get("tool_use_id"))
                        if not tool_use_id or tool_use_id not in calls_by_id:
                            continue
                        call = calls_by_id[tool_use_id]
                        call["result_text"] = _tool_result_text(block.get("content"))
                        call["is_error"] = bool(block.get("is_error"))
                        result_ts_ms = line_ts_ms
                        call_ts_ms = call.get("_call_ts_ms")
                        if (
                            call_ts_ms is not None
                            and result_ts_ms is not None
                            and result_ts_ms >= call_ts_ms
                        ):
                            call["latency_ms"] = result_ts_ms - call_ts_ms
                    elif btype == "text":
                        text = _string(block.get("text"))
                        if text:
                            turn_seq += 1
                            text_turns.append({
                                "turn_number": turn_seq,
                                "role": "user",
                                "text": text,
                                "ts": line_ts,
                            })

        elif etype == "error":
            terminal_outcome = "error"
        elif etype == "complete":
            reason = _string(entry.get("reason"))
            if reason and reason.lower() not in SUCCESSFUL_COMPLETE_REASONS:
                terminal_outcome = "error"

    token_usage = _extract_claude_code_token_usage(entries)
    calls = [calls_by_id[tid] for tid in ordered]
    return _records_from_paired_calls(
        runtime_type=RUNTIME_CLAUDE_CODE,
        org_id=org_id,
        session_id=session_id,
        calls=calls,
        terminal_outcome=terminal_outcome,
        token_usage=token_usage,
        include_raw_content=include_raw_content,
        text_turns=text_turns,
    )


# ── codex adapter ────────────────────────────────────────────────────────────


def adapt_codex_transcript(
    entries: list[dict[str, Any]],
    *,
    org_id: str,
    session_id: str,
    include_raw_content: bool = False,
) -> list[dict[str, Any]]:
    """Adapt a Codex CLI rollout JSONL into unified runtime records.

    Recognized line ``type`` values: ``function_call`` (name, arguments, call_id),
    ``function_call_output`` (call_id, output, success), ``message`` (role,
    content — assistant/user turns), ``turn_complete``/``error`` (terminal).
    Codex encodes ``arguments`` as a JSON-string; it is parsed into toolInput.
    """
    calls_by_id: dict[str, dict[str, Any]] = {}
    ordered: list[str] = []
    text_turns: list[dict[str, Any]] = []
    terminal_outcome = "complete"
    turn_seq = 0

    for entry in entries:
        etype = _string(entry.get("type")) or ""
        if etype == "function_call":
            call_id = _string(entry.get("call_id")) or _string(entry.get("id")) or f"call-{turn_seq + 1}"
            turn_seq += 1
            raw_args = entry.get("arguments")
            tool_input: dict[str, Any] = {}
            if isinstance(raw_args, dict):
                tool_input = raw_args
            elif isinstance(raw_args, str):
                try:
                    parsed = json.loads(raw_args)
                    if isinstance(parsed, dict):
                        tool_input = parsed
                except json.JSONDecodeError:
                    tool_input = {}
            calls_by_id[call_id] = {
                "tool_name": _string(entry.get("name")) or "unknown",
                "tool_use_id": call_id,
                "tool_input": tool_input,
                "result_text": "",
                "is_error": False,
                "latency_ms": None,
                "call_number": turn_seq,
                "ts": _string(entry.get("timestamp")) or "1970-01-01T00:00:00.000Z",
            }
            ordered.append(call_id)
        elif etype == "function_call_output":
            call_id = _string(entry.get("call_id"))
            if not call_id or call_id not in calls_by_id:
                continue
            call = calls_by_id[call_id]
            output = entry.get("output")
            if isinstance(output, dict):
                call["result_text"] = _string(output.get("content")) or json.dumps(output, sort_keys=True)
            else:
                call["result_text"] = _string(output) or ""
            success = entry.get("success")
            call["is_error"] = success is False or bool(entry.get("isError"))
        elif etype == "message":
            # role/content -> assistant/user turns. role "system" maps through;
            # any other/unknown role defaults to "assistant" so the turn is kept.
            role = (_string(entry.get("role")) or "assistant").lower()
            if role not in ("user", "assistant", "system"):
                role = "assistant"
            text = _codex_message_text(entry.get("content"))
            if text:
                turn_seq += 1
                text_turns.append({
                    "turn_number": turn_seq,
                    "role": role,
                    "text": text,
                    "ts": _string(entry.get("timestamp")),
                })
        elif etype == "error":
            terminal_outcome = "error"
        elif etype == "turn_complete":
            status = _string(entry.get("status"))
            if status and status.lower() not in SUCCESSFUL_COMPLETE_REASONS:
                terminal_outcome = "error"

    token_usage = _extract_token_usage(entries)
    calls = [calls_by_id[cid] for cid in ordered]
    return _records_from_paired_calls(
        runtime_type=RUNTIME_CODEX,
        org_id=org_id,
        session_id=session_id,
        calls=calls,
        terminal_outcome=terminal_outcome,
        token_usage=token_usage,
        include_raw_content=include_raw_content,
        text_turns=text_turns,
    )


def _codex_message_text(content: Any) -> str:
    """Flatten a Codex ``message`` content into plain text.

    ``content`` is a plain string or a list of blocks such as
    ``{"type":"input_text"/"output_text"/"text","text":…}``.
    """
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict):
                text = _string(block.get("text"))
                if text:
                    parts.append(text)
            elif isinstance(block, str):
                parts.append(block)
        return "\n".join(parts)
    return ""


def _extract_token_usage(entries: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Best-effort accumulation of token usage from transcript lines."""
    total_in = 0
    total_out = 0
    found = False
    for entry in entries:
        usage = entry.get("usage") or entry.get("tokenUsage")
        if not isinstance(usage, dict):
            continue
        found = True
        in_tokens = usage.get("input_tokens", usage.get("totalInputTokens", usage.get("inputTokens", 0)))
        out_tokens = usage.get("output_tokens", usage.get("totalOutputTokens", usage.get("outputTokens", 0)))
        if isinstance(in_tokens, int) and not isinstance(in_tokens, bool):
            total_in += in_tokens
        if isinstance(out_tokens, int) and not isinstance(out_tokens, bool):
            total_out += out_tokens
    if not found:
        return None
    return validate_token_usage(
        {
            "totalInputTokens": total_in,
            "totalOutputTokens": total_out,
            "estimatedCost": 0.0,
        },
        context="codex.tokenUsage",
    )


def _int_field(value: Any) -> int:
    """Return ``value`` if it is a non-bool int, else 0."""
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    return 0


def _extract_claude_code_token_usage(
    entries: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Accumulate token usage from real Claude Code lines.

    Real Claude Code puts usage under ``entry["message"]["usage"]`` on assistant
    lines, with keys ``input_tokens``, ``output_tokens``,
    ``cache_read_input_tokens`` and ``cache_creation_input_tokens``. Cache reads
    and cache creations count as input tokens for the rolled-up total. The result
    is mapped to the schema's token-usage shape and validated.
    """
    total_in = 0
    total_out = 0
    found = False
    for entry in entries:
        message = entry.get("message")
        if not isinstance(message, dict):
            continue
        usage = message.get("usage")
        if not isinstance(usage, dict):
            continue
        found = True
        total_in += (
            _int_field(usage.get("input_tokens"))
            + _int_field(usage.get("cache_read_input_tokens"))
            + _int_field(usage.get("cache_creation_input_tokens"))
        )
        total_out += _int_field(usage.get("output_tokens"))
    if not found:
        return None
    return validate_token_usage(
        {
            "totalInputTokens": total_in,
            "totalOutputTokens": total_out,
            "estimatedCost": 0.0,
        },
        context="claude-code.tokenUsage",
    )


# ── stubs for cursor / copilot / gemini ───────────────────────────────────────


def adapt_cursor_transcript(
    entries: list[dict[str, Any]],
    *,
    org_id: str,
    session_id: str,
    include_raw_content: bool = False,
) -> list[dict[str, Any]]:
    """STUB. Cursor agent transcript -> unified records.

    Contract (to implement): Cursor emits a chat/agent transcript with tool
    invocations under ``toolCalls`` and results under ``toolResults`` keyed by an
    id. Map each tool call to a governance_decision record and the whole chat to
    one session_output record, exactly as :func:`adapt_claude_code_transcript`
    does — only the field extraction differs. Add no new enum value (``cursor``
    already exists).
    """
    raise NotImplementedError(
        "cursor adapter not implemented; see docstring for the target contract"
    )


def adapt_copilot_transcript(
    entries: list[dict[str, Any]],
    *,
    org_id: str,
    session_id: str,
    include_raw_content: bool = False,
) -> list[dict[str, Any]]:
    """STUB. GitHub Copilot agent transcript -> unified records.

    Contract (to implement): Copilot's session log uses ``tool_use`` /
    ``tool_result`` blocks within assistant messages. Flatten them into the same
    normalized call list and reuse :func:`_records_from_paired_calls`.
    """
    raise NotImplementedError(
        "copilot adapter not implemented; see docstring for the target contract"
    )


def adapt_gemini_transcript(
    entries: list[dict[str, Any]],
    *,
    org_id: str,
    session_id: str,
    include_raw_content: bool = False,
) -> list[dict[str, Any]]:
    """STUB. Gemini CLI transcript -> unified records.

    Contract (to implement): Gemini emits ``functionCall`` / ``functionResponse``
    parts inside content blocks. Map each functionCall+functionResponse pair to a
    normalized call and reuse :func:`_records_from_paired_calls`.
    """
    raise NotImplementedError(
        "gemini adapter not implemented; see docstring for the target contract"
    )


RUNTIME_ADAPTERS: dict[str, Callable[..., list[dict[str, Any]]]] = {
    RUNTIME_CLAUDE_CODE: adapt_claude_code_transcript,
    RUNTIME_CODEX: adapt_codex_transcript,
    RUNTIME_CURSOR: adapt_cursor_transcript,
    RUNTIME_COPILOT: adapt_copilot_transcript,
    RUNTIME_GEMINI: adapt_gemini_transcript,
}


# ── unified records -> normalized 8-feature training events ───────────────────


def _event_from_decision_record(
    record: dict[str, Any],
    *,
    index: int,
    split: str,
    application: str,
) -> dict[str, Any]:
    decision = record["decision"]
    org_id = record["orgId"]
    session_id = record["sessionId"]
    record_id = record["id"]
    policy_action = decision["policyAction"]
    is_error = decision["isError"]
    duration_ms = decision.get("durationMs")
    matched_policy_id = decision.get("matchedPolicyId")
    policy_reason = decision.get("policyReason")

    # latency_measured must be True ONLY when latency was actually measured. The
    # adapter records it explicitly in runtimeMeta.latencyMeasured because
    # durationMs is forced to a number (0.0 when unmeasured) by the schema. For
    # records that predate this flag (e.g. lifted legacy audit entries with a real
    # measured duration), fall back to ``durationMs is not None``.
    runtime_meta = record.get("runtimeMeta")
    if isinstance(runtime_meta, dict) and "latencyMeasured" in runtime_meta:
        latency_measured = bool(runtime_meta["latencyMeasured"])
    else:
        latency_measured = duration_ms is not None

    operator_review_required = policy_action in {"denied", "audited"} or is_error
    evidence_complete = bool(decision.get("toolName") and policy_action and latency_measured)
    approval_refs_complete = policy_action == "allowed" or bool(matched_policy_id or policy_reason)
    detection_count = sum(
        [
            1 if policy_action in {"denied", "audited"} else 0,
            1 if is_error else 0,
            1 if matched_policy_id else 0,
            1 if policy_reason else 0,
        ]
    )
    decision_label = "hold_for_operator_review" if operator_review_required else "clear_for_operator_review"
    event = {
        "event_id": f"runtime-decision-{org_id}-{session_id}-{record_id}",
        "application": application,
        "evidence_ref": f"gal://sessions/{org_id}/{session_id}/runtime/decision/{record_id}",
        "split": split,
        "features": {
            "people_present": False,
            "vehicles_present": False,
            "obstacles_present": False,
            "evidence_complete": evidence_complete,
            "operator_review_required": operator_review_required,
            "latency_measured": latency_measured,
            "approval_refs_complete": approval_refs_complete,
            "detection_count": detection_count,
        },
        "outcome": {
            "decision": decision_label,
            "escalate_for_deeper_review": operator_review_required,
        },
    }
    validate_audit_event(event, context=event["event_id"])
    return event


def _event_from_output_record(
    record: dict[str, Any],
    *,
    index: int,
    split: str,
    application: str,
) -> dict[str, Any]:
    output = record["output"]
    org_id = record["orgId"]
    session_id = record["sessionId"]
    record_id = record["id"]
    eval_label = output.get("evalLabel", {})
    hold = eval_label.get("decision") == "hold" or output["outcome"] == "error"
    turns = output.get("turns", [])
    latency_measured = any("latencyMs" in turn for turn in turns)
    detection_count = sum(1 for turn in turns if turn.get("role") == "tool")
    decision_label = "hold_for_operator_review" if hold else "clear_for_operator_review"
    event = {
        "event_id": f"runtime-output-{org_id}-{session_id}-{record_id}",
        "application": application,
        "evidence_ref": f"gal://sessions/{org_id}/{session_id}/runtime/output/{record_id}",
        "split": split,
        "features": {
            "people_present": False,
            "vehicles_present": False,
            "obstacles_present": False,
            "evidence_complete": bool(turns),
            "operator_review_required": hold,
            "latency_measured": latency_measured,
            "approval_refs_complete": output.get("outcome") == "complete",
            "detection_count": detection_count,
        },
        "outcome": {
            "decision": decision_label,
            "escalate_for_deeper_review": bool(eval_label.get("escalate", hold)),
        },
    }
    validate_audit_event(event, context=event["event_id"])
    return event


def normalized_events_from_runtime_records(
    records: list[dict[str, Any]],
    *,
    split: str,
    application: str,
) -> list[dict[str, Any]]:
    """Normalize unified runtime records into 8-feature training events.

    governance_decision -> one event; session_output -> one event. This is the
    bridge that lets both record types feed the unchanged dataset builder.
    """
    if split not in VALID_SPLITS:
        raise ValueError(f"split must be one of {VALID_SPLITS!r}")
    events: list[dict[str, Any]] = []
    for index, record in enumerate(records):
        if record["recordType"] == RECORD_TYPE_GOVERNANCE_DECISION:
            events.append(
                _event_from_decision_record(record, index=index, split=split, application=application)
            )
        else:
            events.append(
                _event_from_output_record(record, index=index, split=split, application=application)
            )
    return events


# ── CLI ──────────────────────────────────────────────────────────────────────


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--runtime-type",
        choices=VALID_RUNTIME_TYPES,
        default=RUNTIME_CLAUDE_CODE,
    )
    parser.add_argument("--split", choices=VALID_SPLITS, default="train")
    parser.add_argument("--application", default="gal-runtime-record")
    parser.add_argument("--org", default="unknown-org")
    parser.add_argument("--session-id", default="unknown-session")
    parser.add_argument(
        "--include-raw-content",
        action="store_true",
        default=False,
        help="Retain raw transcript text in session_output turns (default off).",
    )
    parser.add_argument(
        "--emit",
        choices=("events", "records"),
        default="events",
        help="Emit normalized training events (default) or the unified records.",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    adapter = RUNTIME_ADAPTERS.get(args.runtime_type)
    try:
        if adapter is None:
            raise ValueError(f"no adapter registered for runtime {args.runtime_type!r}")
        entries = load_transcript_lines(args.input)
        records = adapter(
            entries,
            org_id=args.org,
            session_id=args.session_id,
            include_raw_content=args.include_raw_content,
        )
    except (ValueError, NotImplementedError) as exc:
        print(str(exc), file=sys.stderr)
        return 2

    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.emit == "records":
        write_jsonl(args.output, records)
        rows = records
    else:
        events = normalized_events_from_runtime_records(
            records, split=args.split, application=args.application
        )
        write_jsonl(args.output, events)
        rows = events

    print(
        json.dumps(
            {
                "audit_event_schema_ref": AUDIT_EVENT_SCHEMA_REF,
                "input": args.input.as_posix(),
                "output": args.output.as_posix(),
                "runtime_type": args.runtime_type,
                "records": len(records),
                "rows": len(rows),
                "emit": args.emit,
                "split": args.split,
                "application": args.application,
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
