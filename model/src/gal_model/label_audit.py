"""Audit training data labels using the Petri judge LLM.

Samples training examples, runs the judge LLM independently on each,
and reports label quality metrics: agreement rate, disagreement categories,
and a prioritized human review queue.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Any

JUDGE_PROMPT = """You are auditing training labels for a governance decision model.

Given a structured governance example with features and its current label,
determine whether the label is correct.

Governance features:
- people_present: human reviewers involved
- vehicles_present: bots/automation involved
- obstacles_present: CI failures, change requests, merge conflicts
- evidence_complete: required evidence present
- operator_review_required: policy requires human review
- latency_measured: time-to-decision captured
- approval_refs_complete: required approvals obtained
- detection_count: risk signal count (0-20, higher = more signals)

Decision should be hold_for_operator_review when:
- evidence is incomplete or CI is failing
- required reviewers have not approved
- the change is unusually large (detection_count >= 10)
- operator review is explicitly required
- only bots involved, no humans

Decision should be clear_for_operator_review when:
- all evidence complete and CI passes
- required approvals obtained
- human reviewers participated
- no change requests outstanding
- detection_count is low (< 5)

Return JSON: {"decision": "clear_for_operator_review" or "hold_for_operator_review",
"agrees_with_label": true or false, "rationale": "<brief reason>"}"""


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True, help="Training JSONL file")
    parser.add_argument("--output", type=Path, required=True, help="Audit report output")
    parser.add_argument("--sample-size", type=int, default=100)
    parser.add_argument("--api-key", default=os.environ.get("DEEPSEEK_API_KEY", ""))
    parser.add_argument("--model", default="deepseek-chat")
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args(argv)


def judge_example(example: dict[str, Any], *, api_key: str, model: str) -> dict[str, Any]:
    """Ask the judge LLM to evaluate a single training example."""
    features = example.get("features", {})
    current_label = example.get("label", example.get("outcome", {}).get("decision", "unknown"))

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": JUDGE_PROMPT},
            {"role": "user", "content": json.dumps({
                "features": features,
                "current_label": current_label,
                "example_id": example.get("example_id", example.get("event_id", "unknown")),
            })},
        ],
        "temperature": 0.0,
        "max_tokens": 256,
    }
    req = urllib.request.Request(
        "https://api.deepseek.com/v1/chat/completions",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
        content = data["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1].rstrip("```")

    result = json.loads(content)
    result["current_label"] = current_label
    return result


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if not args.api_key:
        print("Error: DEEPSEEK_API_KEY required", file=sys.stderr)
        return 2

    examples = [
        json.loads(line) for line in args.dataset.read_text(encoding="utf-8").splitlines() if line.strip()
    ]
    if not examples:
        print("No examples loaded", file=sys.stderr)
        return 1

    random.seed(args.seed)
    sample = random.sample(examples, min(args.sample_size, len(examples)))

    print(f"Auditing {len(sample)} examples with judge LLM ...", file=sys.stderr)

    results: list[dict[str, Any]] = []
    agreements = 0
    disagreements: list[dict[str, Any]] = []
    errors = 0

    for i, ex in enumerate(sample):
        try:
            judgment = judge_example(ex, api_key=args.api_key, model=args.model)
            judgment["example_id"] = ex.get("example_id", ex.get("event_id", f"example-{i}"))
            results.append(judgment)
            if judgment.get("agrees_with_label", False):
                agreements += 1
            else:
                ex["judge_judgment"] = judgment
                disagreements.append(ex)
            print(f"  [{i + 1}/{len(sample)}] {'+' if judgment.get('agrees_with_label') else '-'} "
                  f"{judgment['example_id'][:50]}", file=sys.stderr)
        except Exception as exc:
            errors += 1
            print(f"  [{i + 1}/{len(sample)}] ERROR: {exc}", file=sys.stderr)

    label_quality = {
        "sample_size": len(sample),
        "judged": len(results),
        "errors": errors,
        "agreements": agreements,
        "disagreements": len(disagreements),
        "agreement_rate": round(agreements / len(results) * 100, 1) if results else 0,
        "label_quality_rating": (
            "excellent" if agreements / len(results) > 0.95
            else "good" if agreements / len(results) > 0.85
            else "fair" if agreements / len(results) > 0.70
            else "poor"
        ) if results else "unknown",
    }

    # Disagreement categories
    disagreement_types = Counter()
    for d in disagreements:
        judge_dec = d.get("judge_judgment", {}).get("decision", "?")
        current = d.get("label", d.get("outcome", {}).get("decision", "?"))
        disagreement_types[f"{current} -> {judge_dec}"] += 1

    label_quality["disagreement_types"] = dict(disagreement_types)
    label_quality["human_review_queue"] = [
        {
            "example_id": d.get("example_id", d.get("event_id", "?")),
            "current_label": d.get("label", d.get("outcome", {}).get("decision", "?")),
            "judge_label": d.get("judge_judgment", {}).get("decision", "?"),
            "judge_rationale": d.get("judge_judgment", {}).get("rationale", ""),
            "features": d.get("features", {}),
        }
        for d in disagreements[:20]  # Top 20 for review
    ]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(label_quality, indent=2, sort_keys=True))
    print(json.dumps(label_quality, indent=2, sort_keys=True))
    return 0


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
