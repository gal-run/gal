"""Benchmark an OpenAI-compatible baseline on GAL runtime cases."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .llm_baseline_benchmark import (
    build_prompt,
    parse_baseline_response,
    run_baseline,
    sample_cases,
)
from .runtime_benchmark import load_cases

DEFAULT_BASE_URL = "http://localhost:8000/v1/chat/completions"
DEFAULT_MODEL = "baseline-model"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--endpoint", default=os.environ.get("OPENAI_BASELINE_ENDPOINT", DEFAULT_BASE_URL))
    parser.add_argument("--api-key", default=os.environ.get("OPENAI_API_KEY"))
    parser.add_argument("--model", default=os.environ.get("OPENAI_BASELINE_MODEL", DEFAULT_MODEL))
    parser.add_argument("--max-cases", type=int, default=40)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--output", type=Path)
    return parser.parse_args(argv)


def call_openai_compatible(
    *,
    endpoint: str,
    api_key: str | None,
    model: str,
    system: str,
    user: str,
) -> tuple[str, float]:
    body = {
        "model": model,
        "temperature": 0,
        "max_tokens": 256,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    is_runpod_runsync = _is_runpod_runsync(endpoint)
    headers = _build_headers(api_key=api_key, is_runpod=is_runpod_runsync)
    request_body = {"input": body} if is_runpod_runsync else body

    request = urllib.request.Request(
        endpoint,
        data=json.dumps(request_body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=300 if is_runpod_runsync else 90) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body_preview = exc.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"baseline endpoint returned {exc.code}: {body_preview}") from exc
    latency_ms = (time.perf_counter() - started) * 1000.0

    if is_runpod_runsync:
        payload = _resolve_runpod_payload(endpoint=endpoint, api_key=api_key, payload=payload)
        payload = _unwrap_runpod_output(payload)

    return _extract_openai_text(payload), latency_ms


def _is_runpod_runsync(endpoint: str) -> bool:
    return "/runsync" in endpoint


def _build_headers(*, api_key: str | None, is_runpod: bool) -> dict[str, str]:
    headers = {"content-type": "application/json"}
    if api_key:
        headers["authorization"] = api_key if is_runpod else f"Bearer {api_key}"
    return headers


def _runpod_status_endpoint(endpoint: str, request_id: str) -> str:
    runsync_marker = "/runsync"
    prefix, _, _ = endpoint.partition(runsync_marker)
    if not prefix:
        raise ValueError(f"cannot derive RunPod status endpoint from {endpoint!r}")
    return f"{prefix}/status/{request_id}"


def _resolve_runpod_payload(
    *,
    endpoint: str,
    api_key: str | None,
    payload: dict[str, Any],
) -> dict[str, Any]:
    status = payload.get("status")
    if not isinstance(status, str) or status == "COMPLETED":
        return payload

    request_id = payload.get("id")
    if not isinstance(request_id, str) or not request_id:
        raise ValueError("RunPod payload is missing request id")

    status_endpoint = _runpod_status_endpoint(endpoint, request_id)
    headers = {}
    if api_key:
        headers["authorization"] = api_key

    while status in {"IN_QUEUE", "IN_PROGRESS", "IN_PROGRESS_QUEUE"}:
        time.sleep(2)
        status_request = urllib.request.Request(status_endpoint, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(status_request, timeout=300) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body_preview = exc.read().decode("utf-8", errors="replace")[:500]
            raise RuntimeError(f"RunPod status endpoint returned {exc.code}: {body_preview}") from exc
        status = payload.get("status")

    if status != "COMPLETED":
        raise RuntimeError(str(payload.get("error") or f"RunPod request finished with status {status!r}"))
    return payload


def _unwrap_runpod_output(payload: dict[str, Any]) -> dict[str, Any]:
    output = payload.get("output")
    if isinstance(output, dict):
        return output
    return payload


def _extract_openai_text(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("baseline response did not include choices")
    first = choices[0]
    if not isinstance(first, dict):
        raise ValueError("baseline response choice must be an object")
    message = first.get("message")
    if isinstance(message, dict) and isinstance(message.get("content"), str):
        return message["content"].strip()
    text = first.get("text")
    if isinstance(text, str):
        return text.strip()
    raise ValueError("baseline response did not include message content")


def run_openai_baseline(
    cases: list[dict[str, Any]],
    *,
    endpoint: str,
    api_key: str | None,
    model: str,
) -> dict[str, Any]:
    def caller(*, base_url: str, api_key: str, model: str, system: str, user: str) -> tuple[str, float]:
        return call_openai_compatible(endpoint=base_url, api_key=api_key or None, model=model, system=system, user=user)

    # Reuse the main baseline runner by monkey-patching the expected call signature locally.
    import gal_model.llm_baseline_benchmark as llm_mod

    original = llm_mod.call_anthropic_compatible
    try:
        llm_mod.call_anthropic_compatible = caller  # type: ignore[assignment]
        result = run_baseline(cases, base_url=endpoint, api_key=api_key or "", model=model)
    finally:
        llm_mod.call_anthropic_compatible = original  # type: ignore[assignment]
    result["benchmark"] = "gal_native_runtime_governance_openai_baseline"
    result["baseline_type"] = "openai_compatible_llm"
    result["base_url"] = endpoint
    return result


def console_main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    cases = sample_cases(load_cases(args.cases), max_cases=args.max_cases, seed=args.seed)
    result = run_openai_baseline(cases, endpoint=args.endpoint, api_key=args.api_key, model=args.model)
    output = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
    sys.stdout.write(output)
    return 0 if not result["errors"] else 1


if __name__ == "__main__":
    raise SystemExit(console_main())
