"""Build a stratified runtime benchmark sample from a larger case file."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from .llm_baseline_benchmark import sample_cases
from .runtime_benchmark import load_cases


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-cases", type=int, default=40)
    parser.add_argument("--seed", type=int, default=7)
    return parser.parse_args(argv)


def build_sample(cases_path: Path, *, max_cases: int, seed: int) -> tuple[list[dict], dict[str, int]]:
    cases = load_cases(cases_path)
    sample = sample_cases(cases, max_cases=max_cases, seed=seed)
    decision_counts = Counter(
        str(case["expected"]["decision"])
        for case in sample
        if bool(case.get("expected", {}).get("schema_valid", True))
    )
    return sample, dict(sorted(decision_counts.items()))


def console_main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    sample, decision_counts = build_sample(args.cases, max_cases=args.max_cases, seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        for case in sample:
            handle.write(json.dumps(case, sort_keys=True) + "\n")

    summary = {
        "input_cases": args.cases.as_posix(),
        "output_cases": args.output.as_posix(),
        "sample_cases": len(sample),
        "decision_counts": decision_counts,
        "seed": args.seed,
    }
    sys.stdout.write(json.dumps(summary, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(console_main())
