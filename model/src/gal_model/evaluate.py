"""Evaluate a trained GAL governance decision model."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import torch

from .checkpoint import load_model_from_checkpoint
from .constants import INDEX_TO_LABEL, LABELS, LABEL_TO_INDEX, MODEL_REF
from .dataset import load_examples
from .device import VALID_DEVICE_CHOICES, resolve_device, synchronize_device
from .features import encode_features


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--min-accuracy", type=float, default=0.0)
    parser.add_argument("--device", choices=VALID_DEVICE_CHOICES, default="cpu")
    return parser.parse_args(argv)


def evaluate_examples(
    model: torch.nn.Module,
    examples: list[dict[str, Any]],
    *,
    device: torch.device,
) -> dict[str, Any]:
    encoded = [encode_features(item["features"]) for item in examples]
    expected = [LABEL_TO_INDEX[item["label"]] for item in examples]
    tensor = torch.tensor(encoded, dtype=torch.float32, device=device)

    with torch.no_grad():
        model(tensor)
        logits = model(tensor)
        probabilities = torch.softmax(logits, dim=1)
        predicted = torch.argmax(probabilities, dim=1)
    synchronize_device(device)

    synchronize_device(device)
    started = time.perf_counter()
    with torch.no_grad():
        logits = model(tensor)
        probabilities = torch.softmax(logits, dim=1)
        predicted = torch.argmax(probabilities, dim=1)
    synchronize_device(device)
    elapsed_ms = (time.perf_counter() - started) * 1000.0

    confusion = {label: {inner: 0 for inner in LABELS} for label in LABELS}
    per_label = {label: {"support": 0, "correct": 0, "recall": 0.0} for label in LABELS}
    correct = 0
    confidence_sum = 0.0

    for index, expected_index in enumerate(expected):
        predicted_index = int(predicted[index].item())
        expected_label = INDEX_TO_LABEL[expected_index]
        predicted_label = INDEX_TO_LABEL[predicted_index]
        confidence = float(probabilities[index][predicted_index].item())

        confusion[expected_label][predicted_label] += 1
        per_label[expected_label]["support"] += 1
        confidence_sum += confidence
        if predicted_index == expected_index:
            correct += 1
            per_label[expected_label]["correct"] += 1

    total = len(examples)
    for label, metrics in per_label.items():
        support = int(metrics["support"])
        metrics["recall"] = round(float(metrics["correct"]) / support, 6) if support else 0.0

    return {
        "model_ref": MODEL_REF,
        "examples": total,
        "accuracy": round(correct / total, 6),
        "average_confidence": round(confidence_sum / total, 6),
        "latency_ms": round(elapsed_ms, 6),
        "examples_per_second": round(total / (elapsed_ms / 1000.0), 3) if elapsed_ms > 0 else 0.0,
        "labels": LABELS,
        "confusion_matrix": confusion,
        "per_label": per_label,
        "advisory_only": True,
        "physical_action_allowed": False,
        "hardware_commands_allowed": False,
    }


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if not 0.0 <= args.min_accuracy <= 1.0:
        print("min-accuracy must be between 0 and 1", file=sys.stderr)
        return 2

    runtime_device = resolve_device(args.device)
    model, checkpoint = load_model_from_checkpoint(args.model, device=args.device)
    examples = load_examples(args.dataset)
    result = evaluate_examples(model, examples, device=runtime_device)
    result["model_ref"] = checkpoint["model_ref"]
    result["architecture"] = checkpoint.get("architecture", "mlp")
    result["dataset"] = args.dataset.as_posix()
    result["device"] = str(runtime_device)
    result["min_accuracy"] = args.min_accuracy
    result["passed"] = result["accuracy"] >= args.min_accuracy

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["passed"] else 1


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
