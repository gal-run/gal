import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';

/**
 * Desktop Frame effect — the "real desktop background" look (à la Screen Studio), done
 * entirely in post so it works headless (no live GUI capture needed).
 *
 * Composites a recording as a rounded, shadowed macOS-style window (title bar + traffic
 * lights) floating on a real desktop wallpaper image, which is blurred + dimmed for focus.
 * All chrome is generated with sharp (SVG→PNG); the composite is a single ffmpeg pass.
 */
export const DesktopFrameConfigSchema = z.object({
  input: z.string(),
  output: z.string(),
  /** Wallpaper/background image. Use a real desktop screenshot for the authentic look. */
  background: z.string(),
  canvasWidth: z.number().int().positive().default(2560),
  canvasHeight: z.number().int().positive().default(1600),
  /** Window width on the canvas (content is scaled to fit). */
  windowWidth: z.number().int().positive().default(1600),
  /** Window height incl. the title bar. */
  windowHeight: z.number().int().positive().default(1048),
  titleBar: z.number().int().nonnegative().default(48),
  cornerRadius: z.number().int().nonnegative().default(26),
  /** Background focus: gaussian blur sigma (0 = crisp) and brightness delta (negative = dimmer). */
  backgroundBlur: z.number().nonnegative().default(9),
  backgroundDim: z.number().min(-1).max(1).default(-0.12),
  bodyColor: z.string().default('#181825'),
  barColor: z.string().default('#1e1e2e'),
  shadowOpacity: z.number().min(0).max(1).default(0.63),
  shadowBlur: z.number().nonnegative().default(46),
  fps: z.number().int().positive().default(60),
  /** x264 rate factor: lower = higher quality (0 = lossless). Keep low for crisp terminal text. */
  crf: z.number().int().min(0).max(51).default(20),
  /** x264 preset: slower = better quality/compression. */
  preset: z.string().default('medium'),
  /** Pixel format. yuv420p is universally compatible; yuv444p keeps full chroma for colored text. */
  pixFmt: z.string().default('yuv420p'),
});

export type DesktopFrameConfig = z.input<typeof DesktopFrameConfigSchema>;

export class DesktopFrame {
  /** Render the framed video. Returns the output path. */
  async render(configInput: DesktopFrameConfig): Promise<string> {
    const c = DesktopFrameConfigSchema.parse(configInput);
    const winX = Math.round((c.canvasWidth - c.windowWidth) / 2);
    const winY = Math.round((c.canvasHeight - c.windowHeight) / 2);
    const contentH = c.windowHeight - c.titleBar;

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-frame-'));
    try {
      const basePng = path.join(tmp, 'window_base.png');
      const maskPng = path.join(tmp, 'mask.png');
      const shadowPng = path.join(tmp, 'shadow.png');
      await this.writeChrome(c, basePng, maskPng, shadowPng);

      // Single ffmpeg pass: dim+blur bg → window(base+clip)→round→shadow→overlay.
      const filter = [
        `[0:v]scale=${c.canvasWidth}:${c.canvasHeight}:force_original_aspect_ratio=increase,` +
          `crop=${c.canvasWidth}:${c.canvasHeight},boxblur=${c.backgroundBlur}:1,` +
          `eq=brightness=${c.backgroundDim}:saturation=1.05[bg]`,
        `[1:v]scale=${c.windowWidth}:${contentH}[term]`,
        `[2:v][term]overlay=0:${c.titleBar}[win]`,
        `[win][3:v]alphamerge[winr]`,
        `[bg][4:v]overlay=0:0[bgs]`,
        `[bgs][winr]overlay=${winX}:${winY}:shortest=1[out]`,
      ].join(';');

      const args = [
        '-y', '-loglevel', 'error',
        '-loop', '1', '-i', c.background,
        '-i', c.input,
        '-i', basePng,
        '-i', maskPng,
        '-i', shadowPng,
        '-filter_complex', filter,
        '-map', '[out]',
        '-r', String(c.fps),
        '-c:v', 'libx264', '-preset', c.preset, '-crf', String(c.crf), '-pix_fmt', c.pixFmt,
        '-movflags', '+faststart',
        c.output,
      ];
      await this.spawn('ffmpeg', args);
      return c.output;
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Generate window base (bar + traffic lights), rounded alpha mask, and soft shadow. */
  private async writeChrome(
    c: z.infer<typeof DesktopFrameConfigSchema>,
    basePng: string,
    maskPng: string,
    shadowPng: string,
  ): Promise<void> {
    const { windowWidth: w, windowHeight: h, titleBar: bar, cornerRadius: r } = c;
    const dots = [ '#ff5f57', '#febc2e', '#28c840' ]
      .map((col, i) => `<circle cx="${30 + i * 26 + 8}" cy="${bar / 2}" r="8" fill="${col}"/>`)
      .join('');
    const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${c.bodyColor}"/>
      <path d="M0 ${bar} V${r} Q0 0 ${r} 0 H${w - r} Q${w} 0 ${w} ${r} V${bar} Z" fill="${c.barColor}"/>
      ${dots}
    </svg>`;
    await sharp(Buffer.from(baseSvg)).png().toFile(basePng);

    const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#ffffff"/></svg>`;
    await sharp(Buffer.from(maskSvg)).png().toFile(maskPng);

    // Shadow: a blurred dark rounded rect on the full canvas, offset down.
    const sx = Math.round((c.canvasWidth - w) / 2);
    const sy = Math.round((c.canvasHeight - h) / 2) + 30;
    const alpha = Math.round(c.shadowOpacity * 255);
    const shadowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${c.canvasWidth}" height="${c.canvasHeight}">
      <rect x="${sx}" y="${sy}" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#000000" fill-opacity="${(alpha / 255).toFixed(3)}"/></svg>`;
    await sharp(Buffer.from(shadowSvg))
      .blur(Math.max(0.3, c.shadowBlur / 2))
      .png()
      .toFile(shadowPng);
  }

  private spawn(bin: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args);
      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d; });
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${bin} exited ${code}: ${stderr.slice(-500)}`));
      });
    });
  }
}
