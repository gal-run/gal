#!/bin/bash

# Build script for GAL Chrome Extension

set -e

echo "Building GAL Chrome Extension..."

# Clean dist (except icons)
if [ -d "dist" ]; then
  find dist -mindepth 1 ! -path "dist/icons*" -delete
fi

# Build with Vite
pnpm vite build

# Copy manifest and icons
cp public/manifest.json dist/
if [ -d "public/icons" ]; then
  mkdir -p dist/icons
  cp -r public/icons/* dist/icons/
fi

echo "✅ Build complete: dist/"
