#!/usr/bin/env bash
set -euo pipefail

DATASET_DIR="${DATASET_DIR:-}"
OUT="${OUT:-dist/gal-model-runpod-job-bundle.tar.gz}"

if [[ -z "${DATASET_DIR}" ]]; then
  echo "DATASET_DIR is required" >&2
  exit 2
fi

if [[ ! -f "${DATASET_DIR}/dataset-manifest.json" ]]; then
  echo "dataset manifest not found at ${DATASET_DIR}/dataset-manifest.json" >&2
  exit 2
fi

stage_dir="$(mktemp -d)"
cleanup() {
  rm -rf "${stage_dir}"
}
trap cleanup EXIT

mkdir -p "${stage_dir}/repo" "${stage_dir}/dataset" "$(dirname "${OUT}")"

tar \
  --exclude='.venv' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='tmp' \
  --exclude='artifacts' \
  --exclude='dist' \
  --exclude='.git' \
  -cf "${stage_dir}/repo.tar" \
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

tar -xf "${stage_dir}/repo.tar" -C "${stage_dir}/repo"
cp -R "${DATASET_DIR}/." "${stage_dir}/dataset/"

python3 - <<'PY' "${stage_dir}"
import json
import sys
from pathlib import Path

stage_dir = Path(sys.argv[1])
dataset_manifest_path = stage_dir / "dataset" / "dataset-manifest.json"
dataset_manifest = json.loads(dataset_manifest_path.read_text(encoding="utf-8"))

job_manifest = {
    "artifact_type": "gal-model-runpod-job-bundle",
    "bundle_version": "v0",
    "dataset_manifest": "dataset/dataset-manifest.json",
    "dataset_ref": dataset_manifest["dataset_ref"],
    "run_command": "bash RUNPOD_COMMAND.sh",
    "output_root": "artifacts/gal-sidecar-runpod",
    "advisory_only": True,
    "physical_action_allowed": False,
    "hardware_commands_allowed": False,
}
(stage_dir / "runpod-job-manifest.json").write_text(
    json.dumps(job_manifest, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)

command = """#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/repo"
PYTHON_BIN="${PYTHON_BIN:-python3}" \\
DATASET_MANIFEST="../dataset/dataset-manifest.json" \\
TRAIN_DATASET="../dataset/train.jsonl" \\
EVAL_DATASET="../dataset/validation.jsonl" \\
TEST_DATASET="../dataset/test.jsonl" \\
RUNTIME_BENCHMARK="../dataset/runtime-benchmark.jsonl" \\
OUTPUT_ROOT="../artifacts/gal-sidecar-runpod" \\
bash scripts/runpod/train_gal_sidecar.sh
"""
(stage_dir / "RUNPOD_COMMAND.sh").write_text(command, encoding="utf-8")
PY

chmod +x "${stage_dir}/RUNPOD_COMMAND.sh"

tar -czf "${OUT}" -C "${stage_dir}" .
echo "Wrote ${OUT}"
