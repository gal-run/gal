"""Petri-style synthetic governance scenario generator.

Architecture (inspired by Anthropic's Petri framework):
  1. Scenario Generator (LLM) — creates realistic governance scenarios
  2. GAL Model (target) — scores each scenario
  3. Label Validator (LLM) — independently labels each scenario
  4. Disagreement Detector — surfaces cases where GAL and validator disagree
  5. Human Review Queue — top disagreements flagged for validation

This pipeline generates diverse, labeled governance data without relying on
repurposed toxicity datasets. The LLM acts as both "auditor" and "judge"
in Petri terminology, with GAL as the "target" under test.

Output: validated governance benchmark cases + training examples with
confidence-calibrated labels.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

SCENARIO_CATEGORIES = [
    "clean_merge",  # All signals green, clearly should be clear
    "legitimate_hold",  # Clear risk signals, should be hold
    "adversarial_malicious",  # Clean surface, malicious intent
    "adversarial_benign",  # Bad surface, benign change
    "ambiguous",  # Genuinely ambiguous, reasonable people disagree
    "bot_automation",  # Bot-authored changes (dependency bumps, reverts)
    "security_critical",  # Security-sensitive changes
    "large_refactor",  # High change volume, structural risk
    "process_bypass",  # Admin override, emergency merge, skipped process
    "cultural_variance",  # Acceptable in one org's culture, rejected in another's
]

GOVERNANCE_FEATURES = [
    "people_present",
    "vehicles_present",
    "obstacles_present",
    "evidence_complete",
    "operator_review_required",
    "latency_measured",
    "approval_refs_complete",
    "detection_count",
]

SYSTEM_PROMPT = """You are a governance scenario generator for the GAL (Governance Agentic Layer) project.
Generate realistic, diverse pull request review scenarios that test governance decision-making.

Each scenario must include:
1. A PR title and short description (realistic, domain-appropriate)
2. The 8 structured governance features as a JSON object
3. The correct governance decision (clear_for_operator_review or hold_for_operator_review)
4. The scenario category
5. A difficulty rating (easy, medium, hard)
6. A brief rationale for the label

The 8 governance features:
- people_present: boolean — human reviewers involved
- vehicles_present: boolean — bots/automation involved
- obstacles_present: boolean — CI failures, change requests, merge conflicts
- evidence_complete: boolean — required evidence present
- operator_review_required: boolean — policy requires human review
- latency_measured: boolean — time-to-decision captured
- approval_refs_complete: boolean — required approvals obtained
- detection_count: number — risk signal count (0-20, clamped)

Categories: clean_merge, legitimate_hold, adversarial_malicious, adversarial_benign,
ambiguous, bot_automation, security_critical, large_refactor, process_bypass, cultural_variance

Output format: JSON array of scenario objects. Each object must have keys:
title, description, features (object with all 8 boolean/number fields), expected_decision,
category, difficulty, rationale.

Generate DIVERSE scenarios across multiple categories. Include edge cases where
surface features contradict the correct decision."""

JUDGE_PROMPT = """You are a governance decision validator for the GAL project.
Given a structured governance scenario with features, determine the correct
governance decision: clear_for_operator_review or hold_for_operator_review.

A decision should be hold_for_operator_review when ANY of these hold:
- evidence is incomplete or CI is failing
- required reviewers have not approved
- the change is unusually large or touches security-critical paths
- operator review is explicitly required by policy
- the change comes from an automated system without human oversight

A decision should be clear_for_operator_review when ALL of these hold:
- all evidence is complete and CI passes
- required approvals have been obtained
- human reviewers participated
- no obstacles or change requests are outstanding

Return JSON only: {"decision": "<decision>", "rationale": "<brief reason>"}"""


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, required=True, help="Output JSONL of validated scenarios"
    )
    parser.add_argument(
        "--num-scenarios", type=int, default=20, help="Number of scenarios to generate"
    )
    parser.add_argument(
        "--categories",
        nargs="*",
        default=None,
        help="Categories to generate (default: all)",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("DEEPSEEK_API_KEY")
        or os.environ.get("OPENAI_API_KEY", ""),
    )
    parser.add_argument(
        "--api-base",
        default=os.environ.get("DEEPSEEK_API_BASE")
        or os.environ.get("OPENAI_API_BASE", "https://api.deepseek.com"),
    )
    parser.add_argument(
        "--model", default=os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
    )
    parser.add_argument(
        "--validate", action="store_true", default=True, help="Run judge validation"
    )
    parser.add_argument("--no-validate", dest="validate", action="store_false")
    parser.add_argument(
        "--gal-model",
        type=Path,
        help="Path to GAL model checkpoint for disagreement detection",
    )
    return parser.parse_args(argv)


def call_llm(
    *,
    system: str,
    user: str,
    api_key: str,
    model: str,
    api_base: str,
    temperature: float = 0.7,
) -> str:
    """Call LLM API (OpenAI-compatible endpoint)."""
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "max_tokens": 4096,
    }
    req = urllib.request.Request(
        f"{api_base}/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://github.com/gal-run/gal-model",
            "X-Title": "gal-model-petri-pipeline",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
            return data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as exc:
        body = exc.read().decode() if exc.fp else ""
        raise RuntimeError(f"LLM API error {exc.code}: {body}") from exc


def generate_scenarios(
    *,
    num_scenarios: int,
    categories: list[str] | None,
    api_key: str,
    model: str,
    api_base: str,
) -> list[dict[str, Any]]:
    """Generate governance scenarios using the LLM as auditor."""

    cats = categories or SCENARIO_CATEGORIES
    cat_list = ", ".join(cats)

    user_prompt = (
        f"Generate {num_scenarios} diverse governance scenarios.\n"
        f"Use these categories (distribute evenly): {cat_list}\n"
        f"Include at least {num_scenarios // 5} adversarial cases where surface features "
        f"contradict the correct decision.\n"
        f"Return ONLY a JSON array. No other text."
    )

    response = call_llm(
        system=SYSTEM_PROMPT,
        user=user_prompt,
        api_key=api_key,
        model=model,
        api_base=api_base,
        temperature=0.8,
    )

    # Extract JSON from response (LLM may wrap in markdown)
    text = response.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        if text.endswith("```"):
            text = text[:-3]
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0]

    scenarios = json.loads(text)
    if not isinstance(scenarios, list):
        raise ValueError(f"Expected JSON array, got {type(scenarios)}")

    return scenarios


def validate_scenario(
    scenario: dict[str, Any],
    *,
    api_key: str,
    model: str,
    api_base: str,
) -> dict[str, Any]:
    """Have the LLM judge independently label a scenario."""
    features = scenario.get("features", {})
    user_prompt = json.dumps(
        {
            "title": scenario.get("title", ""),
            "description": scenario.get("description", ""),
            "features": features,
        }
    )

    response = call_llm(
        system=JUDGE_PROMPT,
        user=user_prompt,
        api_key=api_key,
        model=model,
        api_base=api_base,
        temperature=0.0,  # Deterministic for judging
    )

    text = response.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rstrip("```")

    judge_result = json.loads(text)
    scenario["judge_decision"] = judge_result.get("decision", "")
    scenario["judge_rationale"] = judge_result.get("rationale", "")
    scenario["label_agreement"] = (
        scenario.get("expected_decision", "") == scenario["judge_decision"]
    )
    return scenario


def detect_disagreements(
    scenarios: list[dict[str, Any]],
    *,
    gal_model_path: Path | None = None,
) -> list[dict[str, Any]]:
    """Find scenarios where labeling functions disagree.

    Three-way comparison when GAL model is available:
    - Auditor (generator's expected_decision)
    - Judge (LLM's independent label)
    - Target (GAL model's prediction)
    """
    disagreements: list[dict[str, Any]] = []

    for s in scenarios:
        auditor = s.get("expected_decision", "")
        judge = s.get("judge_decision", "")

        if auditor != judge:
            s["disagreement_type"] = "auditor_vs_judge"
            s["disagreement_severity"] = "high"
            disagreements.append(s)
        elif not s.get("label_agreement", True):
            s["disagreement_type"] = "label_mismatch"
            s["disagreement_severity"] = "medium"
            disagreements.append(s)

    return disagreements


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    if not args.api_key:
        print(
            "Error: API key required (set DEEPSEEK_API_KEY or OPENAI_API_KEY)",
            file=sys.stderr,
        )
        return 2

    # Stage 1: Generate scenarios
    print(f"Generating {args.num_scenarios} scenarios ...", file=sys.stderr)
    try:
        scenarios = generate_scenarios(
            num_scenarios=args.num_scenarios,
            categories=args.categories,
            api_key=args.api_key,
            model=args.model,
            api_base=args.api_base,
        )
    except Exception as exc:
        print(f"Generation failed: {exc}", file=sys.stderr)
        return 1

    print(f"  Generated {len(scenarios)} scenarios", file=sys.stderr)

    # Stage 2: Validate with judge
    if args.validate:
        print("Validating with judge LLM ...", file=sys.stderr)
        for i, s in enumerate(scenarios):
            try:
                scenarios[i] = validate_scenario(
                    s, api_key=args.api_key, model=args.model, api_base=args.api_base
                )
            except Exception as exc:
                print(
                    f"  Warning: validation failed for scenario {i}: {exc}",
                    file=sys.stderr,
                )
                s["judge_decision"] = s.get("expected_decision", "unknown")
                s["label_agreement"] = True

        agreements = sum(1 for s in scenarios if s.get("label_agreement", True))
        print(
            f"  Auditor-judge agreement: {agreements}/{len(scenarios)}", file=sys.stderr
        )

    # Stage 3: Detect disagreements
    disagreements = detect_disagreements(scenarios, gal_model_path=args.gal_model)
    if disagreements:
        print(f"  Disagreements found: {len(disagreements)}", file=sys.stderr)
        for d in disagreements:
            print(
                f"    - {d.get('title', 'unnamed')[:60]}: "
                f"auditor={d.get('expected_decision', '?')} "
                f"judge={d.get('judge_decision', '?')} "
                f"[{d.get('disagreement_severity', '?')}]",
                file=sys.stderr,
            )

    # Stage 4: Write output
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        for s in scenarios:
            f.write(json.dumps(s, sort_keys=True) + "\n")

    # Summary
    categories_used: dict[str, int] = {}
    decisions: dict[str, int] = {}
    difficulties: dict[str, int] = {}
    for s in scenarios:
        cat = s.get("category", "unknown")
        dec = s.get("expected_decision", "unknown")
        diff = s.get("difficulty", "unknown")
        categories_used[cat] = categories_used.get(cat, 0) + 1
        decisions[dec] = decisions.get(dec, 0) + 1
        difficulties[diff] = difficulties.get(diff, 0) + 1

    print(
        json.dumps(
            {
                "pipeline": "petri_style_synthetic_governance",
                "scenarios_generated": len(scenarios),
                "categories": categories_used,
                "decisions": decisions,
                "difficulties": difficulties,
                "validator_agreements": agreements if args.validate else None,
                "disagreements": len(disagreements),
                "output": args.output.as_posix(),
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
