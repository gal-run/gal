/**
 * Design Project Types - run-design creative production pipeline (Issue #3612)
 */

export type DesignProjectType = 'image-only' | 'image-video' | 'story';

export type ImageStatus = 'pending' | 'generating' | 'done' | 'needs-regen';

export type VideoStatus = 'pending' | 'generating' | 'done' | 'needs-regen' | 'not-needed';

export interface SceneAssets {
  imageUrl?: string;
  imagePlatform?: string;
  videoUrl?: string;
  videoPlatform?: string;
}

export interface SceneStatus {
  image: ImageStatus;
  video: VideoStatus;
}

export interface Scene {
  id: string;
  order: number;
  description: string;
  referenceImageUrl?: string;
  status: SceneStatus;
  assets: SceneAssets;
  prompt?: string;
  notes?: string;
}

export interface DesignProjectMetadata {
  client?: string;
  deadline?: string;
  notes?: string;
}

export interface DesignProject {
  id: string;
  name: string;
  type: DesignProjectType;
  createdAt: string;
  scenes: Scene[];
  metadata: DesignProjectMetadata;
}

/**
 * Summary of active design project for Chrome extension status card
 */
export interface ActiveDesignProjectSummary {
  id: string;
  name: string;
  type: DesignProjectType;
  totalScenes: number;
  completedScenes: number;
}
