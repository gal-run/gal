#!/bin/bash

# Demo Studio - Quick Start Script
# This script demonstrates the basic workflow

set -e

echo "🎬 Demo Studio - Quick Start"
echo "============================"
echo ""

# Check dependencies
echo "1. Checking dependencies..."
node dist/cli/index.js check
echo ""

# Create a demo script
echo "2. Creating demo script..."
node dist/cli/index.js create "My First Demo" -o /tmp
echo ""

# Show the script
echo "3. Demo script content:"
cat /tmp/my-first-demo.json
echo ""

# Dry run to validate
echo "4. Validating script..."
node dist/cli/index.js run /tmp/my-first-demo.json --dry-run
echo ""

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit /tmp/my-first-demo.json to customize your demo"
echo "  2. Run: node dist/cli/index.js record -o raw.mp4"
echo "  3. Process: node dist/cli/index.js process raw.mp4 -o final.mp4"
echo ""
echo "For AI agent control:"
echo "  node dist/cli/index.js mcp"
