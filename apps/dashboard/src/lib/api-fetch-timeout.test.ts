import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './api'

describe('APIClient.fetchWithAuth timeout handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()

    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string | URL | Request, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal

          if (signal?.aborted) {
            const abortError = new Error('The operation was aborted')
            abortError.name = 'AbortError'
            reject(abortError)
            return
          }

          signal?.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted')
            abortError.name = 'AbortError'
            reject(abortError)
          })
        })
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('aborts stalled requests after the configured timeout', async () => {
    const request = api.fetchWithAuth('http://localhost:3000/api/slow', {
      timeoutMs: 50,
    })
    const assertion = expect(request).rejects.toThrow('Request timeout:')

    await vi.advanceTimersByTimeAsync(50)

    await assertion
  })
})
