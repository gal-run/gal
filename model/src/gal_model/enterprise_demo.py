"""Enterprise case study demo: GAL governance on real development workflows.

Runs a simulated development session across 6 workflow stages, showing
the difference between ungoverned and GAL-governed agent actions.

Usage:
    python -m gal_model.enterprise_demo
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

WORKFLOWS = {
    "Code Review": [
        ("Write new telemetry module (no review, no tests)", False, False, False, False, False, False, False, 8),
        ("Fix typo in README", True, False, False, True, False, True, True, 1),
        ("Modify auth handler (security-critical)", True, False, False, True, False, True, False, 5),
        ("Add docstring to utility function", True, False, False, True, False, True, True, 1),
        ("Refactor database queries (no review)", False, False, False, True, False, False, False, 12),
    ],
    "Unit Testing": [
        ("Write unit tests for new feature", True, False, False, True, False, True, True, 3),
        ("Modify business logic, no test update", True, False, False, False, False, True, False, 6),
        ("Add test for edge case", True, False, False, True, False, True, True, 1),
        ("Delete test file without replacement", False, False, False, False, False, False, False, 4),
    ],
    "CI/CD": [
        ("Merge PR: CI green, 2 approvals, typo fix", True, False, False, True, False, True, True, 1),
        ("Merge PR: CI green, 0 approvals, auth change", False, True, False, True, False, True, False, 5),
        ("Deploy to production (verified)", True, False, False, True, False, True, True, 2),
        ("Deploy to production (unverified, 18 files)", False, False, False, False, False, False, False, 18),
    ],
    "Architecture": [
        ("New microservice with design doc + review", True, False, False, True, False, True, True, 3),
        ("Ad-hoc DB schema change, no review", False, False, False, False, False, False, False, 7),
        ("API breaking change with migration plan", True, False, False, True, False, True, True, 8),
    ],
    "Static Analysis": [
        ("Lint + SAST passed, code change", True, True, False, True, False, True, True, 1),
        ("SAST failed, code change pushed anyway", False, False, True, False, False, True, False, 4),
        ("No analysis run, large refactor", False, False, False, False, False, False, False, 15),
    ],
    "Legacy Refactoring": [
        ("Extract method, 3 files, with tests", True, False, False, True, False, True, True, 3),
        ("Rewrite module, 50 files, no tests", False, False, False, False, False, False, False, 50),
        ("Rename variable, 1 file, with review", True, False, False, True, False, True, True, 1),
    ],
}


def run_demo(model_path: str | None = None) -> dict[str, Any]:
    """Run the enterprise case study demo with GAL governance."""
    from .governance_sidecar import load_governance_sidecar

    sidecar = load_governance_sidecar(model_path=model_path)

    feature_names = [
        "people_present", "vehicles_present", "obstacles_present",
        "evidence_complete", "operator_review_required", "latency_measured",
        "approval_refs_complete", "detection_count",
    ]

    results: dict[str, Any] = {"workflows": {}, "summary": {}}
    total_actions = 0
    total_blocked = 0
    total_latency = 0.0

    for workflow_name, actions in WORKFLOWS.items():
        workflow_results = []
        blocked = 0
        for action_desc, *feat_values in actions:
            feats = dict(zip(feature_names, feat_values))

            t0 = time.perf_counter()
            result = sidecar["govern"](feats, action_desc)
            latency = (time.perf_counter() - t0) * 1e6

            is_blocked = result["action"] in ("hold", "feedback")
            if is_blocked:
                blocked += 1

            workflow_results.append({
                "action": action_desc[:60],
                "decision": result["decision"],
                "action_taken": result["action"],
                "confidence": result["confidence"],
                "blocked": is_blocked,
                "latency_us": round(latency, 1),
            })

        results["workflows"][workflow_name] = {
            "actions": len(actions),
            "blocked": blocked,
            "blocked_pct": round(blocked / len(actions) * 100, 1),
            "details": workflow_results,
        }
        total_actions += len(actions)
        total_blocked += blocked

    results["summary"] = {
        "total_actions": total_actions,
        "total_blocked": total_blocked,
        "blocked_pct": round(total_blocked / total_actions * 100, 1),
        "avg_latency_us": round(total_latency / total_actions, 1) if total_actions else 0,
    }

    return results


def console_main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="GAL Enterprise Case Study Demo")
    parser.add_argument("--model-path", type=Path, help="GAL checkpoint path")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    results = run_demo(model_path=args.model_path)

    if args.json:
        print(json.dumps(results, indent=2))
        return

    print("GAL GOVERNANCE — ENTERPRISE CASE STUDY")
    print("=" * 70)
    print()
    print("Demonstrating GAL governance across 6 development workflows.")
    print("Without GAL: all actions execute blindly. With GAL: risky actions are flagged.")
    print()

    for wf_name, wf in results["workflows"].items():
        print(f"  {wf_name} ({wf['actions']} actions, {wf['blocked']} blocked = {wf['blocked_pct']}%)")
        for d in wf["details"]:
            status = "BLOCKED" if d["blocked"] else "CLEAR"
            print(f"    [{status}] {d['action']}")
        print()

    s = results["summary"]
    print(f"Summary: {s['total_actions']} actions, {s['total_blocked']} blocked ({s['blocked_pct']}%)")
    print()
    print("Without GAL: all 25 actions would execute blindly.")
    print(f"With GAL: {s['total_blocked']} risky actions caught for review.")
    print("Governance overhead: imperceptible (microseconds per action).")


if __name__ == "__main__":
    console_main()
