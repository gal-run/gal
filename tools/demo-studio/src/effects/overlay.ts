import sharp from 'sharp';
import { z } from 'zod';

const KeystrokeStyleSchema = z.object({
  fontSize: z.number().default(24),
  fontFamily: z.string().default('SF Pro Display'),
  color: z.string().default('#ffffff'),
  backgroundColor: z.string().default('#1a1a1a'),
  borderRadius: z.number().default(8),
  padding: z.number().default(12),
  shadow: z.boolean().default(true)
});

const KeystrokeConfigSchema = z.object({
  keys: z.string(),
  position: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-center', 'center']).default('bottom-center'),
  style: KeystrokeStyleSchema.optional().default({})
});

type KeystrokeConfig = z.infer<typeof KeystrokeConfigSchema>;
type KeystrokeConfigInput = z.input<typeof KeystrokeConfigSchema>;

const TextOverlayStyleSchema = z.object({
  fontSize: z.number().default(32),
  fontFamily: z.string().default('SF Pro Display'),
  color: z.string().default('#ffffff'),
  backgroundColor: z.string().default('transparent'),
  fontWeight: z.enum(['normal', 'bold', 'light']).default('bold'),
  textAlign: z.enum(['left', 'center', 'right']).default('center'),
  shadow: z.boolean().default(true)
});

const TextOverlayConfigSchema = z.object({
  text: z.string(),
  x: z.number().optional().default(0),
  y: z.number().optional().default(0),
  startTime: z.number(),
  endTime: z.number(),
  style: TextOverlayStyleSchema.optional().default({})
});

type TextOverlayConfig = z.infer<typeof TextOverlayConfigSchema>;
type TextOverlayConfigInput = z.input<typeof TextOverlayConfigSchema>;

export class OverlayEngine {
  private keystrokes: Array<KeystrokeConfig & { timestamp: number; duration: number }> = [];
  private textOverlays: TextOverlayConfig[] = [];

  addKeystroke(config: KeystrokeConfigInput, timestamp: number, duration: number = 2): void {
    this.keystrokes.push({
      ...KeystrokeConfigSchema.parse(config),
      timestamp,
      duration
    });
  }

  addTextOverlay(config: TextOverlayConfigInput): void {
    this.textOverlays.push(TextOverlayConfigSchema.parse(config));
  }

  getActiveKeystrokes(timestamp: number): Array<KeystrokeConfig & { opacity: number }> {
    return this.keystrokes
      .filter(k => timestamp >= k.timestamp && timestamp < k.timestamp + k.duration)
      .map(k => {
        const elapsed = timestamp - k.timestamp;
        const fadeIn = Math.min(elapsed / 0.2, 1);
        const fadeOut = Math.max(0, 1 - (elapsed - (k.duration - 0.3)) / 0.3);
        const opacity = Math.min(fadeIn, fadeOut);
        return { ...k, opacity };
      });
  }

  getActiveTextOverlays(timestamp: number): TextOverlayConfig[] {
    return this.textOverlays.filter(
      t => timestamp >= t.startTime && timestamp < t.endTime
    );
  }

  async renderKeystrokeOverlay(
    keys: string,
    config: KeystrokeConfig,
    width: number = 1920,
    height: number = 1080
  ): Promise<Buffer> {
    const { style, position } = config;
    const keyParts = keys.split('+').map(k => k.trim());
    
    const keyWidth = 50;
    const keyHeight = 40;
    const keySpacing = 6;
    const totalWidth = keyParts.length * (keyWidth + keySpacing) - keySpacing;
    
    const svg = `
      <svg width="${totalWidth + style.padding * 2}" height="${keyHeight + style.padding * 2}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000" flood-opacity="0.3"/>
          </filter>
        </defs>
        <rect x="0" y="0" width="${totalWidth + style.padding * 2}" height="${keyHeight + style.padding * 2}"
              rx="${style.borderRadius}" ry="${style.borderRadius}"
              fill="${this.escapeXml(style.backgroundColor)}"
              filter="${style.shadow ? 'url(#shadow)' : 'none'}"/>
        ${keyParts.map((key, i) => `
          <rect x="${style.padding + i * (keyWidth + keySpacing)}" y="${style.padding}"
                width="${keyWidth}" height="${keyHeight}"
                rx="6" ry="6"
                fill="#2a2a2a"
                stroke="#444"
                stroke-width="1"/>
          <text x="${style.padding + i * (keyWidth + keySpacing) + keyWidth / 2}"
                y="${style.padding + keyHeight / 2 + 1}"
                text-anchor="middle"
                dominant-baseline="middle"
                font-family="${this.escapeXml(style.fontFamily)}, -apple-system, sans-serif"
                font-size="${Math.min(style.fontSize, 16)}"
                font-weight="500"
                fill="${this.escapeXml(style.color)}">${this.escapeXml(key)}</text>
        `).join('')}
      </svg>
    `;

    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  async renderTextOverlay(
    text: string,
    config: TextOverlayConfig,
    width: number = 1920
  ): Promise<Buffer> {
    const { style } = config;
    
    const lines = text.split('\n');
    const lineHeight = style.fontSize * 1.4;
    const totalHeight = lines.length * lineHeight;
    
    const svg = `
      <svg width="${width}" height="${totalHeight + 40}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.5"/>
          </filter>
        </defs>
        ${lines.map((line, i) => `
          <text x="${width / 2}" 
                y="${30 + i * lineHeight}" 
                text-anchor="${style.textAlign}"
                font-family="${this.escapeXml(style.fontFamily)}, -apple-system, sans-serif"
                font-size="${style.fontSize}"
                font-weight="${style.fontWeight}"
                fill="${this.escapeXml(style.color)}"
                filter="${style.shadow ? 'url(#textShadow)' : 'none'}">${this.escapeXml(line)}</text>
        `).join('')}
      </svg>
    `;

    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  calculatePosition(
    position: string,
    overlayWidth: number,
    overlayHeight: number,
    frameWidth: number = 1920,
    frameHeight: number = 1080,
    margin: number = 40
  ): { x: number; y: number } {
    switch (position) {
      case 'top-left':
        return { x: margin, y: margin };
      case 'top-right':
        return { x: frameWidth - overlayWidth - margin, y: margin };
      case 'bottom-left':
        return { x: margin, y: frameHeight - overlayHeight - margin };
      case 'bottom-center':
        return { x: (frameWidth - overlayWidth) / 2, y: frameHeight - overlayHeight - margin };
      case 'center':
        return { x: (frameWidth - overlayWidth) / 2, y: (frameHeight - overlayHeight) / 2 };
      default:
        return { x: margin, y: frameHeight - overlayHeight - margin };
    }
  }

  clear(): void {
    this.keystrokes = [];
    this.textOverlays = [];
  }

  getKeystrokes(): Array<KeystrokeConfig & { timestamp: number; duration: number }> {
    return [...this.keystrokes];
  }

  getTextOverlays(): TextOverlayConfig[] {
    return [...this.textOverlays];
  }
}

export { KeystrokeConfigSchema, TextOverlayConfigSchema, type KeystrokeConfig, type TextOverlayConfig };
