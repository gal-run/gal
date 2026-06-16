import { spawn } from 'child_process';
import { readFile, writeFile, access, mkdir, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate: number;
  hasAudio: boolean;
}

export interface ProcessOptions {
  input: string;
  output: string;
  startTime?: number;
  endTime?: number;
  resolution?: { width: number; height: number };
  fps?: number;
  quality?: 'draft' | 'standard' | 'high' | 'production';
  mute?: boolean;
}

/**
 * Normalize a filesystem path so it can never be mistaken for a command-line
 * option by a spawned binary. A leading dash makes ffmpeg/screencapture treat
 * the value as a flag (argument injection); prefixing a relative path with
 * `./` keeps it a path while preserving its meaning. Absolute paths are left
 * untouched. Newlines are rejected outright.
 */
export function safePathArg(p: string): string {
  if (p.includes('\n') || p.includes('\r')) {
    throw new Error('Path must not contain a newline');
  }
  if (p.startsWith('-')) {
    return `./${p}`;
  }
  return p;
}

export class VideoProcessor {
  async getVideoInfo(inputPath: string): Promise<VideoInfo> {
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        '-i', safePathArg(inputPath)
      ];

      const proc = spawn('ffprobe', args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data; });
      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed: ${stderr}`));
          return;
        }

        try {
          const info = JSON.parse(stdout);
          const videoStream = info.streams.find((s: any) => s.codec_type === 'video');
          const audioStream = info.streams.find((s: any) => s.codec_type === 'audio');

          if (!videoStream) {
            reject(new Error('No video stream found'));
            return;
          }

          const fpsParts = videoStream.r_frame_rate.split('/');
          const fps = parseInt(fpsParts[0]) / parseInt(fpsParts[1]);

          resolve({
            duration: parseFloat(info.format.duration),
            width: videoStream.width,
            height: videoStream.height,
            fps: fps,
            codec: videoStream.codec_name,
            bitrate: parseInt(info.format.bit_rate) || 0,
            hasAudio: !!audioStream
          });
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  async process(options: ProcessOptions): Promise<string> {
    const qualityPresets = {
      draft: { crf: 28, preset: 'ultrafast' },
      standard: { crf: 23, preset: 'fast' },
      high: { crf: 18, preset: 'medium' },
      production: { crf: 12, preset: 'slow' }
    };

    const { crf, preset } = qualityPresets[options.quality || 'high'];

    const args: string[] = ['-y'];

    if (options.startTime !== undefined) {
      args.push('-ss', String(options.startTime));
    }

    args.push('-i', safePathArg(options.input));

    if (options.endTime !== undefined && options.startTime !== undefined) {
      args.push('-t', String(options.endTime - options.startTime));
    }

    if (options.resolution) {
      args.push('-vf', `scale=${options.resolution.width}:${options.resolution.height}`);
    }

    if (options.fps) {
      args.push('-r', String(options.fps));
    }

    args.push('-c:v', 'libx264');
    args.push('-preset', preset);
    args.push('-crf', String(crf));
    args.push('-pix_fmt', 'yuv420p');
    args.push('-movflags', '+faststart');

    if (options.mute) {
      args.push('-an');
    } else {
      args.push('-c:a', 'aac');
      args.push('-b:a', '192k');
    }

    args.push('--', safePathArg(options.output));

    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FFmpeg failed: ${stderr}`));
        } else {
          resolve(options.output);
        }
      });

      proc.on('error', reject);
    });
  }

  async extractFrame(inputPath: string, timestamp: number, outputPath: string): Promise<string> {
    const args = [
      '-y',
      '-ss', String(timestamp),
      '-i', safePathArg(inputPath),
      '-vframes', '1',
      '-q:v', '2',
      '--',
      safePathArg(outputPath)
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args);

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error('Failed to extract frame'));
        }
      });

      proc.on('error', reject);
    });
  }

  async extractFrames(inputPath: string, outputDir: string, fps: number = 1): Promise<string[]> {
    await mkdir(outputDir, { recursive: true });
    const pattern = join(outputDir, 'frame-%04d.png');

    const args = [
      '-y',
      '-i', safePathArg(inputPath),
      '-vf', `fps=${fps}`,
      '-q:v', '2',
      '--',
      safePathArg(pattern)
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`Failed to extract frames: ${stderr}`));
          return;
        }

        // Find all extracted frames
        const { readdir } = await import('fs/promises');
        const files = await readdir(outputDir);
        const frames = files
          .filter(f => f.endsWith('.png'))
          .map(f => join(outputDir, f))
          .sort();
        resolve(frames);
      });

      proc.on('error', reject);
    });
  }

  async concatenate(inputs: string[], outputPath: string): Promise<string> {
    const tempFile = join(tmpdir(), `concat-${Date.now()}.txt`);
    // Per the ffmpeg concat demuxer rules, a path is wrapped in single quotes
    // and any single quote inside it must be escaped as the four-char sequence
    // '\'' (close quote, escaped quote, reopen quote). Newlines terminate an
    // entry, so a path containing one would let an attacker inject directives.
    const content = inputs
      .map(p => {
        if (p.includes('\n') || p.includes('\r')) {
          throw new Error('Input path must not contain a newline');
        }
        const escaped = p.replace(/'/g, "'\\''");
        return `file '${escaped}'`;
      })
      .join('\n');
    await writeFile(tempFile, content);

    const args = [
      '-y',
      '-f', 'concat',
      '-i', tempFile,
      '-c', 'copy',
      '--',
      safePathArg(outputPath)
    ];

    try {
      return await new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', args);
        let stderr = '';

        proc.stderr.on('data', (data) => { stderr += data; });

        proc.on('close', (code) => {
          if (code !== 0) {
            reject(new Error(`Concatenation failed: ${stderr}`));
          } else {
            resolve(outputPath);
          }
        });

        proc.on('error', reject);
      });
    } finally {
      await unlink(tempFile).catch(() => {});
    }
  }

  async addAudio(videoPath: string, audioPath: string, outputPath: string): Promise<string> {
    const args = [
      '-y',
      '-i', safePathArg(videoPath),
      '-i', safePathArg(audioPath),
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-shortest',
      '--',
      safePathArg(outputPath)
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Failed to add audio: ${stderr}`));
        } else {
          resolve(outputPath);
        }
      });

      proc.on('error', reject);
    });
  }

  async createThumbnail(inputPath: string, outputPath: string, timestamp: number = 0): Promise<string> {
    const info = await this.getVideoInfo(inputPath);
    const time = Math.min(timestamp, info.duration * 0.25);

    await this.extractFrame(inputPath, time, outputPath);

    await sharp(outputPath)
      .resize(320, 180, { fit: 'cover' })
      .toFile(outputPath + '.tmp');

    await unlink(outputPath);
    const { rename } = await import('fs/promises');
    await rename(outputPath + '.tmp', outputPath);

    return outputPath;
  }

  async convertToGif(inputPath: string, outputPath: string, fps: number = 10, width: number = 480): Promise<string> {
    const filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
    const args = [
      '-y',
      '-i', safePathArg(inputPath),
      '-vf', filter,
      '-loop', '0',
      '--',
      safePathArg(outputPath)
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args);
      let stderr = '';

      proc.stderr.on('data', (data) => { stderr += data; });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`GIF conversion failed: ${stderr}`));
        } else {
          resolve(outputPath);
        }
      });

      proc.on('error', reject);
    });
  }
}
