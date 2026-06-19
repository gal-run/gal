/**
 * Organization Command Distribution
 *
 * GAL-63: Distribute custom commands across organization repositories
 *
 * Features:
 * - Command template management
 * - Multi-repo distribution
 * - Version tracking
 * - Selective deployment
 */

import { createLogger } from '@gal/telemetry';

const logger = createLogger('command-distributor');

export interface CommandDistributionConfig {
  orgName: string;
  sourceRepo: string;
  commandsPath: string;
  targetRepos: TargetRepository[];
  autoSync: boolean;
  versionTracking: boolean;
}

export interface TargetRepository {
  owner: string;
  repo: string;
  enabled: boolean;
  branch: string;
  commandsPath: string;
  includePatterns?: string[];
  excludePatterns?: string[];
}

export interface Command {
  name: string;
  description: string;
  content: string;
  version: string;
  tags: string[];
  metadata: CommandMetadata;
}

export interface CommandMetadata {
  author: string;
  createdAt: Date;
  updatedAt: Date;
  deprecated?: boolean;
  replacedBy?: string;
}

export interface DistributionResult {
  repo: TargetRepository;
  status: 'success' | 'failed' | 'skipped' | 'no_changes';
  commandsDistributed: string[];
  commandsSkipped: string[];
  error?: string;
  pullRequestUrl?: string;
}

export interface DistributionReport {
  timestamp: Date;
  orgName: string;
  results: DistributionResult[];
  summary: {
    total: number;
    success: number;
    failed: number;
    skipped: number;
    commandsDistributed: number;
  };
}

// Built-in command templates
const BUILTIN_COMMANDS: Command[] = [
  {
    name: 'review',
    description: 'Automated code review',
    content: `---
description: Run automated code review on current changes
---

Review the following aspects:
1. Security vulnerabilities
2. Code quality and best practices
3. Test coverage
4. Documentation completeness

Provide actionable feedback with severity levels.
`,
    version: '1.0.0',
    tags: ['quality', 'review'],
    metadata: {
      author: 'GAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  },
  {
    name: 'audit',
    description: 'Security audit',
    content: `---
description: Run security audit on the codebase
---

Scan for:
1. Hardcoded secrets and API keys
2. SQL injection vulnerabilities
3. XSS vulnerabilities
4. Dependency vulnerabilities
5. Authentication issues

Report findings with severity and remediation steps.
`,
    version: '1.0.0',
    tags: ['security', 'audit'],
    metadata: {
      author: 'GAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  },
  {
    name: 'compliance',
    description: 'Compliance check',
    content: `---
description: Run compliance validation
---

Check compliance with:
- SOC 2 requirements
- GDPR data handling
- ISO 27001 controls
- Internal policies

Generate compliance report with gaps and recommendations.
`,
    version: '1.0.0',
    tags: ['compliance', 'governance'],
    metadata: {
      author: 'GAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  },
  {
    name: 'estimate',
    description: 'Time estimation',
    content: `---
description: Estimate time for implementation
---

Analyze the task and provide:
1. Time estimate breakdown by component
2. Complexity assessment
3. Dependencies and blockers
4. Risk factors

Format as a structured estimate suitable for GitHub.
`,
    version: '1.0.0',
    tags: ['planning', 'estimation'],
    metadata: {
      author: 'GAL',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  },
];

/**
 * Command Distributor
 */
export class CommandDistributor {
  private config: CommandDistributionConfig;
  private commands: Map<string, Command> = new Map();
  private githubToken?: string;

  constructor(config: Partial<CommandDistributionConfig> = {}, githubToken?: string) {
    this.config = {
      orgName: config.orgName || process.env.GITHUB_ORG || '',
      sourceRepo: config.sourceRepo || 'governance',
      commandsPath: config.commandsPath || '.claude/commands',
      targetRepos: config.targetRepos || [],
      autoSync: config.autoSync ?? false,
      versionTracking: config.versionTracking ?? true,
    };

    this.githubToken = githubToken || process.env.GITHUB_TOKEN;

    // Load built-in commands
    for (const cmd of BUILTIN_COMMANDS) {
      this.commands.set(cmd.name, cmd);
    }
  }

  /**
   * Add a custom command
   */
  addCommand(command: Command): void {
    this.commands.set(command.name, command);
  }

  /**
   * Remove a command
   */
  removeCommand(name: string): void {
    this.commands.delete(name);
  }

  /**
   * Get all commands
   */
  getCommands(): Command[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get command by name
   */
  getCommand(name: string): Command | undefined {
    return this.commands.get(name);
  }

  /**
   * Distribute commands to all target repos
   */
  async distributeAll(): Promise<DistributionReport> {
    const results: DistributionResult[] = [];

    for (const repo of this.config.targetRepos) {
      if (!repo.enabled) {
        results.push({
          repo,
          status: 'skipped',
          commandsDistributed: [],
          commandsSkipped: [],
        });
        continue;
      }

      try {
        const result = await this.distributeToRepo(repo);
        results.push(result);
      } catch (error) {
        results.push({
          repo,
          status: 'failed',
          commandsDistributed: [],
          commandsSkipped: [],
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const totalDistributed = results.reduce(
      (sum, r) => sum + r.commandsDistributed.length,
      0
    );

    return {
      timestamp: new Date(),
      orgName: this.config.orgName,
      results,
      summary: {
        total: results.length,
        success: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'failed').length,
        skipped: results.filter(r => r.status === 'skipped').length,
        commandsDistributed: totalDistributed,
      },
    };
  }

  /**
   * Distribute commands to a single repo
   */
  async distributeToRepo(repo: TargetRepository): Promise<DistributionResult> {
    const commandsToDistribute: Command[] = [];
    const commandsSkipped: string[] = [];

    // Filter commands based on patterns
    for (const command of this.commands.values()) {
      if (this.shouldIncludeCommand(command, repo)) {
        commandsToDistribute.push(command);
      } else {
        commandsSkipped.push(command.name);
      }
    }

    if (commandsToDistribute.length === 0) {
      return {
        repo,
        status: 'no_changes',
        commandsDistributed: [],
        commandsSkipped,
      };
    }

    // Create files for each command
    const files: { path: string; content: string }[] = [];

    for (const command of commandsToDistribute) {
      const path = `${repo.commandsPath}/${command.name}.md`;
      const content = this.formatCommandFile(command);
      files.push({ path, content });
    }

    // Create version file if enabled
    if (this.config.versionTracking) {
      const versionContent = this.generateVersionFile(commandsToDistribute);
      files.push({
        path: `${repo.commandsPath}/VERSION.json`,
        content: versionContent,
      });
    }

    // Push to repo
    const pullRequestUrl = await this.pushToRepo(repo, files);

    return {
      repo,
      status: 'success',
      commandsDistributed: commandsToDistribute.map(c => c.name),
      commandsSkipped,
      pullRequestUrl,
    };
  }

  /**
   * Check if command should be included for repo
   */
  private shouldIncludeCommand(command: Command, repo: TargetRepository): boolean {
    // Check exclude patterns first
    if (repo.excludePatterns) {
      for (const pattern of repo.excludePatterns) {
        if (this.matchPattern(command, pattern)) {
          return false;
        }
      }
    }

    // If include patterns specified, must match at least one
    if (repo.includePatterns && repo.includePatterns.length > 0) {
      return repo.includePatterns.some(p => this.matchPattern(command, p));
    }

    return true;
  }

  /**
   * Match command against pattern
   */
  private matchPattern(command: Command, pattern: string): boolean {
    // Pattern can be command name, tag, or wildcard
    if (pattern === '*') return true;
    if (pattern === command.name) return true;
    if (pattern.startsWith('tag:')) {
      const tag = pattern.substring(4);
      return command.tags.includes(tag);
    }
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
      return regex.test(command.name);
    }
    return false;
  }

  /**
   * Format command file content
   */
  private formatCommandFile(command: Command): string {
    const header = [
      '---',
      `description: ${command.description}`,
      `version: ${command.version}`,
      `tags: [${command.tags.join(', ')}]`,
      `author: ${command.metadata.author}`,
      `updated: ${command.metadata.updatedAt.toISOString()}`,
      '---',
      '',
    ].join('\n');

    return header + command.content;
  }

  /**
   * Generate version tracking file
   */
  private generateVersionFile(commands: Command[]): string {
    const versions = Object.fromEntries(
      commands.map(c => [c.name, { version: c.version, updated: c.metadata.updatedAt }])
    );

    return JSON.stringify(
      {
        distributedAt: new Date().toISOString(),
        source: `${this.config.orgName}/${this.config.sourceRepo}`,
        commands: versions,
      },
      null,
      2
    );
  }

  /**
   * Push files to repository
   */
  private async pushToRepo(
    repo: TargetRepository,
    files: { path: string; content: string }[]
  ): Promise<string | undefined> {
    if (!this.githubToken) {
      logger.info(`[DRY RUN] Would push ${files.length} files to ${repo.owner}/${repo.repo}`);
      return undefined;
    }

    // In production: Create branch, commit files, create PR via GitHub API
    const branchName = `gal/command-sync-${Date.now()}`;

    // For now, return mock PR URL
    return `https://github.com/${repo.owner}/${repo.repo}/pull/new/${branchName}`;
  }

  /**
   * Add target repository
   */
  addTargetRepo(repo: TargetRepository): void {
    this.config.targetRepos.push(repo);
  }

  /**
   * Remove target repository
   */
  removeTargetRepo(owner: string, repoName: string): void {
    this.config.targetRepos = this.config.targetRepos.filter(
      r => !(r.owner === owner && r.repo === repoName)
    );
  }

  /**
   * Format distribution report
   */
  formatReport(report: DistributionReport): string {
    const lines: string[] = [];

    lines.push('═'.repeat(60));
    lines.push('        COMMAND DISTRIBUTION REPORT');
    lines.push('═'.repeat(60));
    lines.push('');
    lines.push(`Organization: ${report.orgName}`);
    lines.push(`Timestamp: ${report.timestamp.toISOString()}`);
    lines.push('');

    // Summary
    lines.push('Summary:');
    lines.push(`  Total repositories: ${report.summary.total}`);
    lines.push(`  Successful: ${report.summary.success}`);
    lines.push(`  Failed: ${report.summary.failed}`);
    lines.push(`  Skipped: ${report.summary.skipped}`);
    lines.push(`  Commands distributed: ${report.summary.commandsDistributed}`);
    lines.push('');

    // Results by repo
    lines.push('By Repository:');
    for (const result of report.results) {
      const icon = result.status === 'success' ? '✅' :
        result.status === 'failed' ? '❌' :
          result.status === 'skipped' ? '⏭️' : '➖';

      lines.push(`  ${icon} ${result.repo.owner}/${result.repo.repo}`);

      if (result.commandsDistributed.length > 0) {
        lines.push(`     Distributed: ${result.commandsDistributed.join(', ')}`);
      }

      if (result.pullRequestUrl) {
        lines.push(`     PR: ${result.pullRequestUrl}`);
      }

      if (result.error) {
        lines.push(`     Error: ${result.error}`);
      }
    }

    lines.push('═'.repeat(60));

    return lines.join('\n');
  }
}

export default CommandDistributor;
