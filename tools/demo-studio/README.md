# Demo Studio

AI-powered software demo video recorder. Create polished demo videos with zoom effects, cursor smoothing, and voiceover - controllable by AI agents via MCP.

[![CI](https://github.com/gal-run/gal/actions/workflows/ci.yml/badge.svg)](https://github.com/gal-run/gal/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/%40gal-run%2Fdemo-studio.svg)](https://badge.fury.io/js/%40gal-run%2Fdemo-studio)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why Demo Studio?

Unlike Screen Studio or other screen recorders, Demo Studio is designed for **AI agent control** and **automated demo creation**:

- **MCP Integration**: Control recording from AI agents (Claude, Codex, etc.)
- **Scriptable Demos**: Define complete demo flows in JSON
- **Programmatic API**: Full TypeScript API for building custom workflows
- **Window Detection**: Automatically detect and capture specific windows
- **Post-Processing**: Built-in effects engine for zoom, cursor smoothing, overlays

## Features

- **Screen Recording**: High-quality capture with configurable FPS and resolution
- **Smart Zoom**: Auto-zoom on clicks, configurable zoom regions with easing
- **Cursor Smoothing**: Smooth cursor movements between clicks
- **Keystroke Overlay**: Display keyboard shortcuts on screen
- **TTS Voiceover**: Auto-generate narration (OpenAI, ElevenLabs)
- **Timeline Editor**: Multi-track editor for trimming and arranging clips
- **MCP Integration**: Control recording from AI agents
- **Scriptable Demos**: Define demo flows in JSON/YAML
- **Window Detection**: List, find, and capture specific windows
- **Screenshot Capture**: Region, window, and full-screen capture

## Quick Start

### 1. Install & Build

```bash
git clone https://github.com/gal-run/gal.git
cd demo-studio
npm install
npm run build
```

### 2. Check Dependencies

```bash
node dist/cli/index.js check
```

### 3. Record Your First Demo

```bash
# Start recording (Ctrl+C to stop)
node dist/cli/index.js record -o demo.mp4

# Get video info
node dist/cli/index.js info demo.mp4

# Convert to GIF
node dist/cli/index.js gif demo.mp4 -o demo.gif
```

### 4. Create Scriptable Demo

```bash
# Create demo script template
node dist/cli/index.js create "My Demo" -o .

# Edit the JSON file, then run
node dist/cli/index.js run my-demo.json --dry-run  # Validate
```

### 5. Use with AI Agents (MCP)

```bash
# Start MCP server
node dist/cli/index.js mcp

# Connect from Claude Code or other MCP clients
```

## CLI Commands

```bash
demo-studio check                           # Check system dependencies
demo-studio record -o demo.mp4              # Record screen
demo-studio info video.mp4                  # Get video info
demo-studio process input.mp4 -o out.mp4    # Process video
demo-studio gif input.mp4 -o output.gif     # Convert to GIF
demo-studio thumbnail video.mp4 -o thumb.jpg
demo-studio windows                         # List windows (macOS)
demo-studio screenshot -o screen.png        # Take screenshot
demo-studio create "Demo Name"              # Create demo script
demo-studio run demo.json                   # Run demo script
demo-studio mcp                             # Start MCP server
```
demo-studio mcp
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `start_recording` | Begin screen recording |
| `stop_recording` | End recording and save |
| `add_zoom_region` | Define zoom focus area |
| `add_click_marker` | Add animated click indicator |
| `add_keystroke_overlay` | Show keyboard shortcut |
| `add_text_overlay` | Add text annotation |
| `set_cursor_style` | Configure cursor appearance |
| `add_voiceover` | Add TTS narration |
| `export_video` | Render final video |
| `run_demo_script` | Execute demo script |

## Demo Script Format

```json
{
  "name": "Feature Demo",
  "steps": [
    { "type": "record", "duration": 5 },
    { "type": "zoom", "x": 0.5, "y": 0.5, "scale": 1.5, "duration": 2 },
    { "type": "click", "x": 400, "y": 300, "duration": 1, "zoom": { "scale": 2 } },
    { "type": "keystroke", "keys": "Cmd+K", "duration": 2 },
    { "type": "voiceover", "text": "Click here to start" }
  ]
}
```

## Examples

See `examples/` directory for complete demo scripts:

- `login-flow.json` - Login flow with zoom and voiceover
- `feature-walkthrough.json` - Multi-feature tour with effects

## Architecture

```
demo-studio/
├── src/
│   ├── core/recorder.ts      # Screen recording engine
│   ├── effects/
│   │   ├── zoom.ts           # Zoom effect processor
│   │   └── cursor.ts         # Cursor smoothing
│   ├── timeline/editor.ts    # Visual timeline editor
│   ├── renderer/index.ts     # Video rendering
│   ├── tts/index.ts          # Text-to-speech
│   └── mcp/server.ts         # MCP server for AI
├── cli/                      # Command-line interface
├── skill/SKILL.md            # GAL skill definition
└── examples/                 # Demo script examples
```

## Output Quality

| Level | CRF | Preset | Use Case |
|-------|-----|--------|----------|
| draft | 28 | ultrafast | Quick previews |
| standard | 23 | fast | Internal demos |
| high | 18 | medium | Published content |
| production | 12 | slow | Final releases |

## Requirements

- Node.js 18+
- FFmpeg (auto-installed via npm)
- macOS 10.15+ (Windows support planned)

## Environment Variables

```bash
# For TTS voiceover
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
```

## License

MIT
