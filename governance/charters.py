#!/usr/bin/env python3
"""GAL repo-charter tooling — the anti-drift enforcement primitive.

Subcommands:
  check   Validate REGISTRY.yaml self-consistency and (optionally) per-repo
          .gal/charter.yaml files under an org root. Exits non-zero on any
          violation so it can gate CI / a gal-cli hook.
  stamp   Generate/refresh .gal/charter.yaml in each repo from REGISTRY.yaml
          (single source of truth -> materialized per-repo charters).

Tier rules (see DEFINITION-OF-MOAT.md):
  tier=core         -> moat must be true (unless explicitly required-infra)
  tier=integrate    -> integrates must be set
  tier=experimental -> review_by must be a future date
  tier=archive      -> no extra requirement
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
from pathlib import Path

import yaml

VALID_TIERS = {"core", "integrate", "experimental", "archive"}
HERE = Path(__file__).resolve().parent
REGISTRY = HERE / "REGISTRY.yaml"
# Repos that are core required-infra but legitimately not the moat.
CORE_INFRA_EXCEPTIONS = {"web/gal-website"}


def _load_registry() -> list[dict]:
    data = yaml.safe_load(REGISTRY.read_text())
    return data.get("repos", [])


def _violations_for(entry: dict, *, where: str) -> list[str]:
    """Tier-rule violations for one repo entry (registry row or charter)."""
    out: list[str] = []
    repo = entry.get("repo", "<missing repo>")
    tier = entry.get("tier")
    if tier not in VALID_TIERS:
        out.append(f"{where}: {repo}: invalid/missing tier {tier!r}")
        return out
    if tier == "core" and not entry.get("moat") and repo not in CORE_INFRA_EXCEPTIONS:
        out.append(f"{where}: {repo}: tier=core requires moat:true (or required-infra exception)")
    if tier == "integrate" and not entry.get("integrates"):
        out.append(f"{where}: {repo}: tier=integrate requires `integrates:`")
    if tier == "experimental":
        rb = entry.get("review_by")
        if not rb:
            out.append(f"{where}: {repo}: tier=experimental requires `review_by:`")
        else:
            try:
                d = rb if isinstance(rb, dt.date) else dt.date.fromisoformat(str(rb))
                if d <= dt.date.today():
                    out.append(f"{where}: {repo}: experimental review_by {d} is past — re-attest or retier (DRIFT)")
            except ValueError:
                out.append(f"{where}: {repo}: review_by {rb!r} is not YYYY-MM-DD")
    return out


def cmd_check(root: str | None) -> int:
    registry = _load_registry()
    by_repo = {e["repo"]: e for e in registry}
    violations: list[str] = []

    # 1. registry self-consistency
    for e in registry:
        violations += _violations_for(e, where="registry")

    # 2. per-repo charters (when an org root is given): each registry repo must
    #    have a .gal/charter.yaml that matches its registry tier.
    if root:
        root_p = Path(root)
        for repo, e in by_repo.items():
            charter_p = root_p / repo / ".gal" / "charter.yaml"
            if not charter_p.exists():
                violations.append(f"charter: {repo}: missing .gal/charter.yaml")
                continue
            try:
                c = yaml.safe_load(charter_p.read_text()) or {}
            except yaml.YAMLError as exc:
                violations.append(f"charter: {repo}: unparseable charter ({exc})")
                continue
            violations += _violations_for(c, where="charter")
            if c.get("tier") != e.get("tier"):
                violations.append(
                    f"charter: {repo}: tier {c.get('tier')!r} != registry {e.get('tier')!r}"
                )

    if violations:
        print("CHARTER CHECK FAILED:")
        for v in violations:
            print(f"  - {v}")
        return 1
    n = len(registry)
    scope = f" + {n} per-repo charters" if root else ""
    print(f"charter check OK — {n} registry entries{scope} valid.")
    return 0


def cmd_stamp(root: str) -> int:
    """Write .gal/charter.yaml into each repo from the registry."""
    root_p = Path(root)
    written = 0
    for e in _load_registry():
        repo = e["repo"]
        repo_dir = root_p / repo
        if not repo_dir.exists():
            print(f"  skip {repo}: not found under {root}")
            continue
        charter = {k: e[k] for k in ("repo", "tier", "moat", "purpose", "owner") if k in e}
        for opt in ("integrates", "review_by", "competes_with"):
            if e.get(opt):
                charter[opt] = e[opt]
        out_dir = repo_dir / ".gal"
        out_dir.mkdir(exist_ok=True)
        (out_dir / "charter.yaml").write_text(
            "# Generated from gal/governance/REGISTRY.yaml — edit the registry, then re-stamp.\n"
            + yaml.safe_dump(charter, sort_keys=False, allow_unicode=True)
        )
        written += 1
    print(f"stamped {written} charters under {root}")
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="GAL repo-charter anti-drift tooling")
    sub = p.add_subparsers(dest="cmd", required=True)
    pc = sub.add_parser("check", help="validate registry + per-repo charters")
    pc.add_argument("--root", help="org root containing group/repo dirs (validates charters)")
    ps = sub.add_parser("stamp", help="generate per-repo charters from the registry")
    ps.add_argument("--root", required=True, help="org root containing group/repo dirs")
    args = p.parse_args()
    if args.cmd == "check":
        return cmd_check(args.root)
    if args.cmd == "stamp":
        return cmd_stamp(args.root)
    return 2


if __name__ == "__main__":
    sys.exit(main())
