#!/usr/bin/env bash
set -euo pipefail

GPU_ID="${GPU_ID:-NVIDIA RTX 2000 Ada Generation}"
TEMPLATE_ID="${TEMPLATE_ID:-runpod-torch-v240}"
CLOUD_TYPE="${CLOUD_TYPE:-SECURE}"
POD_NAME="${POD_NAME:-gal-model-sidecar-train}"
CONTAINER_DISK_GB="${CONTAINER_DISK_GB:-20}"
VOLUME_GB="${VOLUME_GB:-20}"
PORTS="${PORTS:-22/tcp}"

CREATE=0
if [[ "${1:-}" == "--create" ]]; then
  CREATE=1
fi

COMMAND=(
  runpodctl pod create
  --template-id "${TEMPLATE_ID}"
  --gpu-id "${GPU_ID}"
  --name "${POD_NAME}"
  --cloud-type "${CLOUD_TYPE}"
  --container-disk-in-gb "${CONTAINER_DISK_GB}"
  --volume-in-gb "${VOLUME_GB}"
  --ports "${PORTS}"
)

printf 'Planned RunPod command:\n'
printf '  %q' "${COMMAND[@]}"
printf '\n'

if [[ "${CREATE}" != "1" ]]; then
  echo "DRY_RUN_ONLY: no pod created. Re-run with --create and CONFIRM_RUNPOD_SPEND=YES after readiness is approved."
  exit 0
fi

if [[ "${CONFIRM_RUNPOD_SPEND:-}" != "YES" ]]; then
  echo "Refusing to create pod without CONFIRM_RUNPOD_SPEND=YES" >&2
  exit 1
fi

"${COMMAND[@]}"
