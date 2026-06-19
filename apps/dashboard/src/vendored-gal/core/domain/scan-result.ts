import type { AgentPlatform } from '@gal/types'

// Re-export AgentPlatform for convenience
export type { AgentPlatform }

/**
 * ScanResult domain model - Rich entity with business logic
 */
export class ScanResult {
  constructor(
    public readonly platform: AgentPlatform,
    public readonly owner: string,
    public readonly repo: string,
    public readonly scannedAt: Date,
    public readonly settings?: AgentSettings,
    public readonly rules: AgentRule[] = [],
    public readonly commands: AgentCommand[] = [],
    public readonly hooks: AgentHook[] = [],
    public readonly agents: AgentSubagent[] = [],
    public readonly instructions?: AgentInstructions,
    public readonly cursorRules?: AgentCursorRules,
    public readonly agentsMd?: AgentAgentsMd,
    public readonly geminiMd?: AgentGeminiMd,
    public readonly windsurfRules?: AgentWindsurfRules,
    public readonly copilotInstructions?: AgentCopilotInstructions,
    public readonly mcpConfig?: AgentMcpConfig
  ) {}

  /**
   * Calculate total config count for this scan
   */
  getTotalConfigCount(): number {
    return (
      (this.settings ? 1 : 0) +
      this.rules.length +
      this.commands.length +
      this.hooks.length +
      this.agents.length +
      (this.instructions ? 1 : 0) +
      (this.cursorRules ? 1 : 0) +
      (this.agentsMd ? 1 : 0) +
      (this.geminiMd ? 1 : 0) +
      (this.windsurfRules ? 1 : 0) +
      (this.copilotInstructions ? 1 : 0) +
      (this.mcpConfig ? 1 : 0)
    )
  }

  /**
   * Check if scan found any configurations
   */
  hasConfigurations(): boolean {
    return this.getTotalConfigCount() > 0
  }

  /**
   * Check if scan is fresh (within last 24 hours)
   */
  isFresh(nowDate: Date = new Date()): boolean {
    const age = nowDate.getTime() - this.scannedAt.getTime()
    const oneDayInMs = 24 * 60 * 60 * 1000
    return age < oneDayInMs
  }

  /**
   * Get breakdown of config types
   */
  getConfigBreakdown(): ConfigBreakdown {
    return {
      settings: this.settings ? 1 : 0,
      rules: this.rules.length,
      commands: this.commands.length,
      hooks: this.hooks.length,
      agents: this.agents.length,
      instructions: this.instructions ? 1 : 0,
      cursorRules: this.cursorRules ? 1 : 0,
      agentsMd: this.agentsMd ? 1 : 0,
      geminiMd: this.geminiMd ? 1 : 0,
      windsurfRules: this.windsurfRules ? 1 : 0,
      copilotInstructions: this.copilotInstructions ? 1 : 0,
      mcpConfig: this.mcpConfig ? 1 : 0,
      total: this.getTotalConfigCount(),
    }
  }

  /**
   * Check if repo has specific config type
   */
  hasConfigType(type: ConfigType): boolean {
    switch (type) {
      case 'settings':
        return !!this.settings
      case 'rules':
        return this.rules.length > 0
      case 'commands':
        return this.commands.length > 0
      case 'hooks':
        return this.hooks.length > 0
      case 'agents':
        return this.agents.length > 0
      case 'instructions':
        return !!this.instructions
      case 'cursorRules':
        return !!this.cursorRules
      case 'agentsMd':
        return !!this.agentsMd
      case 'geminiMd':
        return !!this.geminiMd
      case 'windsurfRules':
        return !!this.windsurfRules
      case 'copilotInstructions':
        return !!this.copilotInstructions
      case 'mcpConfig':
        return !!this.mcpConfig
      default:
        return false
    }
  }
}

/**
 * Supporting types for ScanResult
 */
export interface AgentSettings {
  platform: AgentPlatform
  fileName: string
  content: string
  storageUrl?: string
  version: number
  repoName: string
}

export interface AgentRule {
  platform: AgentPlatform
  name: string
  fileName: string
  content: string
  storageUrl?: string
  version: number
  repoName: string
}

export interface AgentCommand {
  platform: AgentPlatform
  name: string
  fileName: string
  content: string
  storageUrl?: string
  version: number
  repoName: string
}

export interface AgentHook {
  platform: AgentPlatform
  name: string
  fileName: string
  type: 'pre_tool_use' | 'post_tool_use' | 'pre_prompt' | 'post_prompt'
  content: string
  storageUrl?: string
  version: number
  repoName: string
}

export interface AgentSubagent {
  platform: AgentPlatform
  name: string
  fileName: string
  content: string
  storageUrl?: string
  version: number
  repoName: string
}

export interface AgentInstructions {
  platform: AgentPlatform
  fileName: string
  content: string
  storageUrl?: string
  version: number
  repoName: string
}

export interface AgentCursorRules {
  platform: AgentPlatform
  fileName: string
  content: string
  storageUrl?: string
  version: number
  repoName: string
}

export interface AgentAgentsMd {
  platform: AgentPlatform
  fileName: string
  content: string
  storageUrl?: string
  version: number
  repoName: string
}

export interface AgentGeminiMd {
  platform: AgentPlatform
  fileName: string
  content: string
  storageUrl?: string
  version: number
  repoName: string
}

export interface AgentWindsurfRules {
  platform: AgentPlatform
  fileName: string
  content: string
  storageUrl?: string
  version: number
  repoName: string
}

export interface AgentCopilotInstructions {
  platform: AgentPlatform
  fileName: string
  content: string
  storageUrl?: string
  version: number
  repoName: string
}

export interface AgentMcpConfig {
  platform: AgentPlatform
  fileName: string
  content: string
  storageUrl?: string
  version: number
  repoName: string
}

export interface ConfigBreakdown {
  settings: number
  rules: number
  commands: number
  hooks: number
  agents: number
  instructions: number
  cursorRules: number
  agentsMd: number
  geminiMd: number
  windsurfRules: number
  copilotInstructions: number
  mcpConfig: number
  total: number
}

export type ConfigType =
  | 'settings'
  | 'rules'
  | 'commands'
  | 'hooks'
  | 'agents'
  | 'instructions'
  | 'cursorRules'
  | 'agentsMd'
  | 'geminiMd'
  | 'windsurfRules'
  | 'copilotInstructions'
  | 'mcpConfig'
