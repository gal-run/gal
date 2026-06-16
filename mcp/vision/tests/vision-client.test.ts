import { describe, it, expect } from 'vitest';
import { mimeTypeFromPath, isVideoMimeType, isImageMimeType } from '../src/vision-client.js';

describe('vision-client utilities', () => {
  describe('mimeTypeFromPath', () => {
    it('detects PNG images', () => {
      expect(mimeTypeFromPath('test.png')).toBe('image/png');
      expect(mimeTypeFromPath('/path/to/image.PNG')).toBe('image/png');
    });

    it('detects JPEG images', () => {
      expect(mimeTypeFromPath('test.jpg')).toBe('image/jpeg');
      expect(mimeTypeFromPath('test.jpeg')).toBe('image/jpeg');
    });

    it('detects MP4 videos', () => {
      expect(mimeTypeFromPath('video.mp4')).toBe('video/mp4');
    });

    it('detects MOV videos', () => {
      expect(mimeTypeFromPath('video.mov')).toBe('video/quicktime');
    });

    it('returns octet-stream for unknown types', () => {
      expect(mimeTypeFromPath('file.xyz')).toBe('application/octet-stream');
    });
  });

  describe('isVideoMimeType', () => {
    it('returns true for video mime types', () => {
      expect(isVideoMimeType('video/mp4')).toBe(true);
      expect(isVideoMimeType('video/quicktime')).toBe(true);
      expect(isVideoMimeType('video/webm')).toBe(true);
    });

    it('returns false for non-video mime types', () => {
      expect(isVideoMimeType('image/png')).toBe(false);
      expect(isVideoMimeType('application/json')).toBe(false);
    });
  });

  describe('isImageMimeType', () => {
    it('returns true for image mime types', () => {
      expect(isImageMimeType('image/png')).toBe(true);
      expect(isImageMimeType('image/jpeg')).toBe(true);
      expect(isImageMimeType('image/webp')).toBe(true);
    });

    it('returns false for non-image mime types', () => {
      expect(isImageMimeType('video/mp4')).toBe(false);
      expect(isImageMimeType('application/json')).toBe(false);
    });
  });
});
