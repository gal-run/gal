"""Train the GAL governance decision model."""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader

from .constants import LABELS, MODEL_REF
from .dataset import load_examples, tensor_dataset_from_examples
from .device import VALID_DEVICE_CHOICES, resolve_device
from .features import FEATURE_NAMES
from .network import ARCHITECTURES, build_model


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=10)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=0.02)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--architecture", choices=ARCHITECTURES, default="mlp")
    parser.add_argument("--device", choices=VALID_DEVICE_CHOICES, default="cpu")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    if args.epochs <= 0:
        print("epochs must be positive", file=sys.stderr)
        return 2
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    device = resolve_device(args.device)

    examples = load_examples(args.dataset)
    dataset = tensor_dataset_from_examples(examples)
    loader = DataLoader(dataset, batch_size=args.batch_size, shuffle=True)
    model = build_model(args.architecture).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.learning_rate)
    loss_fn = nn.CrossEntropyLoss()

    last_loss = 0.0
    model.train()
    for _ in range(args.epochs):
        for features, labels in loader:
            features = features.to(device)
            labels = labels.to(device)
            optimizer.zero_grad()
            logits = model(features)
            loss = loss_fn(logits, labels)
            loss.backward()
            optimizer.step()
            last_loss = float(loss.detach().item())

    args.output_dir.mkdir(parents=True, exist_ok=True)
    model_path = args.output_dir / "gal-governance-decision.pt"
    torch.save(
        {
            "model_ref": MODEL_REF,
            "architecture": args.architecture,
            "labels": LABELS,
            "feature_names": FEATURE_NAMES,
            "state_dict": model.state_dict(),
        },
        model_path,
    )
    metadata = {
        "model_ref": MODEL_REF,
        "architecture": args.architecture,
        "dataset": args.dataset.as_posix(),
        "examples": len(examples),
        "epochs": args.epochs,
        "last_loss": round(last_loss, 6),
        "device": str(device),
        "output_model": model_path.as_posix(),
        "advisory_only": True,
        "physical_action_allowed": False,
        "hardware_commands_allowed": False,
    }
    metadata_path = args.output_dir / "training-summary.json"
    metadata_path.write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2, sort_keys=True))
    return 0


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
