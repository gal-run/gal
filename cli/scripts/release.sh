#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# GAL CLI — Build and create a GitHub release
#
# Usage:  ./scripts/release.sh [version]
#
# If version is omitted, the current version from Cargo.toml is used.
# Tags and pushes the release, then creates a GitHub release with assets.
#
# Prerequisites:
#   - gh CLI installed and authenticated
#   - Rust toolchain with cross-compilation targets installed:
#       rustup target add aarch64-apple-darwin
#       rustup target add x86_64-apple-darwin
#       rustup target add x86_64-unknown-linux-gnu
#       rustup target add aarch64-unknown-linux-gnu
#   - Linux ARM64 cross-compiler (if on macOS):
#       brew install filosottile/musl-cross/musl-cross
#     or use Docker for cross-compilation.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$(pwd)"

# ── Determine version ──────────────────────────────────────────────────────
if [ $# -ge 1 ]; then
    VERSION="$1"
    # Update Cargo.toml version
    sed -i '' "s/^version = .*/version = \"${VERSION#v}\"/" Cargo.toml
else
    VERSION="v$(grep '^version = ' Cargo.toml | head -1 | sed 's/.*"\(.*\)"/\1/')"
fi

# Strip leading "v" for Cargo consistency
CARGO_VERSION="${VERSION#v}"

echo "=== GAL CLI Release ${VERSION} ==="
echo ""

# ── Build all targets ──────────────────────────────────────────────────────
TARGETS=(
    "aarch64-apple-darwin"
    "x86_64-apple-darwin"
    "x86_64-unknown-linux-gnu"
    "aarch64-unknown-linux-gnu"
)

echo "Building release binaries..."
mkdir -p dist

for TARGET in "${TARGETS[@]}"; do
    echo "  Building ${TARGET}..."
    cargo build --release --target "${TARGET}"

    ARCHIVE="gal-${TARGET}.tar.gz"
    cd "target/${TARGET}/release"
    tar -czf "${REPO_ROOT}/dist/${ARCHIVE}" gal
    cd "${REPO_ROOT}"

    echo "    -> dist/${ARCHIVE}"
done

echo ""

# ── Create GitHub release ──────────────────────────────────────────────────
echo "Creating GitHub release ${VERSION}..."
echo ""

RELEASE_NOTES=$(cat <<'EOF'
## Downloads

| Platform | Archive |
|----------|---------|
| macOS Intel | `gal-x86_64-apple-darwin.tar.gz` |
| macOS Apple Silicon | `gal-aarch64-apple-darwin.tar.gz` |
| Linux AMD64 | `gal-x86_64-unknown-linux-gnu.tar.gz` |
| Linux ARM64 | `gal-aarch64-unknown-linux-gnu.tar.gz` |

## Install

```bash
curl -fsSL https://gal.run/install.sh | sh
```
EOF
)

gh release create "${VERSION}" \
    --title "${VERSION} - Initial Rust release" \
    --notes "First release of the Rust GAL CLI. Replaces @gal-run/cli (TypeScript).

53 commands, 3 MCP servers, 5.8 MB binary. Zero npm dependencies." \
    dist/*.tar.gz

echo ""
echo "=== Release ${VERSION} published! ==="
echo "  https://github.com/gal-run/gal-cli-oss/releases/tag/${VERSION}"
echo ""
echo "Don't forget to push the Cargo.toml version bump:"
echo "  git add Cargo.toml && git commit -m 'chore: bump version to ${CARGO_VERSION}'"
echo "  git push && git push origin ${VERSION}"
