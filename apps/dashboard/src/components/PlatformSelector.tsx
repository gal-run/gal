'use client'

/**
 * GAL-395: Platform Selector Component
 * Allows selecting between AI tool platforms (Claude, Cursor, etc.)
 */

import { Code2, Github, Sparkles, Zap, Wind, Orbit } from 'lucide-react'
import type { AgentPlatform } from '@/lib/api'

interface PlatformSelectorProps {
  selectedPlatform: AgentPlatform
  onPlatformChange: (platform: AgentPlatform) => void
  availablePlatforms?: AgentPlatform[]
  disabled?: boolean
}

// Platform configuration - matches PlatformBadge.tsx
// GAL-395: Added GitHub Copilot support
const PLATFORM_OPTIONS: {
  id: AgentPlatform
  name: string
  icon: typeof Sparkles
  color: string
  bg: string
  border: string
  description: string
}[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    icon: Sparkles,
    color: 'text-[var(--status-warning-text)]',
    bg: 'bg-[var(--status-warning-light)]',
    border: 'border-[var(--status-warning-text)]/30',
    description: 'Anthropic Claude Code configurations',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    icon: Code2,
    color: 'text-[var(--status-info-text)]',
    bg: 'bg-[var(--status-info-light)]',
    border: 'border-[var(--status-info-text)]/30',
    description: 'Cursor AI editor configurations',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    icon: Github,
    color: 'text-[var(--brand-copilot)]',
    bg: 'bg-[var(--brand-copilot-bg)]',
    border: 'border-[var(--brand-copilot-border)]',
    description: 'GitHub Copilot agent configurations',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    icon: Wind,
    color: 'text-[var(--brand-windsurf)]',
    bg: 'bg-[var(--brand-windsurf-bg)]',
    border: 'border-[var(--brand-windsurf-border)]',
    description: 'Windsurf AI editor configurations',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    icon: Sparkles,
    color: 'text-[var(--brand-gemini)]',
    bg: 'bg-[var(--brand-gemini-bg)]',
    border: 'border-[var(--brand-gemini-border)]',
    description: 'Google Gemini configurations',
  },
  {
    id: 'codex',
    name: 'Codex',
    icon: Zap,
    color: 'text-[var(--status-success-text)]',
    bg: 'bg-[var(--status-success-light)]',
    border: 'border-[var(--status-success-text)]/30',
    description: 'OpenAI Codex configurations',
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    icon: Orbit,
    color: 'text-[var(--text-secondary)]',
    bg: 'bg-[var(--surface-raised)]',
    border: 'border-[var(--border-default)]',
    description: 'Antigravity AI configurations',
  },
  {
    id: 'amp',
    name: 'Amp',
    icon: Zap,
    color: 'text-[var(--text-secondary)]',
    bg: 'bg-[var(--surface-raised)]',
    border: 'border-[var(--border-default)]',
    description: 'Amp AI configurations',
  },
]

export function PlatformSelector({
  selectedPlatform,
  onPlatformChange,
  availablePlatforms = ['claude', 'cursor', 'copilot', 'windsurf', 'gemini', 'codex', 'antigravity', 'amp'],
  disabled = false,
}: PlatformSelectorProps) {
  const filteredOptions = PLATFORM_OPTIONS.filter(opt =>
    availablePlatforms.includes(opt.id)
  )

  return (
    <div className="flex gap-2">
      {filteredOptions.map(platform => {
        const Icon = platform.icon
        const isSelected = selectedPlatform === platform.id

        return (
          <button
            key={platform.id}
            onClick={() => onPlatformChange(platform.id)}
            disabled={disabled}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg border transition-all
              ${
                isSelected
                  ? `${platform.bg} ${platform.border} ${platform.color}`
                  : 'bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
            title={platform.description}
          >
            <Icon className={`w-4 h-4 ${isSelected ? platform.color : ''}`} />
            <span className="font-medium">{platform.name}</span>
          </button>
        )
      })}
    </div>
  )
}

// Compact dropdown variant for smaller spaces
export function PlatformDropdown({
  selectedPlatform,
  onPlatformChange,
  availablePlatforms = ['claude', 'cursor', 'copilot', 'windsurf', 'gemini', 'codex', 'antigravity', 'amp'],
  disabled = false,
}: PlatformSelectorProps) {
  const filteredOptions = PLATFORM_OPTIONS.filter(opt =>
    availablePlatforms.includes(opt.id)
  )
  const selected = PLATFORM_OPTIONS.find(p => p.id === selectedPlatform)
  const Icon = selected?.icon || Sparkles

  return (
    <div className="relative">
      <select
        value={selectedPlatform}
        onChange={e => onPlatformChange(e.target.value as AgentPlatform)}
        disabled={disabled}
        className={`
          appearance-none pl-9 pr-8 py-2 rounded-lg border bg-[var(--surface-raised)] text-[var(--text-primary)]
          border-[var(--border-default)] hover:border-[var(--border-default)] focus:border-[var(--status-success)] focus:ring-1 focus:ring-[var(--status-success)]
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {filteredOptions.map(platform => (
          <option key={platform.id} value={platform.id}>
            {platform.name}
          </option>
        ))}
      </select>
      <Icon
        className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${selected?.color || 'text-[var(--text-secondary)]'}`}
      />
    </div>
  )
}
