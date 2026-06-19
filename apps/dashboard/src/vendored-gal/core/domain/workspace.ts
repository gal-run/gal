/**
 * Workspace domain entity - Rich entity with business logic
 * Represents either an organization or personal account
 */

import type { WorkspaceType } from '@gal/types';

export class Workspace {
  constructor(
    public readonly id: string,
    public readonly type: WorkspaceType,
    public readonly name: string,
    public readonly slug: string,
    public readonly ownerId: string,
    public readonly avatarUrl: string | undefined,
    public readonly createdAt: Date = new Date()
  ) {}

  /**
   * Check if workspace is an organization
   */
  isOrganization(): boolean {
    return this.type === 'organization';
  }

  /**
   * Check if workspace is a personal account
   */
  isPersonal(): boolean {
    return this.type === 'personal';
  }

  /**
   * Check if user is the workspace owner
   */
  isOwner(userId: string): boolean {
    return this.ownerId === userId;
  }

  /**
   * Get display information for UI
   */
  getDisplayInfo(): { name: string; slug: string; avatarUrl?: string } {
    const result: { name: string; slug: string; avatarUrl?: string } = {
      name: this.name,
      slug: this.slug,
    };

    // Only add avatarUrl if it's defined (exactOptionalPropertyTypes compliance)
    if (this.avatarUrl !== undefined) {
      result.avatarUrl = this.avatarUrl;
    }

    return result;
  }

  /**
   * Validate slug format (URL-safe)
   */
  static isValidSlug(slug: string): boolean {
    return /^[a-z0-9-_]+$/.test(slug);
  }

  /**
   * Generate slug from name
   */
  static generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
