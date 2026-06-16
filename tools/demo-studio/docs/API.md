# API Reference

## Core Modules

### Recorder

Screen recording with FFmpeg.

```typescript
import { Recorder } from '@gal-run/demo-studio';

const recorder = new Recorder({
  output: 'demo.mp4',
  fps: 30,
  captureAudio: true
});

// Start recording
await recorder.startRecording();

// Stop recording
const outputPath = await recorder.stopRecording();

// Events
recorder.on('started', (data) => console.log('Recording started'));
recorder.on('stopped', (data) => console.log('Saved to', data.outputPath));
```

### DemoScriptRunner

Orchestrate recording + effects from JSON.

```typescript
import { DemoScriptRunner } from '@gal-run/demo-studio';

// Load from file
const runner = await DemoScriptRunner.fromFile('demo.json');

// Or create directly
const runner = new DemoScriptRunner({
  name: 'My Demo',
  steps: [
    { type: 'record', duration: 5 },
    { type: 'click', x: 400, y: 300, zoom: { scale: 1.5 } },
    { type: 'keystroke', keys: 'Cmd+K' }
  ]
});

// Execute
await runner.initialize('/output/dir');
await runner.run((step, total, action) => {
  console.log(`[${step}/${total}] ${action}`);
});
await runner.export('output.mp4');
```

### WindowDetector

List and find windows (macOS).

```typescript
import { WindowDetector } from '@gal-run/demo-studio';

const detector = new WindowDetector();

// List all windows
const windows = await detector.listWindows();

// Filter windows
const filtered = await detector.listWindows({
  filter: { name: 'Chrome' }
});

// Find specific window
const window = await detector.findWindow('VS Code');

// Get window bounds
const bounds = detector.getWindowBounds(window.id);
// { x: 0, y: 0, width: 1920, height: 1080 }

// Focus window
await detector.focusWindow(window.id);
```

### ScreenCapture

Screenshots and frame capture.

```typescript
import { ScreenCapture } from '@gal-run/demo-studio';

const capture = new ScreenCapture();

// Full screenshot
const buffer = await capture.captureScreenshot({ format: 'png' });

// Region screenshot
const region = await capture.captureRegion(0, 0, 800, 600, 'png');

// Window screenshot
const window = await capture.captureWindow(windowId, 'png');

// Recording session
await capture.startRecording();
const frameId = await capture.captureFrame();
const session = await capture.stopRecording();
```

## Effects

### ZoomEngine

Zoom effects with easing.

```typescript
import { ZoomEngine } from '@gal-run/demo-studio';

const zoom = new ZoomEngine();

// Add zoom region
zoom.addZoomRegion(
  { x: 0.5, y: 0.5, scale: 1.5, duration: 0.5, easing: 'ease-out' },
  0,  // start time
  5   // end time
);

// Get zoom at time
const zoomConfig = zoom.getZoomAtTime(2.5);

// Generate keyframes
const keyframes = zoom.generateKeyframes(10, 30); // 10s at 30fps
```

### CursorEngine

Cursor smoothing and click highlights.

```typescript
import { CursorEngine } from '@gal-run/demo-studio';

const cursor = new CursorEngine({
  visible: true,
  smoothness: 0.8,
  highlightOnClick: true
});

// Add position
cursor.addPosition(100, 200, 0); // x, y, timestamp

// Add click
cursor.addClick(400, 300, 5); // x, y, timestamp

// Get position at time
const pos = cursor.getPositionAtTime(2.5);
```

### OverlayEngine

Keystroke and text overlays.

```typescript
import { OverlayEngine } from '@gal-run/demo-studio';

const overlay = new OverlayEngine();

// Add keystroke
overlay.addKeystroke({ keys: 'Cmd+K' }, 0, 2);

// Add text
overlay.addTextOverlay({
  text: 'Welcome!',
  startTime: 0,
  endTime: 5
});

// Get active overlays
const keystrokes = overlay.getActiveKeystrokes(1);
const texts = overlay.getActiveTextOverlays(1);

// Render overlay
const buffer = await overlay.renderKeystrokeOverlay('Cmd+K', config);
```

## Timeline

### TimelineEditor

Multi-track video editing.

```typescript
import { TimelineEditor } from '@gal-run/demo-studio';

const timeline = new TimelineEditor();

// Add tracks
timeline.addTrack('Video', 'video');
timeline.addTrack('Audio', 'audio');

// Add clips
timeline.addClip({
  type: 'video',
  source: 'input.mp4',
  startTime: 0,
  endTime: 10,
  track: 0
});

// Edit clips
timeline.trimClip(clipId, 2, 8);
timeline.splitClip(clipId, 5);
timeline.moveClip(clipId, 3);

// Add effects
timeline.addEffect(clipId, {
  type: 'fade',
  params: { duration: 0.5 }
});

// Export/import
const data = timeline.exportTimeline();
timeline.importTimeline(data);
```

## Rendering

### Renderer

Video export with quality presets.

```typescript
import { Renderer } from '@gal-run/demo-studio';

const renderer = new Renderer(
  {
    output: 'output.mp4',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    quality: 'high'
  },
  timeline,
  zoomEngine,
  cursorEngine
);

await renderer.render((progress) => {
  console.log(`${Math.round(progress * 100)}%`);
});
```

## TTS

### TTSEngine

Text-to-speech integration.

```typescript
import { TTSEngine } from '@gal-run/demo-studio';

const tts = new TTSEngine({
  provider: 'openai',
  voice: 'alloy',
  speed: 1.0
});

// Add segments
tts.addSegment('Hello world', 0);
tts.addSegment('Click here to continue', 3);

// Generate all
const segments = await tts.generateAllSegments('/output/audio');

// Generate single
const result = await tts.generateSpeech('Test text');
console.log(result.duration);
```

## Types

```typescript
interface RecordingConfig {
  output: string;
  fps: number;
  resolution: { width: number; height: number };
  captureAudio: boolean;
  region?: { x: number; y: number; width: number; height: number };
}

interface ZoomConfig {
  x: number;  // 0-1 normalized
  y: number;  // 0-1 normalized
  scale: number;  // 1-4
  duration: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

interface DemoStep {
  type: 'record' | 'click' | 'keystroke' | 'zoom' | 'voiceover' | 'text' | 'wait' | 'screenshot';
  duration?: number;
  x?: number;
  y?: number;
  scale?: number;
  keys?: string;
  text?: string;
  zoom?: { scale: number; duration?: number };
}

interface DemoScript {
  name: string;
  version: string;
  output?: {
    path: string;
    resolution?: { width: number; height: number };
    fps?: number;
    quality?: 'draft' | 'standard' | 'high' | 'production';
  };
  steps: DemoStep[];
}
```
