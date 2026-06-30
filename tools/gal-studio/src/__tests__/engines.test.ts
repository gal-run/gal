import { describe, it, expect, beforeEach } from 'vitest';
import { ZoomEngine } from '../effects/zoom.js';
import { CursorEngine } from '../effects/cursor.js';
import { TimelineEditor } from '../timeline/editor.js';
import { OverlayEngine } from '../effects/overlay.js';

describe('ZoomEngine', () => {
  let zoomEngine: ZoomEngine;

  beforeEach(() => {
    zoomEngine = new ZoomEngine();
  });

  it('should add zoom region', () => {
    const id = zoomEngine.addZoomRegion(
      { x: 0.5, y: 0.5, scale: 1.5, duration: 0.5, easing: 'ease-out' },
      0,
      5
    );
    expect(id).toBeDefined();
    expect(zoomEngine.getRegions()).toHaveLength(1);
  });

  it('should remove zoom region', () => {
    const id = zoomEngine.addZoomRegion(
      { x: 0.5, y: 0.5, scale: 1.5, duration: 0.5, easing: 'ease-out' },
      0,
      5
    );
    const removed = zoomEngine.removeZoomRegion(id);
    expect(removed).toBe(true);
    expect(zoomEngine.getRegions()).toHaveLength(0);
  });

  it('should return default zoom when no regions', () => {
    const zoom = zoomEngine.getZoomAtTime(2);
    expect(zoom.scale).toBe(1);
    expect(zoom.x).toBe(0.5);
    expect(zoom.y).toBe(0.5);
  });

  it('should generate keyframes', () => {
    zoomEngine.addZoomRegion(
      { x: 0.5, y: 0.5, scale: 1.5, duration: 0.5, easing: 'ease-out' },
      0,
      2
    );
    const keyframes = zoomEngine.generateKeyframes(3, 30);
    expect(keyframes).toHaveLength(90);
  });
});

describe('CursorEngine', () => {
  let cursorEngine: CursorEngine;

  beforeEach(() => {
    cursorEngine = new CursorEngine();
  });

  it('should add cursor position', () => {
    cursorEngine.addPosition(100, 200, 0);
    expect(cursorEngine.getPositions()).toHaveLength(1);
  });

  it('should add click event', () => {
    cursorEngine.addClick(100, 200, 0);
    expect(cursorEngine.getClicks()).toHaveLength(1);
  });

  it('should smooth cursor positions', () => {
    cursorEngine.addPosition(0, 0, 0);
    cursorEngine.addPosition(100, 100, 1);
    cursorEngine.addPosition(200, 200, 2);
    
    const pos = cursorEngine.getPositionAtTime(1);
    expect(pos).not.toBeNull();
  });

  it('should return last position for time outside range', () => {
    cursorEngine.addPosition(100, 200, 0);
    const pos = cursorEngine.getPositionAtTime(10);
    expect(pos).not.toBeNull();
    expect(pos?.x).toBe(100);
    expect(pos?.y).toBe(200);
  });
});

describe('TimelineEditor', () => {
  let timeline: TimelineEditor;

  beforeEach(() => {
    timeline = new TimelineEditor();
  });

  it('should add track', () => {
    const id = timeline.addTrack('Video 1', 'video');
    expect(id).toBeDefined();
    expect(timeline.getState().tracks).toHaveLength(1);
  });

  it('should remove track', () => {
    const id = timeline.addTrack('Video 1', 'video');
    const removed = timeline.removeTrack(id);
    expect(removed).toBe(true);
    expect(timeline.getState().tracks).toHaveLength(0);
  });

  it('should add clip', () => {
    timeline.addTrack('Video 1', 'video');
    const clipId = timeline.addClip({
      type: 'video',
      source: 'test.mp4',
      startTime: 0,
      endTime: 10,
      track: 0
    });
    expect(clipId).toBeDefined();
  });

  it('should trim clip', () => {
    timeline.addTrack('Video 1', 'video');
    const clipId = timeline.addClip({
      type: 'video',
      source: 'test.mp4',
      startTime: 0,
      endTime: 10,
      track: 0
    });
    const trimmed = timeline.trimClip(clipId, 2, 8);
    expect(trimmed).toBe(true);
  });

  it('should split clip', () => {
    timeline.addTrack('Video 1', 'video');
    const clipId = timeline.addClip({
      type: 'video',
      source: 'test.mp4',
      startTime: 0,
      endTime: 10,
      track: 0
    });
    const newClipId = timeline.splitClip(clipId, 5);
    expect(newClipId).toBeDefined();
  });

  it('should export and import timeline', () => {
    timeline.addTrack('Video 1', 'video');
    timeline.addClip({
      type: 'video',
      source: 'test.mp4',
      startTime: 0,
      endTime: 10,
      track: 0
    });
    
    const exported = timeline.exportTimeline();
    const newTimeline = new TimelineEditor();
    newTimeline.importTimeline(exported as any);
    
    expect(newTimeline.getState().tracks).toHaveLength(1);
  });
});

describe('OverlayEngine', () => {
  let overlayEngine: OverlayEngine;

  beforeEach(() => {
    overlayEngine = new OverlayEngine();
  });

  it('should add keystroke overlay', () => {
    overlayEngine.addKeystroke({ keys: 'Cmd+K' }, 0, 2);
    expect(overlayEngine.getKeystrokes()).toHaveLength(1);
  });

  it('should add text overlay', () => {
    overlayEngine.addTextOverlay({
      text: 'Hello World',
      startTime: 0,
      endTime: 5
    });
    expect(overlayEngine.getTextOverlays()).toHaveLength(1);
  });

  it('should get active keystrokes', () => {
    overlayEngine.addKeystroke({ keys: 'Cmd+K' }, 0, 2);
    const active = overlayEngine.getActiveKeystrokes(1);
    expect(active).toHaveLength(1);
    expect(active[0].opacity).toBeGreaterThan(0);
  });

  it('should get active text overlays', () => {
    overlayEngine.addTextOverlay({
      text: 'Hello World',
      startTime: 0,
      endTime: 5
    });
    const active = overlayEngine.getActiveTextOverlays(2);
    expect(active).toHaveLength(1);
  });

  it('should calculate position correctly', () => {
    const pos = overlayEngine.calculatePosition('bottom-center', 200, 50, 1920, 1080);
    expect(pos.x).toBe(860);
    expect(pos.y).toBe(990);
  });
});
