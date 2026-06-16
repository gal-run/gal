/**
 * User Context Types - Phase 1: Unified UX
 *
 * Feature: API-First User Experience (GitHub Issue #1044)
 * Spec: docs/features/gal/convenience/unified-experience-spec.md
 *
 * User capabilities are DETECTED from GitHub permissions, NOT self-declared.
 */

/**
 * Organization-specific capabilities derived from GitHub role
 */
export interface OrgCapabilities {
  /** Can set org-wide approved config (admins only) */
  canManageApprovedConfig: boolean;
  /** Can run discovery scans (admins only) */
  canRunDiscovery: boolean;
  /** Can manage team roles (admins only) */
  canManageTeam: boolean;
  /** Can sync org approved config (all members) */
  canSyncConfig: boolean;
  /** Can change team member roles (owners only) */
  canChangeRoles: boolean;
  /** Can manage billing settings (owners only) */
  canManageBilling: boolean;
}

/**
 * Repository-specific capabilities derived from repo permissions
 */
export interface RepoCapabilities {
  /** Can manage repo-level config overrides (repo admins only) */
  canManageConfig: boolean;
}

/**
 * Organization with detected capabilities
 */
export interface UserOrg {
  /** Organization ID */
  id: string;
  /** Organization name (GitHub login) */
  name: string;
  /** User's GitHub role in this org */
  githubRole: 'admin' | 'member';
  /** Derived capabilities based on role */
  capabilities: OrgCapabilities;
  /** Whether org has approved config set */
  approvedConfigExists?: boolean;
  /** Last discovery scan timestamp */
  lastDiscoveryScan?: string | null;
}

/**
 * Repository with detected capabilities
 */
export interface UserRepo {
  /** Repository owner */
  owner: string;
  /** Repository name */
  name: string;
  /** User's permission level */
  permission: 'admin' | 'write' | 'read';
  /** Derived capabilities based on permission */
  capabilities: RepoCapabilities;
}

/**
 * Onboarding status summary
 */
export interface OnboardingStatusSummary {
  /** Whether onboarding is completed */
  completed: boolean;
  /** CLI installed and verified */
  cliInstalled: boolean;
  /** VS Code extension installed */
  extensionInstalled: boolean;
  /** GitHub OAuth connected */
  githubConnected: boolean;
}

/**
 * Recommended action for user
 */
export interface RecommendedAction {
  /** Action type */
  type: 'set_org_config' | 'run_discovery' | 'sync_config' | 'install_cli' | 'connect_github';
  /** Action title */
  title: string;
  /** Action description */
  description: string;
  /** URL to navigate to */
  url: string;
  /** Priority level */
  priority?: 'high' | 'medium' | 'low';
}

/**
 * User context response - single source of truth for capabilities
 */
export interface UserContextResponse {
  /** User information */
  user: {
    id: string;
    githubLogin: string;
    email: string;
    avatarUrl: string;
  };
  /** Organizations with detected capabilities */
  orgs: UserOrg[];
  /** Repositories with detected capabilities */
  repos: UserRepo[];
  /** Onboarding status */
  onboardingStatus: OnboardingStatusSummary;
  /** Recommended next actions */
  recommendedActions: RecommendedAction[];
}
