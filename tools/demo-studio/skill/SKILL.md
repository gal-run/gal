# Demo Studio - AI-Powered Demo Video Recording

Create polished software demo videos with AI agent control.

## When to Use This Skill

Use when you need to:
- Record a software demo video
- Add zoom effects to highlight UI elements
- Create cursor smoothing and click indicators
- Generate voiceover narration
- Export polished demo videos
- List and capture specific windows
- Run automated demo scripts

## Quick Start

```bash
# Create a new demo script
demo-studio create "My Demo"

# Run the demo script
demo-studio run my-demo.json

# List available windows
demo-studio windows

# Record a specific window
demo-studio record --window "Chrome"

# Take a screenshot
demo-studio screenshot --window "VS Code" -o vscode.png
```

## CLI Commands

### `demo-studio record`
Start screen recording with options:
- `--output, -o` - Output file path
- `--fps, -f` - Frames per second (default: 30)
- `--no-audio` - Disable audio capture
- `--region` - Capture region (x,y,w,h)
- `--window` - Window name to capture

### `demo-studio windows`
List all available windows for capture:
- `--filter, -f` - Filter windows by name pattern

### `demo-studio screenshot`
Capture a screenshot:
- `--output, -o` - Output file path
- `--region` - Capture region
- `--window` - Window name
- `--format, -f` - Output format (png, jpg, webp)

### `demo-studio run <script>`
Run a demo script:
- `--output, -o` - Override output path
- `--dry-run` - Validate script without executing

### `demo-studio create <name>`
Create a new demo script template:
- `--output, -o` - Output directory

### `demo-studio mcp`
Start MCP server for AI agent control

## MCP Tools

| Tool | Description |
|------|-------------|
| `start_recording` | Begin screen recording |
| `stop_recording` | End recording and save |
| `add_zoom_region` | Add zoom effect region |
| `add_click_marker` | Add click animation |
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
  "version": "1.0.0",
  "output": {
    "path": "demo.mp4",
    "resolution": { "width": 1920, "height": 1080 },
    "fps": 30,
    "quality": "high"
  },
  "recording": {
    "captureAudio": true
  },
  "steps": [
    { "type": "record", "duration": 3 },
    { "type": "text", "text": "Welcome", "duration": 2 },
    { "type": "zoom", "x": 960, "y": 540, "scale": 1.5, "duration": 2 },
    { "type": "click", "x": 400, "y": 300, "duration": 1, "zoom": { "scale": 2 } },
    { "type": "keystroke", "keys": "Cmd+K", "duration": 2 },
    { "type": "voiceover", "text": "Click here to start", "duration": 3 }
  ]
}
```

### Step Types

| Type | Properties | Description |
|------|------------|-------------|
| `record` | `duration` | Record screen for duration |
| `click` | `x`, `y`, `duration`, `zoom` | Click animation with optional zoom |
| `keystroke` | `keys`, `duration`, `position` | Keyboard shortcut overlay |
| `zoom` | `x`, `y`, `scale`, `duration` | Zoom to region |
| `voiceover` | `text`, `duration`, `voice` | TTS narration |
| `text` | `text`, `x`, `y`, `duration` | Text overlay |
| `wait` | `duration` | Wait for duration |
| `screenshot` | - | Capture screenshot |

## Example Scripts

See `examples/` directory:
- `login-flow.json` - Login flow with zoom and voiceover
- `feature-walkthrough.json` - Multi-feature tour
- `dashboard-overview.json` - Dashboard overview demo
- `api-demo.json` - API documentation walkthrough
- `vscode-extension.json` - VS Code extension demo

## Output Quality

| Level | CRF | Preset | Use Case |
|-------|-----|--------|----------|
| draft | 28 | ultrafast | Quick previews |
| standard | 23 | fast | Internal demos |
| high | 18 | medium | Published content |
| production | 12 | slow | Final releases |

## AI Agent Integration

### Via MCP Server

```bash
demo-studio mcp
```

Connect AI agents via MCP to:
1. Control recording programmatically
2. Add effects at precise timestamps
3. Generate voiceover from context
4. Export polished demos automatically

### Programmatic Usage

```typescript
import { DemoScriptRunner } from '@gal-run/demo-studio';

const runner = await DemoScriptRunner.fromFile('demo.json');
await runner.run();
await runner.export('output.mp4');
```

## Installation

```bash
npm install -g @gal-run/demo-studio
```

## Requirements

- Node.js 18+
- FFmpeg (auto-installed)
- macOS 10.15+ (Windows support planned)

## Environment Variables

```bash
# For TTS voiceover
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
```

## License

MIT
