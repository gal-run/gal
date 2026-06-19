import type { IOrganizationRepository } from '../../repositories/IOrganizationRepository'
import type { IScanResultRepository } from '../../repositories/IScanResultRepository'
import { Organization, ConfigStats, PlatformStats } from '../../domain/organization'
import { ScanResult } from '../../domain/scan-result'
import { DomainError } from '../../errors/DomainError'
import type { AgentPlatform } from '../../domain/scan-result'

/**
 * OrganizationService - Business logic for organization management
 *
 * Coordinates between organization and scan result repositories to:
 * - Manage organization lifecycle
 * - Calculate statistics from scan results
 * - Update organization metadata
 */
export class OrganizationService {
  constructor(
    private orgRepository: IOrganizationRepository,
    private scanRepository: IScanResultRepository
  ) {}

  /**
   * Get organization by name
   */
  async getOrganization(name: string): Promise<Organization | null> {
    return this.orgRepository.findByName(name)
  }

  /**
   * List all organizations
   */
  async listOrganizations(): Promise<Organization[]> {
    return this.orgRepository.findAll()
  }

  /**
   * Get organization by GitHub installation ID
   */
  async getOrganizationByInstallationId(
    installationId: number
  ): Promise<Organization | null> {
    return this.orgRepository.findByInstallationId(installationId)
  }

  /**
   * Create a new organization
   */
  async createOrganization(
    name: string,
    installationId: number,
    accountType: 'User' | 'Organization',
    totalRepos: number
  ): Promise<Organization> {
    const org = new Organization(
      name, // id = name
      name,
      installationId,
      accountType,
      totalRepos,
      0, // totalConfigs - will be updated after scan
      0, // totalCommands
      0, // totalHooks
      { storageUrl: `gs://gal-configs/${name}/settings/`, versions: 0 },
      { storageUrl: `gs://gal-configs/${name}/commands/`, count: 0 },
      { storageUrl: `gs://gal-configs/${name}/hooks/`, count: 0 }
    )

    await this.orgRepository.create(org)
    return org
  }

  /**
   * Update organization after scan completion
   *
   * Business logic:
   * 1. Calculate statistics from scan results
   * 2. Update organization with new totals
   * 3. Save scan results to repository
   *
   * @param orgName - Organization name
   * @param scanResults - Scan results to process
   * @param totalReposScanned - Total repos scanned (may be more than repos with configs)
   */
  async updateAfterScan(
    orgName: string,
    scanResults: ScanResult[],
    totalReposScanned?: number
  ): Promise<void> {
    const org = await this.orgRepository.findByName(orgName)
    if (!org) {
      throw new DomainError(`Organization ${orgName} not found`)
    }

    // Calculate statistics from scan results
    const stats = this.calculateConfigStats(scanResults)
    const platformStats = this.calculatePlatformStats(scanResults, orgName)

    // Update organization domain model
    org.totalRepos = totalReposScanned ?? scanResults.length
    org.totalConfigs = stats.totalConfigs
    org.totalCommands = stats.totalCommands
    org.totalHooks = stats.totalHooks
    org.platforms = platformStats
    org.lastScanAt = new Date()
    org.updatedAt = new Date()

    // Persist changes
    await this.orgRepository.update(org)
    await this.scanRepository.saveScanResults(orgName, scanResults)
  }

  /**
   * Delete an organization and all its data
   */
  async deleteOrganization(orgName: string): Promise<void> {
    // Delete scan results first (foreign key constraint)
    await this.scanRepository.deleteByOrganization(orgName)

    // Delete organization
    await this.orgRepository.delete(orgName)
  }

  /**
   * Calculate configuration statistics from scan results
   *
   * Business rules:
   * - Count unique command names (not total command files)
   * - Count unique hook names (not total hook files)
   * - Total configs = sum of all config types across all repos
   * - If no repos scanned, all counts must be 0 (GAL-105 data integrity)
   */
  private calculateConfigStats(scanResults: ScanResult[]): ConfigStats {
    // GAL-105: Ensure all counts are 0 when no repos (data integrity)
    const hasRepos = scanResults.length > 0

    if (!hasRepos) {
      return {
        totalConfigs: 0,
        totalCommands: 0,
        totalHooks: 0,
      }
    }

    // Track unique command and hook names (deduplication)
    const commandNames = new Set<string>()
    const hookNames = new Set<string>()
    let totalConfigs = 0

    for (const result of scanResults) {
      // Count configs for this repo
      const repoConfigCount = result.getTotalConfigCount()
      totalConfigs += repoConfigCount

      // Collect unique command names (across all repos)
      for (const command of result.commands) {
        commandNames.add(command.name)
      }

      // Collect unique hook names (across all repos)
      for (const hook of result.hooks) {
        hookNames.add(hook.name)
      }
    }

    return {
      totalConfigs,
      totalCommands: commandNames.size,
      totalHooks: hookNames.size,
    }
  }

  /**
   * Calculate platform-specific statistics from scan results
   *
   * Aggregates counts per platform (claude, cursor, etc.) including:
   * - Settings count
   * - Rules count
   * - Commands count
   * - Hooks count
   * - Agents count
   * - Platform instruction file presence (CLAUDE.md, GEMINI.md, AGENTS.md, etc.)
   * - .cursorrules presence
   * - Total configs per platform
   */
  private calculatePlatformStats(
    scanResults: ScanResult[],
    orgName: string
  ): Record<AgentPlatform, PlatformStats> {
    // Initialize stats for all platforms
    const platforms: Record<AgentPlatform, PlatformStats> = {
      claude: this.createEmptyPlatformStats(orgName, 'claude'),
      cursor: this.createEmptyPlatformStats(orgName, 'cursor'),
      copilot: this.createEmptyPlatformStats(orgName, 'copilot'),
      gemini: this.createEmptyPlatformStats(orgName, 'gemini'),
      codex: this.createEmptyPlatformStats(orgName, 'codex'),
      windsurf: this.createEmptyPlatformStats(orgName, 'windsurf'),
      antigravity: this.createEmptyPlatformStats(orgName, 'antigravity'),
      amp: this.createEmptyPlatformStats(orgName, 'amp'),
      'ai-studio': this.createEmptyPlatformStats(orgName, 'ai-studio'),
      'codex-cloud': this.createEmptyPlatformStats(orgName, 'codex-cloud'),
      kling: this.createEmptyPlatformStats(orgName, 'kling'),
      higgsfield: this.createEmptyPlatformStats(orgName, 'higgsfield'),
      jules: this.createEmptyPlatformStats(orgName, 'jules'),
      'gal-code': this.createEmptyPlatformStats(orgName, 'gal-code'),
    }

    // Aggregate counts per platform
    for (const result of scanResults) {
      // Non-null assertion safe because we initialized all platforms above
      const platformStats = platforms[result.platform]!

      if (result.settings) {
        platformStats.settingsCount++
      }

      platformStats.rulesCount += result.rules.length
      platformStats.commandsCount += result.commands.length
      platformStats.hooksCount += result.hooks.length
      platformStats.agentsCount += result.agents.length

      if (result.instructions) {
        platformStats.instructionsCount++
      }

      if (result.cursorRules) {
        platformStats.cursorRulesCount++
      }

      // Total configs for this repo on this platform
      platformStats.totalConfigs += result.getTotalConfigCount()
    }

    return platforms
  }

  /**
   * Create empty platform stats with storage URL
   */
  private createEmptyPlatformStats(
    orgName: string,
    platform: AgentPlatform
  ): PlatformStats {
    return {
      storageUrl: `gs://gal-configs/${orgName}/${platform}/`,
      settingsCount: 0,
      rulesCount: 0,
      commandsCount: 0,
      hooksCount: 0,
      agentsCount: 0,
      instructionsCount: 0,
      cursorRulesCount: 0,
      windsurfRulesCount: 0,
      mcpConfigCount: 0,
      // GAL-395: Copilot-specific counts
      copilotInstructionsCount: 0,
      copilotPathInstructionsCount: 0,
      copilotSkillsCount: 0,
      totalConfigs: 0,
    }
  }
}
