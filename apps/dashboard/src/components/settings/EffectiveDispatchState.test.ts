import { describe, expect, it } from 'vitest'
import { computeEffectiveDispatchState } from './EffectiveDispatchState'

describe('computeEffectiveDispatchState', () => {
  it('prioritizes the global dispatch toggle over lower-level readiness (#2238)', () => {
    const result = computeEffectiveDispatchState({
      globalEnabled: false,
      consumerPaused: false,
      anyCategoryEnabled: true,
    })

    expect(result.willDispatch).toBe(false)
    expect(result.blockingReason).toBe('Global auto-dispatch is disabled')
  })

  it('reports the queue consumer pause as the effective blocker when global dispatch is enabled (#2238)', () => {
    const result = computeEffectiveDispatchState({
      globalEnabled: true,
      consumerPaused: true,
      anyCategoryEnabled: true,
    })

    expect(result.willDispatch).toBe(false)
    expect(result.blockingReason).toBe('Queue consumer is paused')
  })

  it('treats All Categories disabled as inactive even when global dispatch is enabled (#2238)', () => {
    const result = computeEffectiveDispatchState({
      globalEnabled: true,
      consumerPaused: false,
      anyCategoryEnabled: false,
    })

    expect(result.willDispatch).toBe(false)
    expect(result.blockingReason).toBe('No categories are enabled')
  })

  it('allows dispatch only when global, consumer, and category state are all active (#2238)', () => {
    const result = computeEffectiveDispatchState({
      globalEnabled: true,
      consumerPaused: false,
      anyCategoryEnabled: true,
      categoryName: 'Queue',
      categoryEnabled: true,
    })

    expect(result.willDispatch).toBe(true)
    expect(result.blockingReason).toBeNull()
  })
})
