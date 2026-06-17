"""Export a PyTorch checkpoint to TypeScript model format."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import torch


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def format_number(value: float) -> str:
    return repr(value) if value != value else str(value)


def json_array(items: list[float]) -> str:
    return json.dumps(items)


def json_matrix(rows: list[list[float]]) -> str:
    return "[\n" + ",\n".join("      " + json.dumps(row) for row in rows) + "\n    ]"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)

    ckpt = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    architecture = ckpt["architecture"]
    if architecture != "mlp":
        print(
            f"error: only mlp architecture supported for TS export, got {architecture!r}",
            file=sys.stderr,
        )
        return 1

    checkpoint_sha = sha256(args.checkpoint)

    lines: list[str] = []
    lines.append("export const GovernanceSidecarModel = {")
    lines.append(f'  "architecture": {json.dumps(architecture)},')
    lines.append(f'  "checkpoint_sha256": {json.dumps(checkpoint_sha)},')
    lines.append(f'  "feature_names": {json.dumps(ckpt["feature_names"])},')
    lines.append(f'  "labels": {json.dumps(ckpt["labels"])},')
    lines.append(f'  "model_ref": {json.dumps(ckpt["model_ref"])},')
    lines.append(f'  "schema_version": "gal-model-runtime-artifact/v0",')
    lines.append('  "weights": {')

    state = ckpt["state_dict"]
    weight_keys = [k for k in state if k.endswith(".weight") or k.endswith(".bias")]
    for i, key in enumerate(sorted(weight_keys)):
        tensor = state[key].tolist()
        comma = "," if i < len(weight_keys) - 1 else ""
        if isinstance(tensor[0], list):
            lines.append(f"    {json.dumps(key)}: {json_matrix(tensor)}{comma}")
        else:
            lines.append(f"    {json.dumps(key)}: {json_array(tensor)}{comma}")

    lines.append("  }")
    lines.append("} as const")
    lines.append("")

    content = "\n".join(lines)
    args.output.write_text(content, encoding="utf-8")
    print(f"Wrote {args.output} ({checkpoint_sha[:12]}...)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
