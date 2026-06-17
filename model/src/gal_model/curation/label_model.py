"""Snorkel-style label model: aggregates noisy labeling function votes into calibrated probabilistic labels.

The label model learns the accuracy of each labeling function (LF) by observing
where they agree and disagree across examples — no ground truth needed. It outputs
a probabilistic label with confidence score for every example.

Algorithm: Generative model over LF votes with learned accuracy parameters.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np


def apply_labeling_functions(
    examples: list[dict[str, Any]],
    labeling_functions: list,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Apply all LFs to all examples. Returns (vote_matrix, confidence_matrix, abstain_mask).

    vote_matrix: int [n_examples, n_lfs] — 0=clear, 1=hold, -1=abstain
    confidence_matrix: float [n_examples, n_lfs] — LF confidence per vote
    abstain_mask: bool [n_examples, n_lfs] — True where LF abstained
    """
    n = len(examples)
    m = len(labeling_functions)
    votes = np.full((n, m), -1, dtype=int)
    confidences = np.zeros((n, m), dtype=float)
    abstains = np.ones((n, m), dtype=bool)

    for j, lf in enumerate(labeling_functions):
        for i, ex in enumerate(examples):
            try:
                result = lf(ex)
            except Exception:
                continue
            if result is not None and isinstance(result, dict):
                decision = result.get("decision", "")
                if decision == "clear_for_operator_review":
                    votes[i, j] = 0
                    confidences[i, j] = result.get("confidence", 0.5)
                    abstains[i, j] = False
                elif decision == "hold_for_operator_review":
                    votes[i, j] = 1
                    confidences[i, j] = result.get("confidence", 0.5)
                    abstains[i, j] = False

    return votes, confidences, abstains


def estimate_lf_accuracy(
    votes: np.ndarray,
    abstains: np.ndarray,
) -> np.ndarray:
    """Estimate LF accuracy from agreement patterns.

    The accuracy of LF j is estimated as the probability that LF j agrees with
    the majority vote of other LFs that didn't abstain on the same example.
    """
    n, m = votes.shape
    accuracies = np.ones(m) * 0.5

    for j in range(m):
        active = ~abstains[:, j]
        if active.sum() < 3:
            accuracies[j] = 0.6
            continue

        agreements = 0
        total = 0
        for i in range(n):
            if not active[i]:
                continue
            others = votes[i, :]  # Other LFs on this example
            others_mask = (~abstains[i, :]) & (np.arange(m) != j)
            if others_mask.sum() == 0:
                continue
            other_votes = others[others_mask]
            majority = int(np.median(other_votes[other_votes >= 0])) if (other_votes >= 0).any() else votes[i, j]
            if votes[i, j] == majority:
                agreements += 1
            total += 1

        if total > 0:
            accuracies[j] = max(0.55, min(0.95, agreements / total))

    return accuracies


def aggregate_votes(
    votes: np.ndarray,
    confidences: np.ndarray,
    abstains: np.ndarray,
    lf_accuracies: np.ndarray,
) -> list[dict[str, Any]]:
    """Aggregate LF votes into probabilistic labels with confidence scores.

    Uses weighted voting where each LF's vote is weighted by its estimated accuracy.
    """
    n, m = votes.shape
    results: list[dict[str, Any]] = []

    for i in range(n):
        clear_score = 0.0
        hold_score = 0.0
        vote_details: list[dict[str, Any]] = []

        for j in range(m):
            if abstains[i, j]:
                continue
            weight = lf_accuracies[j] * confidences[i, j]
            if votes[i, j] == 0:  # clear
                clear_score += weight
            elif votes[i, j] == 1:  # hold
                hold_score += weight
            vote_details.append({
                "lf_index": j,
                "vote": "clear" if votes[i, j] == 0 else "hold",
                "confidence": round(float(confidences[i, j]), 4),
                "lf_accuracy": round(float(lf_accuracies[j]), 4),
            })

        total = clear_score + hold_score
        if total == 0:
            decision = "hold_for_operator_review"
            confidence = 0.5
        else:
            decision = "clear_for_operator_review" if clear_score > hold_score else "hold_for_operator_review"
            confidence = round(max(clear_score, hold_score) / total, 4)

        results.append({
            "decision": decision,
            "confidence": confidence,
            "clear_score": round(float(clear_score), 4),
            "hold_score": round(float(hold_score), 4),
            "vote_count": len(vote_details),
            "vote_details": vote_details,
        })

    return results


def label_model_pipeline(
    examples: list[dict[str, Any]],
    labeling_functions: list,
) -> dict[str, Any]:
    """Run the full label model pipeline.

    Returns aggregated labels plus LF accuracy estimates and coverage stats.
    """
    votes, confidences, abstains = apply_labeling_functions(examples, labeling_functions)
    lf_accuracies = estimate_lf_accuracy(votes, abstains)
    aggregated = aggregate_votes(votes, confidences, abstains, lf_accuracies)

    # LF coverage stats
    lf_stats = []
    for j, lf in enumerate(labeling_functions):
        lf_stats.append({
            "lf_name": getattr(lf, "__name__", f"lf_{j}"),
            "coverage": round(float((~abstains[:, j]).mean()), 4),
            "estimated_accuracy": round(float(lf_accuracies[j]), 4),
        })

    # Decision distribution
    decisions = defaultdict(int)
    high_conf = 0
    low_conf = 0
    for r in aggregated:
        decisions[r["decision"]] += 1
        if r["confidence"] >= 0.8:
            high_conf += 1
        elif r["confidence"] < 0.6:
            low_conf += 1

    return {
        "examples": len(examples),
        "labeling_functions": len(labeling_functions),
        "aggregated": aggregated,
        "lf_stats": lf_stats,
        "decision_distribution": dict(decisions),
        "high_confidence_count": high_conf,
        "low_confidence_count": low_conf,
        "average_confidence": round(
            float(np.mean([r["confidence"] for r in aggregated])), 4
        ),
    }


def load_events(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def save_labels(
    examples: list[dict[str, Any]],
    aggregated: list[dict[str, Any]],
    output_path: Path,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        for ex, label in zip(examples, aggregated):
            ex["probabilistic_label"] = label
            f.write(json.dumps(ex, sort_keys=True) + "\n")


def console_main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Snorkel-style label model for governance data")
    parser.add_argument("--events", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--source", default="github_pr_reviews")
    args = parser.parse_args()

    from .source_registry import build_registry

    registry = build_registry()
    if args.source not in registry:
        print(f"Unknown source: {args.source}", file=sys.stderr)
        valid = ", ".join(registry.keys())
        print(f"Valid sources: {valid}", file=sys.stderr)
        sys.exit(2)

    src = registry[args.source]
    if not src.labeling_functions:
        print(f"Source {args.source} has no labeling functions defined", file=sys.stderr)
        sys.exit(2)

    examples = load_events(args.events)
    if not examples:
        print("No examples loaded", file=sys.stderr)
        sys.exit(1)

    result = label_model_pipeline(examples, src.labeling_functions)
    save_labels(examples, result["aggregated"], args.output)

    summary = {
        "source": args.source,
        "pipeline": "snorkel_label_model",
        "output": args.output.as_posix(),
        "examples": result["examples"],
        "lf_stats": result["lf_stats"],
        "decision_distribution": result["decision_distribution"],
        "high_confidence_pct": round(result["high_confidence_count"] / result["examples"] * 100, 1),
        "low_confidence_pct": round(result["low_confidence_count"] / result["examples"] * 100, 1),
        "average_confidence": result["average_confidence"],
        "labeling_functions_used": len(result["lf_stats"]),
    }
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    console_main()
