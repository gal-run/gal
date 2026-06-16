import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveApprovalHandoff,
  loadApprovalHandoff,
  clearApprovalHandoff,
  isStageableSelection,
  type ApprovedConfigStagePayload,
  type StageSelection,
} from './approvalHandoff'

class SessionStorageMock {
  private store = new Map<string, string>()

  clear() {
    this.store.clear()
  }

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  removeItem(key: string) {
    this.store.delete(key)
  }

  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
}

Object.defineProperty(globalThis, 'sessionStorage', {
  value: new SessionStorageMock(),
  configurable: true,
})

beforeEach(() => {
  sessionStorage.clear()
})

const exampleSelection: StageSelection = {
  platform: 'claude',
  type: 'command',
  name: 'review-pr',
  repo: 'my-org/my-repo',
  path: '.claude/commands/review-pr.md',
}

const examplePayload: ApprovedConfigStagePayload = {
  orgName: 'my-org',
  source: 'discovery-bulk-approve',
  createdAt: new Date().toISOString(),
  selections: [exampleSelection],
}

describe('saveApprovalHandoff', () => {
  it('returns a non-empty key', () => {
    const key = saveApprovalHandoff(examplePayload)
    expect(key.length).toBeGreaterThan(0)
  })

  it('stores the payload in sessionStorage', () => {
    const key = saveApprovalHandoff(examplePayload)
    const stored = sessionStorage.getItem(`gal-stage-approval:${key}`)
    expect(stored).not.toBeNull()
    const parsed = JSON.parse(stored!)
    expect(parsed.orgName).toBe('my-org')
    expect(parsed.source).toBe('discovery-bulk-approve')
    expect(parsed.selections).toHaveLength(1)
  })

  it('generates unique keys for each call', () => {
    const k1 = saveApprovalHandoff(examplePayload)
    const k2 = saveApprovalHandoff(examplePayload)
    expect(k1).not.toBe(k2)
  })
})

describe('loadApprovalHandoff', () => {
  it('returns the payload for a valid key', () => {
    const key = saveApprovalHandoff(examplePayload)
    const loaded = loadApprovalHandoff(key)
    expect(loaded).not.toBeNull()
    expect(loaded!.orgName).toBe('my-org')
    expect(loaded!.selections[0].path).toBe('.claude/commands/review-pr.md')
  })

  it('returns null for an unknown key', () => {
    const loaded = loadApprovalHandoff('nonexistent-key')
    expect(loaded).toBeNull()
  })

  it('preserves all StageSelection fields', () => {
    const key = saveApprovalHandoff(examplePayload)
    const loaded = loadApprovalHandoff(key)
    const sel = loaded!.selections[0]
    expect(sel.platform).toBe('claude')
    expect(sel.type).toBe('command')
    expect(sel.name).toBe('review-pr')
    expect(sel.repo).toBe('my-org/my-repo')
    expect(sel.path).toBe('.claude/commands/review-pr.md')
  })
})

describe('clearApprovalHandoff', () => {
  it('removes the entry from sessionStorage', () => {
    const key = saveApprovalHandoff(examplePayload)
    expect(loadApprovalHandoff(key)).not.toBeNull()

    clearApprovalHandoff(key)
    expect(loadApprovalHandoff(key)).toBeNull()
  })

  it('is a no-op for unknown keys', () => {
    // Should not throw
    expect(() => clearApprovalHandoff('unknown-key')).not.toThrow()
  })
})

describe('round-trip: save → load → clear', () => {
  it('works for multiple selections', () => {
    const payload: ApprovedConfigStagePayload = {
      orgName: 'acme',
      source: 'discovery-bulk-approve',
      createdAt: '2026-01-01T00:00:00Z',
      selections: [
        { platform: 'claude', type: 'command', name: 'cmd-a', repo: 'r1', path: '.claude/commands/cmd-a.md' },
        { platform: 'claude', type: 'subagent', name: 'agent-x', repo: 'r2', path: '.claude/agents/agent-x.md' },
        { platform: 'claude', type: 'instructions', name: 'CLAUDE.md', repo: 'r1', path: 'CLAUDE.md' },
      ],
    }

    const key = saveApprovalHandoff(payload)
    const loaded = loadApprovalHandoff(key)

    expect(loaded!.selections).toHaveLength(3)
    expect(loaded!.selections[1].type).toBe('subagent')
    expect(loaded!.selections[2].name).toBe('CLAUDE.md')

    clearApprovalHandoff(key)
    expect(loadApprovalHandoff(key)).toBeNull()
  })
})

describe('isStageableSelection', () => {
  it('returns true for types Approved Config can stage (#159, #166)', () => {
    expect(isStageableSelection(exampleSelection)).toBe(true)
    expect(isStageableSelection({ ...exampleSelection, type: 'subagent' })).toBe(true)
    expect(isStageableSelection({ ...exampleSelection, type: 'hook' })).toBe(true)
    expect(isStageableSelection({ ...exampleSelection, type: 'instructions' })).toBe(true)
    expect(isStageableSelection({ ...exampleSelection, type: 'settings' })).toBe(true)
  })

  it('returns false for types the handoff should not silently stage (#159, #166)', () => {
    expect(isStageableSelection({ ...exampleSelection, type: 'rule' })).toBe(false)
    expect(isStageableSelection({ ...exampleSelection, type: 'mcp' })).toBe(false)
  })
})
