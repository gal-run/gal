"""Runtime device helpers for GAL model training and inference."""

from __future__ import annotations

import torch

VALID_DEVICE_CHOICES = ("cpu", "cuda", "auto")


def resolve_device(device_name: str, *, require_cuda: bool = False) -> torch.device:
    normalized = device_name.strip().lower()
    if normalized not in VALID_DEVICE_CHOICES:
        raise ValueError(f"device must be one of {VALID_DEVICE_CHOICES!r}")

    if normalized == "auto":
        normalized = "cuda" if torch.cuda.is_available() else "cpu"

    if normalized == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA requested but torch.cuda.is_available() is false")
    if require_cuda and normalized != "cuda":
        raise ValueError("CUDA is required for this run")
    return torch.device(normalized)


def synchronize_device(device: torch.device) -> None:
    if device.type == "cuda":
        torch.cuda.synchronize(device)
