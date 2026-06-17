#!/usr/bin/env bash
set -euo pipefail

PYTHON_BIN="${PYTHON_BIN:-python3}"
DATASET_MANIFEST="${DATASET_MANIFEST:-dataset-manifest.json}"
TRAIN_DATASET="${TRAIN_DATASET:-train.jsonl}"
EVAL_DATASET="${EVAL_DATASET:-validation.jsonl}"
TEST_DATASET="${TEST_DATASET:-test.jsonl}"
RUNTIME_BENCHMARK="${RUNTIME_BENCHMARK:-runtime-benchmark.jsonl}"
OUTPUT_ROOT="${OUTPUT_ROOT:-artifacts/gal-sidecar-runpod}"
EPOCHS="${EPOCHS:-20}"
SEED="${SEED:-7}"
MIN_ACCURACY="${MIN_ACCURACY:-0.75}"
MAX_P95_LATENCY_MS="${MAX_P95_LATENCY_MS:-10}"
RUNTIME_WARMUP_ITERATIONS="${RUNTIME_WARMUP_ITERATIONS:-5}"
INSTALL_PROJECT="${INSTALL_PROJECT:-0}"
DEVICE="${DEVICE:-cuda}"
REQUIRE_CUDA="${REQUIRE_CUDA:-1}"
CUDA_PREFLIGHT_OUT="${CUDA_PREFLIGHT_OUT:-${OUTPUT_ROOT}/cuda-preflight.json}"
STOP_AFTER_CUDA_PREFLIGHT="${STOP_AFTER_CUDA_PREFLIGHT:-0}"

mkdir -p "${OUTPUT_ROOT}"

if [[ "${REQUIRE_CUDA}" == "1" || "${DEVICE}" == "cuda" ]]; then
  PYTHONPATH=src "${PYTHON_BIN}" -m gal_model.cuda_preflight --require-cuda --out "${CUDA_PREFLIGHT_OUT}"
else
  PYTHONPATH=src "${PYTHON_BIN}" -m gal_model.cuda_preflight --out "${CUDA_PREFLIGHT_OUT}" || true
fi

if [[ "${STOP_AFTER_CUDA_PREFLIGHT}" == "1" ]]; then
  echo "CUDA_PREFLIGHT_ONLY_PASS: ${CUDA_PREFLIGHT_OUT}"
  exit 0
fi

if [[ "${INSTALL_PROJECT}" == "1" ]]; then
  "${PYTHON_BIN}" -m pip install -e .
fi

echo "Validating dataset manifest: ${DATASET_MANIFEST}"
PYTHONPATH=src "${PYTHON_BIN}" -m gal_model.validate_data --manifest "${DATASET_MANIFEST}" \
  | tee "${OUTPUT_ROOT}/dataset-validation.json"

for architecture in mlp resnet_mlp; do
  model_dir="${OUTPUT_ROOT}/${architecture}"
  mkdir -p "${model_dir}"

  echo "Training ${architecture}"
  PYTHONPATH=src "${PYTHON_BIN}" -m gal_model.train \
    --dataset "${TRAIN_DATASET}" \
    --output-dir "${model_dir}" \
    --epochs "${EPOCHS}" \
    --seed "${SEED}" \
    --architecture "${architecture}" \
    --device "${DEVICE}" \
    | tee "${model_dir}/training-summary.stdout.json"

  model_path="${model_dir}/gal-governance-decision.pt"

  if [[ -f "${EVAL_DATASET}" ]]; then
    echo "Evaluating ${architecture} on ${EVAL_DATASET}"
    PYTHONPATH=src "${PYTHON_BIN}" -m gal_model.evaluate \
      --model "${model_path}" \
      --dataset "${EVAL_DATASET}" \
      --min-accuracy "${MIN_ACCURACY}" \
      --device "${DEVICE}" \
      | tee "${model_dir}/eval-validation.json"
  fi

  if [[ -f "${TEST_DATASET}" ]]; then
    echo "Evaluating ${architecture} on ${TEST_DATASET}"
    PYTHONPATH=src "${PYTHON_BIN}" -m gal_model.evaluate \
      --model "${model_path}" \
      --dataset "${TEST_DATASET}" \
      --min-accuracy "${MIN_ACCURACY}" \
      --device "${DEVICE}" \
      | tee "${model_dir}/eval-test.json"
  fi

  if [[ -f "${RUNTIME_BENCHMARK}" ]]; then
    echo "Running runtime governance benchmark for ${architecture}"
    PYTHONPATH=src "${PYTHON_BIN}" -m gal_model.runtime_benchmark \
      --model "${model_path}" \
      --cases "${RUNTIME_BENCHMARK}" \
      --max-false-clear-rate 0 \
      --min-operator-review-recall 1 \
      --max-p95-latency-ms "${MAX_P95_LATENCY_MS}" \
      --warmup-iterations "${RUNTIME_WARMUP_ITERATIONS}" \
      --min-schema-rejection-rate 0 \
      --min-audit-metadata-completeness 1 \
      --device "${DEVICE}" \
      | tee "${model_dir}/runtime-benchmark.json"
  fi
done

"${PYTHON_BIN}" - <<'PY' "${OUTPUT_ROOT}" "${DATASET_MANIFEST}" "${TRAIN_DATASET}" "${EVAL_DATASET}" "${TEST_DATASET}" "${RUNTIME_BENCHMARK}" "${DEVICE}" "${CUDA_PREFLIGHT_OUT}"
import json
import sys
from pathlib import Path

output_root = Path(sys.argv[1])
manifest = {
    "artifact_type": "gal-sidecar-runpod-training",
    "dataset_manifest": sys.argv[2],
    "train_dataset": sys.argv[3],
    "eval_dataset": sys.argv[4],
    "test_dataset": sys.argv[5],
    "runtime_benchmark": sys.argv[6],
    "device": sys.argv[7],
    "cuda_preflight": sys.argv[8],
    "architectures": ["mlp", "resnet_mlp"],
    "outputs": {
        "mlp": "mlp/gal-governance-decision.pt",
        "resnet_mlp": "resnet_mlp/gal-governance-decision.pt",
    },
    "advisory_only": True,
    "physical_action_allowed": False,
    "hardware_commands_allowed": False,
}
(output_root / "artifact-manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps(manifest, indent=2, sort_keys=True))
PY
