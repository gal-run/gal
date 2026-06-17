"""CUDA runtime preflight for GAL RunPod training."""

from __future__ import annotations

import argparse
import json
import platform
import subprocess
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--require-cuda", action="store_true")
    return parser.parse_args(argv)


def _nvidia_smi() -> dict[str, Any]:
    try:
        summary = subprocess.run(
            ["nvidia-smi"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError:
        return {"available": False, "error": "nvidia-smi is not installed."}
    except subprocess.CalledProcessError as exc:
        return {"available": False, "error": exc.stderr.strip() or exc.stdout.strip()}

    query = [
        "nvidia-smi",
        "--query-gpu=name,driver_version,compute_mode,memory.total,memory.used",
        "--format=csv,noheader",
    ]
    try:
        result = subprocess.run(
            query,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except subprocess.CalledProcessError as exc:
        return {
            "available": True,
            "query_error": exc.stderr.strip() or exc.stdout.strip(),
            "raw": summary.stdout,
        }

    rows: list[dict[str, str]] = []
    for line in result.stdout.splitlines():
        parts = [part.strip() for part in line.split(",")]
        if len(parts) >= 5:
            rows.append(
                {
                    "name": parts[0],
                    "driver_version": parts[1],
                    "compute_mode": parts[2],
                    "memory_total": parts[3],
                    "memory_used": parts[4],
                }
            )
    return {"available": True, "gpus": rows}


def build_report() -> dict[str, Any]:
    report: dict[str, Any] = {
        "schema": "gal-model.cuda_runtime_preflight.v0",
        "created_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "purpose": "Verify actual CUDA tensor allocation before paid GAL sidecar training.",
        "python": platform.python_version(),
        "status": "blocked",
        "nvidia_smi": _nvidia_smi(),
        "torch": {},
        "advisory_only": True,
        "physical_action_allowed": False,
        "hardware_commands_allowed": False,
    }
    try:
        import torch
    except ImportError:
        report["torch"] = {"imported": False, "error": "PyTorch is not installed."}
        return report

    torch_info: dict[str, Any] = {
        "imported": True,
        "version": getattr(torch, "__version__", "unknown"),
        "compiled_cuda": getattr(getattr(torch, "version", None), "cuda", None),
        "cuda_available": bool(torch.cuda.is_available()),
        "device_count": int(torch.cuda.device_count()) if torch.cuda.is_available() else 0,
        "devices": [],
    }
    report["torch"] = torch_info
    if not torch_info["cuda_available"]:
        torch_info["error"] = "torch.cuda.is_available() is false."
        return report

    try:
        for index in range(torch.cuda.device_count()):
            torch_info["devices"].append(
                {"index": index, "name": torch.cuda.get_device_name(index)}
            )
        device = torch.device("cuda:0")
        tensor = torch.zeros(1, device=device)
        tensor = tensor + 1
        torch.cuda.synchronize(device)
        torch_info["tensor_probe"] = tensor.detach().cpu().tolist()
        report["status"] = "pass"
    except Exception as exc:  # pragma: no cover - depends on runtime
        torch_info["error"] = f"{type(exc).__name__}: {exc}"
        torch_info["traceback"] = traceback.format_exc()
    return report


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    report = build_report()
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if (not args.require_cuda or report["status"] == "pass") else 1


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
