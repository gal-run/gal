import { describe, expect, it } from 'vitest'
import { classifyEmailTriageInput } from './email-rules-adapter.js'

describe('classifyEmailTriageInput', () => {
  it('classifies synthetic newsletters for archive', () => {
    const result = classifyEmailTriageInput({
      from: 'news@news.example.net',
      senderName: 'example-news',
      subject: 'Weekly newsletter',
      body: 'Digest with unsubscribe link',
      type: 'newsletter',
    })

    expect(result).toEqual({
      label: 'example-news',
      createTask: false,
      archive: true,
    })
  })

  it('keeps action-required mail in inbox', () => {
    const result = classifyEmailTriageInput({
      from: 'support@platform.example.net',
      senderName: 'platform',
      subject: 'Action required: verify your deployment',
      body: 'Please verify your deployment.',
    })

    expect(result.label).toBe('platform')
    expect(result.createTask).toBe(true)
    expect(result.archive).toBe(false)
  })
})
