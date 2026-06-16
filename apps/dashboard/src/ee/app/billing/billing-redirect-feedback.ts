export interface BillingRedirectFeedback {
  errorMessage: string | null
  successMessage: string | null
  shouldClearParams: boolean
}

export function getBillingRedirectFeedback(
  searchParams: Pick<URLSearchParams, 'get'>
): BillingRedirectFeedback {
  const success = searchParams.get('success')
  const canceled = searchParams.get('canceled')

  if (success === 'true') {
    return {
      errorMessage: null,
      successMessage: 'Payment successful! Your subscription is now active.',
      shouldClearParams: true,
    }
  }

  if (canceled === 'true') {
    return {
      errorMessage: 'Checkout was canceled. No charges were made.',
      successMessage: null,
      shouldClearParams: true,
    }
  }

  return {
    errorMessage: null,
    successMessage: null,
    shouldClearParams: false,
  }
}
