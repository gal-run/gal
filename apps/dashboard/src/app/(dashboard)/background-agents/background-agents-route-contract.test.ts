import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const backgroundAgentsPageSource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

const backgroundAgentSessionPageSource = readFileSync(
  join(__dirname, '[sessionId]', 'page.tsx'),
  'utf8',
)

describe('background-agents legacy route contract', () => {
  it('redirects the legacy background-agents list route to the unified sessions page (#6107)', () => {
    // Client-side redirect (#507): a server `redirect()` thrown inside the
    // force-dynamic client `(dashboard)` layout surfaces as a blank client-side
    // exception on the public demo, so the list route navigates via the router.
    expect(backgroundAgentsPageSource).toContain("'use client'")
    expect(backgroundAgentsPageSource).toContain("router.replace('/sessions')")
  })

  it('redirects legacy background-agents session detail routes to the unified session detail page (#6107)', () => {
    expect(backgroundAgentSessionPageSource).toContain('const { sessionId } = await params')
    expect(backgroundAgentSessionPageSource).toContain('redirect(`/sessions/${sessionId}`)')
  })
})
