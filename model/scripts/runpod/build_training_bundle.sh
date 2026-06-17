#!/usr/bin/env bash
set -euo pipefail

OUT="${OUT:-dist/gal-model-runpod-bundle.tar.gz}"
mkdir -p "$(dirname "${OUT}")"

tar \
  --exclude='.venv' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='tmp' \
  --exclude='artifacts' \
  --exclude='dist' \
  --exclude='.git' \
  -czf "${OUT}" \
  AGENTS.md \
  Makefile \
  README.md \
  pyproject.toml \
  requirements.txt \
  src \
  schemas \
  docs \
  benchmarks \
  data/fixtures \
  model_cards \
  scripts/runpod

echo "Wrote ${OUT}"
