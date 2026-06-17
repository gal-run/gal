"""Stage or publish a GAL model bundle for Kaggle Models."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

KAGGLE_FRAMEWORKS = (
    "api",
    "flax",
    "jax",
    "keras",
    "onnx",
    "other",
    "pyTorch",
    "scikitLearn",
    "tensorFlow2",
    "transformers",
)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--staging-dir", type=Path, required=True)
    parser.add_argument("--owner-slug", required=True)
    parser.add_argument("--model-slug", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--instance-slug", required=True)
    parser.add_argument("--framework", choices=KAGGLE_FRAMEWORKS, default="onnx")
    parser.add_argument("--license-name", default="Apache 2.0")
    parser.add_argument("--subtitle", default="")
    parser.add_argument("--overview", default="GAL governance sidecar artifact bundle")
    parser.add_argument("--description-file", type=Path, default=Path("model_cards/gal-governance-decision-v0.md"))
    parser.add_argument("--usage-file", type=Path)
    parser.add_argument("--training-data", action="append", default=[])
    parser.add_argument("--visibility", choices=("private", "public"), default="private")
    parser.add_argument("--skip-model-create", action="store_true")
    parser.add_argument("--execute", action="store_true")
    return parser.parse_args(argv)


def list_source_files(source_dir: Path) -> list[Path]:
    if not source_dir.exists():
        raise ValueError(f"{source_dir}: source directory was not found")
    if not source_dir.is_dir():
        raise ValueError(f"{source_dir}: source directory must be a directory")
    files = sorted(
        path.relative_to(source_dir)
        for path in source_dir.rglob("*")
        if path.is_file() and not any(part.startswith(".") for part in path.relative_to(source_dir).parts)
    )
    if not files:
        raise ValueError(f"{source_dir}: no publishable files found")
    return files


def _read_text(path: Path) -> str:
    if not path.exists():
        raise ValueError(f"{path}: referenced file was not found")
    return path.read_text(encoding="utf-8")


def _copy_source_tree(source_dir: Path, staging_dir: Path, files: list[Path]) -> None:
    if staging_dir.exists():
        shutil.rmtree(staging_dir)
    staging_dir.mkdir(parents=True, exist_ok=True)
    for relative_path in files:
        source = source_dir / relative_path
        destination = staging_dir / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def stage_bundle(args: argparse.Namespace) -> dict[str, object]:
    files = list_source_files(args.source_dir)
    _copy_source_tree(args.source_dir, args.staging_dir, files)

    description = _read_text(args.description_file)
    usage = _read_text(args.usage_file) if args.usage_file else "Load the staged artifact files from Kaggle Models."
    model_metadata = {
        "description": description,
        "isPrivate": args.visibility == "private",
        "ownerSlug": args.owner_slug,
        "provenanceSources": [],
        "slug": args.model_slug,
        "subtitle": args.subtitle,
        "title": args.title,
    }
    instance_metadata = {
        "fineTunable": False,
        "framework": args.framework,
        "instanceSlug": args.instance_slug,
        "licenseName": args.license_name,
        "modelSlug": args.model_slug,
        "overview": args.overview,
        "ownerSlug": args.owner_slug,
        "trainingData": args.training_data,
        "usage": usage,
    }
    (args.staging_dir / "model-metadata.json").write_text(
        json.dumps(model_metadata, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    (args.staging_dir / "model-instance-metadata.json").write_text(
        json.dumps(instance_metadata, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return {
        "commands": [
            f"kaggle models create -p {args.staging_dir.as_posix()}",
            f"kaggle models variations create -p {args.staging_dir.as_posix()}",
        ],
        "copied_file_count": len(files),
        "copied_files": [path.as_posix() for path in files],
        "description_file": args.description_file.as_posix(),
        "execute": False,
        "framework": args.framework,
        "instance_slug": args.instance_slug,
        "model_slug": args.model_slug,
        "owner_slug": args.owner_slug,
        "provider": "kaggle",
        "skip_model_create": args.skip_model_create,
        "source_dir": args.source_dir.as_posix(),
        "staging_dir": args.staging_dir.as_posix(),
        "usage_file": args.usage_file.as_posix() if args.usage_file else None,
        "visibility": args.visibility,
    }


def publish(args: argparse.Namespace) -> dict[str, object]:
    summary = stage_bundle(args)
    if not args.execute:
        return summary

    if shutil.which("kaggle") is None:
        raise ValueError("kaggle CLI is not installed or not on PATH")

    if not args.skip_model_create:
        subprocess.run(["kaggle", "models", "create", "-p", args.staging_dir.as_posix()], check=True)
    subprocess.run(["kaggle", "models", "variations", "create", "-p", args.staging_dir.as_posix()], check=True)
    summary["execute"] = True
    return summary


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        summary = publish(args)
    except (ValueError, subprocess.CalledProcessError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
