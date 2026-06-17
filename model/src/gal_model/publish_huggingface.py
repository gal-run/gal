"""Publish GAL model artifacts to a Hugging Face repository."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folder", type=Path, required=True)
    parser.add_argument("--repo-id", required=True)
    parser.add_argument("--repo-type", choices=("model", "dataset", "space"), default="model")
    parser.add_argument("--visibility", choices=("private", "public"), default="private")
    parser.add_argument("--commit-message", default="Upload GAL model artifacts")
    parser.add_argument("--allow-pattern", action="append", default=[])
    parser.add_argument("--ignore-pattern", action="append", default=[])
    parser.add_argument("--execute", action="store_true")
    return parser.parse_args(argv)


def list_publishable_files(folder: Path) -> list[str]:
    if not folder.exists():
        raise ValueError(f"{folder}: folder was not found")
    if not folder.is_dir():
        raise ValueError(f"{folder}: folder must be a directory")
    files = sorted(
        path.relative_to(folder).as_posix()
        for path in folder.rglob("*")
        if path.is_file() and not any(part.startswith(".") for part in path.relative_to(folder).parts)
    )
    if not files:
        raise ValueError(f"{folder}: no publishable files found")
    return files


def build_summary(args: argparse.Namespace, files: list[str], *, executed: bool) -> dict[str, object]:
    return {
        "allow_patterns": args.allow_pattern,
        "commit_message": args.commit_message,
        "committed": executed,
        "execute": executed,
        "file_count": len(files),
        "files": files,
        "folder": args.folder.as_posix(),
        "ignore_patterns": args.ignore_pattern,
        "provider": "huggingface",
        "repo_id": args.repo_id,
        "repo_type": args.repo_type,
        "visibility": args.visibility,
    }


def publish(args: argparse.Namespace) -> dict[str, object]:
    files = list_publishable_files(args.folder)
    if not args.execute:
        return build_summary(args, files, executed=False)

    try:
        from huggingface_hub import HfApi
    except ImportError as exc:
        raise ValueError("huggingface_hub is not installed; install the publish extras first") from exc

    api = HfApi()
    api.create_repo(
        repo_id=args.repo_id,
        repo_type=args.repo_type,
        private=args.visibility == "private",
        exist_ok=True,
    )
    api.upload_folder(
        folder_path=args.folder.as_posix(),
        repo_id=args.repo_id,
        repo_type=args.repo_type,
        commit_message=args.commit_message,
        allow_patterns=args.allow_pattern or None,
        ignore_patterns=args.ignore_pattern or None,
    )
    return build_summary(args, files, executed=True)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    try:
        summary = publish(args)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
