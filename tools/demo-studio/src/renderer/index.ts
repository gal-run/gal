import { spawn } from 'child_process';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { TimelineEditor, type TimelineClip, type TimelineTrack } from '../timeline/editor.js';
import { ZoomEngine, type ZoomConfig } from '../effects/zoom.js';
import { CursorEngine, type SmoothedPosition } from '../effects/cursor.js';
import { safePathArg } from '../core/video-processor.js';

const RenderConfigSchema = z.object({
  output: z.string().default('output.mp4'),
  resolution: z.object({
    width: z.number().default(1920),
    height: z.number().default(1080)
  }).default({ width: 1920, height: 1080 }),
  fps: z.number().default(30),
  codec: z.enum(['h264', 'h265', 'vp9']).default('h264'),
  quality: z.enum(['draft', 'standard', 'high', 'production']).default('high'),
  audioCodec: z.enum(['aac', 'mp3', 'opus']).default('aac'),
  audioBitrate: z.string().default('192k')
});

type RenderConfig = z.infer<typeof RenderConfigSchema>;

import { z } from 'zod';

export class Renderer {
  private config: RenderConfig;
  private timeline: TimelineEditor;
  private zoomEngine: ZoomEngine;
  private cursorEngine: CursorEngine;
  private tempDir: string = '';

  constructor(
    config: Partial<RenderConfig>,
    timeline: TimelineEditor,
    zoomEngine: ZoomEngine,
    cursorEngine: CursorEngine
  ) {
    this.config = RenderConfigSchema.parse(config);
    this.timeline = timeline;
    this.zoomEngine = zoomEngine;
    this.cursorEngine = cursorEngine;
  }

  async initialize(): Promise<void> {
    this.tempDir = join(tmpdir(), `demo-studio-render-${Date.now()}`);
    await mkdir(this.tempDir, { recursive: true });
    await mkdir(join(this.tempDir, 'frames'), { recursive: true });
    await mkdir(join(this.tempDir, 'audio'), { recursive: true });
  }

  async render(progressCallback?: (progress: number) => void): Promise<string> {
    await this.initialize();

    const state = this.timeline.getState();
    const totalDuration = state.duration;
    const totalFrames = Math.floor(totalDuration * this.config.fps);

    const videoFilter = this.buildVideoFilter();
    const audioFilter = this.buildAudioFilter(state.tracks);

    const args = this.buildFFmpegArgs(videoFilter, audioFilter, totalDuration);

    return new Promise((resolve, reject) => {
      const process = spawn('ffmpeg', args);
      let stderr = '';

      process.stderr.on('data', (data) => {
        stderr += data.toString();
        const match = stderr.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (match && progressCallback) {
          const hours = parseInt(match[1]);
          const minutes = parseInt(match[2]);
          const seconds = parseFloat(match[3]);
          const currentTime = hours * 3600 + minutes * 60 + seconds;
          const progress = Math.min(currentTime / totalDuration, 1);
          progressCallback(progress);
        }
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(this.config.output);
        } else {
          reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', reject);
    });
  }

  private buildFFmpegArgs(
    videoFilter: string,
    audioFilter: string,
    duration: number
  ): string[] {
    const { output, resolution, fps, codec, quality, audioCodec, audioBitrate } = this.config;
    
    const qualityPresets = {
      draft: { crf: 28, preset: 'ultrafast' },
      standard: { crf: 23, preset: 'fast' },
      high: { crf: 18, preset: 'medium' },
      production: { crf: 12, preset: 'slow' }
    };

    const { crf, preset } = qualityPresets[quality];

    const args: string[] = ['-y'];

    const inputs = this.getInputFiles();
    inputs.forEach(input => {
      args.push('-i', safePathArg(input));
    });

    if (videoFilter) {
      args.push('-vf', videoFilter);
    }

    args.push('-c:v', codec === 'h265' ? 'libx265' : 'libx264');
    args.push('-preset', preset);
    args.push('-crf', String(crf));
    args.push('-r', String(fps));
    args.push('-s', `${resolution.width}x${resolution.height}`);

    if (audioFilter) {
      args.push('-af', audioFilter);
    }
    args.push('-c:a', audioCodec);
    args.push('-b:a', audioBitrate);

    args.push('-t', String(duration));
    args.push('--', safePathArg(output));

    return args;
  }

  private buildVideoFilter(): string {
    const filters: string[] = [];
    
    filters.push('format=yuv420p');
    
    filters.push('scale=1920:1080:force_original_aspect_ratio=decrease');
    filters.push('pad=1920:1080:(ow-iw)/2:(oh-ih)/2');

    return filters.join(',');
  }

  private buildAudioFilter(tracks: TimelineTrack[]): string {
    const audioTracks = tracks.filter(t => t.type === 'audio' && !t.muted);
    
    if (audioTracks.length === 0) {
      return '';
    }

    const inputs = audioTracks.map((_, i) => `[${i}:a]`).join('');
    return `${inputs}amix=inputs=${audioTracks.length}:duration=longest[aout]`;
  }

  private getInputFiles(): string[] {
    const inputs: string[] = [];
    const state = this.timeline.getState();

    for (const track of state.tracks) {
      for (const clip of track.clips) {
        if (!inputs.includes(clip.source)) {
          inputs.push(clip.source);
        }
      }
    }

    return inputs;
  }

  async cleanup(): Promise<void> {
    if (this.tempDir) {
      await rm(this.tempDir, { recursive: true, force: true });
    }
  }

  async renderFrame(
    frameIndex: number,
    timestamp: number,
    baseImagePath: string
  ): Promise<Buffer> {
    const zoom = this.zoomEngine.getZoomAtTime(timestamp);
    const cursorPosition = this.cursorEngine.getPositionAtTime(timestamp);

    return this.applyEffects(baseImagePath, zoom, cursorPosition);
  }

  private async applyEffects(
    imagePath: string,
    zoom: ZoomConfig,
    cursorPosition: SmoothedPosition | null
  ): Promise<Buffer> {
    const sharp = (await import('sharp')).default;
    
    let pipeline = sharp(imagePath);
    
    if (zoom.scale > 1) {
      const { width, height } = this.config.resolution;
      const cropWidth = Math.floor(width / zoom.scale);
      const cropHeight = Math.floor(height / zoom.scale);
      const left = Math.floor(zoom.x * width - cropWidth / 2);
      const top = Math.floor(zoom.y * height - cropHeight / 2);
      
      pipeline = pipeline.extract({
        left: Math.max(0, left),
        top: Math.max(0, top),
        width: cropWidth,
        height: cropHeight
      }).resize(width, height);
    }

    if (cursorPosition) {
      const cursorBuffer = await this.createCursorOverlay(cursorPosition);
      pipeline = pipeline.composite([{
        input: cursorBuffer,
        top: Math.floor(cursorPosition.y),
        left: Math.floor(cursorPosition.x)
      }]);
    }

    return pipeline.png().toBuffer();
  }

  private async createCursorOverlay(position: SmoothedPosition): Promise<Buffer> {
    const sharp = (await import('sharp')).default;
    
    const svg = `
      <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 0l16 12.279-6.951 1.17 4.325 8.817-3.596 1.734-4.35-8.879-5.428 4.702z" 
              fill="white" 
              stroke="black" 
              stroke-width="1"/>
      </svg>
    `;

    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  getConfig(): RenderConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<RenderConfig>): void {
    this.config = RenderConfigSchema.parse({ ...this.config, ...config });
  }
}

export { RenderConfigSchema, type RenderConfig };
