import { describe, expect, it } from 'vitest'

import { getBillingRedirectFeedback } from './billing-redirect-feedback'

describe('getBillingRedirectFeedback', () => {
  it('returns a success message for Stripe success redirects (#2590)', () => {
    const params = new URLSearchParams('success=true')

    expect(getBillingRedirectFeedback(params)).toEqual({
      errorMessage: null,
      successMessage: 'Payment successful! Your subscription is now active.',
      shouldClearParams: true,
    })
  })

  it('returns an error message for canceled checkout redirects (#2590)', () => {
    const params = new URLSearchParams('canceled=true')

    expect(getBillingRedirectFeedback(params)).toEqual({
      errorMessage: 'Checkout was canceled. No charges were made.',
      successMessage: null,
      shouldClearParams: true,
    })
  })

  it('leaves unrelated billing URLs untouched', () => {
    const params = new URLSearchParams('coupon=PARTNER100')

    expect(getBillingRedirectFeedback(params)).toEqual({
      errorMessage: null,
      successMessage: null,
      shouldClearParams: false,
    })
  })
})
