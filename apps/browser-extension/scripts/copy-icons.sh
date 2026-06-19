#!/bin/bash
# Copy icons from dist to public (one-time setup)
mkdir -p public/icons
cp dist/icons/* public/icons/
echo "✅ Icons copied to public/icons/"
