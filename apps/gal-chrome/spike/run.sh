#!/bin/bash
# gal-chrome spike: start the bridge, launch a REAL Chromium with the spike extension loaded,
# let it connect, drive it via chrome.debugger (CDP), and verify. Non-destructive: clean
# throwaway profile, not your real one.
#
# NOTE: Chrome STABLE (149+) ignores --load-extension for security, so verification uses
# Chrome-for-Testing / Chromium (which allow it). It's the same Chromium engine + the same
# extension code. In PRODUCTION the user installs gal-chrome normally (Web Store or
# chrome://extensions "Load unpacked") into their real Chrome — no CLI flag needed.
set -uo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
PROFILE="$(mktemp -d)"

# Pick a Chromium that honors --load-extension: $CHROME_BIN, else Chrome-for-Testing, else Chromium.
CHROME="${CHROME_BIN:-}"
# @puppeteer/browsers installs into ./chrome relative to where it ran (here: this dir).
for base in "$DIR/chrome" "$HOME/.cache/puppeteer/chrome"; do
  [ -n "$CHROME" ] && break
  CHROME="$(ls "$base/"*/chrome-mac-arm64/"Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" 2>/dev/null | head -1)"
done
[ -z "$CHROME" ] && CHROME="$(ls "$HOME/.cache/puppeteer/chrome/"*/chrome-mac-x64/"Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" 2>/dev/null | head -1)"
[ -z "$CHROME" ] && [ -x "/Applications/Chromium.app/Contents/MacOS/Chromium" ] && CHROME="/Applications/Chromium.app/Contents/MacOS/Chromium"
if [ -z "$CHROME" ] || [ ! -x "$CHROME" ]; then
  echo "No Chrome-for-Testing/Chromium found. Run: npx -y @puppeteer/browsers install chrome@stable" >&2
  exit 2
fi
echo "[run] using: $CHROME" >&2

python3 "$DIR/bridge.py" &
BRIDGE=$!
sleep 1.5

"$CHROME" \
  --user-data-dir="$PROFILE" \
  --no-first-run --no-default-browser-check \
  --load-extension="$DIR/extension" \
  --new-window "about:blank" >/tmp/galchrome-chrome.log 2>&1 &
CHROMEPID=$!

wait $BRIDGE
RC=$?

kill "$CHROMEPID" 2>/dev/null
pkill -f "user-data-dir=$PROFILE" 2>/dev/null
rm -rf "$PROFILE"
exit $RC
