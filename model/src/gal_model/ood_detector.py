"""Out-of-distribution detection for governance feature vectors.

Detects when an input feature vector falls outside the training distribution,
preventing adversarial feature gaming. An attacker who learns the 8-feature
decision boundary can craft inputs that always pass — OOD detection catches
these by flagging unusual feature combinations.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np


class GovernanceOODDetector:
    """Density-based OOD detector for 8-feature governance vectors.

    Fits a simple density model on training feature vectors. At inference time,
    scores each input against the density — low density = likely adversarial.
    """

    def __init__(self) -> None:
        self._training_vectors: set[tuple] = set()
        self._training_array: np.ndarray | None = None
        self._density_threshold: float = 0.0

    def fit(self, examples: list[dict[str, Any]]) -> None:
        """Build the set of known feature vectors from training data."""
        from .features import encode_features

        vectors = []
        for ex in examples:
            feats = ex.get("features", {})
            vec = tuple(encode_features(feats))
            self._training_vectors.add(vec)
            vectors.append(vec)

        self._training_array = np.array(vectors)

        # Compute density threshold as the minimum distance between any two training points
        if len(self._training_array) > 1:
            from sklearn.metrics import pairwise_distances

            dists = pairwise_distances(self._training_array[:500])
            np.fill_diagonal(dists, np.inf)
            min_dist = dists.min()
            self._density_threshold = min_dist * 3  # 3x the minimum inter-point distance
        else:
            self._density_threshold = 0.1

    def score(self, features: dict[str, Any]) -> dict[str, Any]:
        """Score a feature vector for OOD. Returns in_distribution and anomaly_score."""
        from .features import encode_features

        vec = np.array(encode_features(features))

        # Check 1: exact match in training set
        vec_tuple = tuple(vec.tolist())
        exact_match = vec_tuple in self._training_vectors

        # Check 2: distance to nearest training vector
        if self._training_array is not None:
            dists = np.linalg.norm(self._training_array - vec, axis=1)
            min_dist = float(dists.min())
        else:
            min_dist = 0.0  # No training data — can't detect OOD

        # Check 3: feature consistency (logical constraints on features)
        consistency_ok = self._check_consistency(features)

        in_distribution = exact_match or (min_dist <= self._density_threshold and consistency_ok)
        anomaly_score = min_dist if not exact_match else 0.0

        return {
            "in_distribution": in_distribution,
            "anomaly_score": round(anomaly_score, 6),
            "exact_match": exact_match,
            "min_distance_to_training": round(min_dist, 6),
            "density_threshold": round(self._density_threshold, 6),
            "consistency_ok": consistency_ok,
            "known_vectors": len(self._training_vectors),
        }

    def _check_consistency(self, features: dict[str, Any]) -> bool:
        """Check logical consistency of governance features.

        Examples of invalid states:
        - evidence_complete=True but obstacles_present=True (inconsistent)
        - operator_review_required=True and evidence_complete=False but people_present=False
          and vehicles_present=False (nobody flagged it, so why is review required?)
        """
        evidence = features.get("evidence_complete", True)
        obstacles = features.get("obstacles_present", False)
        people = features.get("people_present", False)
        vehicles = features.get("vehicles_present", False)
        review_req = features.get("operator_review_required", False)
        approvals = features.get("approval_refs_complete", False)
        detection = features.get("detection_count", 0)

        # evidence_complete=True should not coexist with obstacles
        if evidence and obstacles and detection > 2:
            return False

        # If review is required, someone should be present (human or bot)
        if review_req and not people and not vehicles:
            return False

        # approvals_complete=True should not coexist with review_required=True
        if approvals and review_req:
            return False

        # detection_count > 0 should have SOME signal
        if detection > 0 and not people and not vehicles and not obstacles and evidence:
            return False

        return True

    def save(self, path: Path) -> None:
        data = {
            "training_vectors": len(self._training_vectors),
            "density_threshold": self._density_threshold,
            "vectors": [list(v) for v in self._training_vectors],
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2))

    @classmethod
    def load(cls, path: Path) -> GovernanceOODDetector:
        detector = cls()
        data = json.loads(path.read_text(encoding="utf-8"))
        detector._training_vectors = {tuple(v) for v in data["vectors"]}
        detector._training_array = np.array(data["vectors"])
        detector._density_threshold = data["density_threshold"]
        return detector
