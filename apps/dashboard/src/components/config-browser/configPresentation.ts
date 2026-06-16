const PLATFORM_LABELS: Record<string, string> = {
  claude: 'Claude',
  cursor: 'Cursor',
  copilot: 'Copilot',
  gemini: 'Gemini',
  codex: 'Codex',
  windsurf: 'Windsurf',
  antigravity: 'Antigravity',
  amp: 'Amp',
}

export function getPlatformLabel(platform?: string): string | null {
  if (!platform) return null
  return PLATFORM_LABELS[platform] || null
}

export function getConfigPresentation(input: {
  type: string
  platform?: string
  path?: string
}) {
  const platformLabel = getPlatformLabel(input.platform)
  const defaultMeta = {
    label: input.type,
    icon: '📋',
    platformBadge: platformLabel,
    detail: null as string | null,
  }

  if (input.type === 'instructions') return { ...defaultMeta, label: 'AGENTS.md', icon: '📄' }
  if (input.type === 'command') return { ...defaultMeta, label: 'Command', icon: '⚡' }
  if (input.type === 'workflow') return { ...defaultMeta, label: 'Workflow', icon: '🧭' }
  if (input.type === 'prompt') return { ...defaultMeta, label: 'Prompt', icon: '💬', platformBadge: platformLabel || 'Copilot' }
  if (input.type === 'hook') return { ...defaultMeta, label: 'Hook', icon: '🔗' }
  if (input.type === 'settings') return { ...defaultMeta, label: 'Settings', icon: '⚙️' }
  if (input.type === 'subagent') return { ...defaultMeta, label: 'Subagent', icon: '🤖' }
  if (input.type === 'agent') return { ...defaultMeta, label: 'Agent', icon: '🤖' }
  if (input.type === 'skill') return { ...defaultMeta, label: 'Skill', icon: '🧩' }
  if (input.type === 'policy') return { ...defaultMeta, label: 'Policy', icon: '🛡️' }
  if (input.type === 'rule') return { ...defaultMeta, label: 'Rule', icon: '📏' }

  if (input.type === 'mcp') {
    if (input.path === '.gemini/settings.json') {
      return {
        ...defaultMeta,
        label: 'Embedded MCP',
        icon: '🔌',
        platformBadge: 'Gemini',
        detail: 'Extracted from .gemini/settings.json',
      }
    }
    if (input.path === '.codex/config.toml') {
      return {
        ...defaultMeta,
        label: 'Embedded MCP',
        icon: '🔌',
        platformBadge: 'Codex',
        detail: 'Extracted from .codex/config.toml',
      }
    }
    return { ...defaultMeta, label: 'MCP Config', icon: '🔌' }
  }

  return defaultMeta
}
