import type { AgentPlatform } from '@gal/types'

/**
 * Organization domain model - Rich entity with business logic
 */
export class Organization {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly installationId: number,
    public readonly accountType: 'User' | 'Organization',
    public totalRepos: number,
    public totalConfigs: number,
    public totalCommands: number,
    public totalHooks: number,
    public readonly settings: {
      storageUrl: string
      versions: number
    },
    public readonly commands: {
      storageUrl: string
      count: number
    },
    public readonly hooks: {
      storageUrl: string
      count: number
    },
    public platforms?: Record<AgentPlatform, PlatformStats>,
    public hookSettings?: HookSettings,
    public planTier?: 'free' | 'convenience' | 'enforcement' | 'enterprise',
    public seatLimit?: number,
    public stripeCustomerId?: string,
    public stripeSubscriptionId?: string,
    public manualGrant?: ManualGrant,
    public configRepoEnabled?: boolean,
    public configRepoUrl?: string,
    public configRepoCreatedAt?: string,
    public lastConfigSyncAt?: string,
    public lastScanAt?: Date,
    public audienceTierRef?: any | null,
    public audienceTierSource?: 'stripe' | 'admin' | null,
    public entitledFeatures?: string[] | null,
    public installedByGithubId?: number,
    public installedByLogin?: string,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date(),
    /** #4202: GitHub org member count, synced via organization.member_added/removed webhooks */
    public memberCount?: number,
  ) {}

  /**
   * Check if a new team member can be added based on plan limits
   */
  canAddTeamMember(currentTeamSize: number, planLimit: number): boolean {
    if (!this.seatLimit) return true // No limit set
    return currentTeamSize < planLimit
  }

  /**
   * Calculate aggregate config statistics
   */
  calculateConfigStats(): ConfigStats {
    return {
      totalConfigs: this.totalConfigs,
      totalCommands: this.totalCommands,
      totalHooks: this.totalHooks,
    }
  }

  /**
   * Check if organization has billing configured
   */
  hasBillingConfigured(): boolean {
    return !!this.stripeCustomerId
  }

  /**
   * Check if organization has active subscription
   */
  hasActiveSubscription(): boolean {
    return !!this.stripeSubscriptionId
  }

  /**
   * Check if organization was manually granted access
   * @deprecated Use hasActiveSubscription() instead. manualGrant is replaced by Stripe subscriptions (#3115).
   */
  isManuallyGranted(): boolean {
    return !!this.manualGrant
  }

  /**
   * Check if organization has config repo integration enabled
   */
  hasConfigRepoIntegration(): boolean {
    return this.configRepoEnabled === true && !!this.configRepoUrl
  }

  /**
   * Update scan timestamp
   */
  markScanned(): void {
    this.lastScanAt = new Date()
    this.updatedAt = new Date()
  }

  /**
   * Update config stats after scan
   */
  updateStats(stats: ConfigStats): void {
    this.totalConfigs = stats.totalConfigs
    this.totalCommands = stats.totalCommands
    this.totalHooks = stats.totalHooks
    this.updatedAt = new Date()
  }
}

/**
 * Supporting types for Organization
 */
export interface PlatformStats {
  storageUrl: string
  settingsCount: number
  rulesCount: number
  commandsCount: number
  hooksCount: number
  agentsCount: number
  instructionsCount: number
  cursorRulesCount: number
  windsurfRulesCount: number
  mcpConfigCount: number
  // GAL-395: Copilot-specific counts
  copilotInstructionsCount: number
  copilotPathInstructionsCount: number
  copilotSkillsCount: number
  totalConfigs: number
}

export interface HookSettings {
  globalIntervalMinutes?: number
  intervals?: Partial<Record<ReminderType, number>>
  autoQueueNewIssues?: boolean  // Auto-queue newly created GitHub issues (#2147)
  updatedAt?: Date
  updatedBy?: string
}

export type ReminderType =
  | 'auth-required'
  | 'auth-expired'
  | 'auth-expiring'
  | 'sync-required'
  | 'sync-outdated'
  | 'sync-missing'

/**
 * @deprecated manualGrant is replaced by Stripe subscriptions (#3115).
 * Retained for backward compatibility with existing Firestore documents.
 */
export interface ManualGrant {
  grantedBy: string
  grantedAt: string
  reason: string
}

export interface ConfigStats {
  totalConfigs: number
  totalCommands: number
  totalHooks: number
}
