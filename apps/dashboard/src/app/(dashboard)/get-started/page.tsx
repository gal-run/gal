'use client'

import { Terminal, Copy, Check, ArrowRight, FileText, Settings, Zap, Bot, Link2, Download } from 'lucide-react'
import { useState, useMemo } from 'react'
import { getCliInstallCommand } from '@/lib/config'

function CLITool() {
  const [copied, setCopied] = useState<string | null>(null)

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  // Get environment-specific CLI install command
  const cliInstallCmd = useMemo(() => getCliInstallCommand(), [])

  const steps = [
    {
      step: 1,
      title: 'Install',
      description: 'One-time global installation',
      cmd: cliInstallCmd,
      id: 'install',
    },
    {
      step: 2,
      title: 'Authenticate',
      description: 'Connect with your GitHub account',
      cmd: 'gal auth login',
      id: 'auth',
    },
    {
      step: 3,
      title: 'Sync',
      description: 'Pull approved configs to any repo',
      cmd: 'gal sync --pull',
      id: 'sync',
    },
  ]

  const configFiles = [
    { icon: FileText, path: 'CLAUDE.md', desc: 'Project memory' },
    { icon: Settings, path: '.claude/settings.json', desc: 'Permissions' },
    { icon: Zap, path: '.claude/commands/', desc: 'Slash commands' },
    { icon: Bot, path: '.claude/agents/', desc: 'Subagents' },
    { icon: Link2, path: '.claude/hooks/', desc: 'Event hooks' },
    { icon: Settings, path: '.mcp.json', desc: 'MCP servers' },
  ]

  return (
    <div className="p-6 sm:p-8 lg:p-12 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
          <Download className="w-3 h-3" />
          CLI Tool
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3" style={{ color: 'var(--text-primary)' }}>
          Get Started with GAL
        </h1>
        <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
          Sync your workspace&apos;s approved AI coding tool configurations in three steps.
        </p>
      </div>

      {/* Three Steps */}
      <div className="space-y-6 mb-12">
        {steps.map(({ step, title, description, cmd, id }, index) => (
          <div key={id} className="relative">
            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className="absolute left-5 top-14 w-px h-6 bg-[var(--border-subtle)]"
              />
            )}

            <div className="flex gap-4">
              {/* Step number */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm bg-[var(--accent)] text-[var(--text-on-accent)] shadow-sm"
              >
                {step}
              </div>

              {/* Content */}
              <div className="flex-1 pt-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    {title}
                  </h3>
                  <ArrowRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {description}
                  </span>
                </div>

                {/* Command */}
                <div
                  className="flex items-center justify-between p-3 rounded-md mt-2 shadow-sm border border-[var(--accent-neon)]/10 border-t-2 border-t-[var(--accent-neon)]/20"
                  style={{ backgroundColor: 'var(--bg-code)' }}
                >
                  <code className="text-sm font-mono" style={{ color: 'var(--code-text)' }}>
                    <span style={{ color: 'var(--code-prompt)' }}>$ </span>
                    <span style={{ color: 'var(--code-command)' }}>{cmd}</span>
                  </code>
                  <button
                    onClick={() => handleCopy(cmd, id)}
                    className="p-1.5 rounded transition-colors ml-3 flex-shrink-0"
                    style={{
                      backgroundColor: copied === id ? 'var(--accent-bg)' : 'transparent',
                    }}
                    title="Copy command"
                  >
                    {copied === id ? (
                      <Check className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                    ) : (
                      <Copy className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t mb-12" style={{ borderColor: 'var(--border-subtle)' }} />

      {/* Supported Configs */}
      <div>
        <div className="flex items-center gap-2 mb-6">
          <Terminal className="w-4 h-4 text-[var(--accent-neon)]" />
          <h2 className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-secondary)' }}>
            Supported AI Coding Tool Configurations
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {configFiles.map(({ icon: Icon, path, desc }) => (
            <div
              key={path}
              className="p-3 rounded-md shadow-sm hover:shadow-md transition-all duration-200 border border-[var(--border-subtle)] hover:border-[var(--border-interactive)]"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                <code className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  {path}
                </code>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-center text-xs mt-12" style={{ color: 'var(--text-muted)' }}>
        Available for macOS and Linux via Homebrew
      </p>
    </div>
  )
}

export default CLITool
