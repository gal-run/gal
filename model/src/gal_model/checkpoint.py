"""Checkpoint loading and metadata validation."""

from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any

import torch

from .constants import LABELS, MODEL_REF
from .device import resolve_device
from .features import FEATURE_NAMES
from .network import ARCHITECTURE_MLP, ARCHITECTURES, build_model


def load_checkpoint(path: Path) -> dict[str, Any]:
    """Load a trusted GAL checkpoint from disk."""
    try:
        checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    except TypeError:
        checkpoint = torch.load(path, map_location="cpu")
    if not isinstance(checkpoint, dict):
        raise ValueError(f"{path}: checkpoint must be a dictionary")
    validate_checkpoint_metadata(checkpoint)
    return checkpoint


def validate_checkpoint_metadata(checkpoint: Mapping[str, Any]) -> None:
    """Reject checkpoints that do not match the runtime contract."""
    model_ref = checkpoint.get("model_ref")
    if model_ref != MODEL_REF:
        raise ValueError(f"checkpoint model_ref {model_ref!r} does not match {MODEL_REF!r}")

    labels = checkpoint.get("labels")
    if labels != LABELS:
        raise ValueError(f"checkpoint labels {labels!r} do not match {LABELS!r}")

    feature_names = checkpoint.get("feature_names")
    if feature_names != FEATURE_NAMES:
        raise ValueError(f"checkpoint feature_names {feature_names!r} do not match {FEATURE_NAMES!r}")

    architecture = checkpoint.get("architecture", ARCHITECTURE_MLP)
    if architecture not in ARCHITECTURES:
        raise ValueError(f"checkpoint architecture {architecture!r} is unsupported")

    state_dict = checkpoint.get("state_dict")
    if not isinstance(state_dict, Mapping):
        raise ValueError("checkpoint state_dict is required")


def load_model_from_checkpoint(path: Path, *, device: str = "cpu") -> tuple[torch.nn.Module, dict[str, Any]]:
    """Load a validated checkpoint into an eval-mode model."""
    checkpoint = load_checkpoint(path)
    runtime_device = resolve_device(device)
    model = build_model(str(checkpoint.get("architecture", ARCHITECTURE_MLP)))
    model.load_state_dict(checkpoint["state_dict"])
    model.to(runtime_device)
    model.eval()
    return model, checkpoint
