"""Runtime governance sidecar: ONNX-based agent action scoring service.

Embeds into any agent runtime (Claude Code, Cursor, Copilot, Codex) to
intercept actions, score governance decisions, and enforce the feedback loop.

Architecture:
  Agent Action → Sidecar (0.04ms) → clear/hold/feedback → Agent continues/verifies

Deployment modes:
  1. In-process: import governance_gate() directly
  2. CLI: echo '{"features":{...},"title":"..."}' | gal-model-govern
  3. HTTP (future): lightweight REST endpoint
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any


def load_governance_sidecar(
    model_path: str | Path | None = None,
    *,
    satisfaction_threshold: float = 0.85,
    feedback_rounds: int = 3,
) -> dict[str, Any]:
    """Load and return a ready-to-use governance sidecar context.

    Returns a dict with 'score' and 'govern' callables, plus metadata.
    The caller can pass this context to any agent runtime integration.

    Args:
        model_path: Path to GAL checkpoint or ONNX artifact. Auto-detects if None.
        satisfaction_threshold: Confidence threshold for satisfaction (default 0.85)
        feedback_rounds: Max feedback loop rounds (default 3)

    Returns:
        Sidecar context dict with score(), govern(), and metadata.
    """
    import torch

    from .constants import INDEX_TO_LABEL, MODEL_REF
    from .features import encode_features
    from .network import build_model

    if model_path is None:
        # Auto-detect
        candidates = [
            "tmp/scaled-final-mlp/gal-governance-decision.pt",
            "tmp/corpus-v0.3-mlp/gal-governance-decision.pt",
            "tmp/live-github-mlp/gal-governance-decision.pt",
        ]
        for c in candidates:
            if Path(c).exists():
                model_path = c
                break
        if model_path is None:
            raise FileNotFoundError("No GAL model checkpoint found. Train first or provide --model-path.")

    ck = torch.load(model_path, map_location="cpu")
    input_dim = ck.get("input_dim", 8)
    model = build_model("mlp", input_dim=input_dim)
    model.load_state_dict(ck["state_dict"])
    model.eval()

    # Try to load text embedder for augmented mode
    embedder = None
    if input_dim > 8:
        try:
            from sentence_transformers import SentenceTransformer
            embedder = SentenceTransformer("all-MiniLM-L6-v2")
        except Exception:
            pass

    def score(features: dict[str, Any], title: str = "") -> dict[str, Any]:
        """Score a single agent action. Returns governance decision with confidence."""
        struct_vec = encode_features(features)

        if embedder is not None and title:
            emb = embedder.encode([title], show_progress_bar=False)[0].tolist()
            tensor = torch.tensor([struct_vec + emb], dtype=torch.float32)
        else:
            tensor = torch.tensor([struct_vec], dtype=torch.float32)

        t0 = time.perf_counter()
        with torch.no_grad():
            logits = model(tensor)
            probs = torch.softmax(logits, dim=1)[0]
            conf = float(probs.max().item())
            decision = INDEX_TO_LABEL[int(torch.argmax(probs).item())]
        latency_ms = (time.perf_counter() - t0) * 1000

        satisfied = conf >= satisfaction_threshold
        needs_feedback = not satisfied

        return {
            "decision": decision,
            "confidence": round(conf, 6),
            "latency_ms": round(latency_ms, 4),
            "satisfied": satisfied,
            "needs_feedback": needs_feedback,
            "model_ref": ck.get("model_ref", MODEL_REF),
            "advisory_only": True,
            "physical_action_allowed": False,
            "hardware_commands_issued": False,
        }

    def govern(features: dict[str, Any], title: str = "") -> dict[str, Any]:
        """Full governance gate: score + initiate feedback if needed."""
        result = score(features, title)

        if result["needs_feedback"]:
            from .governance_feedback import select_prompt_template

            result["governance_prompt"] = select_prompt_template(features, title)
            result["action"] = "feedback"
        elif result["decision"] == "clear_for_operator_review":
            result["action"] = "proceed"
        else:
            result["action"] = "hold"

        return result

    return {
        "score": score,
        "govern": govern,
        "metadata": {
            "model_ref": ck.get("model_ref", MODEL_REF),
            "architecture": ck.get("architecture", "mlp"),
            "input_dim": input_dim,
            "satisfaction_threshold": satisfaction_threshold,
            "feedback_rounds": feedback_rounds,
            "has_embedder": embedder is not None,
        },
    }


# ── CLI interface ──────────────────────────────────────────────────────────


def console_main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="GAL Governance Sidecar — score agent actions from CLI")
    parser.add_argument("--model-path", type=Path, help="GAL checkpoint path (auto-detected if omitted)")
    parser.add_argument("--input", type=Path, help="JSON file with inference request (stdin if omitted)")
    parser.add_argument("--mode", choices=("score", "govern"), default="govern")
    parser.add_argument("--satisfaction-threshold", type=float, default=0.85)
    parser.add_argument("--pretty", action="store_true", default=True)
    args = parser.parse_args()

    # Load input
    if args.input:
        request = json.loads(args.input.read_text(encoding="utf-8"))
    else:
        request = json.loads(sys.stdin.read())

    features = request.get("features", {})
    title = request.get("title", request.get("request_id", ""))

    # Load sidecar
    sidecar = load_governance_sidecar(
        model_path=args.model_path,
        satisfaction_threshold=args.satisfaction_threshold,
    )

    # Score
    if args.mode == "score":
        result = sidecar["score"](features, title)
    else:
        result = sidecar["govern"](features, title)

    indent = 2 if args.pretty else None
    print(json.dumps(result, indent=indent, sort_keys=True))


if __name__ == "__main__":
    console_main()
