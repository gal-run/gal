#!/bin/bash
set -e

cd "$(dirname "$0")"

APP_NAME="GAL Accessibility App"
APP_BUNDLE="${APP_NAME}.app"

echo "Building ${APP_NAME}..."
swift build -c release

echo "Creating app bundle..."
mkdir -p "${APP_BUNDLE}/Contents/MacOS"
mkdir -p "${APP_BUNDLE}/Contents/Resources"

cp .build/release/gal-accessibility-app "${APP_BUNDLE}/Contents/MacOS/GAL Accessibility App"

cat > "${APP_BUNDLE}/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    <key>CFBundleExecutable</key>
    <string>GAL Accessibility App</string>
    <key>CFBundleIdentifier</key>
    <string>dev.gal.accessibility-app</string>
    <key>CFBundleName</key>
    <string>GAL Accessibility App</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSAppleEventsUsageDescription</key>
    <string>GAL Accessibility App needs to control applications for desktop automation.</string>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
</dict>
</plist>
PLIST

chmod +x "${APP_BUNDLE}/Contents/MacOS/GAL Accessibility App"

echo "Build complete: ${APP_BUNDLE}"
echo "To run: open \"${APP_BUNDLE}\""
echo "To test: echo '{\"action\":\"ping\"}' | nc -U "$HOME/Library/Application Support/GALComputerUse/helper.sock""
