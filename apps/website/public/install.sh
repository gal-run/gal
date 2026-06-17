#!/usr/bin/env sh
set -eu

BASE_URL="${GAL_INSTALL_BASE_URL:-https://gal.run/cli}"
INSTALL_DIR="${GAL_INSTALL_DIR:-$HOME/.local/bin}"
METHOD="${GAL_INSTALL_METHOD:-auto}"
VERSION="${GAL_INSTALL_VERSION:-latest}"
FORCE="${GAL_INSTALL_FORCE:-0}"

usage() {
  cat <<'EOF'
GAL CLI installer

Usage: install.sh [--method auto|native|homebrew|pnpm|npm] [--version <version>] [--force] [--install-dir <dir>]
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --method)
      METHOD="$2"
      shift 2
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --force)
      FORCE="1"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

log() {
  printf '%s\n' "$1"
}

detect_platform() {
  OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  ARCH="$(uname -m)"

  case "$OS" in
    darwin) PLATFORM="darwin" ;;
    linux) PLATFORM="linux" ;;
    *)
      echo "Unsupported platform: $OS" >&2
      exit 1
      ;;
  esac

  case "$ARCH" in
    x86_64|amd64) ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *)
      echo "Unsupported architecture: $ARCH" >&2
      exit 1
      ;;
  esac
}

fetch_latest_version() {
  curl -fsSL "$BASE_URL/LATEST"
}

resolve_version() {
  if [ "$VERSION" = "latest" ]; then
    VERSION="$(fetch_latest_version 2>/dev/null || true)"
  fi

  if [ -z "$VERSION" ]; then
    return 1
  fi

  return 0
}

native_asset_url() {
  detect_platform
  printf '%s/releases/%s/gal-%s-%s-%s.tar.gz' "$BASE_URL" "$VERSION" "$VERSION" "$PLATFORM" "$ARCH"
}

native_available() {
  if ! resolve_version; then
    return 1
  fi

  ASSET_URL="$(native_asset_url)"
  curl -fsI "$ASSET_URL" >/dev/null 2>&1
}

record_native_install() {
  mkdir -p "$HOME/.gal"
  cat > "$HOME/.gal/install-metadata.json" <<EOF
{
  "method": "native",
  "binaryPath": "$INSTALL_DIR/gal",
  "installedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platform": "$PLATFORM",
  "version": "$VERSION"
}
EOF
}

install_native() {
  detect_platform
  if ! resolve_version; then
    echo "Native assets are not published yet at $BASE_URL." >&2
    exit 1
  fi

  ASSET_URL="$(native_asset_url)"
  TMP_DIR="$(mktemp -d)"
  ARCHIVE_PATH="$TMP_DIR/gal.tar.gz"

  curl -fsSL "$ASSET_URL" -o "$ARCHIVE_PATH"
  mkdir -p "$INSTALL_DIR"
  tar -xzf "$ARCHIVE_PATH" -C "$TMP_DIR"

  if [ -f "$INSTALL_DIR/gal" ] && [ "$FORCE" != "1" ]; then
    echo "GAL is already installed at $INSTALL_DIR/gal. Re-run with --force to replace it." >&2
    exit 1
  fi

  install -m 755 "$TMP_DIR/gal" "$INSTALL_DIR/gal"
  record_native_install
  rm -rf "$TMP_DIR"

  log "Installed GAL CLI to $INSTALL_DIR/gal"
  case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *)
      log ""
      log "Add this directory to PATH before using gal:"
      log "  export PATH=\"$INSTALL_DIR:\$PATH\""
      ;;
  esac
}

install_homebrew() {
  if ! command_exists brew; then
    echo "Homebrew is not installed." >&2
    exit 1
  fi

  if brew list gal >/dev/null 2>&1; then
    if [ "$FORCE" = "1" ]; then
      brew reinstall gal
    else
      brew upgrade gal
    fi
  else
    brew install scheduler-systems/tap/gal
  fi
}

install_pnpm() {
  if ! command_exists pnpm; then
    echo "pnpm is not installed." >&2
    exit 1
  fi

  pnpm add -g "@scheduler-systems/gal-run@${VERSION}"
}

install_npm() {
  if ! command_exists npm; then
    echo "npm is not installed." >&2
    exit 1
  fi

  npm install -g "@scheduler-systems/gal-run@${VERSION}"
}

resolve_auto_method() {
  if native_available; then
    METHOD="native"
    return
  fi

  if [ "$(uname -s)" = "Darwin" ] && command_exists brew; then
    METHOD="homebrew"
    return
  fi

  if command_exists pnpm; then
    METHOD="pnpm"
    return
  fi

  if command_exists npm; then
    METHOD="npm"
    return
  fi

  METHOD="native"
}

if [ "$METHOD" = "auto" ]; then
  resolve_auto_method
fi

case "$METHOD" in
  native)
    if ! native_available; then
      log "Native assets are not available at $BASE_URL yet. Falling back to package manager install."
      if command_exists pnpm; then
        METHOD="pnpm"
      elif command_exists npm; then
        METHOD="npm"
      elif [ "$(uname -s)" = "Darwin" ] && command_exists brew; then
        METHOD="homebrew"
      else
        echo "No supported fallback installer found." >&2
        exit 1
      fi
    fi
    ;;
esac

case "$METHOD" in
  native) install_native ;;
  homebrew) install_homebrew ;;
  pnpm) install_pnpm ;;
  npm) install_npm ;;
  *)
    echo "Unsupported install method: $METHOD" >&2
    exit 1
    ;;
esac
