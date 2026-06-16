#!/bin/bash

# Demo Studio - Full Workflow Demo
# Demonstrates all main features

set -e

echo "🎬 Demo Studio - Full Workflow Demo"
echo "===================================="
echo ""

CLI="node dist/cli/index.js"

# 1. Check dependencies
echo "1️⃣  Checking dependencies..."
$CLI check
echo ""

# 2. Show available commands
echo "2️⃣  Available commands:"
$CLI --help | grep -A 30 "Commands:" | head -15
echo ""

# 3. Create a demo script
echo "3️⃣  Creating demo script..."
$CLI create "Feature Demo" -o /tmp
echo ""

# 4. Validate the script
echo "4️⃣  Validating script..."
$CLI run /tmp/feature-demo.json --dry-run
echo ""

# 5. Show video processing options
echo "5️⃣  Video processing examples:"
echo "   Trim:    $CLI trim input.mp4 -o output.mp4 -s 5 -e 30"
echo "   Resize:  $CLI resize input.mp4 -o output.mp4 -w 1280"
echo "   GIF:     $CLI gif input.mp4 -o output.gif -f 15 -w 480"
echo ""

# 6. Show MCP info
echo "6️⃣  AI Agent Integration:"
echo "   Start MCP server: $CLI mcp"
echo "   Then connect from Claude Code or other MCP clients"
echo ""

echo "✅ Demo complete!"
echo ""
echo "Try recording:"
echo "   $CLI record -o test.mp4"
echo "   (Press Ctrl+C to stop)"
