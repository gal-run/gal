import { z } from 'zod';
import sharp from 'sharp';

const ZoomConfigSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(1).max(4).default(1.5),
  duration: z.number().min(0).default(0.5),
  easing: z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']).default('ease-out')
});

type ZoomConfig = z.infer<typeof ZoomConfigSchema>;

interface ZoomRegion {
  id: string;
  config: ZoomConfig;
  startTime: number;
  endTime: number;
}

interface ZoomKeyframe {
  timestamp: number;
  x: number;
  y: number;
  scale: number;
}

export class ZoomEngine {
  private regions: ZoomRegion[] = [];
  private currentZoom: ZoomConfig = { x: 0.5, y: 0.5, scale: 1, duration: 0, easing: 'ease-out' };

  addZoomRegion(config: ZoomConfig, startTime: number, endTime: number): string {
    const id = `zoom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.regions.push({
      id,
      config: ZoomConfigSchema.parse(config),
      startTime,
      endTime
    });
    return id;
  }

  removeZoomRegion(id: string): boolean {
    const index = this.regions.findIndex(r => r.id === id);
    if (index === -1) return false;
    this.regions.splice(index, 1);
    return true;
  }

  getZoomAtTime(timestamp: number): ZoomConfig {
    const activeRegion = this.regions.find(
      r => timestamp >= r.startTime && timestamp <= r.endTime
    );

    if (!activeRegion) {
      return { x: 0.5, y: 0.5, scale: 1, duration: 0, easing: 'ease-out' };
    }

    const progress = (timestamp - activeRegion.startTime) / (activeRegion.endTime - activeRegion.startTime);
    const easedProgress = this.applyEasing(progress, activeRegion.config.easing);

    return {
      x: this.lerp(this.currentZoom.x, activeRegion.config.x, easedProgress),
      y: this.lerp(this.currentZoom.y, activeRegion.config.y, easedProgress),
      scale: this.lerp(this.currentZoom.scale, activeRegion.config.scale, easedProgress),
      duration: activeRegion.config.duration,
      easing: activeRegion.config.easing
    };
  }

  generateKeyframes(duration: number, fps: number = 30): ZoomKeyframe[] {
    const keyframes: ZoomKeyframe[] = [];
    const totalFrames = Math.floor(duration * fps);
    
    for (let frame = 0; frame < totalFrames; frame++) {
      const timestamp = frame / fps;
      const zoom = this.getZoomAtTime(timestamp);
      keyframes.push({
        timestamp,
        x: zoom.x,
        y: zoom.y,
        scale: zoom.scale
      });
    }

    return keyframes;
  }

  async applyZoomToFrame(
    inputPath: string,
    outputPath: string,
    zoom: ZoomConfig,
    outputWidth: number = 1920,
    outputHeight: number = 1080
  ): Promise<void> {
    const { x, y, scale } = zoom;
    
    const cropWidth = Math.floor(outputWidth / scale);
    const cropHeight = Math.floor(outputHeight / scale);
    
    const left = Math.floor((x * outputWidth) - (cropWidth / 2));
    const top = Math.floor((y * outputHeight) - (cropHeight / 2));
    
    await sharp(inputPath)
      .extract({
        left: Math.max(0, left),
        top: Math.max(0, top),
        width: cropWidth,
        height: cropHeight
      })
      .resize(outputWidth, outputHeight, {
        kernel: 'lanczos3',
        fit: 'cover'
      })
      .toFile(outputPath);
  }

  private lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
  }

  private applyEasing(t: number, easing: string): number {
    switch (easing) {
      case 'linear':
        return t;
      case 'ease-in':
        return t * t;
      case 'ease-out':
        return 1 - (1 - t) * (1 - t);
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      default:
        return t;
    }
  }

  getRegions(): ZoomRegion[] {
    return [...this.regions];
  }

  clearRegions(): void {
    this.regions = [];
  }
}

export { ZoomConfigSchema, type ZoomConfig, type ZoomRegion, type ZoomKeyframe };
