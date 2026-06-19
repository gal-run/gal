# Examples

## Basic Recording

```bash
# Record full screen
demo-studio record -o demo.mp4

# Record specific window
demo-studio record --window "Chrome" -o chrome-demo.mp4

# Record region
demo-studio record --region 0,0,1920,1080 -o region.mp4
```

## Window Detection

```bash
# List all windows
demo-studio windows

# Filter by name
demo-studio windows --filter Chrome

# Output example:
#   12345-1
#     Name:   Google Chrome
#     Owner:  Google Chrome
#     Size:   1920x1080
```

## Screenshot Capture

```bash
# Full screen
demo-studio screenshot -o screen.png

# Specific window
demo-studio screenshot --window "VS Code" -o vscode.png

# Region
demo-studio screenshot --region 100,100,800,600 -o region.jpg
```

## Demo Scripts

### Simple Demo

```json
{
  "name": "Simple Demo",
  "steps": [
    { "type": "record", "duration": 3 },
    { "type": "click", "x": 960, "y": 540, "duration": 1 }
  ]
}
```

### With Zoom

```json
{
  "name": "Zoom Demo",
  "steps": [
    { "type": "record", "duration": 2 },
    { "type": "zoom", "x": 480, "y": 270, "scale": 1.5, "duration": 3 },
    { "type": "click", "x": 480, "y": 270, "zoom": { "scale": 2 } }
  ]
}
```

### With Voiceover

```json
{
  "name": "Voiceover Demo",
  "steps": [
    { "type": "record", "duration": 2 },
    { "type": "voiceover", "text": "Welcome to our application", "duration": 3 },
    { "type": "click", "x": 400, "y": 300 },
    { "type": "voiceover", "text": "Click here to start", "duration": 2 }
  ]
}
```

### Complete Example

```json
{
  "name": "Complete Demo",
  "version": "1.0.0",
  "output": {
    "path": "complete.mp4",
    "resolution": { "width": 1920, "height": 1080 },
    "fps": 30,
    "quality": "high"
  },
  "recording": {
    "captureAudio": true
  },
  "steps": [
    { "type": "record", "duration": 1 },
    { "type": "text", "text": "Feature Overview", "x": 960, "y": 100, "duration": 2 },
    { "type": "voiceover", "text": "Let's explore the main features", "duration": 3 },
    { "type": "zoom", "x": 480, "y": 540, "scale": 1.5, "duration": 3 },
    { "type": "click", "x": 480, "y": 540, "duration": 1, "zoom": { "scale": 2 } },
    { "type": "keystroke", "keys": "Enter", "duration": 1 },
    { "type": "zoom", "x": 1440, "y": 540, "scale": 1.5, "duration": 3 },
    { "type": "voiceover", "text": "Here's the second panel", "duration": 2 },
    { "type": "zoom", "x": 960, "y": 540, "scale": 1, "duration": 2 },
    { "type": "text", "text": "Thanks for watching!", "duration": 2 }
  ]
}
```

## Programmatic Usage

### Run Demo Script

```typescript
import { DemoScriptRunner } from '@gal-run/demo-studio';

const runner = await DemoScriptRunner.fromFile('demo.json');
await runner.initialize('./output');
await runner.run();
await runner.export('final.mp4');
```

### Custom Recording

```typescript
import { Recorder, ZoomEngine, Renderer, TimelineEditor } from '@gal-run/demo-studio';

const recorder = new Recorder({ output: 'raw.mp4', fps: 30 });
const zoom = new ZoomEngine();
const timeline = new TimelineEditor();

// Add zoom regions
zoom.addZoomRegion({ x: 0.5, y: 0.5, scale: 1.5, duration: 0.5, easing: 'ease-out' }, 0, 5);

// Record
await recorder.startRecording();
// ... wait for user to stop
const raw = await recorder.stopRecording();

// Add to timeline
timeline.addTrack('Main', 'video');
timeline.addClip({ type: 'video', source: raw, startTime: 0, endTime: 30, track: 0 });

// Render
const renderer = new Renderer({ output: 'final.mp4' }, timeline, zoom);
await renderer.render();
```

### Window Detection

```typescript
import { WindowDetector, Recorder } from '@gal-run/demo-studio';

const detector = new WindowDetector();
const recorder = new Recorder();

// Find VS Code window
const vscode = await detector.findWindow(/vs code/i);
if (vscode) {
  // Focus it
  await detector.focusWindow(vscode.id);
  
  // Record it
  recorder.setConfig({ region: vscode.bounds });
  await recorder.startRecording();
}
```

## MCP Integration

### Start MCP Server

```bash
demo-studio mcp
```

### Use from AI Agent

The MCP server exposes these tools:

```
start_recording(output, fps, captureAudio)
stop_recording()
add_zoom_region(x, y, scale, startTime, endTime)
add_click_marker(x, y, timestamp)
add_keystroke_overlay(keys, timestamp, duration)
add_text_overlay(text, startTime, endTime)
set_cursor_style(visible, smoothness, highlightOnClick)
add_voiceover(text, startTime, voice)
export_video(output, quality)
run_demo_script(script)
```

### Example Agent Workflow

1. `start_recording` - Begin capture
2. User performs actions
3. `stop_recording` - Save raw video
4. `add_zoom_region` - Add zoom effects
5. `add_click_marker` - Mark important clicks
6. `add_voiceover` - Add narration
7. `export_video` - Render final output
