"""Export a GAL checkpoint to an ONNX Runtime sidecar artifact."""

from __future__ import annotations

import argparse
import json
import sys
import warnings
from pathlib import Path
from typing import Any

import numpy as np
import torch

from .checkpoint import load_model_from_checkpoint
from .dataset import load_examples
from .features import FEATURE_NAMES, encode_features
from .onnx_runtime import (
    DEFAULT_ONNX_FILENAME,
    DEFAULT_RUNTIME_ARTIFACT_FILENAME,
    build_runtime_artifact_metadata,
    create_inference_session,
    run_onnx_logits,
    softmax_numpy,
)

DEFAULT_OPSET_VERSION = 17


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--dataset", type=Path)
    parser.add_argument("--opset-version", type=int, default=DEFAULT_OPSET_VERSION)
    parser.add_argument("--atol", type=float, default=1e-5)
    parser.add_argument("--rtol", type=float, default=1e-5)
    parser.add_argument("--min-decision-match-rate", type=float, default=1.0)
    return parser.parse_args(argv)


def _torch_logits(model: torch.nn.Module, encoded: list[list[float]]) -> np.ndarray:
    device = next(model.parameters()).device
    tensor = torch.tensor(encoded, dtype=torch.float32, device=device)
    with torch.no_grad():
        logits = model(tensor)
    return logits.detach().cpu().numpy().astype(np.float32, copy=False)


def run_parity_check(
    model: torch.nn.Module,
    dataset_path: Path,
    session_model_path: Path,
    *,
    atol: float,
    rtol: float,
    min_decision_match_rate: float,
) -> dict[str, Any]:
    examples = load_examples(dataset_path)
    encoded = [encode_features(item["features"]) for item in examples]
    torch_logits = _torch_logits(model, encoded)
    session = create_inference_session(session_model_path)
    onnx_logits = run_onnx_logits(session, encoded)

    torch_probs = softmax_numpy(torch_logits)
    onnx_probs = softmax_numpy(onnx_logits)
    torch_decisions = np.argmax(torch_probs, axis=1)
    onnx_decisions = np.argmax(onnx_probs, axis=1)
    decision_match_rate = float(np.mean(torch_decisions == onnx_decisions))
    max_abs_logit_diff = float(np.max(np.abs(torch_logits - onnx_logits)))
    max_abs_probability_diff = float(np.max(np.abs(torch_probs - onnx_probs)))
    logits_close = bool(np.allclose(torch_logits, onnx_logits, atol=atol, rtol=rtol))
    passed = logits_close and decision_match_rate >= min_decision_match_rate

    return {
        "dataset": dataset_path.as_posix(),
        "examples": len(examples),
        "decision_match_rate": round(decision_match_rate, 6),
        "max_abs_logit_diff": round(max_abs_logit_diff, 8),
        "max_abs_probability_diff": round(max_abs_probability_diff, 8),
        "atol": atol,
        "rtol": rtol,
        "logits_allclose": logits_close,
        "min_decision_match_rate": min_decision_match_rate,
        "passed": passed,
        "providers": session.get_providers(),
    }


def export_checkpoint_to_onnx(
    checkpoint_path: Path,
    *,
    output_dir: Path,
    opset_version: int,
    dataset_path: Path | None = None,
    atol: float = 1e-5,
    rtol: float = 1e-5,
    min_decision_match_rate: float = 1.0,
) -> dict[str, Any]:
    model, checkpoint = load_model_from_checkpoint(checkpoint_path, device="cpu")
    output_dir.mkdir(parents=True, exist_ok=True)
    onnx_path = output_dir / DEFAULT_ONNX_FILENAME
    metadata_path = output_dir / DEFAULT_RUNTIME_ARTIFACT_FILENAME

    dummy = torch.zeros((1, len(FEATURE_NAMES)), dtype=torch.float32)
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message="You are using the legacy TorchScript-based ONNX export",
            category=DeprecationWarning,
        )
        torch.onnx.export(
            model,
            dummy,
            onnx_path,
            export_params=True,
            do_constant_folding=True,
            dynamo=False,
            input_names=["features"],
            output_names=["logits"],
            dynamic_axes={"features": {0: "batch"}, "logits": {0: "batch"}},
            opset_version=opset_version,
        )

    providers = create_inference_session(onnx_path).get_providers()
    parity = None
    if dataset_path is not None:
        parity = run_parity_check(
            model,
            dataset_path,
            onnx_path,
            atol=atol,
            rtol=rtol,
            min_decision_match_rate=min_decision_match_rate,
        )
        if not parity["passed"]:
            raise ValueError(
                "ONNX parity check failed: "
                f"logits_allclose={parity['logits_allclose']} "
                f"decision_match_rate={parity['decision_match_rate']}"
            )

    metadata = build_runtime_artifact_metadata(
        checkpoint,
        onnx_path=onnx_path,
        checkpoint_path=checkpoint_path,
        opset_version=opset_version,
        providers=providers,
        parity=parity,
    )
    metadata_path.write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    return {
        "model_ref": checkpoint["model_ref"],
        "architecture": checkpoint.get("architecture", "mlp"),
        "checkpoint": checkpoint_path.as_posix(),
        "artifact": onnx_path.as_posix(),
        "artifact_metadata": metadata_path.as_posix(),
        "opset_version": opset_version,
        "providers": providers,
        "parity": parity,
        "advisory_only": True,
        "physical_action_allowed": False,
        "hardware_commands_allowed": False,
    }


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if args.opset_version <= 0:
        print("opset-version must be positive", file=sys.stderr)
        return 2
    if args.dataset is None and args.min_decision_match_rate != 1.0:
        print("min-decision-match-rate requires --dataset", file=sys.stderr)
        return 2

    result = export_checkpoint_to_onnx(
        args.model,
        output_dir=args.output_dir,
        opset_version=args.opset_version,
        dataset_path=args.dataset,
        atol=args.atol,
        rtol=args.rtol,
        min_decision_match_rate=args.min_decision_match_rate,
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
