"""Build a sanitized external publish bundle for GAL model artifacts."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--model-card", type=Path, default=Path("model_cards/gal-governance-decision-v0.md"))
    parser.add_argument("--checkpoint", type=Path)
    parser.add_argument("--benchmark", type=Path, action="append", default=[])
    parser.add_argument("--extra-file", type=Path, action="append", default=[])
    return parser.parse_args(argv)


def _require_file(path: Path, *, context: str) -> None:
    if not path.exists():
        raise ValueError(f"{path}: {context} was not found")
    if not path.is_file():
        raise ValueError(f"{path}: {context} must be a file")


def _copy_file(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def build_publish_bundle(
    *,
    artifact_dir: Path,
    output_dir: Path,
    model_card: Path,
    checkpoint: Path | None = None,
    benchmarks: list[Path] | None = None,
    extra_files: list[Path] | None = None,
) -> dict[str, object]:
    _require_file(model_card, context="model card")
    if not artifact_dir.exists():
        raise ValueError(f"{artifact_dir}: artifact directory was not found")
    if not artifact_dir.is_dir():
        raise ValueError(f"{artifact_dir}: artifact directory must be a directory")

    benchmarks = benchmarks or []
    extra_files = extra_files or []
    for path in benchmarks:
        _require_file(path, context="benchmark artifact")
    for path in extra_files:
        _require_file(path, context="extra file")
    if checkpoint is not None:
        _require_file(checkpoint, context="checkpoint")

    files_to_copy = sorted(path for path in artifact_dir.rglob("*") if path.is_file())
    if not files_to_copy:
        raise ValueError(f"{artifact_dir}: no artifact files found")

    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    copied: list[str] = []
    for source in files_to_copy:
        relative_path = source.relative_to(artifact_dir)
        destination = output_dir / relative_path
        _copy_file(source, destination)
        copied.append(relative_path.as_posix())

    readme_target = output_dir / "README.md"
    _copy_file(model_card, readme_target)
    copied.append("README.md")

    if checkpoint is not None:
        checkpoint_target = output_dir / checkpoint.name
        _copy_file(checkpoint, checkpoint_target)
        copied.append(checkpoint_target.name)

    benchmark_targets: list[str] = []
    for benchmark in benchmarks:
        destination = output_dir / "benchmarks" / benchmark.name
        _copy_file(benchmark, destination)
        relative = destination.relative_to(output_dir).as_posix()
        benchmark_targets.append(relative)
        copied.append(relative)

    extra_targets: list[str] = []
    for extra in extra_files:
        destination = output_dir / "extras" / extra.name
        _copy_file(extra, destination)
        relative = destination.relative_to(output_dir).as_posix()
        extra_targets.append(relative)
        copied.append(relative)

    manifest = {
        "artifact_dir": artifact_dir.as_posix(),
        "benchmarks": benchmark_targets,
        "checkpoint": checkpoint.name if checkpoint is not None else None,
        "copied_files": sorted(copied),
        "extra_files": extra_targets,
        "model_card": model_card.as_posix(),
        "publish_bundle_version": "gal-publish-bundle/v0",
        "reviewed_data_embedded": False,
        "sensitive_telemetry_embedded": False,
    }
    manifest_path = output_dir / "publish-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    summary = {
        "artifact_dir": artifact_dir.as_posix(),
        "benchmark_count": len(benchmark_targets),
        "checkpoint_included": checkpoint is not None,
        "extra_file_count": len(extra_targets),
        "file_count": len(manifest["copied_files"]) + 1,
        "manifest": manifest_path.as_posix(),
        "output_dir": output_dir.as_posix(),
        "readme": readme_target.as_posix(),
    }
    return summary


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        summary = build_publish_bundle(
            artifact_dir=args.artifact_dir,
            output_dir=args.output_dir,
            model_card=args.model_card,
            checkpoint=args.checkpoint,
            benchmarks=args.benchmark,
            extra_files=args.extra_file,
        )
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
