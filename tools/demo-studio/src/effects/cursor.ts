import { z } from 'zod';
import sharp from 'sharp';

const CursorConfigSchema = z.object({
  visible: z.boolean().default(true),
  style: z.enum(['arrow', 'pointer', 'text', 'crosshair', 'hand']).default('arrow'),
  color: z.string().default('#ffffff'),
  size: z.number().min(16).max(128).default(32),
  smoothness: z.number().min(0).max(1).default(0.8),
  highlightOnClick: z.boolean().default(true),
  highlightColor: z.string().default('#3b82f6'),
  highlightSize: z.number().default(48)
});

type CursorConfig = z.infer<typeof CursorConfigSchema>;

interface CursorPosition {
  x: number;
  y: number;
  timestamp: number;
}

interface ClickEvent {
  x: number;
  y: number;
  timestamp: number;
  duration: number;
}

interface SmoothedPosition {
  x: number;
  y: number;
  isHighlighted: boolean;
  highlightOpacity: number;
}

export class CursorEngine {
  private config: CursorConfig;
  private positions: CursorPosition[] = [];
  private clicks: ClickEvent[] = [];
  private smoothPositions: SmoothedPosition[] = [];

  constructor(config: Partial<CursorConfig> = {}) {
    this.config = CursorConfigSchema.parse(config);
  }

  addPosition(x: number, y: number, timestamp: number): void {
    this.positions.push({ x, y, timestamp });
    this.computeSmoothPositions();
  }

  addClick(x: number, y: number, timestamp: number, duration: number = 0.3): void {
    this.clicks.push({ x, y, timestamp, duration });
  }

  private computeSmoothPositions(): void {
    if (this.positions.length < 2) {
      this.smoothPositions = this.positions.map(p => ({
        x: p.x,
        y: p.y,
        isHighlighted: false,
        highlightOpacity: 0
      }));
      return;
    }

    this.smoothPositions = [];
    
    for (let i = 0; i < this.positions.length; i++) {
      const current = this.positions[i];
      const windowSize = Math.floor(this.config.smoothness * 10) + 1;
      
      const start = Math.max(0, i - windowSize);
      const end = Math.min(this.positions.length - 1, i + windowSize);
      
      let sumX = 0, sumY = 0, count = 0;
      for (let j = start; j <= end; j++) {
        sumX += this.positions[j].x;
        sumY += this.positions[j].y;
        count++;
      }

      const smoothedX = sumX / count;
      const smoothedY = sumY / count;

      const click = this.clicks.find(
        c => Math.abs(c.timestamp - current.timestamp) < c.duration
      );

      const highlightOpacity = click 
        ? 1 - (Math.abs(current.timestamp - click.timestamp) / click.duration)
        : 0;

      this.smoothPositions.push({
        x: smoothedX,
        y: smoothedY,
        isHighlighted: !!click,
        highlightOpacity
      });
    }
  }

  getPositionAtTime(timestamp: number): SmoothedPosition | null {
    const index = this.positions.findIndex(
      (p, i) => {
        const next = this.positions[i + 1];
        if (!next) return true;
        return p.timestamp <= timestamp && next.timestamp > timestamp;
      }
    );

    if (index === -1) return null;

    const current = this.positions[index];
    const next = this.positions[index + 1];

    if (!next) {
      return this.smoothPositions[index] || null;
    }

    const t = (timestamp - current.timestamp) / (next.timestamp - current.timestamp);
    const smoothedCurrent = this.smoothPositions[index];
    const smoothedNext = this.smoothPositions[index + 1];

    if (!smoothedCurrent || !smoothedNext) return null;

    return {
      x: this.lerp(smoothedCurrent.x, smoothedNext.x, t),
      y: this.lerp(smoothedCurrent.y, smoothedNext.y, t),
      isHighlighted: smoothedCurrent.isHighlighted || smoothedNext.isHighlighted,
      highlightOpacity: Math.max(
        smoothedCurrent.highlightOpacity,
        smoothedNext.highlightOpacity
      )
    };
  }

  async renderCursor(
    framePath: string,
    outputPath: string,
    position: SmoothedPosition
  ): Promise<void> {
    const cursorSvg = this.createCursorSvg(position);
    
    const cursorBuffer = await sharp(Buffer.from(cursorSvg))
      .png()
      .toBuffer();

    const highlightBuffer = position.isHighlighted
      ? await sharp({
          create: {
            width: this.config.highlightSize,
            height: this.config.highlightSize,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          }
        })
          .composite([{
            input: Buffer.from(this.createHighlightSvg(position.highlightOpacity)),
            top: 0,
            left: 0
          }])
          .png()
          .toBuffer()
      : null;

    let composite: sharp.OverlayOptions[] = [];
    
    if (highlightBuffer) {
      composite.push({
        input: highlightBuffer,
        top: Math.floor(position.y - this.config.highlightSize / 2),
        left: Math.floor(position.x - this.config.highlightSize / 2)
      });
    }

    composite.push({
      input: cursorBuffer,
      top: Math.floor(position.y),
      left: Math.floor(position.x)
    });

    await sharp(framePath)
      .composite(composite)
      .toFile(outputPath);
  }

  // Neutralizes attribute-breakout / SVG injection from user-supplied color
  // values (settable via the MCP set_cursor_style tool). Mirrors the escaping
  // applied in overlay.ts so both effect modules are consistent.
  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private createCursorSvg(position: SmoothedPosition): string {
    const size = this.config.size;
    const color = this.escapeXml(this.config.color);

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 0l16 12.279-6.951 1.17 4.325 8.817-3.596 1.734-4.35-8.879-5.428 4.702z"
              fill="${color}"
              stroke="#000"
              stroke-width="1"/>
      </svg>
    `;
  }

  private createHighlightSvg(opacity: number): string {
    const size = this.config.highlightSize;
    const color = this.escapeXml(this.config.highlightColor);

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="22"
                fill="none"
                stroke="${color}"
                stroke-width="3"
                stroke-opacity="${opacity}"/>
      </svg>
    `;
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  getConfig(): CursorConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<CursorConfig>): void {
    this.config = CursorConfigSchema.parse({ ...this.config, ...config });
  }

  getPositions(): CursorPosition[] {
    return [...this.positions];
  }

  getClicks(): ClickEvent[] {
    return [...this.clicks];
  }

  clear(): void {
    this.positions = [];
    this.clicks = [];
    this.smoothPositions = [];
  }
}

export { CursorConfigSchema, type CursorConfig, type CursorPosition, type ClickEvent, type SmoothedPosition };
