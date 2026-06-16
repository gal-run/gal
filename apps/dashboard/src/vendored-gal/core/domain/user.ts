/**
 * User domain model - Rich entity with business logic
 * Updated for unified auth: supports multiple auth providers
 */

import type { AuthProvider } from '@gal/types';

export class User {
  constructor(
    // Legacy GitHub fields (backward compatible)
    public readonly githubId: number,
    public readonly login: string,
    public readonly email: string | null,
    public readonly name: string | null,
    public readonly avatarUrl: string,
    public organizations: string[],
    public adminOrganizations: string[],
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date(),
    // New unified auth fields
    public providers: AuthProvider[] = []
  ) {
    // If providers is empty but we have GitHub data, create default GitHub provider
    if (providers.length === 0 && githubId > 0) {
      this.providers = [
        {
          type: 'github',
          providerId: String(githubId),
          email: email || '',
          displayName: name || login,
          avatarUrl: avatarUrl,
          connectedAt: createdAt,
        },
      ];
    }
  }

  /**
   * Check if user is admin of a specific organization
   */
  isAdminOf(orgName: string): boolean {
    return this.adminOrganizations.includes(orgName);
  }

  /**
   * Check if user has access to a specific organization
   */
  hasAccessTo(orgName: string): boolean {
    return this.organizations.includes(orgName);
  }

  /**
   * Add organization to user's access list
   */
  addOrganization(orgName: string, isAdmin: boolean = false): void {
    if (!this.organizations.includes(orgName)) {
      this.organizations.push(orgName);
    }
    if (isAdmin && !this.adminOrganizations.includes(orgName)) {
      this.adminOrganizations.push(orgName);
    }
    this.updatedAt = new Date();
  }

  /**
   * Remove organization from user's access list
   */
  removeOrganization(orgName: string): void {
    this.organizations = this.organizations.filter((org) => org !== orgName);
    this.adminOrganizations = this.adminOrganizations.filter(
      (org) => org !== orgName
    );
    this.updatedAt = new Date();
  }

  /**
   * Promote user to admin for an organization
   */
  promoteToAdmin(orgName: string): void {
    if (!this.organizations.includes(orgName)) {
      throw new Error(
        `Cannot promote to admin: User does not have access to ${orgName}`
      );
    }
    if (!this.adminOrganizations.includes(orgName)) {
      this.adminOrganizations.push(orgName);
      this.updatedAt = new Date();
    }
  }

  /**
   * Demote user from admin for an organization
   */
  demoteFromAdmin(orgName: string): void {
    this.adminOrganizations = this.adminOrganizations.filter(
      (org) => org !== orgName
    );
    this.updatedAt = new Date();
  }

  /**
   * Get all organizations user is admin of
   */
  getAdminOrganizations(): string[] {
    return [...this.adminOrganizations];
  }

  /**
   * Get all organizations user has access to
   */
  getAllOrganizations(): string[] {
    return [...this.organizations];
  }

  // ============================================================================
  // Unified Auth Methods
  // ============================================================================

  /**
   * Check if user has a specific provider linked
   */
  hasProvider(providerType: 'github' | 'google' | 'email'): boolean {
    return this.providers.some((p) => p.type === providerType);
  }

  /**
   * Get provider by type
   */
  getProvider(providerType: 'github' | 'google' | 'email'): AuthProvider | undefined {
    return this.providers.find((p) => p.type === providerType);
  }

  /**
   * Link a new authentication provider
   */
  linkProvider(provider: AuthProvider): void {
    // Check if provider already exists
    const existingIndex = this.providers.findIndex(
      (p) => p.type === provider.type
    );

    if (existingIndex >= 0) {
      // Update existing provider
      this.providers[existingIndex] = provider;
    } else {
      // Add new provider
      this.providers.push(provider);
    }

    this.updatedAt = new Date();
  }

  /**
   * Unlink an authentication provider
   */
  unlinkProvider(providerType: 'github' | 'google' | 'email'): void {
    // Require at least one provider to remain
    if (this.providers.length <= 1) {
      throw new Error(
        'Cannot unlink last provider. User must have at least one authentication method.'
      );
    }

    this.providers = this.providers.filter((p) => p.type !== providerType);
    this.updatedAt = new Date();
  }

  /**
   * Get primary email (from any provider)
   */
  getPrimaryEmail(): string | null {
    // Prefer verified email field
    if (this.email) return this.email;

    // Otherwise get from first provider with email
    const providerWithEmail = this.providers.find((p) => p.email);
    return providerWithEmail?.email || null;
  }

  /**
   * Get display name (from name or login)
   */
  getDisplayName(): string {
    return this.name || this.login;
  }

  /**
   * Check if user has multiple auth providers linked
   */
  hasMultipleProviders(): boolean {
    return this.providers.length > 1;
  }
}
