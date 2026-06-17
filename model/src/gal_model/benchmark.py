"""Benchmark GAL governance decision model inference latency."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import torch

from .checkpoint import load_model_from_checkpoint
from .device import VALID_DEVICE_CHOICES, resolve_device, synchronize_device
from .features import FEATURE_NAMES, encode_features
from .infer import load_example


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--example", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--warmup", type=int, default=10)
    parser.add_argument("--iterations", type=int, default=200)
    parser.add_argument("--device", choices=VALID_DEVICE_CHOICES, default="cpu")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if args.batch_size <= 0:
        print("batch-size must be positive", file=sys.stderr)
        return 2
    if args.warmup < 0:
        print("warmup must not be negative", file=sys.stderr)
        return 2
    if args.iterations <= 0:
        print("iterations must be positive", file=sys.stderr)
        return 2

    runtime_device = resolve_device(args.device)
    model, checkpoint = load_model_from_checkpoint(args.model, device=args.device)
    features = load_example(args.example)
    encoded = encode_features(features)
    tensor = torch.tensor([encoded for _ in range(args.batch_size)], dtype=torch.float32, device=runtime_device)

    with torch.no_grad():
        for _ in range(args.warmup):
            model(tensor)

        synchronize_device(runtime_device)
        started = time.perf_counter()
        for _ in range(args.iterations):
            model(tensor)
        synchronize_device(runtime_device)
        elapsed_ms = (time.perf_counter() - started) * 1000.0

    total_examples = args.iterations * args.batch_size
    latency_per_batch_ms = elapsed_ms / args.iterations
    latency_per_example_ms = elapsed_ms / total_examples
    result = {
        "model_ref": checkpoint["model_ref"],
        "architecture": checkpoint.get("architecture", "mlp"),
        "feature_count": len(FEATURE_NAMES),
        "batch_size": args.batch_size,
        "warmup_iterations": args.warmup,
        "timed_iterations": args.iterations,
        "total_examples": total_examples,
        "device": str(runtime_device),
        "total_latency_ms": round(elapsed_ms, 6),
        "latency_per_batch_ms": round(latency_per_batch_ms, 6),
        "latency_per_example_ms": round(latency_per_example_ms, 6),
        "examples_per_second": round(total_examples / (elapsed_ms / 1000.0), 3) if elapsed_ms > 0 else 0.0,
        "fixed_shape": True,
        "advisory_only": True,
        "physical_action_allowed": False,
        "hardware_commands_allowed": False,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
