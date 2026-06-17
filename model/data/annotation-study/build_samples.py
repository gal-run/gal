#!/usr/bin/env python3
"""Build 50 diverse annotation-study samples from the training corpus.

Stratifies 25 clear / 25 hold across both sources
(GitHub PRs and GAL sessions) with diverse detection_count
and feature patterns.
"""

import json
import random
import sys
from pathlib import Path

random.seed(42)

CORPUS = Path("data/curated/corpus/v0.2/train.jsonl")
OUT_DIR = Path("data/annotation-study")

# ── 1. Load all examples ──────────────────────────────────────────────────
all_examples = []
with open(CORPUS) as f:
    for line in f:
        ex = json.loads(line)
        all_examples.append(ex)

print(f"Loaded {len(all_examples)} training examples", file=sys.stderr)

# ── 2. Group by source × label ────────────────────────────────────────────
buckets = {}
for ex in all_examples:
    key = (ex["_source_id"], ex["label"])
    buckets.setdefault(key, []).append(ex)

for key, group in buckets.items():
    print(f"  {key[0]:30s} {key[1]:30s}  n={len(group)}", file=sys.stderr)

# ── 3. Stratified selection ───────────────────────────────────────────────
# 25 clear, 25 hold. Within each label, balance by source.
# GitHub has 410 clear / 108 hold  → pick 13 + 13
# GAL   has 441 clear / 152 hold  → pick 12 + 12

selected = []

for label, gh_count, gal_count in [
    ("clear_for_operator_review", 13, 12),
    ("hold_for_operator_review", 13, 12),
]:
    gh_pool = buckets[("github_pr_reviews", label)]
    gal_pool = buckets[("gal_session_exports", label)]

    # Sort by detection_count diversity, then fill from different feature patterns
    def diversity_key(ex):
        feat = ex["features"]
        sig = (
            feat["detection_count"],
            feat["approval_refs_complete"],
            feat["evidence_complete"],
            feat["latency_measured"],
            feat["obstacles_present"],
            feat["operator_review_required"],
            feat["people_present"],
            feat["vehicles_present"],
        )
        return sig

    # For each pool, group by feature signature, pick one from each signature
    # rotating through until we have enough
    def pick_diverse(pool, n):
        from collections import defaultdict

        by_sig = defaultdict(list)
        for ex in pool:
            by_sig[diversity_key(ex)].append(ex)

        sigs = list(by_sig.keys())
        random.shuffle(sigs)
        result = []
        used_sigs = set()

        # First pass: pick one from each signature
        for sig in sigs:
            if len(result) >= n:
                break
            result.append(by_sig[sig][0])
            used_sigs.add(sig)

        # Second pass: pick remaining from already-used signatures (different examples)
        if len(result) < n:
            remaining = n - len(result)
            extras = []
            for sig in sigs:
                for ex in by_sig[sig][1:]:
                    extras.append(ex)
            random.shuffle(extras)
            result.extend(extras[:remaining])

        return result

    gh_selected = pick_diverse(gh_pool, gh_count)
    gal_selected = pick_diverse(gal_pool, gal_count)
    selected.extend(gh_selected)
    selected.extend(gal_selected)

    print(f"\n{label}:", file=sys.stderr)
    print(f"  github_pr_reviews:  picked {len(gh_selected)} from {len(gh_pool)}", file=sys.stderr)
    print(f"  gal_session_exports: picked {len(gal_selected)} from {len(gal_pool)}", file=sys.stderr)

random.shuffle(selected)
print(f"\nTotal selected: {len(selected)}", file=sys.stderr)

# ── 4. Verify balance ─────────────────────────────────────────────────────
from collections import Counter

label_counts = Counter(ex["label"] for ex in selected)
source_counts = Counter(ex["_source_id"] for ex in selected)
det_counts = Counter(ex["features"]["detection_count"] for ex in selected)

print(f"\nLabel balance:     {dict(label_counts)}", file=sys.stderr)
print(f"Source balance:    {dict(source_counts)}", file=sys.stderr)
print(f"Detection counts:  {dict(det_counts)}", file=sys.stderr)

# Unique feature sigs
feat_sigs = set()
for ex in selected:
    sig = tuple(sorted((k, v) for k, v in ex["features"].items()))
    feat_sigs.add(sig)
print(f"Unique feature signatures: {len(feat_sigs)}", file=sys.stderr)

# ── 5. Write annotation-samples.jsonl ────────────────────────────────────
samples_path = OUT_DIR / "annotation-samples.jsonl"
with open(samples_path, "w") as f:
    for ex in selected:
        record = {
            "id": ex["example_id"],
            "title": ex.get("evidence_ref"),
            "features": {
                "approval_refs_complete": ex["features"]["approval_refs_complete"],
                "detection_count": ex["features"]["detection_count"],
                "evidence_complete": ex["features"]["evidence_complete"],
                "latency_measured": ex["features"]["latency_measured"],
                "obstacles_present": ex["features"]["obstacles_present"],
                "operator_review_required": ex["features"]["operator_review_required"],
                "people_present": ex["features"]["people_present"],
                "vehicles_present": ex["features"]["vehicles_present"],
            },
            "source": ex["_source_id"],
            "current_label": ex["label"],
        }
        f.write(json.dumps(record) + "\n")

print(f"\nWrote {samples_path}", file=sys.stderr)

# ── 6. Compute per-label metrics for the protocol's example annotations ───
print("\n--- Per-group stats for protocol examples ---", file=sys.stderr)
for ex in selected:
    feat = ex["features"]
    flags_on = [k for k, v in feat.items() if v is True and k != "detection_count"]
    print(f"  {ex['label'][:5]:5s} dc={feat['detection_count']} flags={flags_on}  src={ex['_source_id'][:20]}", file=sys.stderr)
print("All feature signatures in sample:\n", file=sys.stderr)
for ex in selected:
    feat = ex["features"]
    print(f"  dc={feat['detection_count']} "
          f"approval_refs={feat['approval_refs_complete']} "
          f"evidence={feat['evidence_complete']} "
          f"latency={feat['latency_measured']} "
          f"obstacles={feat['obstacles_present']} "
          f"operator_review={feat['operator_review_required']} "
          f"people={feat['people_present']} "
          f"vehicles={feat['vehicles_present']} "
          f"label={ex['label'][:5]}", file=sys.stderr)
