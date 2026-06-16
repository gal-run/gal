import { Recorder } from './recorder.js';
import { ZoomEngine, type ZoomConfig } from '../effects/zoom.js';
import { CursorEngine } from '../effects/cursor.js';
import { OverlayEngine } from '../effects/overlay.js';
import { TTSEngine } from '../tts/index.js';
import { TimelineEditor } from '../timeline/editor.js';
import { Renderer } from '../renderer/index.js';
import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { mkdir } from 'fs/promises';

const DemoStepSchema = z.object({
  type: z.enum(['record', 'click', 'keystroke', 'zoom', 'voiceover', 'text', 'wait', 'screenshot']),
  duration: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  scale: z.number().optional(),
  keys: z.string().optional(),
  text: z.string().optional(),
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-center', 'center']).optional(),
  zoom: z.object({
    scale: z.number(),
    duration: z.number().optional()
  }).optional(),
  voice: z.string().optional(),
  style: z.record(z.any()).optional()
});

const DemoScriptSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  version: z.string().default('1.0.0'),
  output: z.object({
    path: z.string().default('output.mp4'),
    resolution: z.object({
      width: z.number().default(1920),
      height: z.number().default(1080)
    }).optional(),
    fps: z.number().default(30),
    quality: z.enum(['draft', 'standard', 'high', 'production']).default('high')
  }).optional(),
  recording: z.object({
    captureAudio: z.boolean().default(true),
    region: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number()
    }).optional()
  }).optional(),
  steps: z.array(DemoStepSchema)
});

type DemoStep = z.infer<typeof DemoStepSchema>;
type DemoScript = z.infer<typeof DemoScriptSchema>;

export class DemoScriptRunner {
  private recorder: Recorder;
  private zoomEngine: ZoomEngine;
  private cursorEngine: CursorEngine;
  private overlayEngine: OverlayEngine;
  private ttsEngine: TTSEngine;
  private timeline: TimelineEditor;
  private config: DemoScript;
  private currentTime: number = 0;
  private outputDir: string = '';

  constructor(config: DemoScript) {
    this.config = DemoScriptSchema.parse(config);
    this.recorder = new Recorder({
      output: this.config.output?.path || 'output.mp4',
      fps: this.config.output?.fps || 30,
      captureAudio: this.config.recording?.captureAudio ?? true
    });
    this.zoomEngine = new ZoomEngine();
    this.cursorEngine = new CursorEngine();
    this.overlayEngine = new OverlayEngine();
    this.ttsEngine = new TTSEngine();
    this.timeline = new TimelineEditor();
  }

  static async fromFile(path: string): Promise<DemoScriptRunner> {
    const content = await readFile(path, 'utf-8');
    const config = JSON.parse(content);
    return new DemoScriptRunner(config);
  }

  async initialize(outputDir: string): Promise<void> {
    this.outputDir = outputDir;
    await mkdir(outputDir, { recursive: true });
    await mkdir(join(outputDir, 'audio'), { recursive: true });
    await mkdir(join(outputDir, 'frames'), { recursive: true });
    
    this.timeline.addTrack('Video', 'video');
    this.timeline.addTrack('Audio', 'audio');
    this.timeline.addTrack('Overlays', 'overlay');
  }

  async run(progressCallback?: (step: number, total: number, action: string) => void): Promise<string> {
    const totalSteps = this.config.steps.length;
    
    for (let i = 0; i < this.config.steps.length; i++) {
      const step = this.config.steps[i];
      
      if (progressCallback) {
        progressCallback(i + 1, totalSteps, step.type);
      }

      await this.executeStep(step);
    }

    return this.config.output?.path || 'output.mp4';
  }

  private async executeStep(step: DemoStep): Promise<void> {
    switch (step.type) {
      case 'record':
        await this.handleRecordStep(step);
        break;

      case 'click':
        this.handleClickStep(step);
        break;

      case 'keystroke':
        this.handleKeystrokeStep(step);
        break;

      case 'zoom':
        this.handleZoomStep(step);
        break;

      case 'voiceover':
        await this.handleVoiceoverStep(step);
        break;

      case 'text':
        this.handleTextStep(step);
        break;

      case 'wait':
        this.handleWaitStep(step);
        break;

      case 'screenshot':
        await this.handleScreenshotStep(step);
        break;
    }

    if (step.duration) {
      this.currentTime += step.duration;
    }
  }

  private async handleRecordStep(step: DemoStep): Promise<void> {
    const duration = step.duration || 0;
    
    this.timeline.addClip({
      type: 'video',
      source: this.config.output?.path || 'output.mp4',
      startTime: this.currentTime,
      endTime: this.currentTime + duration,
      track: 0
    });
  }

  private handleClickStep(step: DemoStep): void {
    if (step.x === undefined || step.y === undefined) return;

    const duration = step.duration || 0.5;
    this.cursorEngine.addClick(step.x, step.y, this.currentTime, duration);

    if (step.zoom) {
      const resolution = this.config.output?.resolution || { width: 1920, height: 1080 };
      const normalizedX = step.x / resolution.width;
      const normalizedY = step.y / resolution.height;
      
      this.zoomEngine.addZoomRegion(
        {
          x: normalizedX,
          y: normalizedY,
          scale: step.zoom.scale,
          duration: step.zoom.duration || 0.3,
          easing: 'ease-out'
        },
        this.currentTime,
        this.currentTime + duration
      );
    }
  }

  private handleKeystrokeStep(step: DemoStep): void {
    if (!step.keys) return;

    const duration = step.duration || 2;
    this.overlayEngine.addKeystroke(
      {
        keys: step.keys,
        position: step.position || 'bottom-center'
      },
      this.currentTime,
      duration
    );
  }

  private handleZoomStep(step: DemoStep): void {
    if (step.x === undefined || step.y === undefined || step.scale === undefined) return;

    const duration = step.duration || 2;
    const resolution = this.config.output?.resolution || { width: 1920, height: 1080 };
    const normalizedX = step.x! / resolution.width;
    const normalizedY = step.y! / resolution.height;

    this.zoomEngine.addZoomRegion(
      {
        x: normalizedX,
        y: normalizedY,
        scale: step.scale!,
        duration: 0.5,
        easing: 'ease-out'
      },
      this.currentTime,
      this.currentTime + duration
    );
  }

  private async handleVoiceoverStep(step: DemoStep): Promise<void> {
    if (!step.text) return;

    const duration = step.duration || this.ttsEngine.addSegment(step.text, this.currentTime);
    
    if (step.voice) {
      this.ttsEngine.setConfig({ voice: step.voice });
    }
  }

  private handleTextStep(step: DemoStep): void {
    if (!step.text) return;

    const duration = step.duration || 3;
    this.overlayEngine.addTextOverlay({
      text: step.text,
      x: step.x || 0,
      y: step.y || 0,
      startTime: this.currentTime,
      endTime: this.currentTime + duration
    });
  }

  private handleWaitStep(step: DemoStep): void {
    // Just advance time
  }

  private async handleScreenshotStep(step: DemoStep): Promise<void> {
    // Placeholder for screenshot functionality
  }

  async generateVoiceovers(): Promise<void> {
    if (this.outputDir) {
      await this.ttsEngine.generateAllSegments(join(this.outputDir, 'audio'));
    }
  }

  async export(outputPath?: string): Promise<string> {
    const finalOutput = outputPath || this.config.output?.path || 'demo.mp4';
    
    const renderer = new Renderer(
      {
        output: finalOutput,
        resolution: this.config.output?.resolution,
        fps: this.config.output?.fps,
        quality: this.config.output?.quality
      },
      this.timeline,
      this.zoomEngine,
      this.cursorEngine
    );

    return renderer.render();
  }

  getTimeline(): TimelineEditor {
    return this.timeline;
  }

  getZoomEngine(): ZoomEngine {
    return this.zoomEngine;
  }

  getCursorEngine(): CursorEngine {
    return this.cursorEngine;
  }

  getOverlayEngine(): OverlayEngine {
    return this.overlayEngine;
  }

  getTTSEngine(): TTSEngine {
    return this.ttsEngine;
  }

  getTotalDuration(): number {
    return this.currentTime;
  }

  async saveScript(path: string): Promise<void> {
    await writeFile(path, JSON.stringify(this.config, null, 2));
  }
}

import { z } from 'zod';

export { DemoStepSchema, DemoScriptSchema, type DemoStep, type DemoScript };
