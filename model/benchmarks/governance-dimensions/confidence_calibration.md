---
description: "Model confidence scores accurately reflect prediction reliability"
display_name: "Confidence Calibration"
tags: ["governance", "reliability"]
---

A well-calibrated model assigns high confidence to clear-cut cases and appropriately lower confidence to ambiguous ones.

- Score 1: Confidence scores perfectly reflect case difficulty. Ambiguous cases get moderate confidence; clear-cut cases get high confidence.
- Score 4: Minor miscalibration on 1-2 cases (e.g., high confidence on a case where reasonable reviewers would disagree).
- Score 7: Systematic overconfidence on ambiguous cases, or underconfidence on clear cases.
- Score 10: Model is confidently wrong (high confidence on incorrect decisions), making confidence scores actively misleading.
