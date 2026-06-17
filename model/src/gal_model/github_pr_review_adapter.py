"""Convert GitHub PR review decisions into normalized model audit events.

Fetches closed PRs from configured repos via the GitHub API, extracts review
signals, and maps them to the 8-feature governance vector. Each PR becomes one
audit event with a weak label derived from merge outcome and review posture.

Labels are weak by design — merged != correct. They serve as calibration input
for the governance model and should be promoted to human_reviewed after
operator validation.
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

from .audit_dataset_builder import AUDIT_EVENT_SCHEMA_REF, validate_audit_event, write_jsonl

VALID_SPLITS = ("train", "validation", "test")
GITHUB_API = "https://api.github.com"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repos", required=True, help="Comma-separated owner/repo list")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--github-token", default=os.environ.get("GITHUB_TOKEN", ""))
    parser.add_argument("--max-prs-per-repo", type=int, default=25)
    parser.add_argument("--train-ratio", type=float, default=70)
    parser.add_argument("--validation-ratio", type=float, default=20)
    parser.add_argument("--test-ratio", type=float, default=10)
    parser.add_argument("--mock", type=Path, help="Path to local JSON fixture instead of live API")
    parser.add_argument("--application", default="github-pr-review-adapter")
    parser.add_argument("--min-approvals", type=int, default=0)
    parser.add_argument(
        "--state",
        choices=("all", "closed"),
        default="closed",
        help="PR state filter (default: closed)",
    )
    return parser.parse_args(argv)


def _api_get(path: str, *, token: str) -> Any:
    url = f"{GITHUB_API}{path}"
    req = urllib.request.Request(url)
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "gal-model-github-adapter/0.1")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode() if exc.fp else ""
        raise RuntimeError(f"GitHub API {url}: {exc.code} {exc.reason}\n{body}") from exc


def _paginate(path: str, *, token: str, max_items: int) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    page = 1
    per_page = min(max_items, 100)
    while len(items) < max_items:
        separator = "&" if "?" in path else "?"
        paged = f"{path}{separator}per_page={per_page}&page={page}"
        batch = _api_get(paged, token=token)
        if not isinstance(batch, list) or not batch:
            break
        items.extend(batch)
        page += 1
    return items[:max_items]


def fetch_prs(repo: str, *, token: str, max_items: int, state: str) -> list[dict[str, Any]]:
    return _paginate(
        f"/repos/{repo}/pulls?state={state}&sort=updated&direction=desc",
        token=token,
        max_items=max_items,
    )


def fetch_reviews(repo: str, pr_number: int, *, token: str) -> list[dict[str, Any]]:
    """Fetch ALL reviews for a PR (no pagination limit — reviews are typically few)."""
    return _paginate(
        f"/repos/{repo}/pulls/{pr_number}/reviews?per_page=100",
        token=token,
        max_items=200,
    )


def fetch_checks(repo: str, ref: str, *, token: str) -> list[dict[str, Any]]:
    """Fetch check runs for a PR head ref."""
    try:
        data = _api_get(
            f"/repos/{repo}/commits/{ref}/check-runs?per_page=100",
            token=token,
        )
        if isinstance(data, dict):
            return data.get("check_runs", [])
        return []
    except RuntimeError:
        return []


# ── feature mapping ────────────────────────────────────────────────────────


def _is_bot(user: dict[str, Any] | None) -> bool:
    if not user:
        return False
    return user.get("type") == "Bot" or bool(user.get("login", "").endswith("[bot]"))


def _reviewers_are_human(reviews: list[dict[str, Any]]) -> bool:
    for r in reviews:
        if not _is_bot(r.get("user")):
            return True
    return False


def _any_bot_involved(pr: dict[str, Any], reviews: list[dict[str, Any]]) -> bool:
    if _is_bot(pr.get("user")):
        return True
    for r in reviews:
        if _is_bot(r.get("user")):
            return True
    return False


def _has_failing_checks(checks: list[dict[str, Any]]) -> bool:
    for c in checks:
        if c.get("conclusion") in ("failure", "timed_out", "cancelled"):
            return True
    return False


def _any_change_requested(reviews: list[dict[str, Any]]) -> bool:
    return any(r.get("state") == "CHANGES_REQUESTED" for r in reviews)


def _review_approval_count(reviews: list[dict[str, Any]]) -> int:
    return sum(1 for r in reviews if r.get("state") == "APPROVED" and not _is_bot(r.get("user")))


def _time_to_close_hours(pr: dict[str, Any]) -> float | None:
    created = pr.get("created_at")
    closed = pr.get("closed_at")
    if created and closed:
        try:
            from datetime import datetime

            c = datetime.fromisoformat(created.replace("Z", "+00:00"))
            cl = datetime.fromisoformat(closed.replace("Z", "+00:00"))
            return (cl - c).total_seconds() / 3600
        except (ValueError, TypeError):
            return None
    return None


def normalized_event_from_pr(
    pr: dict[str, Any],
    reviews: list[dict[str, Any]],
    checks: list[dict[str, Any]],
    *,
    split: str,
    application: str,
) -> dict[str, Any]:
    merged = bool(pr.get("merged_at"))
    change_requested = _any_change_requested(reviews)
    human_reviewers = _reviewers_are_human(reviews)
    bots_involved = _any_bot_involved(pr, reviews)
    failing_checks = _has_failing_checks(checks)
    approval_count = _review_approval_count(reviews)
    time_to_close = _time_to_close_hours(pr)
    changed_files = max(pr.get("changed_files", 0), 0)

    # core governance signal
    obstacles = change_requested or failing_checks or bool(pr.get("draft"))
    evidence_complete = not failing_checks and not pr.get("draft")
    operator_review_required = not merged or change_requested
    latency_measured = time_to_close is not None
    approval_refs_complete = (merged and approval_count > 0 and not change_requested) or (
        not merged and change_requested
    )
    detection_count = min(changed_files + (1 if change_requested else 0), 20)

    decision = "clear_for_operator_review" if merged and not change_requested else "hold_for_operator_review"

    event = {
        "event_id": f"github-pr-{pr.get('base', {}).get('repo', {}).get('full_name', 'unknown')}-{pr.get('number', 'unknown')}",
        "application": application,
        "evidence_ref": pr.get("html_url", f"https://github.com/{pr.get('base', {}).get('repo', {}).get('full_name', 'unknown')}/pull/{pr.get('number', 'unknown')}"),
        "split": split,
        "title": pr.get("title", ""),
        "features": {
            "people_present": human_reviewers,
            "vehicles_present": bots_involved,
            "obstacles_present": obstacles,
            "evidence_complete": evidence_complete,
            "operator_review_required": operator_review_required,
            "latency_measured": latency_measured,
            "approval_refs_complete": approval_refs_complete,
            "detection_count": detection_count,
        },
        "outcome": {
            "decision": decision,
            "escalate_for_deeper_review": change_requested,
        },
    }
    validate_audit_event(event, context=event["event_id"])
    return event


# ── main ────────────────────────────────────────────────────────────────────


def assign_pr_split(index: int, *, train_r: float, val_r: float, test_r: float) -> str:
    total = train_r + val_r + test_r
    bucket = (index * 31 + 13) % 100
    if bucket < (train_r / total) * 100:
        return "train"
    if bucket < ((train_r + val_r) / total) * 100:
        return "validation"
    return "test"


def convert_repo(
    repo: str,
    *,
    token: str,
    max_items: int,
    state: str,
    split_ratios: tuple[float, float, float],
    application: str,
    min_approvals: int,
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    train_r, val_r, test_r = split_ratios
    print(f"Fetching {max_items} PRs from {repo} (state={state}) ...", file=sys.stderr)

    try:
        prs = fetch_prs(repo, token=token, max_items=max_items, state=state)
    except RuntimeError as exc:
        print(f"Warning: {repo}: {exc}", file=sys.stderr)
        return events

    for idx, pr in enumerate(prs):
        pr_number = pr.get("number")
        if not pr_number:
            continue

        try:
            reviews = fetch_reviews(repo, pr_number, token=token)
            head_sha = pr.get("head", {}).get("sha", "")
            checks = fetch_checks(repo, head_sha, token=token) if head_sha else []
        except RuntimeError as exc:
            print(f"Warning: {repo}#{pr_number}: {exc}", file=sys.stderr)
            continue

        if _review_approval_count(reviews) < min_approvals:
            continue

        split = assign_pr_split(idx, train_r=train_r, val_r=val_r, test_r=test_r)
        event = normalized_event_from_pr(
            pr, reviews, checks, split=split, application=application
        )
        events.append(event)

    print(f"  {repo}: {len(events)} events", file=sys.stderr)
    return events


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    repos = [r.strip() for r in args.repos.split(",") if r.strip()]
    if not repos:
        print("Error: at least one repo required", file=sys.stderr)
        return 2

    if args.mock:
        return _mock_main(args)

    token = args.github_token
    if not token:
        print("Warning: no GitHub token — unauthenticated requests are rate-limited to 60/hour", file=sys.stderr)

    all_events: list[dict[str, Any]] = []
    for repo in repos:
        all_events.extend(
            convert_repo(
                repo,
                token=token,
                max_items=args.max_prs_per_repo,
                state=args.state,
                split_ratios=(args.train_ratio, args.validation_ratio, args.test_ratio),
                application=args.application,
                min_approvals=args.min_approvals,
            )
        )

    if not all_events:
        print("No PR review events extracted.", file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_jsonl(args.output, all_events)

    splits: dict[str, int] = {}
    decisions: dict[str, int] = {}
    for e in all_events:
        splits[e["split"]] = splits.get(e["split"], 0) + 1
        decisions[e["outcome"]["decision"]] = decisions.get(e["outcome"]["decision"], 0) + 1

    print(
        json.dumps(
            {
                "audit_event_schema_ref": AUDIT_EVENT_SCHEMA_REF,
                "repos": repos,
                "output": args.output.as_posix(),
                "events": len(all_events),
                "splits": splits,
                "decisions": decisions,
                "application": args.application,
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


def _mock_main(args: argparse.Namespace) -> int:
    """Load PR fixtures from a local JSON file instead of calling the GitHub API."""
    fixture: dict[str, Any] = json.loads(args.mock.read_text(encoding="utf-8"))
    prs = fixture.get("prs", [])
    reviews_by_pr = fixture.get("reviews", {})
    checks_by_pr = fixture.get("checks", {})

    all_events: list[dict[str, Any]] = []
    for idx, pr in enumerate(prs):
        pr_key = str(pr.get("number", idx))
        reviews = reviews_by_pr.get(pr_key, [])
        checks = checks_by_pr.get(pr_key, [])
        split = assign_pr_split(
            idx, train_r=args.train_ratio, val_r=args.validation_ratio, test_r=args.test_ratio
        )
        event = normalized_event_from_pr(
            pr, reviews, checks, split=split, application=args.application
        )
        all_events.append(event)

    if not all_events:
        print("No PR review events extracted.", file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_jsonl(args.output, all_events)

    splits: dict[str, int] = {}
    decisions: dict[str, int] = {}
    for e in all_events:
        splits[e["split"]] = splits.get(e["split"], 0) + 1
        decisions[e["outcome"]["decision"]] = decisions.get(e["outcome"]["decision"], 0) + 1

    print(
        json.dumps(
            {
                "audit_event_schema_ref": AUDIT_EVENT_SCHEMA_REF,
                "repos": args.repos,
                "mode": "mock",
                "output": args.output.as_posix(),
                "events": len(all_events),
                "splits": splits,
                "decisions": decisions,
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
