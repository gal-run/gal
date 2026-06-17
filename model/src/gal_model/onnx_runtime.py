"""Shared ONNX runtime helpers for GAL governance sidecar artifacts."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
import onnxruntime as ort

from .constants import LABELS, MODEL_REF
from .features import FEATURE_NAMES
from .network import ARCHITECTURES

RUNTIME_ARTIFACT_SCHEMA_VERSION = "gal-model-runtime-artifact/v0"
ONNX_EXPORT_FORMAT = "onnx"
ONNX_INPUT_NAME = "features"
ONNX_OUTPUT_NAME = "logits"
DEFAULT_RUNTIME_ARTIFACT_FILENAME = "runtime-artifact.json"
DEFAULT_ONNX_FILENAME = "gal-governance-decision.onnx"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_runtime_artifact_metadata(
    checkpoint: dict[str, Any],
    *,
    onnx_path: Path,
    checkpoint_path: Path,
    opset_version: int,
    providers: list[str],
    parity: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "schema_version": RUNTIME_ARTIFACT_SCHEMA_VERSION,
        "export_format": ONNX_EXPORT_FORMAT,
        "model_ref": checkpoint["model_ref"],
        "architecture": checkpoint.get("architecture", "mlp"),
        "labels": list(checkpoint["labels"]),
        "feature_names": list(checkpoint["feature_names"]),
        "input_name": ONNX_INPUT_NAME,
        "output_name": ONNX_OUTPUT_NAME,
        "input_shape": ["batch", len(FEATURE_NAMES)],
        "output_shape": ["batch", len(LABELS)],
        "opset_version": opset_version,
        "target_runtime": "onnxruntime",
        "providers": providers,
        "checkpoint_file": checkpoint_path.name,
        "checkpoint_sha256": sha256_file(checkpoint_path),
        "artifact_file": onnx_path.name,
        "artifact_sha256": sha256_file(onnx_path),
        "advisory_only": True,
        "physical_action_allowed": False,
        "hardware_commands_allowed": False,
        "parity": parity or {},
    }


def validate_runtime_artifact_metadata(metadata: dict[str, Any]) -> None:
    if metadata.get("schema_version") != RUNTIME_ARTIFACT_SCHEMA_VERSION:
        raise ValueError(
            f"runtime artifact schema_version {metadata.get('schema_version')!r} "
            f"does not match {RUNTIME_ARTIFACT_SCHEMA_VERSION!r}"
        )
    if metadata.get("export_format") != ONNX_EXPORT_FORMAT:
        raise ValueError(f"runtime artifact export_format must be {ONNX_EXPORT_FORMAT!r}")
    if metadata.get("model_ref") != MODEL_REF:
        raise ValueError(f"runtime artifact model_ref {metadata.get('model_ref')!r} does not match {MODEL_REF!r}")
    if metadata.get("labels") != LABELS:
        raise ValueError(f"runtime artifact labels {metadata.get('labels')!r} do not match {LABELS!r}")
    if metadata.get("feature_names") != FEATURE_NAMES:
        raise ValueError(
            f"runtime artifact feature_names {metadata.get('feature_names')!r} do not match {FEATURE_NAMES!r}"
        )
    architecture = metadata.get("architecture")
    if architecture not in ARCHITECTURES:
        raise ValueError(f"runtime artifact architecture {architecture!r} is unsupported")
    for key in ("input_name", "output_name", "artifact_file", "artifact_sha256", "checkpoint_file"):
        if not isinstance(metadata.get(key), str) or not metadata[key]:
            raise ValueError(f"runtime artifact {key} is required")
    opset_version = metadata.get("opset_version")
    if not isinstance(opset_version, int) or opset_version <= 0:
        raise ValueError("runtime artifact opset_version must be a positive integer")
    providers = metadata.get("providers")
    if not isinstance(providers, list) or not all(isinstance(item, str) for item in providers):
        raise ValueError("runtime artifact providers must be a string array")


def load_runtime_artifact(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path}: runtime artifact must be a JSON object")
    validate_runtime_artifact_metadata(payload)
    return payload


def resolve_runtime_artifact_path(model_path: Path, artifact_path: Path | None = None) -> Path:
    if artifact_path is not None:
        return artifact_path
    return model_path.with_name(DEFAULT_RUNTIME_ARTIFACT_FILENAME)


def create_inference_session(model_path: Path) -> ort.InferenceSession:
    available_providers = ort.get_available_providers()
    providers = ["CPUExecutionProvider"] if "CPUExecutionProvider" in available_providers else None
    if providers is None:
        return ort.InferenceSession(model_path.as_posix())
    return ort.InferenceSession(model_path.as_posix(), providers=providers)


def run_onnx_logits(
    session: ort.InferenceSession,
    features: list[list[float]] | np.ndarray,
    *,
    input_name: str = ONNX_INPUT_NAME,
    output_name: str = ONNX_OUTPUT_NAME,
) -> np.ndarray:
    batch = np.asarray(features, dtype=np.float32)
    outputs = session.run([output_name], {input_name: batch})
    logits = outputs[0]
    if not isinstance(logits, np.ndarray):
        logits = np.asarray(logits, dtype=np.float32)
    return logits.astype(np.float32, copy=False)


def softmax_numpy(logits: np.ndarray) -> np.ndarray:
    shifted = logits - np.max(logits, axis=1, keepdims=True)
    exp = np.exp(shifted)
    denom = np.sum(exp, axis=1, keepdims=True)
    return exp / denom
