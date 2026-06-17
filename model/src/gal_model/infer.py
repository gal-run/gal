"""Run inference with a trained GAL governance decision model."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import torch

from .api_contract import build_inference_response, load_inference_request
from .checkpoint import load_model_from_checkpoint
from .constants import INDEX_TO_LABEL
from .device import VALID_DEVICE_CHOICES
from .features import encode_features


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--example", type=Path, required=True)
    parser.add_argument("--device", choices=VALID_DEVICE_CHOICES, default="cpu")
    return parser.parse_args(argv)


def load_example(path: Path) -> dict[str, Any]:
    request = load_inference_request(path)
    return request["features"]


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    model, checkpoint = load_model_from_checkpoint(args.model, device=args.device)

    request = load_inference_request(args.example)
    features = request["features"]
    tensor = torch.tensor([encode_features(features)], dtype=torch.float32, device=next(model.parameters()).device)
    with torch.no_grad():
        logits = model(tensor)
        probabilities = torch.softmax(logits, dim=1)[0]
        index = int(torch.argmax(probabilities).item())
    result = build_inference_response(
        request,
        checkpoint,
        decision=INDEX_TO_LABEL[index],
        confidence=float(probabilities[index].item()),
    )
    result["device"] = args.device
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
