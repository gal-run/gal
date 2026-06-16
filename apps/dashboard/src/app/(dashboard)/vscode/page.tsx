'use client'

import { Code, Copy, Check, ArrowRight, FileText, Settings, Zap, Bot, Link2, Download, ExternalLink } from 'lucide-react'
import { useState, useMemo } from 'react'
import {
  getVscodeInstallCommand,
  getVsixDownloadUrl,
  detectIdeCategory,
  getExtensionInstallUrl,
  getIdeCategoryLabel,
  VSCODE_MARKETPLACE_URL,
  OPEN_VSX_URL,
} from '@/lib/config'

function VSCodeExtension() {
  const [copied, setCopied] = useState<string | null>(null)

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  // Detect the IDE to direct the user to the correct marketplace
  const ideCategory = useMemo(() => detectIdeCategory(), [])
  const detectedInstallUrl = useMemo(() => getExtensionInstallUrl(ideCategory), [ideCategory])
  const ideCategoryLabel = useMemo(() => getIdeCategoryLabel(ideCategory), [ideCategory])

  // Get environment-specific VS Code extension install command
  const vscodeInstallCmd = useMemo(() => getVscodeInstallCommand(), [])
  const vsixDownloadUrl = useMemo(() => getVsixDownloadUrl(), [])
  const installDescription = vsixDownloadUrl ? 'Download and install VSIX' : 'Copy the install command'

  const steps = [
    {
      step: 1,
      title: 'Install',
      description: installDescription,
      cmd: vscodeInstallCmd,
      id: 'install',
      hasDownload: Boolean(vsixDownloadUrl),
      downloadUrl: vsixDownloadUrl,
    },
    {
      step: 2,
      title: 'Authenticate',
      description: 'Connect with your GitHub account',
      cmd: 'GAL: Sign In',
      id: 'auth',
      isCommand: true,
    },
    {
      step: 3,
      title: 'Sync',
      description: 'Pull approved configs to your workspace',
      cmd: 'GAL: Sync Config',
      id: 'sync',
      isCommand: true,
    },
  ]

  const features = [
    { icon: FileText, name: 'Config Sync', desc: 'Pull approved configs to your workspace' },
    { icon: Settings, name: 'Status Bar', desc: 'See sync status at a glance' },
    { icon: Zap, name: 'Quick Actions', desc: 'Access common commands from command palette' },
    { icon: Bot, name: 'Config Viewer', desc: 'View and compare configurations' },
    { icon: Link2, name: 'GitHub Integration', desc: 'Seamless authentication flow' },
    { icon: Download, name: 'Auto Updates', desc: 'Stay up-to-date with latest features' },
  ]

  return (
    <div className="p-6 sm:p-8 lg:p-12 max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-4"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
          <Code className="w-3 h-3" />
          VS Code Extension
        </div>
        <h1 className="text-2xl sm:text-3xl font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Install GAL in your IDE
        </h1>
        <p className="text-base mb-6" style={{ color: 'var(--text-secondary)' }}>
          Sync your workspace&apos;s approved AI coding tool configurations directly in your IDE.
        </p>

        {/* IDE-aware install CTA */}
        {detectedInstallUrl ? (
          <div className="inline-flex flex-col items-center gap-2">
            <a
              href={detectedInstallUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={{
                backgroundColor: 'var(--interactive-primary)',
                color: 'var(--text-on-accent)',
              }}
            >
              Install extension
              <ExternalLink className="w-4 h-4" />
            </a>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Detected IDE: {ideCategoryLabel}
            </span>
          </div>
        ) : (
          <div className="inline-flex flex-col items-center gap-3">
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Choose your IDE&apos;s extension store:
            </p>
            <div className="flex items-center gap-3">
              <a
                href={VSCODE_MARKETPLACE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors"
                style={{
                  backgroundColor: 'var(--interactive-primary)',
                  color: 'var(--text-on-accent)',
                }}
              >
                VS Code / Cursor / Windsurf
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href={OPEN_VSX_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors"
                style={{
                  backgroundColor: 'var(--surface-raised)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                VSCodium / Open VSX
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Three Steps */}
      <div className="space-y-6 mb-12">
        {steps.map(({ step, title, description, cmd, id, hasDownload, downloadUrl, isCommand }, index) => (
          <div key={id} className="relative">
            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className="absolute left-5 top-14 w-px h-6"
                style={{ backgroundColor: 'var(--border-subtle)' }}
              />
            )}

            <div className="flex gap-4">
              {/* Step number */}
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-medium"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  border: '2px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                {step}
              </div>

              {/* Content */}
              <div className="flex-1 pt-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    {title}
                  </h3>
                  <ArrowRight className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {description}
                  </span>
                </div>

                {/* Download link for VSIX (dev-ci only) */}
                {hasDownload && downloadUrl && (
                  <a
                    href={downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs mb-2 hover:underline"
                    style={{ color: 'var(--accent)' }}
                  >
                    <Download className="w-3 h-3" />
                    Download VSIX from GitHub Actions
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                {/* Command */}
                <div
                  className="flex items-center justify-between p-3 rounded-md mt-2"
                  style={{ backgroundColor: 'var(--bg-code)', border: '1px solid var(--border-subtle)' }}
                >
                  <code className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
                    {isCommand ? (
                      <>
                        <span style={{ color: 'var(--text-muted)' }}>Cmd+Shift+P &rarr; </span>
                        <span style={{ color: 'var(--accent)' }}>{cmd}</span>
                      </>
                    ) : (
                      <>
                        <span style={{ color: 'var(--text-muted)' }}>$ </span>
                        <span style={{ color: 'var(--accent)' }}>{cmd}</span>
                      </>
                    )}
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

      <p className="text-center text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
        If your browser cannot open VS Code directly, copy the command above and run it in a terminal.
      </p>

      {/* Divider */}
      <div className="border-t mb-12" style={{ borderColor: 'var(--border-subtle)' }} />

      {/* Features */}
      <div>
        <div className="flex items-center gap-2 mb-6">
          <Code className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Extension Features
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {features.map(({ icon: Icon, name, desc }) => (
            <div
              key={name}
              className="p-3 rounded-md"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  {name}
                </span>
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
        Requires VS Code 1.85.0 or later
      </p>
    </div>
  )
}

export default VSCodeExtension
