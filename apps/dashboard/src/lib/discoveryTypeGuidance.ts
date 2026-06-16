export interface DiscoveryTypeGuide {
  key:
    | 'instructions'
    | 'commands'
    | 'rules'
    | 'hooks'
    | 'mcp'
    | 'settings'
    | 'subagents'
    | 'skills'
    | 'policies'
    | 'workflows'
    | 'prompts'
    | 'agents'
  label: string
  filterType: string
  description: string
  emptyStateDetails: string[]
}

export const DISCOVERY_TYPE_GUIDES: DiscoveryTypeGuide[] = [
  {
    key: 'instructions',
    label: 'AGENTS.md',
    filterType: 'instructions',
    description: 'Root instruction files for each tool',
    emptyStateDetails: ['Look for AGENTS.md, CLAUDE.md, or GEMINI.md at the repo root.'],
  },
  {
    key: 'commands',
    label: 'Commands',
    filterType: 'command',
    description: '.claude/commands/*.md',
    emptyStateDetails: ['Expected paths include .claude/commands/*.md.'],
  },
  {
    key: 'rules',
    label: 'Rules',
    filterType: 'rule',
    description: '.claude/rules/*.md or .cursor/rules/*.mdc',
    emptyStateDetails: ['Expected paths include .claude/rules/*.md or .cursor/rules/*.mdc.'],
  },
  {
    key: 'hooks',
    label: 'Hooks',
    filterType: 'hook',
    description: '.claude/hooks/*.{js,py,sh,json}',
    emptyStateDetails: ['Expected paths include .claude/hooks/*.{js,py,sh,json}.'],
  },
  {
    key: 'mcp',
    label: 'MCP',
    filterType: 'mcp',
    description: '.mcp.json and embedded Gemini/Codex MCP blocks',
    emptyStateDetails: ['MCP appears from .mcp.json, .cursor/mcp.json, .vscode/mcp.json, or embedded MCP sections in Gemini/Codex configs.'],
  },
  {
    key: 'settings',
    label: 'Settings',
    filterType: 'settings',
    description: 'Platform settings.json / config.toml files',
    emptyStateDetails: ['Settings come from .claude/settings.json, .cursor/settings.json, .windsurf/settings.json, .gemini/settings.json, or .codex/config.toml.'],
  },
  {
    key: 'subagents',
    label: 'Subagents',
    filterType: 'subagent',
    description: '.claude/agents/*.md and .github/agents/*.agent.md',
    emptyStateDetails: ['Subagents come from .claude/agents/*.md and .github/agents/*.agent.md.'],
  },
  {
    key: 'skills',
    label: 'Skills',
    filterType: 'skill',
    description: '.claude/skills/*/SKILL.md and .github/skills/*/SKILL.md',
    emptyStateDetails: ['Skills come from .claude/skills/*/SKILL.md or .github/skills/*/SKILL.md.'],
  },
  {
    key: 'policies',
    label: 'Policies',
    filterType: 'policy',
    description: '.gemini/policies/*.toml or .md',
    emptyStateDetails: ['Policies come from .gemini/policies/*.toml or .gemini/policies/*.md.'],
  },
  {
    key: 'workflows',
    label: 'Workflows',
    filterType: 'workflow',
    description: '.windsurf/workflows/*.md',
    emptyStateDetails: ['Workflows come from .windsurf/workflows/*.md.'],
  },
  {
    key: 'prompts',
    label: 'Prompts',
    filterType: 'prompt',
    description: '.github/prompts/*.prompt.md',
    emptyStateDetails: ['Prompts come from .github/prompts/*.prompt.md.'],
  },
  {
    key: 'agents',
    label: 'Agents',
    filterType: 'agent',
    description: 'Legacy alias; current scans appear under Subagents',
    emptyStateDetails: ['Current scans surface agent files under the Subagents filter. Use Subagents to review .claude/agents/*.md and .github/agents/*.agent.md.'],
  },
]

export function getDiscoveryTypeGuide(filterType: string | null): DiscoveryTypeGuide | null {
  if (!filterType) return null
  return DISCOVERY_TYPE_GUIDES.find((guide) => guide.filterType === filterType) || null
}
