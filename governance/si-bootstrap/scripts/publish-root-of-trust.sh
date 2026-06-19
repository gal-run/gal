#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
key_path="${1:-${ROOT_KEY_PATH:-}}"

if [[ -z "${key_path}" ]]; then
  echo "usage: scripts/publish-root-of-trust.sh /path/to/root-key.pem" >&2
  exit 1
fi

if [[ ! -f "${key_path}" ]]; then
  echo "root key not found: ${key_path}" >&2
  exit 1
fi

artifacts_dir="${repo_root}/artifacts"
constitution_path="${repo_root}/CONSTITUTION.md"
signature_bin="${artifacts_dir}/constitution.sig.bin"
signature_b64="${artifacts_dir}/constitution.sig.base64"
public_key_path="${artifacts_dir}/root.pub.pem"
genesis_path="${artifacts_dir}/genesis.json"

mkdir -p "${artifacts_dir}"

constitution_hash="$(shasum -a 256 "${constitution_path}" | awk '{print $1}')"
openssl pkey -in "${key_path}" -pubout -out "${public_key_path}" >/dev/null 2>&1
signature_bin="$(mktemp)"
trap 'rm -f "${signature_bin}"' EXIT
openssl pkeyutl -sign -rawin -inkey "${key_path}" -in "${constitution_path}" -out "${signature_bin}"
base64 < "${signature_bin}" | tr -d '\n' > "${signature_b64}"

public_key_sha256="$(openssl pkey -pubin -in "${public_key_path}" -outform DER | shasum -a 256 | awk '{print $1}')"

cat > "${genesis_path}" <<EOF
{
  "constitution_hash": "${constitution_hash}",
  "signature_algorithm": "ed25519",
  "signature_file": "artifacts/constitution.sig.base64",
  "public_key_file": "artifacts/root.pub.pem",
  "public_key_sha256": "${public_key_sha256}",
  "signed_at_utc": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF

echo "published root of trust to ${artifacts_dir}"
