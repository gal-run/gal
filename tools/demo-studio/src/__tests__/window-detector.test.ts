import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('WindowDetector', () => {
  let WindowDetector: any;
  
  beforeEach(async () => {
    const module = await import('../core/window-detector.js');
    WindowDetector = module.WindowDetector;
  });

  it('should be defined', () => {
    expect(WindowDetector).toBeDefined();
  });

  it('should create instance', () => {
    const detector = new WindowDetector();
    expect(detector).toBeDefined();
  });

  it('should have listWindows method', () => {
    const detector = new WindowDetector();
    expect(typeof detector.listWindows).toBe('function');
  });

  it('should have findWindow method', () => {
    const detector = new WindowDetector();
    expect(typeof detector.findWindow).toBe('function');
  });

  it('should have focusWindow method', () => {
    const detector = new WindowDetector();
    expect(typeof detector.focusWindow).toBe('function');
  });

  it('should have getWindowBounds method', () => {
    const detector = new WindowDetector();
    expect(typeof detector.getWindowBounds).toBe('function');
  });
});
