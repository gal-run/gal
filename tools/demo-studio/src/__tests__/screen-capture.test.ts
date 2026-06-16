import { describe, it, expect, beforeEach } from 'vitest';

describe('ScreenCapture', () => {
  let ScreenCapture: any;
  
  beforeEach(async () => {
    const module = await import('../core/screen-capture.js');
    ScreenCapture = module.ScreenCapture;
  });

  it('should be defined', () => {
    expect(ScreenCapture).toBeDefined();
  });

  it('should create instance', () => {
    const capture = new ScreenCapture();
    expect(capture).toBeDefined();
  });

  it('should have captureScreenshot method', () => {
    const capture = new ScreenCapture();
    expect(typeof capture.captureScreenshot).toBe('function');
  });

  it('should have captureRegion method', () => {
    const capture = new ScreenCapture();
    expect(typeof capture.captureRegion).toBe('function');
  });

  it('should have startRecording method', () => {
    const capture = new ScreenCapture();
    expect(typeof capture.startRecording).toBe('function');
  });

  it('should have stopRecording method', () => {
    const capture = new ScreenCapture();
    expect(typeof capture.stopRecording).toBe('function');
  });

  it('should have captureFrame method', () => {
    const capture = new ScreenCapture();
    expect(typeof capture.captureFrame).toBe('function');
  });

  it('should not be recording initially', () => {
    const capture = new ScreenCapture();
    expect(capture.isRecording()).toBe(false);
  });

  it('should return null session when not recording', () => {
    const capture = new ScreenCapture();
    expect(capture.getSession()).toBeNull();
  });
});
