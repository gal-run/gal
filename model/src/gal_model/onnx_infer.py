"""Run inference with an exported ONNX GAL governance sidecar artifact."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from .api_contract import build_inference_response, load_inference_request, parse_inference_request
from .constants import INDEX_TO_LABEL
from .features import encode_features
from .onnx_runtime import (
    create_inference_session,
    load_runtime_artifact,
    resolve_runtime_artifact_path,
    run_onnx_logits,
    softmax_numpy,
)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--artifact", type=Path)
    parser.add_argument("--example", type=Path, required=True)
    return parser.parse_args(argv)


def load_request(path: Path) -> dict[str, object]:
    if path.as_posix() != "-":
        return load_inference_request(path)
    payload = json.loads(sys.stdin.read())
    if not isinstance(payload, dict):
        raise ValueError("stdin inference request must be a JSON object")
    return parse_inference_request(payload)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    metadata_path = resolve_runtime_artifact_path(args.model, args.artifact)
    metadata = load_runtime_artifact(metadata_path)
    request = load_request(args.example)

    session = create_inference_session(args.model)
    encoded = [encode_features(request["features"])]
    logits = run_onnx_logits(
        session,
        encoded,
        input_name=metadata["input_name"],
        output_name=metadata["output_name"],
    )
    probabilities = softmax_numpy(np.asarray(logits, dtype=np.float32))[0]
    index = int(np.argmax(probabilities))

    result = build_inference_response(
        request,
        metadata,
        decision=INDEX_TO_LABEL[index],
        confidence=float(probabilities[index]),
    )
    result["runtime_format"] = metadata["export_format"]
    result["providers"] = session.get_providers()
    result["device"] = "cpu"
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
