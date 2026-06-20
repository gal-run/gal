#!/usr/bin/env python3
"""M4a cost-first computer-use spike — deterministic driver.

Drives the gal-browser-use-service /agent/run over a fixture of web tasks and emits a
per-(task,profile) row: success-rate, mean cost, mean duration, and the headline
**cost-per-success** and **duration-per-success**.

Decision metric = tasks-succeeded-per-dollar AND per-minute. The model cost target
($/M input <= $0.3-0.4) is a GUARDRAIL, not the report unit: the gemini profile is
priced; a local/MLX profile is ~$0/token by construction, so the two are compared on
success-weighted cost + wall-clock, not raw $/M.

Boundary note: this script ONLY issues HTTP to an already-running service/model endpoint.
It never launches, serves, fetches, or trains a model (gal-model ML boundary).

Run (slice 1, Gemini-only):
    SERVICE_AUTH_TOKEN=... python runner.py --profile gemini --repeat 3
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# Per-1M-token USD rates. PLACEHOLDERS — confirm against current Gemini API pricing
# before trusting the $ figures. Override per-run with --in-rate / --out-rate.
DEFAULT_RATES = {
    # gemini-2.5-flash (verify): input/output USD per 1M tokens
    "gemini": {"in": 0.30, "out": 2.50},
    # local/MLX = $0 marginal by construction
    "mlx": {"in": 0.0, "out": 0.0},
}


def call_agent_run(service_url: str, token: str | None, payload: dict, timeout: float) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(f"{service_url.rstrip('/')}/agent/run", data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def run(args: argparse.Namespace) -> int:
    fixture = json.loads(Path(args.fixture).read_text())
    token = os.environ.get("SERVICE_AUTH_TOKEN")
    if not token:
        print("WARN: SERVICE_AUTH_TOKEN unset — service must be in dev (unauth) mode.", file=sys.stderr)
    rates = DEFAULT_RATES.get(args.profile, {"in": args.in_rate, "out": args.out_rate})
    in_rate = args.in_rate if args.in_rate is not None else rates["in"]
    out_rate = args.out_rate if args.out_rate is not None else rates["out"]
    model = "gemini-2.5-flash" if args.profile == "gemini" else os.environ.get("MLX_MODEL", "ui-tars")

    rows = []
    for task in fixture:
        runs = []
        for i in range(args.repeat):
            payload = {"task": task["task"], "start_url": task.get("start_url"),
                       "model": model, "max_steps": args.max_steps}
            t0 = time.monotonic()
            try:
                resp = call_agent_run(args.service_url, token, payload, args.timeout)
            except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
                print(f"  [{task['name']} #{i+1}] HTTP error: {exc}", file=sys.stderr)
                runs.append({"success": False, "in": 0, "out": 0, "cost": 0.0,
                             "duration": time.monotonic() - t0, "error": str(exc)})
                continue
            # SUCCESS is computed CODE-SIDE (deterministic) — not the service success bit.
            result_text = (resp.get("result") or "").lower()
            success = task["success_substring"].lower() in result_text
            in_tok = resp.get("input_tokens") or 0
            out_tok = resp.get("output_tokens") or 0
            cost = in_tok / 1e6 * in_rate + out_tok / 1e6 * out_rate  # primary: tokens x rate
            runs.append({"success": success, "in": in_tok, "out": out_tok, "cost": cost,
                         "duration": resp.get("duration_s") or (time.monotonic() - t0),
                         "service_cost": resp.get("total_cost"),  # cross-check (may be None)
                         "is_successful_service": resp.get("is_successful"),
                         "gif": resp.get("gif_path"), "video": resp.get("video_path")})

        n = len(runs)
        succ = [r for r in runs if r["success"]]
        ns = len(succ)
        total_cost = sum(r["cost"] for r in runs)
        rows.append({
            "task": task["name"], "profile": args.profile, "model": model, "runs": n,
            "successes": ns, "success_rate": round(ns / n, 3) if n else 0.0,
            "mean_cost": round(statistics.mean([r["cost"] for r in runs]), 6) if n else None,
            "mean_duration_s": round(statistics.mean([r["duration"] for r in runs]), 2) if n else None,
            "cost_per_success": round(total_cost / ns, 6) if ns else float("inf"),
            "duration_per_success_s": round(sum(r["duration"] for r in runs) / ns, 2) if ns else float("inf"),
            "runs_detail": runs,
        })

    out = Path(args.out)
    out.write_text(json.dumps({"rates": {"in": in_rate, "out": out_rate, "note": "PLACEHOLDER — verify"},
                               "rows": rows}, indent=2))
    print(f"\n{'task':28} {'prof':7} {'runs':>4} {'ok':>3} {'rate':>5} {'$/succ':>10} {'s/succ':>8}")
    for r in rows:
        cps = "inf" if r["cost_per_success"] == float("inf") else f"{r['cost_per_success']:.6f}"
        dps = "inf" if r["duration_per_success_s"] == float("inf") else f"{r['duration_per_success_s']:.1f}"
        print(f"{r['task'][:28]:28} {r['profile']:7} {r['runs']:>4} {r['successes']:>3} "
              f"{r['success_rate']:>5} {cps:>10} {dps:>8}")
    print(f"\nwrote {out}  (rates are PLACEHOLDERS — confirm Gemini pricing before quoting $)")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="M4a cost-first CU spike runner")
    p.add_argument("--profile", choices=["gemini", "mlx"], default="gemini")
    p.add_argument("--fixture", default="eval/m4a_web_tasks.json")
    p.add_argument("--service-url", default="http://127.0.0.1:8123")
    p.add_argument("--repeat", type=int, default=1)
    p.add_argument("--max-steps", type=int, default=15)
    p.add_argument("--timeout", type=float, default=300.0)
    p.add_argument("--in-rate", type=float, default=None, help="USD/1M input tokens (override placeholder)")
    p.add_argument("--out-rate", type=float, default=None, help="USD/1M output tokens (override placeholder)")
    p.add_argument("--out", default="m4a_results.json")
    return run(p.parse_args())


if __name__ == "__main__":
    raise SystemExit(main())
