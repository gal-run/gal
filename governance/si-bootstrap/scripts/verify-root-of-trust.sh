#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifacts_dir="${repo_root}/artifacts"
constitution_path="${repo_root}/CONSTITUTION.md"
signature_b64="${artifacts_dir}/constitution.sig.base64"
public_key_path="${artifacts_dir}/root.pub.pem"
genesis_path="${artifacts_dir}/genesis.json"

if [[ ! -f "${signature_b64}" || ! -f "${public_key_path}" || ! -f "${genesis_path}" ]]; then
  echo "missing published root-of-trust artifacts" >&2
  exit 1
fi

signature_bin="$(mktemp)"
trap 'rm -f "${signature_bin}"' EXIT
base64 -d < "${signature_b64}" > "${signature_bin}"
openssl pkeyutl -verify -pubin -inkey "${public_key_path}" -sigfile "${signature_bin}" -rawin -in "${constitution_path}" >/dev/null

actual_hash="$(shasum -a 256 "${constitution_path}" | awk '{print $1}')"
expected_hash="$(python3 - <<'PY' "${genesis_path}"
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as fh:
    print(json.load(fh)["constitution_hash"])
PY
)"

if [[ "${actual_hash}" != "${expected_hash}" ]]; then
  echo "constitution hash mismatch" >&2
  echo "expected: ${expected_hash}" >&2
  echo "actual:   ${actual_hash}" >&2
  exit 1
fi

echo "root of trust verified"
