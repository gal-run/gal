/**
 * ProviderCapacityBar — active count regression tests (#5207)
 *
 * The bug: the Workspace Pool widget showed `configured_max/configured_max`
 * (e.g. ⭐ 4/4) for Codex and Gemini even when those providers had zero real
 * active sessions.  Claude showed correctly because it happened to have
 * sessions in a test environment, so its count matched the max.
 *
 * Root cause: the capacity endpoint's `active` field could equal
 * `maxConcurrentAgents` for providers with no sessions, and the component
 * displayed that value directly.
 *
 * Fix: when the `sessions` prop is provided, derive the active count from the
 * session list (filtered by provider + capacity-active status) instead of from
 * the endpoint's `active` field.  `countActiveSessionsForProvider` implements
 * this logic and is tested here in isolation.
 */

import { describe, expect, it } from 'vitest'
import { countActiveSessionsForProvider } from './ProviderCapacityBar'
import type { Session } from '@gal/types'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<Session>): Session {
  return {
    id: 'test-session',
    name: 'test',
    status: 'ACTIVE',
    agent: 'claude',
    organizationId: 'test-org',
    userId: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Session
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('countActiveSessionsForProvider (#5207)', () => {
  describe('bug regression — Codex/Gemini show 0/N when no sessions exist', () => {
    it('returns 0 for codex when only claude sessions are active', () => {
      // Bug scenario: 4 Claude sessions active, 0 Codex sessions.
      // Before fix: component displayed 4/4 for Codex because the capacity
      // endpoint returned active === maxConcurrentAgents.
      const sessions: Session[] = [
        makeSession({ agent: 'claude', status: 'ACTIVE' }),
        makeSession({ agent: 'claude', status: 'ACTIVE' }),
        makeSession({ agent: 'claude', status: 'ACTIVE' }),
        makeSession({ agent: 'claude', status: 'ACTIVE' }),
      ]
      expect(countActiveSessionsForProvider(sessions, 'codex')).toBe(0)
      expect(countActiveSessionsForProvider(sessions, 'gemini')).toBe(0)
      expect(countActiveSessionsForProvider(sessions, 'claude')).toBe(4)
      expect(countActiveSessionsForProvider(sessions, 'oss')).toBe(0)
    })

    it('returns 0 for gemini when only claude and codex sessions are active', () => {
      const sessions: Session[] = [
        makeSession({ agent: 'claude', status: 'ACTIVE' }),
        makeSession({ agent: 'codex', status: 'ACTIVE' }),
        makeSession({ agent: 'codex', status: 'INITIALIZING' }),
      ]
      expect(countActiveSessionsForProvider(sessions, 'gemini')).toBe(0)
      expect(countActiveSessionsForProvider(sessions, 'claude')).toBe(1)
      expect(countActiveSessionsForProvider(sessions, 'codex')).toBe(2)
      expect(countActiveSessionsForProvider(sessions, 'oss')).toBe(0)
    })
  })

  describe('counts capacity-active statuses (ACTIVE / INITIALIZING / PENDING)', () => {
    it('counts ACTIVE sessions', () => {
      const sessions = [makeSession({ agent: 'claude', status: 'ACTIVE' })]
      expect(countActiveSessionsForProvider(sessions, 'claude')).toBe(1)
    })

    it('counts INITIALIZING sessions', () => {
      const sessions = [makeSession({ agent: 'codex', status: 'INITIALIZING' })]
      expect(countActiveSessionsForProvider(sessions, 'codex')).toBe(1)
    })

    it('counts PENDING sessions', () => {
      const sessions = [makeSession({ agent: 'gemini', status: 'PENDING' })]
      expect(countActiveSessionsForProvider(sessions, 'gemini')).toBe(1)
    })

    it('does not count TERMINATED sessions', () => {
      const sessions = [makeSession({ agent: 'claude', status: 'TERMINATED' })]
      expect(countActiveSessionsForProvider(sessions, 'claude')).toBe(0)
    })

    it('does not count FAILED sessions', () => {
      const sessions = [makeSession({ agent: 'codex', status: 'FAILED' })]
      expect(countActiveSessionsForProvider(sessions, 'codex')).toBe(0)
    })
  })

  describe('provider isolation — provider-specific counts do not bleed', () => {
    it('does not count claude sessions toward codex', () => {
      const sessions = [makeSession({ agent: 'claude', status: 'ACTIVE' })]
      expect(countActiveSessionsForProvider(sessions, 'codex')).toBe(0)
    })

    it('does not count codex sessions toward gemini', () => {
      const sessions = [makeSession({ agent: 'codex', status: 'ACTIVE' })]
      expect(countActiveSessionsForProvider(sessions, 'gemini')).toBe(0)
    })

    it('does not count gemini sessions toward claude', () => {
      const sessions = [makeSession({ agent: 'gemini', status: 'ACTIVE' })]
      expect(countActiveSessionsForProvider(sessions, 'claude')).toBe(0)
    })
  })

  describe('gal agent is counted under oss (GAL Code mapping)', () => {
    it('counts gal sessions toward oss provider', () => {
      // 'gal' routes through the GAL Code (OpenAI-compatible) adapter.
      const sessions = [makeSession({ agent: 'gal', status: 'ACTIVE' })]
      expect(countActiveSessionsForProvider(sessions, 'oss')).toBe(1)
      expect(countActiveSessionsForProvider(sessions, 'claude')).toBe(0)
      expect(countActiveSessionsForProvider(sessions, 'gemini')).toBe(0)
    })

    it('sums gal and oss sessions under oss', () => {
      const sessions = [
        makeSession({ agent: 'gal', status: 'ACTIVE' }),
        makeSession({ agent: 'oss', status: 'ACTIVE' }),
      ]
      expect(countActiveSessionsForProvider(sessions, 'oss')).toBe(2)
    })
  })

  describe('edge cases', () => {
    it('returns 0 for an empty session list', () => {
      expect(countActiveSessionsForProvider([], 'claude')).toBe(0)
      expect(countActiveSessionsForProvider([], 'codex')).toBe(0)
      expect(countActiveSessionsForProvider([], 'gemini')).toBe(0)
      expect(countActiveSessionsForProvider([], 'oss')).toBe(0)
    })

    it('skips sessions with a null/undefined agent', () => {
      const sessions = [makeSession({ agent: undefined as unknown as Session['agent'], status: 'ACTIVE' })]
      expect(countActiveSessionsForProvider(sessions, 'claude')).toBe(0)
    })

    it('counts multiple active sessions per provider correctly', () => {
      const sessions: Session[] = [
        makeSession({ agent: 'codex', status: 'ACTIVE' }),
        makeSession({ agent: 'codex', status: 'INITIALIZING' }),
        makeSession({ agent: 'codex', status: 'PENDING' }),
        makeSession({ agent: 'codex', status: 'TERMINATED' }), // should NOT count
      ]
      expect(countActiveSessionsForProvider(sessions, 'codex')).toBe(3)
    })
  })
})
