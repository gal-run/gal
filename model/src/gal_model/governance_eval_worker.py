"""Governance EVAL WORKER: drain the telemetry backlog into governance verdicts.

This is the gal-model half of the verdict-storage contract. It is a thin,
**creds-free** HTTP client (only a JWT, no Firestore access) that periodically:

  1. GETs unprocessed session_outputs from telemetry-svc
     (``GET /session-outputs?processed=false&includeTranscript=true``),
  2. scores each one IN-PROCESS with the real governance model
     (:func:`governance_eval.evaluate_session_output` — reused, not
     reimplemented), and
  3. POSTs a compact, metadata-only verdict back to telemetry-svc
     (``POST /governance-verdicts``), which atomically stores the verdict and
     marks the source ``processed=true``.

Design notes that are load-bearing for the shared contract:

  * **stdlib urllib only** — no ``requests``/``httpx``. A pyproject-built worker
    image has no third-party HTTP lib (matches ``runpod_endpoint_preflight`` and
    ``github_pr_review_adapter``). The ``get_fn`` / ``post_fn`` seams let tests
    inject fakes without monkeypatching ``urlopen`` (though that works too).
  * **org scoping is server-side** — the worker never sends ``orgId``; the
    telemetry handler forces it from the ``org_id`` JWT claim.
  * **compact scoredDecisions** — each full scored decision is projected down to
    exactly ``{toolName, decisionShort, confidence}`` before POSTing. Everything
    else (``features``, long-form ``predicted``, ``groundTruth``, ``match``,
    ``recordId``, ``turnSeq``, ``policyAction``, ``isError``, ``latencyMs``,
    ``satisfied``, ``needsFeedback``) is DROPPED. Verdicts stay metadata-only and
    dashboard-cheap; ``toolName`` is already length-capped + secret-masked by the
    eval engine, so it is safe to persist.
  * **fail-safe per record** — one bad record never aborts the batch. A POST
    failure leaves the doc ``processed=false`` (retried next run, at-least-once).
    A per-record eval that returns ``error != None`` still carries a valid
    hold/escalate verdict and is STILL posted (and STILL marks the source
    processed), so a permanently-unadaptable doc never wedges the backlog.
  * **bounded work** — at most ``batch_size * max_batches`` docs per invocation,
    so a huge backlog drains over several CronJob ticks instead of one runaway
    pod. ``offset`` stays 0 every page: scored docs fall out of the
    ``processed=false`` set, so the next page naturally surfaces fresh docs.
  * **idempotent** — the processed flag is the only dedupe; re-runs are safe
    (deterministic decision for a fixed checkpoint).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Callable

from .governance_eval import evaluate_session_output

# ── defaults (overridable via env / CLI) ─────────────────────────────────────
DEFAULT_BATCH_SIZE = 50
DEFAULT_MAX_BATCHES = 20
DEFAULT_HTTP_TIMEOUT_S = 30
DEFAULT_LOOP_INTERVAL_S = 600  # 10 min; only used in --loop mode

# Fetch/Post function signatures (the test seams):
#   GetFn(url: str, token: str, timeout: float) -> dict   # parsed JSON body
#   PostFn(url: str, token: str, body: dict, timeout: float) -> dict
GetFn = Callable[[str, str, float], dict]
PostFn = Callable[[str, str, dict, float], dict]


def _now_rfc3339() -> str:
    """Worker-clock UTC timestamp, e.g. ``2026-06-03T10:00:00.123456+00:00``."""
    return datetime.now(timezone.utc).isoformat()


def _log(message: str) -> None:
    """Single-line structured-ish log to stderr (never logs secrets/tokens)."""
    print(f"[gal-governance-eval-worker] {message}", file=sys.stderr, flush=True)


# ── default stdlib-urllib HTTP transports (overridable for tests) ────────────


def _http_get_json(url: str, token: str, timeout: float) -> dict:
    """GET ``url`` with a Bearer JWT and return the parsed JSON body.

    Raises ``urllib.error.HTTPError`` / ``URLError`` on transport failure so the
    caller can decide how to degrade (the run loop treats a failed GET as fatal
    only when NOTHING was scored).
    """
    request = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _http_post_json(url: str, token: str, body: dict, timeout: float) -> dict:
    """POST ``body`` as JSON with a Bearer JWT and return the parsed JSON body."""
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw else {}


# ── compact projection (the load-bearing contract rule) ──────────────────────


def compact_scored_decisions(scored: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Project full scored decisions down to the metadata-only verdict shape.

    Keeps EXACTLY ``{toolName, decisionShort, confidence}`` per decision and
    drops everything else (features, long-form predicted, groundTruth, match,
    recordId, turnSeq, policyAction, isError, latencyMs, satisfied,
    needsFeedback). A per-call failure record (which carries only
    ``{recordId, recordType, toolCallNumber, error}``) projects to nulls — it
    has no toolName/decisionShort, which is correct: it contributed an error to
    the session counts, not a clear/hold verdict.
    """
    compact: list[dict[str, Any]] = []
    for d in scored:
        if not isinstance(d, dict):
            continue
        compact.append(
            {
                "toolName": d.get("toolName"),
                "decisionShort": d.get("decisionShort"),
                "confidence": d.get("confidence"),
            }
        )
    return compact


def build_verdict_body(result: dict[str, Any], doc: dict[str, Any]) -> dict[str, Any]:
    """Build the camelCase verdict wire body from an eval result + source doc.

    Mirrors the VERDICT STORAGE CONTRACT exactly. ``orgId`` is intentionally
    OMITTED — telemetry forces it from the ``org_id`` JWT claim and ignores any
    body value. ``sourceId`` is the session_outputs doc id (``doc["id"]``,
    surfaced on every queried entry) so the handler can mark it processed.
    """
    session_eval = result.get("sessionEval") or {}
    return {
        "sessionId": result.get("sessionId"),
        "sourceId": doc.get("id"),
        "runtimeType": result.get("runtimeType"),
        "sessionEval": {
            "decision": session_eval.get("decision"),
            "escalate": session_eval.get("escalate"),
            "confidence": session_eval.get("confidence"),
            "counts": session_eval.get("counts"),
        },
        "scoredDecisions": compact_scored_decisions(result.get("scoredDecisions") or []),
        "tokenUsage": result.get("tokenUsage"),
        "modelRef": result.get("modelRef"),
        "evaluatedAt": _now_rfc3339(),
        "error": result.get("error"),
    }


# ── URL helpers ──────────────────────────────────────────────────────────────


def _session_outputs_url(base: str, *, batch_size: int) -> str:
    query = urllib.parse.urlencode(
        {
            "processed": "false",
            "includeTranscript": "true",
            "limit": str(batch_size),
            "offset": "0",
        }
    )
    return f"{base.rstrip('/')}/session-outputs?{query}"


def _verdicts_url(base: str) -> str:
    return f"{base.rstrip('/')}/governance-verdicts"


# ── the run-once batch drain ─────────────────────────────────────────────────


def run_once(
    telemetry_base_url: str,
    token: str,
    *,
    model_path: str | None = None,
    batch_size: int = DEFAULT_BATCH_SIZE,
    max_batches: int = DEFAULT_MAX_BATCHES,
    http_timeout: float = DEFAULT_HTTP_TIMEOUT_S,
    sidecar: dict[str, Any] | None = None,
    get_fn: GetFn | None = None,
    post_fn: PostFn | None = None,
) -> dict[str, Any]:
    """Drain the telemetry backlog once, scoring + posting verdicts.

    Args:
        telemetry_base_url: e.g. ``http://telemetry-svc...:8080``.
        token: the service JWT (HS256). Sent as ``Authorization: Bearer``.
        model_path: GAL checkpoint path. ``None`` => auto-detect.
        batch_size: GET page size (telemetry caps at 500).
        max_batches: hard cap on pages per invocation (bounds total work).
        http_timeout: per-request timeout in seconds.
        sidecar: an already-loaded sidecar (the test seam). When ``None`` the
            model is loaded ONCE here and reused across the whole run; a load
            failure is non-fatal (each record degrades to a hold/escalate
            verdict with ``error`` set — the backlog still drains, fail-safe).
        get_fn / post_fn: HTTP transports (default = stdlib urllib). Injectable
            so tests can run without a real telemetry-svc.

    Returns:
        ``{fetched, scored, posted, errors, batches, modelLoaded}`` summary.

    Raises:
        Only on a GET failure of the VERY FIRST page when nothing was scored
        (genuine auth/connectivity failure -> non-zero exit). Any failure after
        at least one record was processed is swallowed and reported in the
        summary, so partial progress is never lost.
    """
    get_fn = get_fn or _http_get_json
    post_fn = post_fn or _http_post_json

    # Load the model ONCE up front (unless a sidecar was injected). A failure is
    # non-fatal: pass sidecar=None into evaluate_session_output so each record
    # degrades to error="governance model unavailable: ..." (a hold/escalate
    # verdict). A model-down run still drains the backlog — fail-safe.
    model_loaded = sidecar is not None
    if sidecar is None:
        try:
            from .governance_sidecar import load_governance_sidecar

            sidecar = load_governance_sidecar(model_path=model_path)
            model_loaded = True
            _log("governance model loaded")
        except Exception as exc:  # noqa: BLE001 - degrade, never abort the run
            sidecar = None
            model_loaded = False
            _log(f"governance model unavailable (degrading to hold/escalate): {exc}")

    get_url = _session_outputs_url(telemetry_base_url, batch_size=batch_size)
    post_url = _verdicts_url(telemetry_base_url)

    summary = {
        "fetched": 0,
        "scored": 0,
        "posted": 0,
        "errors": 0,
        "batches": 0,
        "modelLoaded": model_loaded,
    }

    for batch_index in range(max_batches):
        # offset stays 0 every page: a scored doc is marked processed=true by the
        # verdict POST and falls out of the processed=false set, so the next GET
        # naturally surfaces fresh docs (advancing offset would SKIP the new head).
        try:
            page = get_fn(get_url, token, http_timeout)
        except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
            if summary["scored"] == 0:
                # First-page failure with nothing done = genuine connectivity/auth
                # failure -> surface as a non-zero exit (re-raise).
                _log(f"FATAL: initial /session-outputs GET failed: {exc}")
                raise
            # Later-page failure: keep the partial progress, stop draining.
            _log(f"WARN: /session-outputs GET failed mid-drain, stopping: {exc}")
            break

        entries = page.get("entries") if isinstance(page, dict) else None
        if not entries:
            # Backlog drained (or empty).
            break

        summary["batches"] += 1
        summary["fetched"] += len(entries)

        for doc in entries:
            if not isinstance(doc, dict):
                summary["errors"] += 1
                continue
            # evaluate_session_output NEVER raises; a bad record returns a result
            # with error!=None and an empty scoredDecisions list (still a valid
            # hold/escalate verdict that we post + that marks the source done).
            result = evaluate_session_output(doc, sidecar, model_path=model_path)
            summary["scored"] += 1
            if result.get("error"):
                summary["errors"] += 1

            body = build_verdict_body(result, doc)
            try:
                post_fn(post_url, token, body, http_timeout)
                summary["posted"] += 1
            except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
                # POST failed: the doc stays processed=false and is retried next
                # run (at-least-once). Log and CONTINUE — never abort the batch.
                _log(
                    f"WARN: verdict POST failed for source={doc.get('id')!r} "
                    f"session={result.get('sessionId')!r}: {exc}"
                )
                summary["errors"] += 1
                continue

        # A short page means the backlog is drained — stop early.
        if len(entries) < batch_size:
            break

    _log(
        "run_once complete: "
        + ", ".join(f"{k}={v}" for k, v in summary.items())
    )
    return summary


# ── CLI ──────────────────────────────────────────────────────────────────────


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "GAL governance EVAL WORKER — drain unprocessed session_outputs from "
            "telemetry-svc into compact governance verdicts (in-process scoring)."
        )
    )
    parser.add_argument(
        "--telemetry-url",
        default=os.getenv("TELEMETRY_URL"),
        help="telemetry-svc base URL (env TELEMETRY_URL). e.g. http://telemetry-svc:8080",
    )
    token_group = parser.add_mutually_exclusive_group()
    token_group.add_argument(
        "--token",
        default=None,
        help="service JWT (HS256). Prefer --token-env to avoid leaking into argv.",
    )
    token_group.add_argument(
        "--token-env",
        default="GAL_WORKER_JWT",
        help="env var holding the service JWT (default GAL_WORKER_JWT).",
    )
    parser.add_argument(
        "--model-path",
        default=os.getenv("GAL_MODEL_PATH") or None,
        help="GAL checkpoint path (env GAL_MODEL_PATH; auto-detected if omitted).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=int(os.getenv("BATCH_SIZE", str(DEFAULT_BATCH_SIZE))),
        help=f"GET page size, capped at 500 (default {DEFAULT_BATCH_SIZE}).",
    )
    parser.add_argument(
        "--max-batches",
        type=int,
        default=int(os.getenv("MAX_BATCHES", str(DEFAULT_MAX_BATCHES))),
        help=f"max pages per invocation (default {DEFAULT_MAX_BATCHES}).",
    )
    parser.add_argument(
        "--http-timeout",
        type=float,
        default=float(os.getenv("HTTP_TIMEOUT", str(DEFAULT_HTTP_TIMEOUT_S))),
        help=f"per-request timeout seconds (default {DEFAULT_HTTP_TIMEOUT_S}).",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--once",
        action="store_true",
        default=True,
        help="run a single drain and exit (default; CronJob-friendly).",
    )
    mode.add_argument(
        "--loop-interval",
        type=float,
        default=None,
        help=(
            "run forever, draining every N seconds (long-lived Deployment mode). "
            "Mutually exclusive with --once."
        ),
    )
    return parser.parse_args(argv)


def _resolve_token(args: argparse.Namespace) -> str | None:
    if args.token:
        return args.token
    return os.getenv(args.token_env)


def console_main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])

    if not args.telemetry_url:
        _log("FATAL: missing --telemetry-url (or env TELEMETRY_URL)")
        return 2
    token = _resolve_token(args)
    if not token:
        _log(
            "FATAL: missing service JWT (set --token, or env "
            f"{args.token_env!r} via --token-env)"
        )
        return 2
    if args.batch_size < 1 or args.batch_size > 500:
        _log("FATAL: --batch-size must be in 1..500")
        return 2

    def _drain() -> dict[str, Any]:
        return run_once(
            args.telemetry_url,
            token,
            model_path=args.model_path,
            batch_size=args.batch_size,
            max_batches=args.max_batches,
            http_timeout=args.http_timeout,
        )

    # Long-lived loop mode (optional). --once is the default CronJob path.
    if args.loop_interval is not None:
        interval = max(1.0, args.loop_interval)
        _log(f"loop mode: draining every {interval:.0f}s")
        while True:
            try:
                _drain()
            except Exception as exc:  # noqa: BLE001 - loop survives a bad cycle
                _log(f"WARN: drain cycle failed, retrying after interval: {exc}")
            time.sleep(interval)

    # Run-once mode: non-zero exit ONLY when an auth/connectivity failure scored
    # nothing (run_once re-raises that case). Any partial progress => exit 0.
    try:
        _drain()
    except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
        _log(f"FATAL: drain failed before scoring anything: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(console_main())
