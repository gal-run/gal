#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GAL CLI — install.sh
# Downloads and installs the latest gal binary from GitHub Releases.
# Usage: curl -fsSL https://gal.run/install.sh | sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────
REPO="gal-run/gal-cli-oss"
VERSION="${GAL_VERSION:-latest}"

# ── Detect OS and architecture ─────────────────────────────────────────────
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
darwin) OS="apple-darwin" ;;
linux) OS="unknown-linux-gnu" ;;
*)
    echo "Error: unsupported operating system: $OS"
    echo "gal currently supports macOS and Linux."
    exit 1
    ;;
esac

case "$ARCH" in
x86_64 | amd64) ARCH="x86_64" ;;
aarch64 | arm64) ARCH="aarch64" ;;
*)
    echo "Error: unsupported architecture: $ARCH"
    echo "gal supports x86_64 and aarch64."
    exit 1
    ;;
esac

# ── Determine install directory ────────────────────────────────────────────
if [ "$(id -u)" -eq 0 ] || [ -w /usr/local/bin ]; then
    BIN_DIR="/usr/local/bin"
else
    BIN_DIR="${HOME}/.local/bin"
    mkdir -p "$BIN_DIR"
fi

# Warn if BIN_DIR is not on PATH
case ":${PATH}:" in
*:"${BIN_DIR}":*) ;;
*)
    echo "Warning: ${BIN_DIR} is not in your PATH."
    echo "  Add it by running:  export PATH=\"${BIN_DIR}:\$PATH\""
    echo "  Or append it to your shell profile (~/.zshrc, ~/.bashrc, etc.)."
    ;;
esac

# ── Resolve version ────────────────────────────────────────────────────────
if [ "$VERSION" = "latest" ]; then
    echo "Fetching latest release version..."
    VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" |
        grep '"tag_name":' |
        sed 's/.*"v\([^"]*\)".*/\1/')"

    if [ -z "$VERSION" ]; then
        echo "Error: could not determine the latest version."
        echo "  Set GAL_VERSION manually:  GAL_VERSION=0.1.0 curl -fsSL https://gal.run/install.sh | sh"
        exit 1
    fi
fi

# Strip leading "v" if present for the URL
V_TAG="${VERSION}"
case "$VERSION" in
v*) VERSION="${VERSION#v}" ;;
esac

ARCHIVE="gal-${ARCH}-${OS}.tar.gz"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ARCHIVE}"

# ── Download and install ───────────────────────────────────────────────────
echo "Downloading gal v${VERSION} for ${ARCH}-${OS}..."
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

# Use API-based download when GITHUB_TOKEN is set (needed for private repos)
if [ -n "${GITHUB_TOKEN:-}" ]; then
    # Resolve asset ID via GitHub API (use python3 for reliable JSON parsing)
    ASSET_DATA="$(curl -fsSL \
        -H "Authorization: Bearer ${GITHUB_TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${REPO}/releases/tags/v${VERSION}")"

    ASSET_ID="$(echo "${ASSET_DATA}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
archive = '${ARCHIVE}'
for asset in data.get('assets', []):
    if asset['name'] == archive:
        print(asset['id'])
" 2>/dev/null)"

    if [ -z "${ASSET_ID}" ]; then
        echo "Error: could not find asset ${ARCHIVE} in release v${VERSION}."
        echo "  Available assets:"
        echo "${ASSET_DATA}" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for asset in data.get('assets', []):
    print(f'    - {asset[\"name\"]}')
" 2>/dev/null || true
        exit 1
    fi

    curl -fsSL \
        -H "Authorization: Bearer ${GITHUB_TOKEN}" \
        -H "Accept: application/octet-stream" \
        "https://api.github.com/repos/${REPO}/releases/assets/${ASSET_ID}" \
        -o "${TMP_DIR}/${ARCHIVE}"
else
    # Public download (works for public repos)
    curl -fsSL "${DOWNLOAD_URL}" -o "${TMP_DIR}/${ARCHIVE}"
fi

echo "Extracting..."
tar -xzf "${TMP_DIR}/${ARCHIVE}" -C "${TMP_DIR}"

echo "Installing to ${BIN_DIR}/gal..."
install -m 755 "${TMP_DIR}/gal" "${BIN_DIR}/gal"

# ── Verify ─────────────────────────────────────────────────────────────────
echo ""
echo "Installed gal v${VERSION} to ${BIN_DIR}/gal"
echo ""
if command -v gal &>/dev/null; then
    gal --version
else
    echo "Note: 'gal' is not on your current PATH."
    echo "Run it directly:  ${BIN_DIR}/gal --version"
fi
