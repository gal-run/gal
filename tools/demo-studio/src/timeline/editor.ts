import { z } from 'zod';

const TimelineClipSchema = z.object({
  id: z.string(),
  type: z.enum(['video', 'audio', 'image', 'text']),
  source: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  track: z.number().default(0),
  effects: z.array(z.object({
    type: z.string(),
    params: z.record(z.any())
  })).optional(),
  transforms: z.object({
    x: z.number().default(0),
    y: z.number().default(0),
    scale: z.number().default(1),
    rotation: z.number().default(0),
    opacity: z.number().min(0).max(1).default(1)
  }).optional()
});

const TimelineTrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['video', 'audio', 'overlay']),
  clips: z.array(TimelineClipSchema).default([]),
  muted: z.boolean().default(false),
  locked: z.boolean().default(false)
});

type TimelineClip = z.infer<typeof TimelineClipSchema>;
type TimelineTrack = z.infer<typeof TimelineTrackSchema>;

interface TimelineState {
  tracks: TimelineTrack[];
  duration: number;
  currentTime: number;
  playbackRate: number;
  isPlaying: boolean;
}

export class TimelineEditor {
  private state: TimelineState;
  private eventListeners: Map<string, Set<Function>> = new Map();

  constructor() {
    this.state = {
      tracks: [],
      duration: 0,
      currentTime: 0,
      playbackRate: 1,
      isPlaying: false
    };
  }

  addTrack(name: string, type: 'video' | 'audio' | 'overlay' = 'video'): string {
    const id = `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const track: TimelineTrack = {
      id,
      name,
      type,
      clips: [],
      muted: false,
      locked: false
    };
    this.state.tracks.push(track);
    this.emit('trackAdded', { track });
    return id;
  }

  removeTrack(trackId: string): boolean {
    const index = this.state.tracks.findIndex(t => t.id === trackId);
    if (index === -1) return false;
    
    this.state.tracks.splice(index, 1);
    this.emit('trackRemoved', { trackId });
    this.updateDuration();
    return true;
  }

  addClip(clip: Omit<TimelineClip, 'id'>): string {
    const id = `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fullClip = TimelineClipSchema.parse({ ...clip, id });
    
    const track = this.state.tracks.find(t => t.clips.length === 0) || this.state.tracks[0];
    if (!track) {
      throw new Error('Track not found');
    }
    
    track.clips.push(fullClip as TimelineClip);
    this.emit('clipAdded', { clip: fullClip });
    this.updateDuration();
    return id;
  }

  removeClip(clipId: string): boolean {
    for (const track of this.state.tracks) {
      const index = track.clips.findIndex(c => c.id === clipId);
      if (index !== -1) {
        track.clips.splice(index, 1);
        this.emit('clipRemoved', { clipId });
        this.updateDuration();
        return true;
      }
    }
    return false;
  }

  moveClip(clipId: string, newStartTime: number, newTrackId?: string): boolean {
    let clip: TimelineClip | null = null;
    let sourceTrack: TimelineTrack | null = null;

    for (const track of this.state.tracks) {
      const index = track.clips.findIndex(c => c.id === clipId);
      if (index !== -1) {
        clip = track.clips[index];
        sourceTrack = track;
        break;
      }
    }

    if (!clip || !sourceTrack) return false;

    const duration = clip.endTime - clip.startTime;
    clip.startTime = newStartTime;
    clip.endTime = newStartTime + duration;

    if (newTrackId && newTrackId !== sourceTrack.id) {
      const destTrack = this.state.tracks.find(t => t.id === newTrackId);
      if (!destTrack) return false;

      sourceTrack.clips = sourceTrack.clips.filter(c => c.id !== clipId);
      destTrack.clips.push(clip);
    }

    this.emit('clipMoved', { clipId, newStartTime, newTrackId });
    this.updateDuration();
    return true;
  }

  trimClip(clipId: string, newStartTime: number, newEndTime: number): boolean {
    for (const track of this.state.tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) {
        clip.startTime = newStartTime;
        clip.endTime = newEndTime;
        this.emit('clipTrimmed', { clipId, newStartTime, newEndTime });
        this.updateDuration();
        return true;
      }
    }
    return false;
  }

  splitClip(clipId: string, splitTime: number): string | null {
    for (const track of this.state.tracks) {
      const clipIndex = track.clips.findIndex(c => c.id === clipId);
      if (clipIndex === -1) continue;

      const clip = track.clips[clipIndex];
      if (splitTime <= clip.startTime || splitTime >= clip.endTime) {
        return null;
      }

      const newClipId = `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newClip: TimelineClip = {
        ...clip,
        id: newClipId,
        startTime: splitTime
      };

      clip.endTime = splitTime;
      track.clips.splice(clipIndex + 1, 0, newClip);

      this.emit('clipSplit', { originalClipId: clipId, newClipId, splitTime });
      return newClipId;
    }
    return null;
  }

  addEffect(clipId: string, effect: { type: string; params: Record<string, any> }): boolean {
    for (const track of this.state.tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) {
        if (!clip.effects) clip.effects = [];
        clip.effects.push(effect);
        this.emit('effectAdded', { clipId, effect });
        return true;
      }
    }
    return false;
  }

  private updateDuration(): void {
    let maxEnd = 0;
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        if (clip.endTime > maxEnd) {
          maxEnd = clip.endTime;
        }
      }
    }
    this.state.duration = maxEnd;
    this.emit('durationChanged', { duration: this.state.duration });
  }

  setCurrentTime(time: number): void {
    this.state.currentTime = Math.max(0, Math.min(time, this.state.duration));
    this.emit('timeChanged', { currentTime: this.state.currentTime });
  }

  play(): void {
    this.state.isPlaying = true;
    this.emit('playbackStarted', {});
  }

  pause(): void {
    this.state.isPlaying = false;
    this.emit('playbackPaused', {});
  }

  stop(): void {
    this.state.isPlaying = false;
    this.state.currentTime = 0;
    this.emit('playbackStopped', {});
  }

  setPlaybackRate(rate: number): void {
    this.state.playbackRate = Math.max(0.25, Math.min(4, rate));
    this.emit('playbackRateChanged', { rate: this.state.playbackRate });
  }

  getClipsAtTime(time: number): TimelineClip[] {
    const clips: TimelineClip[] = [];
    for (const track of this.state.tracks) {
      for (const clip of track.clips) {
        if (time >= clip.startTime && time < clip.endTime) {
          clips.push(clip);
        }
      }
    }
    return clips;
  }

  getState(): TimelineState {
    return { ...this.state };
  }

  exportTimeline(): object {
    return {
      tracks: this.state.tracks,
      duration: this.state.duration
    };
  }

  importTimeline(data: { tracks: TimelineTrack[] }): void {
    this.state.tracks = data.tracks.map(t => TimelineTrackSchema.parse(t));
    this.updateDuration();
    this.emit('timelineImported', {});
  }

  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  private emit(event: string, data: object): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(cb => cb(data));
    }
  }
}

export { TimelineClipSchema, TimelineTrackSchema, type TimelineClip, type TimelineTrack, type TimelineState };
