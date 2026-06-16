import { describe, expect, it } from 'vitest'

import { formatTimelineTime, toTimelineDate } from './session-timeline-utils'

describe('session-timeline-utils', () => {
  it('parses serialized Firestore timestamps from session payloads', () => {
    const date = toTimelineDate({
      _seconds: 1774524215,
      _nanoseconds: 829000000,
    })

    expect(date?.toISOString()).toBe('2026-03-26T11:23:35.829Z')
  })

  it('returns an empty label for invalid timestamps', () => {
    expect(formatTimelineTime({ _seconds: 'not-a-number' })).toBe('')
  })
})
