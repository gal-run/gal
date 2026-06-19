import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const firebaseChatSessionSource = readFileSync(
  join(__dirname, 'FirebaseChatSession.tsx'),
  'utf8',
)

const queueTabContentSource = readFileSync(
  join(__dirname, 'QueueTabContent.tsx'),
  'utf8',
)

describe('chat + queue UX contracts', () => {
  it('keeps chat input/tool-activity error handling and rendering contracts (#1435, #1613)', () => {
    expect(firebaseChatSessionSource).toContain("import { ToolActivityMessage } from './ToolActivityMessage'")
    expect(firebaseChatSessionSource).toContain('<ToolActivityMessage tools={message.toolActivity} timestamp={message.timestamp} />')
    expect(firebaseChatSessionSource).toContain("console.error('[Chat] Failed to send input:', error)")
    expect(firebaseChatSessionSource).toContain("content: 'Failed to send message. Please try again.'")
  })

  it('keeps input prompt colors tokenized for light/dark readability and avoids floating scroll-button overlap affordances (#1916, #1479)', () => {
    expect(firebaseChatSessionSource).toContain("placeholder:text-[var(--text-tertiary)]")
    expect(firebaseChatSessionSource).toContain("color: 'var(--text-primary)'")
    expect(firebaseChatSessionSource).toContain("backgroundColor: inputValue.trim() ? 'var(--accent)' : 'var(--bg-tertiary)'")
    expect(firebaseChatSessionSource).toContain("color: inputValue.trim() ? 'var(--text-on-accent)' : 'var(--text-muted)'")
    expect(firebaseChatSessionSource).not.toContain('Scroll to bottom')
  })

  it('keeps queue surface text and status styling based on semantic design tokens (#1034)', () => {
    expect(queueTabContentSource).toContain("style={{ color: 'var(--text-primary)' }}")
    expect(queueTabContentSource).toContain("style={{ color: 'var(--text-secondary)' }}")
    expect(queueTabContentSource).toContain("style={{ color: 'var(--text-muted)' }}")
    expect(queueTabContentSource).toContain("style={{ color: 'var(--status-danger)' }}")
    expect(queueTabContentSource).toContain("style={{ backgroundColor: 'var(--accent)', color: 'var(--text-on-accent)' }}")
  })

  it('keeps queue failure visibility UX for blocked dispatches and failed-item diagnostics (#4765)', () => {
    expect(queueTabContentSource).toContain('Dispatch Blocked')
    expect(queueTabContentSource).toContain('Systemic Failures Detected')
    expect(queueTabContentSource).toContain('Failed Items')
    expect(queueTabContentSource).toContain('Action:')
    expect(queueTabContentSource).toContain('Failed step:')
    expect(queueTabContentSource).toContain('Workflow run')
    expect(queueTabContentSource).toContain('Token expired')
    expect(queueTabContentSource).toContain('Command not approved')
  })

  it('exposes explicit queue positioning controls instead of priority-only ordering (#4587)', () => {
    expect(queueTabContentSource).toContain('Exact execution order')
    expect(queueTabContentSource).toContain('Position')
    expect(queueTabContentSource).toContain('Move to front')
    expect(queueTabContentSource).toContain('Move to back')
  })

  it('keeps queue autonomy visibility and manual intervention logging on the queue page (#4571)', () => {
    expect(queueTabContentSource).toContain('Queue Autonomy')
    expect(queueTabContentSource).toContain('Recent Interventions')
    expect(queueTabContentSource).toContain('Log intervention')
    expect(queueTabContentSource).toContain('Last 24h')
    expect(queueTabContentSource).toContain('Why was manual intervention required?')
  })
})
