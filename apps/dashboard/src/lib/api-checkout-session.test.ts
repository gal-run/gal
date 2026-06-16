import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './api'

describe('APIClient.createCheckoutSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('window', {
      location: {
        origin: 'https://app.gal.run',
      },
    } as Window)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends Stripe redirect URLs and coupon codes to the checkout endpoint (#2590)', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.test/session' }),
    } as any)

    const result = await api.createCheckoutSession(
      'Scheduler-Systems',
      'convenience',
      'monthly',
      'PARTNER100',
    )

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/organizations/Scheduler-Systems/billing/checkout',
      {
        method: 'POST',
        body: JSON.stringify({
          planTier: 'convenience',
          billingInterval: 'monthly',
          successUrl: 'https://app.gal.run/billing?success=true',
          cancelUrl: 'https://app.gal.run/billing?canceled=true',
          couponCode: 'PARTNER100',
        }),
      },
    )
    expect(result).toEqual({ url: 'https://checkout.stripe.test/session' })
  })

  it('throws the API error message instead of silently returning null (#2590)', async () => {
    vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Stripe not configured' }),
    } as any)

    await expect(
      api.createCheckoutSession('Scheduler-Systems', 'convenience', 'monthly'),
    ).rejects.toThrow('Stripe not configured')
  })

  it('falls back to the generic checkout message when the error body is not JSON', async () => {
    vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: false,
      json: vi.fn().mockRejectedValue(new Error('invalid json')),
    } as any)

    await expect(
      api.createCheckoutSession('Scheduler-Systems', 'convenience', 'monthly'),
    ).rejects.toThrow('Failed to start checkout. Please try again or contact support.')
  })
})
