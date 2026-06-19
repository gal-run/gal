import { describe, expect, it } from 'vitest'
import { getConfigPresentation } from './configPresentation'

describe('getConfigPresentation', () => {
  it('adds platform-aware settings badges (#5910)', () => {
    expect(getConfigPresentation({ type: 'settings', platform: 'gemini' })).toMatchObject({
      label: 'Settings',
      platformBadge: 'Gemini',
    })
  })

  it('labels Gemini and Codex embedded MCP entries distinctly (#5914)', () => {
    expect(getConfigPresentation({ type: 'mcp', platform: 'gemini', path: '.gemini/settings.json' })).toMatchObject({
      label: 'Embedded MCP',
      platformBadge: 'Gemini',
      detail: 'Extracted from .gemini/settings.json',
    })

    expect(getConfigPresentation({ type: 'mcp', platform: 'codex', path: '.codex/config.toml' })).toMatchObject({
      label: 'Embedded MCP',
      platformBadge: 'Codex',
      detail: 'Extracted from .codex/config.toml',
    })
  })
})
