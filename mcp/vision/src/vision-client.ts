/**
 * Vision Client
 *
 * Supports both Google AI Studio (API key) and Vertex AI (ADC) authentication.
 * Prefers API key if GEMINI_API_KEY is set, falls back to Vertex AI.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { VertexAI } from '@google-cloud/vertexai';

export interface VisionClient {
  analyzeImage(imageData: string, mimeType: string, prompt: string): Promise<string>;
  analyzeVideo(videoData: string, mimeType: string, prompt: string): Promise<string>;
}

export interface VisionClientConfig {
  apiKey?: string;
  projectId?: string;
  location?: string;
  model: string;
}

export function createVisionClient(config: VisionClientConfig): VisionClient {
  const modelId = config.model || 'gemini-2.5-flash';

  if (config.apiKey) {
    return createApiKeyClient(config.apiKey, modelId);
  }

  if (config.projectId) {
    return createVertexClient(config.projectId, config.location || 'us-central1', modelId);
  }

  throw new Error('Either GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT must be set');
}

function createApiKeyClient(apiKey: string, modelId: string): VisionClient {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelId });

  return {
    async analyzeImage(imageData: string, mimeType: string, prompt: string): Promise<string> {
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: imageData } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      });

      return result.response.text();
    },

    async analyzeVideo(videoData: string, mimeType: string, prompt: string): Promise<string> {
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: videoData } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      });

      return result.response.text();
    },
  };
}

function createVertexClient(projectId: string, location: string, modelId: string): VisionClient {
  const vertexAI = new VertexAI({ project: projectId, location });
  const model = vertexAI.getGenerativeModel({ model: modelId });

  return {
    async analyzeImage(imageData: string, mimeType: string, prompt: string): Promise<string> {
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: imageData } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      });

      const candidates = result.response.candidates;
      if (!candidates || candidates.length === 0) return '';
      const parts = candidates[0].content?.parts;
      if (!parts || parts.length === 0) return '';
      return parts[0].text ?? '';
    },

    async analyzeVideo(videoData: string, mimeType: string, prompt: string): Promise<string> {
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: videoData } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      });

      const candidates = result.response.candidates;
      if (!candidates || candidates.length === 0) return '';
      const parts = candidates[0].content?.parts;
      if (!parts || parts.length === 0) return '';
      return parts[0].text ?? '';
    },
  };
}

export function mimeTypeFromPath(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop();

  const imageMimes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
  };

  const videoMimes: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
  };

  return imageMimes[ext || ''] || videoMimes[ext || ''] || 'application/octet-stream';
}

export function isVideoMimeType(mimeType: string): boolean {
  return mimeType.startsWith('video/');
}

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}
