import { spawn } from 'node:child_process';
import { z } from 'zod';

/**
 * Auto-Zoom effect — Screen Studio's signature "cinematic push-in" done natively, deterministic.
 *
 * Applies a smooth zoom that eases from 1.0 (full view) toward a target point over the clip, so
 * the action (e.g. a terminal's key moment) is emphasized. Implemented with ffmpeg `zoompan` at
 * `d=1` (one output frame per input frame) so the clip DURATION is preserved — the classic
 * zoompan pitfall (default `d` duplicates every frame and explodes the length) is avoided.
 */
export const AutoZoomConfigSchema = z.object({
  input: z.string(),
  output: z.string(),
  /** Max zoom factor at the end of the ease (1 = none). Keep gentle (1.2–1.4) to avoid edge clipping. */
  scale: z.number().min(1).max(4).default(1.3),
  /** Zoom focus point, fraction of width/height (0..1). Center on the region the action lands in. */
  targetX: z.number().min(0).max(1).default(0.5),
  targetY: z.number().min(0).max(1).default(0.5),
  /** Easing exponent for the push-in: 1 = linear, >1 = slow start / accelerate (ease-in). */
  ease: z.number().min(0.25).max(4).default(1.5),
  crf: z.number().int().min(0).max(51).default(16),
  preset: z.string().default('medium'),
  pixFmt: z.string().default('yuv420p'),
});

export type AutoZoomConfig = z.input<typeof AutoZoomConfigSchema>;

export class AutoZoom {
  /** Render the zoomed clip. Returns the output path. */
  async render(configInput: AutoZoomConfig): Promise<string> {
    const c = AutoZoomConfigSchema.parse(configInput);
    const { fps, width, height, totalFrames } = await this.probe(c.input);

    // zoom(on) = 1 + (scale-1) * (on/total)^ease  — starts at 1.0 (no crop), eases toward `scale`.
    const gain = (c.scale - 1).toFixed(4);
    const z = `1+${gain}*pow(on/${totalFrames}\\,${c.ease})`;
    // Keep the target point fixed while the window shrinks around it.
    const x = `iw*${c.targetX}-(iw/zoom)/2`;
    const y = `ih*${c.targetY}-(ih/zoom)/2`;
    const vf =
      `zoompan=z=${z}:x=${x}:y=${y}:d=1:s=${width}x${height}:fps=${fps.toFixed(4)}`;

    const args = [
      '-y', '-loglevel', 'error',
      '-i', c.input,
      '-vf', vf,
      '-c:v', 'libx264', '-preset', c.preset, '-crf', String(c.crf), '-pix_fmt', c.pixFmt,
      '-movflags', '+faststart',
      c.output,
    ];
    await this.spawn('ffmpeg', args);
    return c.output;
  }

  private async probe(input: string): Promise<{ fps: number; width: number; height: number; totalFrames: number }> {
    const out = await this.capture('ffprobe', [
      '-v', 'error', '-select_streams', 'v',
      '-show_entries', 'stream=r_frame_rate,width,height',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1', input,
    ]);
    const get = (k: string) => (out.match(new RegExp(`${k}=([^\\n]+)`)) || [])[1]?.trim() ?? '';
    const [n, d] = get('r_frame_rate').split('/').map(Number);
    const fps = d ? n / d : Number(get('r_frame_rate')) || 30;
    const width = parseInt(get('width'), 10);
    const height = parseInt(get('height'), 10);
    const duration = parseFloat(get('duration'));
    return { fps, width, height, totalFrames: Math.max(1, Math.round(fps * duration)) };
  }

  private capture(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args);
      let stdout = '', stderr = '';
      proc.stdout.on('data', (d) => { stdout += d; });
      proc.stderr.on('data', (d) => { stderr += d; });
      proc.on('error', reject);
      proc.on('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(`${bin} exited ${code}: ${stderr.slice(-300)}`)));
    });
  }

  private spawn(bin: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args);
      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d; });
      proc.on('error', reject);
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}: ${stderr.slice(-500)}`)));
    });
  }
}
