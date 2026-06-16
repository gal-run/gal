import { z } from 'zod';

const TTSEngineConfigSchema = z.object({
  provider: z.enum(['openai', 'elevenlabs', 'coqui', 'local']).default('openai'),
  voice: z.string().default('alloy'),
  model: z.string().optional(),
  speed: z.number().min(0.25).max(4).default(1.0),
  outputFormat: z.enum(['mp3', 'wav', 'ogg', 'aac']).default('mp3')
});

type TTSEngineConfig = z.infer<typeof TTSEngineConfigSchema>;

interface VoiceoverSegment {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  outputPath?: string;
}

interface TTSResult {
  audioBuffer: Buffer;
  duration: number;
  format: string;
}

export class TTSEngine {
  private config: TTSEngineConfig;
  private segments: VoiceoverSegment[] = [];
  private apiKey?: string;

  constructor(config: Partial<TTSEngineConfig> = {}) {
    this.config = TTSEngineConfigSchema.parse(config);
    this.apiKey = process.env.OPENAI_API_KEY || process.env.ELEVENLABS_API_KEY;
  }

  async generateSpeech(text: string): Promise<TTSResult> {
    switch (this.config.provider) {
      case 'openai':
        return this.generateOpenAISpeech(text);
      case 'elevenlabs':
        return this.generateElevenLabsSpeech(text);
      case 'coqui':
        return this.generateCoquiSpeech(text);
      case 'local':
        return this.generateLocalSpeech(text);
      default:
        throw new Error(`Unsupported TTS provider: ${this.config.provider}`);
    }
  }

  private async generateOpenAISpeech(text: string): Promise<TTSResult> {
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY environment variable required');
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.config.model || 'tts-1',
        input: text,
        voice: this.config.voice,
        speed: this.config.speed,
        response_format: this.config.outputFormat
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI TTS error: ${response.statusText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const duration = this.estimateDuration(text);

    return {
      audioBuffer,
      duration,
      format: this.config.outputFormat
    };
  }

  private async generateElevenLabsSpeech(text: string): Promise<TTSResult> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY environment variable required');
    }

    const voiceId = this.config.voice;
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: this.config.model || 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs TTS error: ${response.statusText}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const duration = this.estimateDuration(text);

    return {
      audioBuffer,
      duration,
      format: 'mp3'
    };
  }

  private async generateCoquiSpeech(text: string): Promise<TTSResult> {
    throw new Error('Coqui TTS not yet implemented');
  }

  private async generateLocalSpeech(text: string): Promise<TTSResult> {
    throw new Error('Local TTS not yet implemented');
  }

  addSegment(text: string, startTime: number): VoiceoverSegment {
    const estimatedDuration = this.estimateDuration(text);
    const segment: VoiceoverSegment = {
      id: `segment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text,
      startTime,
      endTime: startTime + estimatedDuration
    };
    this.segments.push(segment);
    return segment;
  }

  async generateAllSegments(outputDir: string): Promise<VoiceoverSegment[]> {
    const results: VoiceoverSegment[] = [];

    for (const segment of this.segments) {
      const result = await this.generateSpeech(segment.text);
      const outputPath = `${outputDir}/${segment.id}.${this.config.outputFormat}`;
      
      const { writeFile } = await import('fs/promises');
      await writeFile(outputPath, result.audioBuffer);
      
      segment.outputPath = outputPath;
      segment.endTime = segment.startTime + result.duration;
      results.push(segment);
    }

    return results;
  }

  private estimateDuration(text: string): number {
    const wordsPerMinute = 150;
    const wordCount = text.split(/\s+/).length;
    const baseDuration = (wordCount / wordsPerMinute) * 60;
    return baseDuration / this.config.speed;
  }

  generateScriptFromDemo(demoSteps: DemoStep[]): string {
    const lines: string[] = [];

    for (const step of demoSteps) {
      if (step.voiceover) {
        lines.push(step.voiceover);
      } else if (step.type === 'click' && step.description) {
        lines.push(step.description);
      } else if (step.type === 'keystroke') {
        lines.push(`Press ${step.keys}`);
      }
    }

    return lines.join('\n\n');
  }

  getConfig(): TTSEngineConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<TTSEngineConfig>): void {
    this.config = TTSEngineConfigSchema.parse({ ...this.config, ...config });
  }

  getSegments(): VoiceoverSegment[] {
    return [...this.segments];
  }

  clearSegments(): void {
    this.segments = [];
  }
}

interface DemoStep {
  type: 'click' | 'keystroke' | 'record' | 'zoom';
  voiceover?: string;
  description?: string;
  keys?: string;
}

export { TTSEngineConfigSchema, type TTSEngineConfig, type VoiceoverSegment, type TTSResult };
