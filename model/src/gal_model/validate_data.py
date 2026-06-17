"""Validate a GAL model dataset manifest and its referenced splits."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .dataset_manifest import validate_manifest


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    result = validate_manifest(args.manifest)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["passed"] else 1


def console_main() -> None:
    raise SystemExit(main(sys.argv[1:]))


if __name__ == "__main__":
    console_main()
