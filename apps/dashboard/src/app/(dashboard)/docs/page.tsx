'use client'

import {
  Search,
  Shield,
  Terminal,
  Rocket,
  CheckCircle,
  ArrowRight,
  Copy,
  Check,
  FileText,
  Zap,
  Settings,
  Bot,
  Code,
  Globe,
} from 'lucide-react'
import { useState, useMemo } from 'react'
import { getCliInstallCommand, VSCODE_INSTALL_GUIDE_PATH, CHROME_WEB_STORE_URL, CHROME_INSTALL_GUIDE_PATH } from '@/lib/config'
import Link from 'next/link'

function Documentation() {
  const [copied, setCopied] = useState<string | null>(null)

  const cliInstallCmd = useMemo(() => getCliInstallCommand(), [])

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Documentation
          </h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:bg-[var(--surface-sunken)] dark:text-[var(--text-tertiary)] font-medium">
            AI Coding Tools
          </span>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Browse documentation for all GAL features and tools
        </p>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-8">
        {[
          { href: '#getting-started', icon: Rocket, label: 'Getting Started', external: false },
          { href: '#discovery', icon: Search, label: 'Discovery', external: false },
          { href: '#approved-config', icon: Shield, label: 'Approved Config', external: false },
          { href: '#cli', icon: Terminal, label: 'CLI', external: false },
          { href: VSCODE_INSTALL_GUIDE_PATH, icon: Code, label: 'VS Code', external: false },
          { href: CHROME_INSTALL_GUIDE_PATH, icon: Globe, label: 'Chrome', external: false },
        ].map((item) => {
          const Icon = item.icon;
          const label = item.label;

          // All cards use anchor links (internal anchors or external URLs)
          return (
            <a
              key={item.href}
              href={item.href}
              className="dashboard-card p-3 transition-all duration-200 group shadow-sm hover:shadow-md border-l-2 border-transparent"
              {...(item.external && { target: '_blank', rel: 'noopener noreferrer' })}
            >
              <Icon className="w-5 h-5 mb-2 text-[var(--text-secondary)]" />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {label}
              </span>
            </a>
          );
        })}
      </div>

      {/* API Reference Card */}
      <Link
        href="/api-reference"
        className="dashboard-card p-4 mb-8 transition-all duration-200 group flex items-center justify-between shadow-sm hover:shadow-md border-l-2 border-transparent"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-bg)' }}>
            <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h3 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>API Reference</h3>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              REST API documentation for integrations
            </p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
      </Link>

      {/* Overview */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>
          What GAL does for you
        </h2>
        <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {[
            { bold: 'Discovers', text: 'AI coding tool configs across all your repositories' },
            { bold: 'Standardizes', text: 'configurations with CISO-approved templates' },
            { bold: 'Syncs', text: 'approved configs to any repository via CLI' },
          ].map(({ bold, text }) => (
            <div key={bold} className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
              <span>
                <strong style={{ color: 'var(--text-primary)' }}>{bold}</strong> {text}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Getting Started */}
      <section id="getting-started" className="dashboard-card p-4 sm:p-6 mb-6 scroll-mt-20 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-bg)' }}>
            <Rocket className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Getting Started
          </h2>
        </div>

        <div className="space-y-4">
          {[
            { step: '1', title: 'Connect GitHub', desc: 'Install the GAL GitHub App on your workspace.' },
            { step: '2', title: 'View Discovery', desc: 'See all AI coding tool configs found across your repositories.' },
            { step: '3', title: 'Set Approved Config', desc: 'Designate the official configuration for your workspace.' },
            { step: '4', title: 'Sync Locally', desc: null, code: 'gal sync --pull' },
          ].map(({ step, title, desc, code }) => (
            <div key={step} className="flex gap-4">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)' }}
              >
                <span className="font-bold text-xs">{step}</span>
              </div>
              <div>
                <h4 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h4>
                {desc && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{desc}</p>}
                {code && (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Developers run{' '}
                    <code className="px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent)' }}>
                      {code}
                    </code>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Auto-Discovery */}
      <section id="discovery" className="dashboard-card p-4 sm:p-6 mb-6 scroll-mt-20 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-bg)' }}>
            <Search className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Auto-Discovery
          </h2>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          GAL scans your GitHub workspace to find AI coding tool configurations.
        </p>

        <h4 className="font-medium mb-3 text-sm" style={{ color: 'var(--text-primary)' }}>
          Supported Config Files
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {[
            { path: 'CLAUDE.md', desc: 'Project memory' },
            { path: '.claude/settings.json', desc: 'Settings' },
            { path: '.claude/commands/', desc: 'Slash commands' },
            { path: '.claude/agents/', desc: 'Subagents' },
            { path: '.claude/hooks/', desc: 'Hooks' },
            { path: '.mcp.json', desc: 'MCP servers' },
          ].map(({ path, desc }) => (
            <div
              key={path}
              className="flex items-center gap-2 p-2 rounded"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <code className="text-xs" style={{ color: 'var(--accent)' }}>{path}</code>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{desc}</span>
            </div>
          ))}
        </div>

        <h4 className="font-medium mb-2 text-sm" style={{ color: 'var(--text-primary)' }}>
          How It Works
        </h4>
        <ol className="text-sm space-y-1 list-decimal list-inside" style={{ color: 'var(--text-secondary)' }}>
          <li>Install the GAL GitHub App</li>
          <li>GAL scans all repositories for AI coding tool configs</li>
          <li>Results appear on your Dashboard</li>
        </ol>
      </section>

      {/* Approved Config */}
      <section id="approved-config" className="dashboard-card p-4 sm:p-6 mb-6 scroll-mt-20 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-bg)' }}>
            <Shield className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Approved Config
          </h2>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Set the official AI coding tool configuration for your workspace.
        </p>

        <div className="space-y-3">
          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <h4 className="font-medium mb-1 text-sm" style={{ color: 'var(--text-primary)' }}>What It Does</h4>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Designate one configuration as the &quot;approved&quot; standard that all developers should use.
            </p>
          </div>

          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <h4 className="font-medium mb-1 text-sm" style={{ color: 'var(--text-primary)' }}>How To Set It</h4>
            <ol className="text-xs space-y-1 list-decimal list-inside" style={{ color: 'var(--text-secondary)' }}>
              <li>Go to Dashboard &rarr; Approved Config</li>
              <li>Choose from discovered configs or create new</li>
              <li>Save as the workspace standard</li>
            </ol>
          </div>

          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--accent-bg)', border: '1px solid var(--accent)' }}>
            <h4 className="font-medium mb-1 text-sm" style={{ color: 'var(--text-primary)' }}>Permissions</h4>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Only organization admins can modify the approved config.
            </p>
          </div>
        </div>
      </section>

      {/* CLI Sync */}
      <section id="cli" className="dashboard-card p-4 sm:p-6 mb-6 scroll-mt-20 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-bg)' }}>
            <Terminal className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            CLI Sync
          </h2>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Pull your workspace&apos;s approved config to any local repository.
        </p>

        <div className="space-y-3">
          {[
            { label: 'Install', cmd: cliInstallCmd, id: 'install', bold: true },
            { label: 'Authenticate', cmd: 'gal auth login', id: 'auth' },
            { label: 'Sync approved config', cmd: 'gal sync --pull', id: 'sync' },
          ].map(({ label, cmd, id, bold }) => (
            <div key={id}>
              <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
              <div
                className="p-3 flex items-center justify-between rounded-lg"
                style={{ backgroundColor: 'var(--bg-code)', border: '1px solid var(--border-subtle)' }}
              >
                <code className={`text-sm ${bold ? 'font-bold' : ''}`} style={{ color: 'var(--accent)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>$ </span>{cmd}
                </code>
                <button
                  onClick={() => handleCopy(cmd, id)}
                  className="p-1.5 rounded transition-colors"
                  style={{ backgroundColor: copied === id ? 'var(--accent-bg)' : 'transparent' }}
                >
                  {copied === id ? (
                    <Check className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  ) : (
                    <Copy className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* VS Code Extension */}
      <section id="vscode" className="dashboard-card p-4 sm:p-6 mb-8 scroll-mt-20 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-bg)' }}>
            <Code className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            VS Code Extension
          </h2>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Sync approved configs directly in VS Code without leaving your editor.
        </p>

        <div className="space-y-3">
          <div>
            <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Install from the guide</p>
            <Link
              href={VSCODE_INSTALL_GUIDE_PATH}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-on-accent)] transition-colors"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <Code className="w-4 h-4" />
              Open VS Code Install Guide
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {[
            { label: 'Sign in', cmd: 'GAL: Login', id: 'vscode-auth' },
            { label: 'Sync config', cmd: 'GAL: Sync Configuration', id: 'vscode-sync' },
          ].map(({ label, cmd, id }) => (
            <div key={id}>
              <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
              <div
                className="p-3 flex items-center justify-between rounded-lg"
                style={{ backgroundColor: 'var(--bg-code)', border: '1px solid var(--border-subtle)' }}
              >
                <code className="text-sm" style={{ color: 'var(--accent)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Cmd+Shift+P &rarr; </span>{cmd}
                </code>
                <button
                  onClick={() => handleCopy(cmd, id)}
                  className="p-1.5 rounded transition-colors"
                  style={{ backgroundColor: copied === id ? 'var(--accent-bg)' : 'transparent' }}
                >
                  {copied === id ? (
                    <Check className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  ) : (
                    <Copy className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Chrome Extension */}
      <section id="chrome-extension" className="dashboard-card p-4 sm:p-6 mb-8 scroll-mt-20 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-bg)' }}>
            <Globe className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Chrome Extension
          </h2>
        </div>

        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Enforce governance policies directly in your browser when using AI coding tools.
        </p>

        <div className="space-y-3">
          <div>
            <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Install from the guide</p>
            <Link
              href={CHROME_INSTALL_GUIDE_PATH}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-on-accent)] transition-colors"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              <Globe className="w-4 h-4" />
              Open Chrome Extension Install Guide
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div>
            <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Or install directly from the Chrome Web Store</p>
            <a
              href={CHROME_WEB_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
            >
              Chrome Web Store
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
            <h4 className="font-medium mb-2 text-sm" style={{ color: 'var(--text-primary)' }}>Features</h4>
            <div className="space-y-1.5">
              {[
                'Real-time governance policy enforcement in the browser',
                'Visual indicators for approved and non-approved configurations',
                'Seamless integration with your GAL workspace',
              ].map((feature) => (
                <div key={feature} className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Config Types Reference */}
      <section className="dashboard-card p-4 sm:p-6 mb-8 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--accent-bg)' }}>
            <FileText className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="text-base sm:text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            AI Coding Tool Config Types
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: FileText, name: 'CLAUDE.md', desc: 'Project memory and custom instructions loaded at startup' },
            { icon: Settings, name: 'Settings', desc: 'Permissions, environment variables, and tool configuration' },
            { icon: Zap, name: 'Commands', desc: 'Custom slash commands defined in .md files' },
            { icon: Bot, name: 'Subagents', desc: 'Specialized agent definitions for specific tasks' },
          ].map(({ icon: Icon, name, desc }) => (
            <div key={name} className="p-3 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 border-l-2 border-transparent" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{name}</span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Next Steps */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold tracking-tight mb-4" style={{ color: 'var(--text-primary)' }}>Next Steps</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { href: '/discovery', title: 'View Discovery', desc: 'See configs in your workspace', external: false },
            { href: '/approved-config', title: 'Approved Config', desc: 'Set your workspace standard', external: false },
            { href: '/get-started', title: 'CLI Tool', desc: 'Sync to local repos', external: false },
            { href: VSCODE_INSTALL_GUIDE_PATH, title: 'VS Code Extension', desc: 'Sync in your editor', external: false },
            { href: CHROME_INSTALL_GUIDE_PATH, title: 'Chrome Extension', desc: 'Governance in browser', external: false },
            { href: '/settings', title: 'Settings', desc: 'Configure your account', external: false },
          ].map((item) => {
            const { title, desc } = item;
            const key = item.href;

            if (item.external) {
              return (
                <a
                  key={key}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dashboard-card p-4 transition-all duration-200 group flex items-center justify-between shadow-sm hover:shadow-md border-l-2 border-transparent"
                >
                  <div>
                    <h4 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h4>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{desc}</p>
                  </div>
                  <ArrowRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </a>
              );
            }

            return (
              <Link
                key={key}
                href={item.href}
                className="dashboard-card p-4 transition-all duration-200 group flex items-center justify-between shadow-sm hover:shadow-md border-l-2 border-transparent"
              >
                <div>
                  <h4 className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{title}</h4>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{desc}</p>
                </div>
                <ArrowRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  )
}

export default Documentation
