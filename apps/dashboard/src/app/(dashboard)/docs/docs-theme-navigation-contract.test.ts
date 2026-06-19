import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const docsPageSource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

const getStartedPageSource = readFileSync(
  join(__dirname, '../get-started/page.tsx'),
  'utf8',
)

const dashboardLayoutSource = readFileSync(
  join(__dirname, '../layout.tsx'),
  'utf8',
)

describe('docs + onboarding theming/navigation contracts', () => {
  it('keeps step badges tokenized for dark/light contrast on docs and get-started surfaces (#2791, #1889, #1905, #2881)', () => {
    expect(getStartedPageSource).toContain('bg-[var(--accent)] text-[var(--text-on-accent)]')
    expect(docsPageSource).toContain("style={{ backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)' }}")
    expect(docsPageSource).not.toContain('bg-blue-600')
    expect(docsPageSource).not.toContain('text-white')
  })

  it('keeps docs discoverability linked from sidebar and contextual dashboard docs surfaces (#1911, #1890)', () => {
    expect(dashboardLayoutSource).toContain('{ path: "/docs", icon: BookOpen, label: "Docs", pageId: "docs" }')
    expect(docsPageSource).toContain("{ href: '#getting-started', icon: Rocket, label: 'Getting Started', external: false }")
    expect(docsPageSource).toContain("{ href: '#discovery', icon: Search, label: 'Discovery', external: false }")
    expect(docsPageSource).toContain("{ href: '#approved-config', icon: Shield, label: 'Approved Config', external: false }")
    expect(docsPageSource).toContain("{ href: '#cli', icon: Terminal, label: 'CLI', external: false }")
    expect(docsPageSource).toContain('href="/api-reference"')
    expect(docsPageSource).toContain("{ href: '/discovery', title: 'View Discovery', desc: 'See configs in your workspace', external: false }")
    expect(docsPageSource).toContain("{ href: '/approved-config', title: 'Approved Config', desc: 'Set your workspace standard', external: false }")
    expect(docsPageSource).toContain("{ href: '/get-started', title: 'CLI Tool', desc: 'Sync to local repos', external: false }")
    expect(docsPageSource).toContain("{ href: '/settings', title: 'Settings', desc: 'Configure your account', external: false }")
  })

  it('keeps VS Code extension docs links pinned to the browser-safe install guide route (#1237)', () => {
    expect(docsPageSource).toContain('VSCODE_INSTALL_GUIDE_PATH')
    expect(docsPageSource).toContain('VS Code Extension')
  })

  it('keeps docs copy platform-neutral in discovery/config section titles (no hard-coded Claude-only heading labels) (#2999, #3000)', () => {
    expect(docsPageSource).toContain('Supported Config Files')
    expect(docsPageSource).not.toContain('Supported Config Files (Claude)')
    expect(docsPageSource).toContain('GAL scans all repositories for AI coding tool configs')
  })
})
