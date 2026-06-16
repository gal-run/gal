import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, writeFile, unlink, access, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join, basename } from 'path';
import { z } from 'zod';
import { safePathArg } from './video-processor.js';

const execAsync = promisify(exec);

const RecordingConfigSchema = z.object({
  output: z.string().default('output.mp4'),
  fps: z.number().min(1).max(60).default(30),
  resolution: z.object({
    width: z.number().default(1920),
    height: z.number().default(1080)
  }).default({ width: 1920, height: 1080 }),
  captureAudio: z.boolean().default(false),
  captureMicrophone: z.boolean().default(false),
  region: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number()
  }).optional(),
  showCursor: z.boolean().default(true),
  quality: z.enum(['draft', 'standard', 'high', 'production']).default('high')
});

type RecordingConfig = z.infer<typeof RecordingConfigSchema>;

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  startTime: number | null;
  outputDir: string;
  config: RecordingConfig;
  frameCount: number;
}

export interface RecordingProgress {
  frame: number;
  fps: number;
  bitrate: string;
  duration: number;
  size: string;
}

export class Recorder {
  private state: RecordingState;
  private ffmpegProcess: ReturnType<typeof spawn> | null = null;
  private eventListeners: Map<string, Set<Function>> = new Map();
  private lastProgress: RecordingProgress | null = null;

  constructor(config: Partial<RecordingConfig> = {}) {
    this.state = {
      isRecording: false,
      isPaused: false,
      startTime: null,
      outputDir: '',
      frameCount: 0,
      config: RecordingConfigSchema.parse(config)
    };
  }

  async checkDependencies(): Promise<{ ffmpeg: boolean; ffprobe: boolean; version: string | null }> {
    try {
      const { stdout } = await execAsync('ffmpeg -version');
      const versionMatch = stdout.match(/ffmpeg version (\S+)/);
      return {
        ffmpeg: true,
        ffprobe: true,
        version: versionMatch ? versionMatch[1] : null
      };
    } catch {
      return { ffmpeg: false, ffprobe: false, version: null };
    }
  }

  async getScreenResolution(): Promise<{ width: number; height: number } | null> {
    if (process.platform === 'darwin') {
      try {
        const { stdout } = await execAsync(
          `osascript -e 'tell application "Finder" to get bounds of window of desktop'`
        );
        const [x, y, width, height] = stdout.trim().split(', ').map(Number);
        return { width, height };
      } catch {
        return null;
      }
    }
    return null;
  }

  async initialize(): Promise<void> {
    this.state.outputDir = join(tmpdir(), `demo-studio-${Date.now()}`);
    await mkdir(this.state.outputDir, { recursive: true });
  }

  async startRecording(): Promise<void> {
    if (this.state.isRecording) {
      throw new Error('Recording already in progress');
    }

    const deps = await this.checkDependencies();
    if (!deps.ffmpeg) {
      throw new Error(
        'FFmpeg is not installed.\n' +
        'Install with:\n' +
        '  macOS:   brew install ffmpeg\n' +
        '  Ubuntu:  sudo apt install ffmpeg\n' +
        '  Windows: choco install ffmpeg'
      );
    }

    await this.initialize();

    const { fps, captureAudio, captureMicrophone, region, showCursor, quality } = this.state.config;
    const args = this.buildFFmpegArgs(fps, region, captureAudio, captureMicrophone, showCursor, quality);

    console.error('Starting FFmpeg...');

    this.ffmpegProcess = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.state.isRecording = true;
    this.state.startTime = Date.now();

    this.ffmpegProcess.stderr?.on('data', (data) => {
      const msg = data.toString();
      this.parseProgress(msg);
      this.emit('log', { message: msg });
    });

    this.ffmpegProcess.on('error', (error) => {
      console.error('FFmpeg error:', error);
      this.emit('error', { error: error.message });
      this.state.isRecording = false;
    });

    this.ffmpegProcess.on('close', (code, signal) => {
      this.state.isRecording = false;
      if (code !== 0 && code !== 255 && signal !== 'SIGINT') {
        this.emit('error', { error: `FFmpeg exited with code ${code}` });
      }
    });

    this.emit('started', { 
      timestamp: this.state.startTime,
      output: this.state.config.output
    });
  }

  private parseProgress(msg: string): void {
    const frameMatch = msg.match(/frame=\s*(\d+)/);
    const fpsMatch = msg.match(/fps=\s*([\d.]+)/);
    const bitrateMatch = msg.match(/bitrate=\s*([\d.]+\s*\w+\/s)/);
    const sizeMatch = msg.match(/size=\s*(\d+\w+)/);
    const timeMatch = msg.match(/time=\s*([\d:.]+)/);

    if (frameMatch) {
      this.state.frameCount = parseInt(frameMatch[1]);
      
      const duration = this.state.startTime 
        ? (Date.now() - this.state.startTime) / 1000 
        : 0;

      this.lastProgress = {
        frame: this.state.frameCount,
        fps: fpsMatch ? parseFloat(fpsMatch[1]) : 0,
        bitrate: bitrateMatch ? bitrateMatch[1] : '0 kbps',
        duration,
        size: sizeMatch ? sizeMatch[1] : '0kB'
      };

      this.emit('progress', this.lastProgress);
    }
  }

  private buildFFmpegArgs(
    fps: number,
    region?: { x: number; y: number; width: number; height: number },
    captureAudio: boolean = false,
    captureMicrophone: boolean = false,
    showCursor: boolean = true,
    quality: string = 'high'
  ): string[] {
    const qualityPresets: Record<string, { crf: number; preset: string }> = {
      draft: { crf: 28, preset: 'ultrafast' },
      standard: { crf: 23, preset: 'fast' },
      high: { crf: 18, preset: 'medium' },
      production: { crf: 12, preset: 'slow' }
    };

    const { crf, preset } = qualityPresets[quality] || qualityPresets.high;
    const args: string[] = ['-y'];

    if (process.platform === 'darwin') {
      args.push('-f', 'avfoundation');
      
      if (!showCursor) {
        args.push('-capture_cursor', '0');
      }
      
      args.push('-i', '1');
      
      if (region) {
        args.push('-filter:v', `crop=${region.width}:${region.height}:${region.x}:${region.y}`);
      }
    } else if (process.platform === 'linux') {
      args.push('-f', 'x11grab');
      args.push('-video_size', `${region?.width || 1920}x${region?.height || 1080}`);
      args.push('-framerate', String(fps));
      args.push('-draw_cursor', showCursor ? '1' : '0');
      args.push('-i', region ? `:0.0+${region.x},${region.y}` : ':0.0');
    } else if (process.platform === 'win32') {
      args.push('-f', 'gdigrab');
      args.push('-framerate', String(fps));
      args.push('-i', 'desktop');
    }

    args.push('-r', String(fps));
    args.push('-pix_fmt', 'yuv420p');
    args.push('-c:v', 'libx264');
    args.push('-preset', preset);
    args.push('-crf', String(crf));
    args.push('-tune', 'zerolatency');
    args.push('-movflags', '+faststart');

    if (captureAudio || captureMicrophone) {
      args.push('-c:a', 'aac');
      args.push('-b:a', '192k');
    }

    args.push('--', safePathArg(this.state.config.output));

    return args;
  }

  async stopRecording(): Promise<string> {
    if (!this.state.isRecording || !this.ffmpegProcess) {
      throw new Error('No recording in progress');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.ffmpegProcess?.kill('SIGKILL');
        reject(new Error('FFmpeg did not stop in time'));
      }, 10000);

      this.ffmpegProcess!.on('close', (code) => {
        clearTimeout(timeout);
        this.state.isRecording = false;
        const duration = this.state.startTime 
          ? (Date.now() - this.state.startTime) / 1000 
          : 0;
        
        this.emit('stopped', {
          outputPath: this.state.config.output,
          duration,
          frames: this.state.frameCount,
          code
        });
        
        resolve(this.state.config.output);
      });

      // Try graceful stop first
      if (this.ffmpegProcess!.stdin?.writable) {
        this.ffmpegProcess!.stdin.write('q');
      } else {
        this.ffmpegProcess!.kill('SIGINT');
      }
    });
  }

  async pauseRecording(): Promise<void> {
    if (!this.state.isRecording || this.state.isPaused) {
      return;
    }
    this.ffmpegProcess?.kill('SIGSTOP');
    this.state.isPaused = true;
    this.emit('paused', { timestamp: Date.now() });
  }

  async resumeRecording(): Promise<void> {
    if (!this.state.isPaused) {
      return;
    }
    this.ffmpegProcess?.kill('SIGCONT');
    this.state.isPaused = false;
    this.emit('resumed', { timestamp: Date.now() });
  }

  getProgress(): RecordingProgress | null {
    return this.lastProgress;
  }

  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  private emit(event: string, data: object = {}): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(cb => cb(data));
    }
  }

  getState(): RecordingState {
    return { ...this.state };
  }

  isRecording(): boolean {
    return this.state.isRecording;
  }

  isPaused(): boolean {
    return this.state.isPaused;
  }

  getOutputPath(): string {
    return this.state.config.output;
  }

  setConfig(config: Partial<RecordingConfig>): void {
    if (this.state.isRecording) {
      throw new Error('Cannot change config while recording');
    }
    this.state.config = RecordingConfigSchema.parse({ ...this.state.config, ...config });
  }

  getConfig(): RecordingConfig {
    return { ...this.state.config };
  }
}

export { RecordingConfigSchema, type RecordingConfig };
