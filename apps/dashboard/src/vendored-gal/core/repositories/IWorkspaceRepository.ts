import type { Workspace, WorkspaceMembership } from '@gal/types';

/**
 * Workspace repository interface
 *
 * Manages workspaces (organizations and personal accounts) and memberships.
 * Workspaces represent GitHub organizations or personal accounts that users can access.
 *
 * Implementations: FirestoreWorkspaceRepository (API)
 */
export interface IWorkspaceRepository {
  // ─────────────────────────────────────────────────────────────────
  // Workspace Queries
  // ─────────────────────────────────────────────────────────────────

  /**
   * Find workspace by ID
   */
  findById(workspaceId: string): Promise<Workspace | null>;

  /**
   * Find workspace by slug (URL-safe identifier)
   */
  findBySlug(slug: string): Promise<Workspace | null>;

  /**
   * Find all workspaces owned by a user
   * (Personal workspaces only - user is the owner)
   */
  findByOwnerId(ownerId: string): Promise<Workspace[]>;

  /**
   * Find all workspaces a user has access to (via memberships)
   */
  findByUserId(userId: string): Promise<Workspace[]>;

  /**
   * Check if a workspace exists
   */
  exists(workspaceId: string): Promise<boolean>;

  // ─────────────────────────────────────────────────────────────────
  // Workspace Commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Create a new workspace
   */
  create(workspace: Workspace): Promise<void>;

  /**
   * Update an existing workspace
   */
  update(workspace: Workspace): Promise<void>;

  /**
   * Delete a workspace
   */
  delete(workspaceId: string): Promise<void>;

  // ─────────────────────────────────────────────────────────────────
  // Membership Queries
  // ─────────────────────────────────────────────────────────────────

  /**
   * Find membership by ID
   */
  findMembershipById(membershipId: string): Promise<WorkspaceMembership | null>;

  /**
   * Find all memberships for a workspace
   */
  findMembershipsByWorkspace(workspaceId: string): Promise<WorkspaceMembership[]>;

  /**
   * Find all memberships for a user
   */
  findMembershipsByUser(userId: string): Promise<WorkspaceMembership[]>;

  /**
   * Find a user's membership in a specific workspace
   */
  findMembership(workspaceId: string, userId: string): Promise<WorkspaceMembership | null>;

  /**
   * Check if a user is a member of a workspace
   */
  isMember(workspaceId: string, userId: string): Promise<boolean>;

  /**
   * Check if a user is an admin of a workspace
   */
  isAdmin(workspaceId: string, userId: string): Promise<boolean>;

  // ─────────────────────────────────────────────────────────────────
  // Membership Commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Create a new membership
   */
  createMembership(membership: WorkspaceMembership): Promise<void>;

  /**
   * Update an existing membership
   */
  updateMembership(membership: WorkspaceMembership): Promise<void>;

  /**
   * Delete a membership
   */
  deleteMembership(membershipId: string): Promise<void>;

  /**
   * Delete all memberships for a workspace
   * (Used when deleting a workspace)
   */
  deleteMembershipsByWorkspace(workspaceId: string): Promise<void>;

  /**
   * Delete all memberships for a user
   * (Used when deleting a user)
   */
  deleteMembershipsByUser(userId: string): Promise<void>;
}
