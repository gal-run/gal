/**
 * User-scope memory sync types.
 *
 * This pipeline mirrors project-specific memory into GAL cloud storage so the
 * same user can reuse it across devices and agent surfaces without publishing
 * it as an organization learning.
 *
 * Storage: organizations/{orgId}/memory/{userId}/projects/{projectKey}
 * Scope: user
 * Format: platform-native Markdown + YAML frontmatter
 * Merge strategy: last-write-wins for index, append-only for topic files
 */

/** User-scope memory only supports user-private mirroring. */
export type MemoryScope = 'user';

/** Where the user memory originated before being mirrored into GAL cloud storage. */
export type UserMemorySourceKind = 'project_memory' | 'global_memory';

/** Cloud storage role for synced user memory. */
export type MemoryStorageKind = 'cloud_mirror';

/** A single memory file (topic file or index) */
export interface MemoryFile {
  /** Relative path within the memory directory (e.g., "project_billing.md") */
  path: string;
  /** Full file content including any YAML frontmatter */
  content: string;
  /** ISO 8601 timestamp of last modification */
  updatedAt: string;
}

/** Request body for POST /api/memory/push */
export interface MemoryPushRequest {
  /** Git remote URL hash — portable project identifier */
  projectKey: string;
  /** Explicitly identifies the user-scope memory pipeline */
  scope?: MemoryScope;
  /** Whether the pushed memory came from project-local or global user memory */
  source?: UserMemorySourceKind;
  /** Memory topic files to sync */
  files: MemoryFile[];
  /** MEMORY.md index content (last-write-wins) */
  index: string;
}

/** Response body for POST /api/memory/push */
export interface MemoryPushResponse {
  /** Whether the sync completed */
  success: true;
  /** Explicitly identifies the user-scope memory pipeline */
  scope: MemoryScope;
  /** GAL stores synced user memory as a cloud mirror */
  storage: MemoryStorageKind;
  /** The origin of the mirrored memory */
  mirroredFrom: UserMemorySourceKind;
  /** ISO 8601 timestamp of last successful sync */
  lastSyncedAt: string;
}

/** Response body for GET /api/memory/pull?projectKey=xxx */
export interface MemoryPullResponse {
  /** Git remote URL hash — portable project identifier */
  projectKey: string;
  /** Explicitly identifies the user-scope memory pipeline */
  scope: MemoryScope;
  /** GAL stores synced user memory as a cloud mirror */
  storage: MemoryStorageKind;
  /** The origin of the last mirrored memory */
  mirroredFrom: UserMemorySourceKind;
  /** All memory topic files for this project */
  files: MemoryFile[];
  /** MEMORY.md index content */
  index: string;
  /** ISO 8601 timestamp of last successful sync */
  lastSyncedAt: string;
}
