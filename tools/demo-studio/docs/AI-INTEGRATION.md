# Using Demo Studio with AI Agents

Demo Studio provides an MCP (Model Context Protocol) server that allows AI agents to control video recording and processing.

## Starting the MCP Server

```bash
cd demo-studio
npm run build
node dist/cli/index.js mcp
```

## MCP Tools Available

| Tool | Description | Parameters |
|------|-------------|------------|
| `start_recording` | Start screen recording | `output`, `fps`, `captureAudio`, `region` |
| `stop_recording` | Stop and save recording | - |
| `add_zoom_region` | Add zoom effect | `x`, `y`, `scale`, `startTime`, `endTime` |
| `add_click_marker` | Add click animation | `x`, `y`, `timestamp`, `duration` |
| `add_keystroke_overlay` | Show keystroke | `keys`, `timestamp`, `duration`, `position` |
| `add_text_overlay` | Add text | `text`, `x`, `y`, `startTime`, `endTime` |
| `set_cursor_style` | Configure cursor | `visible`, `smoothness`, `highlightOnClick` |
| `add_voiceover` | Add TTS | `text`, `startTime`, `voice` |
| `export_video` | Render final video | `output`, `quality` |
| `run_demo_script` | Run JSON script | `script` |

## Example AI Agent Workflow

### From Claude Code

1. Start MCP server:
```
node dist/cli/index.js mcp
```

2. In Claude Code, the agent can use:
```
start_recording(output="demo.mp4", fps=30)
```

3. User performs actions on screen

4. Agent stops recording:
```
stop_recording()
```

5. Agent adds effects:
```
add_zoom_region(x=0.5, y=0.5, scale=1.5, startTime=0, endTime=5)
add_click_marker(x=400, y=300, timestamp=2)
add_voiceover(text="Click here to start", startTime=0)
```

6. Agent exports:
```
export_video(output="final.mp4", quality="high")
```

## Programmatic Usage

```typescript
import { Recorder, VideoProcessor, ZoomEngine } from '@gal-run/demo-studio';

// Record
const recorder = new Recorder({ output: 'raw.mp4', fps: 30 });
await recorder.startRecording();
// ... wait for user actions
await recorder.stopRecording();

// Process
const processor = new VideoProcessor();
const info = await processor.getVideoInfo('raw.mp4');
console.log(`Duration: ${info.duration}s`);

// Trim
await processor.process({
  input: 'raw.mp4',
  output: 'trimmed.mp4',
  startTime: 5,
  endTime: 30
});

// Convert to GIF
await processor.convertToGif('trimmed.mp4', 'demo.gif', 15, 480);
```

## Demo Script Automation

Create `demo.json`:
```json
{
  "name": "Automated Demo",
  "steps": [
    { "type": "record", "duration": 3 },
    { "type": "text", "text": "Welcome", "duration": 2 },
    { "type": "click", "x": 960, "y": 540, "zoom": { "scale": 1.5 } },
    { "type": "keystroke", "keys": "Cmd+K", "duration": 2 }
  ]
}
```

Run with AI agent:
```
run_demo_script(script={...})
```

Or via CLI:
```bash
node dist/cli/index.js run demo.json
```
