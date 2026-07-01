import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';

/**
 * Cursor Polish effect — the "Screen Studio / Cap" cursor treatment, done natively in post so it
 * works headless. Takes the REAL cursor timeline (positions + clicks) captured alongside a recording
 * and re-renders a smoothed, spring-driven pointer over the base video, with click ripples, a brief
 * spotlight at click points, and speed-proportional motion blur.
 *
 * Why a spring, not a moving average: Screen Studio and Cap don't average the path — they run the
 * on-screen cursor as a *damped harmonic oscillator* that chases the real cursor target. That gives
 * the signature "weighted, eased" feel (fast moves overshoot slightly and settle) that a moving
 * average cannot reproduce. We integrate the spring numerically per output frame with semi-implicit
 * (symplectic) Euler, which is stable for stiff springs:
 *
 *   accel    = (tension * (target - pos) - friction * vel) / mass
 *   vel     += accel * dt
 *   pos     += vel   * dt
 *
 * Defaults (tension 470, friction 70, mass 3) are Cap's "Mellow" preset — the default it ships —
 * read from Cap's own source (crates/project/src/configuration.rs). Cap solves the SAME spring in
 * closed form rather than with Euler, but at video frame rates semi-implicit Euler is the correct
 * discretization of the identical system and matches it closely; we also floor mass and snap to
 * rest exactly as Cap does. Tuning: {380,30,1}=Fast, {80,28,2.5}=Smooth (Cap's other presets), or
 * {170,26,1} for the tamer react-spring/Framer-Motion generic feel.
 *
 * Refs: Cap crates/rendering/src/spring_mass_damper.rs, crates/rendering/src/cursor_interpolation.rs,
 * crates/project/src/configuration.rs (github.com/CapSoftware/Cap); react-spring.dev/common/configs.
 *
 * NOTE on the click ripple/spotlight: Cap itself renders NO ripple/spotlight — its "click feel" is a
 * snappier spring near clicks plus auto-zoom. The expanding ring + spotlight here are the
 * Screen-Studio-style / animation-literature treatment (ease-out ring, ~300–600ms, opacity 1→0).
 *
 * Rendering: because ripples/spotlight/motion-blur vary per frame, we generate an RGBA overlay PNG
 * sequence with sharp (one transparent frame per output frame) and composite it over the base video
 * in a single ffmpeg `overlay` pass. Frame dims/fps are probed with ffprobe (like auto-zoom.ts).
 */

const CursorSampleSchema = z.object({
  /** Seconds from the start of the clip. */
  t: z.number().min(0),
  /** Fraction of frame width, 0..1. */
  x: z.number().min(0).max(1),
  /** Fraction of frame height, 0..1. */
  y: z.number().min(0).max(1),
  /** Whether a click begins at (roughly) this sample. */
  click: z.boolean().optional(),
});

export type CursorSample = z.infer<typeof CursorSampleSchema>;

export const CursorPolishConfigSchema = z.object({
  input: z.string(),
  output: z.string(),
  /**
   * The real cursor timeline, ordered by `t`. For gal-computer-use recordings the agent supplies
   * these (one sample per mouse event/poll). x/y are fractions of the frame (0..1) so the path is
   * resolution-independent; clicks are marked with `click: true`.
   */
  cursorPath: z.array(CursorSampleSchema).min(1),

  // ---- Spring (damped harmonic oscillator) params — Cap "Mellow" preset defaults ----
  /** Stiffness: how hard the cursor is pulled toward the target. Higher = snappier. */
  tension: z.number().positive().default(470),
  /** Damping: bleeds off velocity. Higher = less overshoot/wobble. */
  friction: z.number().positive().default(70),
  /** Inertia: higher = heavier, laggier cursor. Floored at 0.001 (Cap's guard) to avoid blow-up. */
  mass: z.number().positive().default(3),

  // ---- Pointer appearance ----
  /** Pointer height in px at the video's native resolution. */
  cursorScale: z.number().int().positive().default(44),
  cursorColor: z.string().default('#ffffff'),
  cursorOutline: z.string().default('#000000'),

  // ---- Click ripple + spotlight ----
  /** Peak ripple radius in px (the ring expands from ~0 to this over `rippleDurationSec`). */
  rippleRadius: z.number().positive().default(80),
  /** How long a click ripple lives, seconds. */
  rippleDurationSec: z.number().positive().default(0.6),
  rippleColor: z.string().default('#3b82f6'),
  /** Filled spotlight radius in px (a soft glow that flashes under the pointer on click). */
  spotlightRadius: z.number().positive().default(46),
  /** How long the spotlight flash lives, seconds. */
  spotlightDurationSec: z.number().positive().default(0.4),

  // ---- Motion blur ----
  /**
   * Enable speed-proportional motion blur on the pointer. Cap does a directional (velocity-vector)
   * 20-tap blur in a shader; here we apply an isotropic sharp gaussian whose sigma scales with
   * per-frame cursor speed — a deterministic, dependency-free approximation of the same "faster =
   * blurrier" behavior (not directional). Ref: Cap crates/rendering/src/shaders/composite-video-frame.wgsl.
   */
  motionBlur: z.boolean().default(true),
  /**
   * Speed (in fractions-of-diagonal per second) at which blur reaches `motionBlurMax`. Movement
   * slower than this gets proportionally less blur; faster is clamped.
   */
  motionBlurSpeed: z.number().positive().default(1.5),
  /** Max sharp blur sigma applied to the pointer at/above `motionBlurSpeed`. */
  motionBlurMax: z.number().nonnegative().default(9),

  // ---- Output quality knobs (mirror the other effects) ----
  crf: z.number().int().min(0).max(51).default(18),
  preset: z.string().default('medium'),
  pixFmt: z.string().default('yuv420p'),
});

export type CursorPolishConfig = z.input<typeof CursorPolishConfigSchema>;

interface FrameCursor {
  x: number; // px
  y: number; // px
  speed: number; // fraction-of-diagonal per second (for motion blur)
}

export class CursorPolish {
  /** Render the polished cursor overlay onto the base video. Returns the output path. */
  async render(configInput: CursorPolishConfig): Promise<string> {
    const c = CursorPolishConfigSchema.parse(configInput);
    const { fps, width, height, totalFrames } = await this.probe(c.input);
    const dt = 1 / fps;
    const diag = Math.hypot(width, height);

    // Spring-integrate the real path into a per-frame smoothed cursor position (in px).
    const frameCursors = this.springTrack(c, fps, totalFrames, width, height, diag);

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cursor-polish-'));
    try {
      const framesDir = path.join(tmp, 'frames');
      await fs.mkdir(framesDir);

      // Pre-render the base pointer PNG once (reused every frame; motion blur re-derives from it).
      const pointerPng = await this.renderPointer(c);
      const pointerMeta = await sharp(pointerPng).metadata();
      const pw = pointerMeta.width ?? c.cursorScale;
      const ph = pointerMeta.height ?? c.cursorScale;
      // Hotspot: the tip of an arrow pointer is its top-left corner.
      const hotspotX = 0;
      const hotspotY = 0;

      // One transparent overlay frame per output frame.
      for (let f = 0; f < totalFrames; f++) {
        const t = f * dt;
        const fc = frameCursors[f];
        const composites: sharp.OverlayOptions[] = [];

        // Click ripples + spotlights (may overlap; draw all active ones).
        for (const s of c.cursorPath) {
          if (!s.click) continue;
          const cx = s.x * width;
          const cy = s.y * height;

          const rAge = t - s.t;
          if (rAge >= 0 && rAge <= c.rippleDurationSec) {
            const png = await this.renderRipple(c, rAge / c.rippleDurationSec);
            const size = Math.ceil(c.rippleRadius * 2) + 4;
            composites.push({
              input: png,
              left: Math.round(cx - size / 2),
              top: Math.round(cy - size / 2),
            });
          }
          const sAge = t - s.t;
          if (sAge >= 0 && sAge <= c.spotlightDurationSec) {
            const png = await this.renderSpotlight(c, sAge / c.spotlightDurationSec);
            const size = Math.ceil(c.spotlightRadius * 2) + 4;
            composites.push({
              input: png,
              left: Math.round(cx - size / 2),
              top: Math.round(cy - size / 2),
            });
          }
        }

        // The pointer itself, motion-blurred by current speed.
        let ptr = pointerPng;
        if (c.motionBlur && c.motionBlurMax > 0) {
          const k = Math.min(1, fc.speed / c.motionBlurSpeed);
          const sigma = k * c.motionBlurMax;
          if (sigma >= 0.35) {
            ptr = await sharp(pointerPng).blur(sigma).png().toBuffer();
          }
        }
        composites.push({
          input: ptr,
          left: Math.round(fc.x - hotspotX),
          top: Math.round(fc.y - hotspotY),
        });

        // Transparent canvas the size of the video, with everything composited on top. Anything
        // drawn off-canvas is clipped by sharp; we guard negative offsets by clamping in composite.
        const framePath = path.join(framesDir, `f${String(f).padStart(6, '0')}.png`);
        await sharp({
          create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
        })
          .composite(this.clampComposites(composites, width, height, pw, ph, c))
          .png()
          .toFile(framePath);
      }

      // Single ffmpeg pass: overlay the RGBA PNG sequence (at the video's fps) onto the base video.
      const filter = `[0:v][1:v]overlay=0:0:shortest=1:format=auto[out]`;
      const args = [
        '-y', '-loglevel', 'error',
        '-i', c.input,
        '-framerate', String(fps),
        '-i', path.join(framesDir, 'f%06d.png'),
        '-filter_complex', filter,
        '-map', '[out]',
        '-r', String(fps),
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

  /**
   * Spring-track the real cursor path into a smoothed per-frame position (px), integrating a damped
   * harmonic oscillator with semi-implicit Euler. `target` is the linearly-interpolated real cursor
   * position for the current time; the rendered `pos` chases it under the spring.
   */
  private springTrack(
    c: z.infer<typeof CursorPolishConfigSchema>,
    fps: number,
    totalFrames: number,
    width: number,
    height: number,
    diag: number,
  ): FrameCursor[] {
    const dt = 1 / fps;
    const mass = Math.max(0.001, c.mass); // Cap floors mass at 0.001 to avoid infinite/NaN dynamics.
    const path = [...c.cursorPath].sort((a, b) => a.t - b.t);

    // Start the spring settled at the first sample so there is no initial lurch.
    let px = path[0].x * width;
    let py = path[0].y * height;
    let vx = 0;
    let vy = 0;

    const out: FrameCursor[] = [];
    let prevX = px;
    let prevY = py;

    for (let f = 0; f < totalFrames; f++) {
      const t = f * dt;
      const [tx, ty] = this.targetAt(path, t, width, height);

      // Semi-implicit (symplectic) Euler: update velocity from the current spring force, then
      // position. This is the discrete form of Cap's damped harmonic oscillator; stable at 60fps.
      const ax = (c.tension * (tx - px) - c.friction * vx) / mass;
      const ay = (c.tension * (ty - py) - c.friction * vy) / mass;
      vx += ax * dt;
      vy += ay * dt;
      px += vx * dt;
      py += vy * dt;

      // Snap to rest when essentially settled (Cap's tiny-disp + tiny-vel guard), avoiding
      // endless sub-pixel jitter. Thresholds are the px-equivalent of Cap's 1e-5 / 1e-4.
      if (Math.abs(tx - px) < 0.01 && Math.abs(vx) < 0.1) { px = tx; vx = 0; }
      if (Math.abs(ty - py) < 0.01 && Math.abs(vy) < 0.1) { py = ty; vy = 0; }

      // Speed as a fraction of the frame diagonal per second — resolution-independent for blur.
      const speed = Math.hypot(px - prevX, py - prevY) / dt / diag;
      prevX = px;
      prevY = py;
      out.push({ x: px, y: py, speed });
    }
    return out;
  }

  /** Linearly-interpolated real cursor target (px) at time `t`, clamped to the sample range. */
  private targetAt(
    path: CursorSample[],
    t: number,
    width: number,
    height: number,
  ): [number, number] {
    if (t <= path[0].t) return [path[0].x * width, path[0].y * height];
    const last = path[path.length - 1];
    if (t >= last.t) return [last.x * width, last.y * height];
    // Find the segment [a, b] containing t. Paths are small; a linear scan is fine and deterministic.
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      if (t >= a.t && t <= b.t) {
        const span = b.t - a.t || 1;
        const k = (t - a.t) / span;
        return [(a.x + (b.x - a.x) * k) * width, (a.y + (b.y - a.y) * k) * height];
      }
    }
    return [last.x * width, last.y * height];
  }

  /** Clamp composite offsets so sharp never receives a negative top/left (which it rejects). */
  private clampComposites(
    composites: sharp.OverlayOptions[],
    width: number,
    height: number,
    _pw: number,
    _ph: number,
    _c: z.infer<typeof CursorPolishConfigSchema>,
  ): sharp.OverlayOptions[] {
    // sharp clips overlays that extend past the right/bottom edge, but throws on negative
    // top/left. Drop overlays that are entirely off the top/left, and clamp partial ones to 0
    // (a few px of edge slop is invisible and keeps the render deterministic).
    return composites
      .filter((o) => (o.left ?? 0) < width && (o.top ?? 0) < height)
      .map((o) => ({ ...o, left: Math.max(0, o.left ?? 0), top: Math.max(0, o.top ?? 0) }));
  }

  /** Render the arrow pointer PNG (macOS-style), scaled to `cursorScale` px tall. */
  private async renderPointer(c: z.infer<typeof CursorPolishConfigSchema>): Promise<Buffer> {
    const s = c.cursorScale;
    const fill = this.escapeXml(c.cursorColor);
    const stroke = this.escapeXml(c.cursorOutline);
    // Classic arrow pointer; viewBox 0 0 24 24 with the tip at (0,0).
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24">
      <path d="M2 2 L2 18 L6.5 14 L9.5 21 L12.5 19.7 L9.5 12.8 L15.5 12.8 Z"
            fill="${fill}" stroke="${stroke}" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  /** Expanding ring ripple. `p` in 0..1 is life progress; radius grows, opacity fades. */
  private async renderRipple(
    c: z.infer<typeof CursorPolishConfigSchema>,
    p: number,
  ): Promise<Buffer> {
    const size = Math.ceil(c.rippleRadius * 2) + 4;
    const cx = size / 2;
    // Ease-out radius (fast start, settle) and linear-ish opacity falloff.
    const eased = 1 - Math.pow(1 - p, 3);
    const r = Math.max(1, eased * c.rippleRadius);
    const opacity = Math.max(0, 1 - p);
    const stroke = this.escapeXml(c.rippleColor);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <circle cx="${cx}" cy="${cx}" r="${r.toFixed(2)}" fill="none"
              stroke="${stroke}" stroke-width="${Math.max(1.5, c.rippleRadius * 0.05).toFixed(2)}"
              stroke-opacity="${opacity.toFixed(3)}"/>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  /** Soft filled spotlight glow that flashes under the pointer on click. */
  private async renderSpotlight(
    c: z.infer<typeof CursorPolishConfigSchema>,
    p: number,
  ): Promise<Buffer> {
    const size = Math.ceil(c.spotlightRadius * 2) + 4;
    const cx = size / 2;
    // Quick pop-in then fade: opacity rises for the first 25% of life, then falls.
    const opacity = p < 0.25 ? (p / 0.25) * 0.5 : Math.max(0, 0.5 * (1 - (p - 0.25) / 0.75));
    const fill = this.escapeXml(c.rippleColor);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <defs>
        <radialGradient id="g" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${fill}" stop-opacity="${opacity.toFixed(3)}"/>
          <stop offset="100%" stop-color="${fill}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="${cx}" cy="${cx}" r="${c.spotlightRadius}" fill="url(#g)"/>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  // Neutralizes attribute-breakout / SVG injection from user-supplied color values. Mirrors the
  // escaping in cursor.ts / overlay.ts so all effect modules are consistent.
  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private async probe(
    input: string,
  ): Promise<{ fps: number; width: number; height: number; totalFrames: number }> {
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
