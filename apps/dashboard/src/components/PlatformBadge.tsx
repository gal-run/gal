'use client'

import { Code2, Github, Sparkles, Zap, Wind, Orbit } from 'lucide-react'
import type { AgentPlatform } from '@/lib/api'

interface PlatformBadgeProps {
  platform: AgentPlatform
  count?: number
  size?: 'sm' | 'md' | 'lg'
}

// GAL-395: Added GitHub Copilot support
const PLATFORM_CONFIG = {
  claude: {
    name: 'Claude',
    icon: Sparkles,
    color: 'text-[var(--status-warning-text)]',
    bg: 'bg-[var(--status-warning-light)]',
    border: 'border-[var(--status-warning-text)]/30',
  },
  cursor: {
    name: 'Cursor',
    icon: Code2,
    color: 'text-[var(--status-info-text)]',
    bg: 'bg-[var(--status-info-light)]',
    border: 'border-[var(--status-info-text)]/30',
  },
  copilot: {
    name: 'Copilot',
    icon: Github,
    color: 'text-[var(--brand-copilot)]',
    bg: 'bg-[var(--brand-copilot-bg)]',
    border: 'border-[var(--brand-copilot-border)]',
  },
  gemini: {
    name: 'Gemini',
    icon: Sparkles,
    color: 'text-[var(--brand-gemini)]',
    bg: 'bg-[var(--brand-gemini-bg)]',
    border: 'border-[var(--brand-gemini-border)]',
  },
  codex: {
    name: 'Codex',
    icon: Zap,
    color: 'text-[var(--status-success-text)]',
    bg: 'bg-[var(--status-success-light)]',
    border: 'border-[var(--status-success-text)]/30',
  },
  windsurf: {
    name: 'Windsurf',
    icon: Wind,
    color: 'text-[var(--brand-windsurf)]',
    bg: 'bg-[var(--brand-windsurf-bg)]',
    border: 'border-[var(--brand-windsurf-border)]',
  },
  antigravity: {
    name: 'Antigravity',
    icon: Orbit,
    color: 'text-[var(--text-secondary)]',
    bg: 'bg-[var(--surface-raised)]',
    border: 'border-[var(--border-default)]',
  },
  amp: {
    name: 'Amp',
    icon: Zap,
    color: 'text-[var(--text-secondary)]',
    bg: 'bg-[var(--surface-raised)]',
    border: 'border-[var(--border-default)]',
  },
  'codex-cloud': {
    name: 'Codex Cloud',
    icon: Zap,
    color: 'text-[var(--status-success-text)]',
    bg: 'bg-[var(--status-success-light)]',
    border: 'border-[var(--status-success-text)]/30',
  },
  'ai-studio': {
    name: 'AI Studio',
    icon: Sparkles,
    color: 'text-[var(--text-secondary)]',
    bg: 'bg-[var(--surface-raised)]',
    border: 'border-[var(--border-default)]',
  },
  kling: {
    name: 'Kling',
    icon: Orbit,
    color: 'text-[var(--text-secondary)]',
    bg: 'bg-[var(--surface-raised)]',
    border: 'border-[var(--border-default)]',
  },
  higgsfield: {
    name: 'Higgsfield',
    icon: Orbit,
    color: 'text-[var(--text-secondary)]',
    bg: 'bg-[var(--surface-raised)]',
    border: 'border-[var(--border-default)]',
  },
  jules: {
    name: 'Jules',
    icon: Zap,
    color: 'text-[var(--text-secondary)]',
    bg: 'bg-[var(--surface-raised)]',
    border: 'border-[var(--border-default)]',
  },
  'gal-code': {
    name: 'GAL Code',
    icon: Code2,
    color: 'text-[var(--text-secondary)]',
    bg: 'bg-[var(--surface-raised)]',
    border: 'border-[var(--border-default)]',
  },
}

export function PlatformBadge({ platform, count, size = 'md' }: PlatformBadgeProps) {
  const config = PLATFORM_CONFIG[platform]
  const Icon = config.icon

  const sizeClasses = {
    sm: {
      container: 'px-2 py-1',
      icon: 'w-3 h-3',
      text: 'text-xs',
    },
    md: {
      container: 'px-3 py-1.5',
      icon: 'w-4 h-4',
      text: 'text-sm',
    },
    lg: {
      container: 'px-4 py-2',
      icon: 'w-5 h-5',
      text: 'text-base',
    },
  }

  const classes = sizeClasses[size]

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border ${config.bg} ${config.border} ${classes.container}`}
    >
      <Icon className={`${config.color} ${classes.icon}`} />
      <span className={`font-medium ${config.color} ${classes.text}`}>
        {config.name}
      </span>
      {count !== undefined && (
        <span className={`font-semibold ${config.color} ${classes.text}`}>
          {count}
        </span>
      )}
    </div>
  )
}

export function PlatformIcon({ platform, className = 'w-4 h-4' }: { platform: AgentPlatform; className?: string }) {
  const config = PLATFORM_CONFIG[platform]
  const Icon = config.icon
  return <Icon className={`${config.color} ${className}`} />
}
