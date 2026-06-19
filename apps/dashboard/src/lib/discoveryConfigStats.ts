import type { DiscoveredConfigGroup } from '@/lib/api'

export interface DiscoveryConfigTypeStats {
  instructions: number
  commands: number
  hooks: number
  settings: number
  subagents: number
  rules: number
  mcp: number
  skills: number
  policies: number
  workflows: number
  prompts: number
  agents: number
}

export function createEmptyDiscoveryConfigTypeStats(): DiscoveryConfigTypeStats {
  return {
    instructions: 0,
    commands: 0,
    hooks: 0,
    settings: 0,
    subagents: 0,
    rules: 0,
    mcp: 0,
    skills: 0,
    policies: 0,
    workflows: 0,
    prompts: 0,
    agents: 0,
  }
}

export function summarizeDiscoveryConfigTypeStats(
  groups: DiscoveredConfigGroup[],
): DiscoveryConfigTypeStats {
  const stats = createEmptyDiscoveryConfigTypeStats()

  for (const group of groups) {
    if (group.type === 'command') stats.commands += 1
    else if (group.type === 'hook') stats.hooks += 1
    else if (group.type === 'settings') stats.settings += 1
    else if (group.type === 'subagent') stats.subagents += 1
    else if (group.type === 'agent') stats.agents += 1
    else if (group.type === 'instructions') stats.instructions += 1
    else if (group.type === 'rule') stats.rules += 1
    else if (group.type === 'mcp') stats.mcp += 1
    else if (group.type === 'skill') stats.skills += 1
    else if (group.type === 'policy') stats.policies += 1
    else if (group.type === 'workflow') stats.workflows += 1
    else if (group.type === 'prompt') stats.prompts += 1
  }

  return stats
}
