/**
 * Workspace types for organization and personal account management
 */

/**
 * Workspace type
 */
export type WorkspaceType = 'organization' | 'personal';

/**
 * Workspace role for access control
 */
export type WorkspaceRole = 'admin' | 'member';

/**
 * Workspace represents either an organization or personal account
 */
export interface Workspace {
  /** Unique identifier */
  id: string;
  /** Workspace type */
  type: WorkspaceType;
  /** Display name */
  name: string;
  /** URL-safe identifier */
  slug: string;
  /** Owner user ID (for personal) or GitHub org ID */
  ownerId: string;
  /** Workspace avatar URL */
  avatarUrl?: string;
  /** Creation timestamp */
  createdAt: Date;
}

/**
 * User's access to a workspace with role
 */
export interface WorkspaceMembership {
  /** Unique identifier */
  id: string;
  /** Reference to Workspace */
  workspaceId: string;
  /** Reference to User */
  userId: string;
  /** User's role in workspace */
  role: WorkspaceRole;
  /** How role was determined */
  source: 'github_org' | 'owner' | 'collaborator';
  /** When role was last verified */
  cachedAt: Date;
  /** When cache expires */
  expiresAt: Date;
}

/**
 * Personal GitHub OAuth connection for a user
 * Stored at: users/{userId}/personalGitHub/connection
 */
export interface PersonalGitHubConnection {
  /** Encrypted GitHub OAuth access token */
  accessToken: string;
  /** OAuth refresh token (if available) */
  refreshToken?: string;
  /** Connected GitHub username */
  githubUsername: string;
  /** Connected GitHub user ID */
  githubId: number;
  /** When the connection was established */
  connectedAt: Date;
  /** OAuth scopes granted (e.g., "repo,read:user") */
  scope: string;
  /** Token expiration timestamp (if applicable) */
  expiresAt?: Date;
}

/**
 * User's workspace preference for an organization
 * Stored at: users/{userId}/workspacePreferences/{orgName}
 */
export interface WorkspacePreference {
  /** Selected workspace: "organization" or "personal" */
  workspace: WorkspaceType;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Workspace context for the current user session
 */
export interface WorkspaceContext {
  /** Currently selected workspace type */
  currentWorkspace: WorkspaceType;
  /** Whether user has personal GitHub connected */
  hasPersonalGitHub: boolean;
  /** Personal GitHub username if connected */
  personalGitHubUsername?: string;
}

/**
 * Personal GitHub connection status
 */
export interface PersonalGitHubStatus {
  /** Whether personal GitHub is connected */
  connected: boolean;
  /** Connected GitHub username (if connected) - alias for githubUsername */
  username?: string;
  /** Connected GitHub username (if connected) */
  githubUsername?: string;
  /** When connected (if connected) */
  connectedAt?: Date;
  /** OAuth scopes granted */
  scope?: string;
}
