/**
 * GalCodePanel tests (#6307)
 *
 * Verifies the embeddable panel:
 *   1. POSTs /api/sessions with the provided mcpConfig
 *   2. Forwards other optional props (name, projectContext, initialPrompt) into the payload
 *   3. Does not POST without an mcpConfig (guards against accidental no-mcp embeds)
 *
 * Uses renderToStaticMarkup for rendering; the creation request itself is
 * dispatched in `useEffect` which React's server renderer does not run, so we
 * also unit-test the pure `buildCreateSessionPayload` helper exported from the
 * component module.
 */

import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// Needed because the test file uses JSX but `"use client"` files transpile to
// `_jsx` helpers that pull `React` from scope in some toolchains.
void React

import { GalCodePanel, buildCreateSessionPayload } from './GalCodePanel'

const apiFetchMock = vi.fn()

vi.mock('@/lib/api', () => ({
  api: {
    get baseUrl() {
      return 'http://test'
    },
    fetchWithAuth: (...args: unknown[]) => apiFetchMock(...args),
  },
}))

// StructuredLogsView transitively imports firebase + browser-only deps; keep it
// rendering inert for unit tests.
vi.mock('./StructuredLogsView', () => ({
  StructuredLogsView: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="structured-logs-view" data-session-id={sessionId} />
  ),
}))

beforeEach(() => {
  apiFetchMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildCreateSessionPayload (#6307)', () => {
  it('includes mcpConfig verbatim on the payload', () => {
    const mcp = {
      servers: {
        financial: {
          command: 'node',
          args: ['/app/financial/mcp/dist/index.js'],
          env: { FINANCIAL_SHEETS_ID: 'abc' },
        },
      },
    }
    const payload = buildCreateSessionPayload({ mcp, name: 'Financial Assist' })
    expect(payload.mcpConfig).toEqual(mcp)
    expect(payload.name).toBe('Financial Assist')
  })

  it('forwards projectContext, agent, runnerLabel, initialPrompt when provided', () => {
    const payload = buildCreateSessionPayload({
      mcp: { servers: { foo: { command: 'node' } } },
      name: 'Panel',
      projectContext: 'scheduler-systems/financial',
      agent: 'claude',
      runnerLabel: 'agents-standard-runc-x64',
      initialPrompt: 'Fill missing statements for 2025-01',
    })
    expect(payload).toEqual({
      name: 'Panel',
      projectContext: 'scheduler-systems/financial',
      agent: 'claude',
      runnerLabel: 'agents-standard-runc-x64',
      initialPrompt: 'Fill missing statements for 2025-01',
      mcpConfig: { servers: { foo: { command: 'node' } } },
    })
  })

  it('uses the name as initialPrompt when initialPrompt is not provided (matches BackgroundAgentsPage behaviour)', () => {
    const payload = buildCreateSessionPayload({
      mcp: { servers: { foo: { command: 'node' } } },
      name: 'Fallback Name',
    })
    expect(payload.initialPrompt).toBe('Fallback Name')
  })

  it('omits undefined fields', () => {
    const payload = buildCreateSessionPayload({
      mcp: { servers: { foo: { command: 'node' } } },
      name: 'Minimal',
    })
    expect(payload).not.toHaveProperty('projectContext')
    expect(payload).not.toHaveProperty('runnerLabel')
    expect(payload).not.toHaveProperty('agent')
  })
})

describe('GalCodePanel (#6307) rendering', () => {
  it('shows a loading indicator before the session is created', () => {
    const markup = renderToStaticMarkup(
      <GalCodePanel
        mcp={{ servers: { financial: { command: 'node' } } }}
        name="Financial Panel"
      />,
    )
    expect(markup).toMatch(/Starting GAL Code session|Loading/i)
  })

  it('renders a visible error message when mcp prop is missing (guard)', () => {
    const markup = renderToStaticMarkup(
      // @ts-expect-error intentional for guard test
      <GalCodePanel name="No MCP" />,
    )
    expect(markup).toMatch(/mcp config required|mcp prop/i)
  })
})
