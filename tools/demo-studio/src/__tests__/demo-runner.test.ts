import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DemoScriptRunner, DemoScriptSchema } from '../core/demo-runner.js';

describe('DemoScriptRunner', () => {
  let runner: DemoScriptRunner;
  
  const validScript = {
    name: 'Test Demo',
    version: '1.0.0',
    output: {
      path: 'test.mp4',
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      quality: 'high' as const
    },
    steps: [
      { type: 'record' as const, duration: 2 },
      { type: 'text' as const, text: 'Hello', duration: 1 },
      { type: 'click' as const, x: 100, y: 200, duration: 0.5 },
      { type: 'keystroke' as const, keys: 'Cmd+K', duration: 1 },
      { type: 'zoom' as const, x: 960, y: 540, scale: 1.5, duration: 2 }
    ]
  };

  beforeEach(() => {
    runner = new DemoScriptRunner(validScript);
  });

  it('should parse valid script', () => {
    expect(runner).toBeDefined();
  });

  it('should have correct total duration after run', async () => {
    await runner.initialize('/tmp/demo-test');
    await runner.run();
    expect(runner.getTotalDuration()).toBe(6.5);
  });

  it('should return timeline editor', () => {
    const timeline = runner.getTimeline();
    expect(timeline).toBeDefined();
  });

  it('should return zoom engine', () => {
    const zoom = runner.getZoomEngine();
    expect(zoom).toBeDefined();
  });

  it('should return cursor engine', () => {
    const cursor = runner.getCursorEngine();
    expect(cursor).toBeDefined();
  });

  it('should return overlay engine', () => {
    const overlay = runner.getOverlayEngine();
    expect(overlay).toBeDefined();
  });

  it('should return TTS engine', () => {
    const tts = runner.getTTSEngine();
    expect(tts).toBeDefined();
  });
});

describe('DemoScriptSchema', () => {
  it('should validate minimal script', () => {
    const result = DemoScriptSchema.parse({
      name: 'Minimal',
      steps: [{ type: 'record', duration: 5 }]
    });
    expect(result.name).toBe('Minimal');
    expect(result.steps).toHaveLength(1);
  });

  it('should apply defaults', () => {
    const result = DemoScriptSchema.parse({
      name: 'Defaults Test',
      steps: []
    });
    expect(result.version).toBe('1.0.0');
    expect(result.output?.fps).toBeUndefined();
  });

  it('should validate click with zoom', () => {
    const result = DemoScriptSchema.parse({
      name: 'Click Test',
      steps: [
        { type: 'click', x: 100, y: 200, zoom: { scale: 1.5 } }
      ]
    });
    expect(result.steps[0].zoom?.scale).toBe(1.5);
  });

  it('should validate voiceover', () => {
    const result = DemoScriptSchema.parse({
      name: 'Voiceover Test',
      steps: [
        { type: 'voiceover', text: 'Hello world', voice: 'alloy' }
      ]
    });
    expect(result.steps[0].text).toBe('Hello world');
  });
});
