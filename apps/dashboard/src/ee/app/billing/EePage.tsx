'use client'

import { Suspense } from 'react'

import { useEffect, useRef, useState } from 'react'

import {
  CreditCard,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Gift,
  Sparkles,
  ExternalLink,
  Loader2,
  Lock,
  Mail,
  Shield,
  Tag,
  Zap,
  Building2,
  Settings,
  Users,
  AlertCircle,
  ArrowLeft,
  X
} from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api, type Organization, type BillingStatus, type CouponValidationResult } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import {
  useWorkspaceAudienceTier,
  useIsWorkspaceAdmin,
} from '@/hooks/useWorkspaceAudienceTier'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_ORGANIZATION, DEMO_BILLING_STATUS } from '@/lib/demo-data'
import { deriveBillingSeatMetrics } from './billing-seat-metrics'

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full" /></div>}>
      <Billing />
    </Suspense>
  )
}

// ---------------------------------------------------------------------------
// #4203 Phase 2: Read-only view for internal/partner orgs
// When internal or partner users navigate directly to /billing, show a
// friendly read-only page instead of the full billing management UI.
// ---------------------------------------------------------------------------
function PrivilegedOrgBillingView({ tier }: { tier: 'internal' | 'partners' }) {
  const isInternal = tier === 'internal'

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-xl sm:text-2xl font-bold mb-2 tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Billing
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Plan information for your workspace
        </p>
      </div>

      <div className="dashboard-card p-8 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{
            backgroundColor: 'color-mix(in srgb, #22c55e 12%, transparent)',
          }}
        >
          <Shield className="w-8 h-8" style={{ color: '#16a34a' }} />
        </div>
        <div className="mb-2">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold"
            style={{
              backgroundColor: 'color-mix(in srgb, #22c55e 12%, transparent)',
              color: '#16a34a',
            }}
          >
            {isInternal ? 'Internal' : 'Design Partner'}
          </span>
        </div>
        <h2
          className="text-lg font-semibold mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          {isInternal
            ? 'Internal -- All Features Enabled'
            : 'Design Partner -- Convenience (Complimentary)'}
        </h2>
        <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
          {isInternal
            ? 'This is an internal Scheduler Systems workspace. Full platform access is included at no cost. No billing configuration is required.'
            : 'This workspace is part of the Design Partner program. Full Convenience-tier access is included at no cost during the partner period.'}
        </p>

        {/* Feature list */}
        <div className="inline-grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-left mb-6">
          {[
            'Auto-Discovery of AI coding tool configs',
            'Approved Config management',
            'CLI sync for developers',
            'Unlimited organizations',
            'Unlimited repositories',
            'Priority support',
          ].map((feature, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <Check className="w-4 h-4 flex-shrink-0" style={{ color: '#16a34a' }} />
              <span style={{ color: 'var(--text-secondary)' }}>{feature}</span>
            </div>
          ))}
        </div>

        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm transition-colors hover:opacity-80"
          style={{ color: 'var(--interactive-primary)' }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// #4203 Phase 1: Access restricted view for non-admin users in public orgs
// ---------------------------------------------------------------------------
function BillingAccessRestricted() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-xl sm:text-2xl font-bold mb-2 tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Billing
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Manage your subscription and view usage
        </p>
      </div>

      <div className="dashboard-card p-8 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
          style={{
            backgroundColor: 'var(--surface-sunken)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <Lock className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
        </div>
        <h2
          className="text-lg font-semibold mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Access Restricted
        </h2>
        <p className="text-sm mb-6 max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
          Billing is managed by your organization administrator.
          Contact your workspace admin if you need to make changes to the subscription.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: 'var(--interactive-primary)',
            color: 'var(--text-on-accent)',
          }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}

function Billing() {
  const { user } = useAuth()
  const selectedWorkspace = useSelectedWorkspace()
  const audienceTier = useWorkspaceAudienceTier()
  const isWorkspaceAdmin = useIsWorkspaceAdmin()
  const searchParams = useSearchParams()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null)
  const [billingLoading, setBillingLoading] = useState(false)
  const lastFetchedOrgRef = useRef<string | null>(null)

  // Billing interval toggle
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly')

  // Checkout state
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  // Feedback state for errors and Stripe redirect results
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // #3300: Read coupon from URL param (?coupon=PARTNER-GRANT)
  const urlCouponCode = searchParams.get('coupon') || ''

  // #3631: Promo code input state
  const [promoExpanded, setPromoExpanded] = useState(!!urlCouponCode)
  const [promoInput, setPromoInput] = useState(urlCouponCode)
  const [promoValidating, setPromoValidating] = useState(false)
  const [promoValidation, setPromoValidation] = useState<CouponValidationResult | null>(null)

  // The active coupon code: validated promo input takes priority, then URL param
  const couponCode = (promoValidation?.valid ? promoValidation.code : undefined) || urlCouponCode || undefined

  // Handle Stripe redirect query params (?success=true or ?canceled=true)
  useEffect(() => {
    const success = searchParams.get('success')
    const canceled = searchParams.get('canceled')

    if (success === 'true') {
      setSuccessMessage('Payment successful! Your subscription is now active.')
      // Clean up URL params without reload
      window.history.replaceState({}, '', '/billing')
    } else if (canceled === 'true') {
      setErrorMessage('Checkout was canceled. No charges were made.')
      window.history.replaceState({}, '', '/billing')
    }
  }, [searchParams])

  // #3631: Auto-validate coupon from URL param
  useEffect(() => {
    if (urlCouponCode && !promoValidation) {
      api.validateCoupon(urlCouponCode).then((result) => {
        setPromoValidation(result)
      }).catch(() => {
        // Silently ignore - URL coupon will still be passed as-is
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCouponCode])

  // Selected workspace IS the org — no fallback, no wrong data
  const orgName = selectedWorkspace || null

  // Load organizations on mount
  useEffect(() => {
    async function loadOrgs() {
      try {
        if (isDemoMode()) {
          setOrganizations([DEMO_ORGANIZATION as unknown as Organization])
          setIsLoading(false)
          return
        }
        const orgs = await api.getOrganizations()
        setOrganizations(orgs)
      } catch {
        // Ignore errors - just show empty state
      } finally {
        setIsLoading(false)
      }
    }
    loadOrgs()
  }, [])

  // Load billing status for the currently selected workspace
  useEffect(() => {
    if (!orgName) {
      setBillingStatus(null)
      setBillingLoading(false)
      lastFetchedOrgRef.current = null
      return
    }

    if (lastFetchedOrgRef.current === orgName) return

    let isCancelled = false
    setBillingLoading(true)
    const fetchStatus = async () => {
      try {
        lastFetchedOrgRef.current = orgName
        if (isDemoMode()) {
          if (!isCancelled) {
            setBillingStatus(DEMO_BILLING_STATUS)
          }
          return
        }
        const status = await api.getBillingStatus(orgName)
        if (!isCancelled) {
          setBillingStatus(status)
        }
      } catch {
        if (!isCancelled) {
          setBillingStatus(null)
        }
      } finally {
        if (!isCancelled) {
          setBillingLoading(false)
        }
      }
    }
    fetchStatus()

    return () => {
      isCancelled = true
    }
  }, [orgName])

  const handleUpgrade = async (planTier: 'convenience' | 'enforcement', interval?: 'monthly' | 'yearly') => {
    if (!orgName) return

    setCheckoutLoading(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const result = await api.createCheckoutSession(orgName, planTier, interval ?? billingInterval, couponCode)
      if (result.url) {
        window.location.href = result.url
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to start checkout. Please try again or contact support.'
      setErrorMessage(message)
    } finally {
      setCheckoutLoading(false)
    }
  }

  const handleManageBilling = async () => {
    if (!orgName) return

    setPortalLoading(true)
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const result = await api.createPortalSession(orgName)
      if (result.url) {
        window.location.href = result.url
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to open billing portal. Please try again or contact support.'
      setErrorMessage(message)
    } finally {
      setPortalLoading(false)
    }
  }

  const handleValidatePromo = async () => {
    const code = promoInput.trim()
    if (!code) return

    setPromoValidating(true)
    setPromoValidation(null)
    try {
      const result = await api.validateCoupon(code)
      setPromoValidation(result)
    } catch {
      setPromoValidation({
        valid: false,
        code,
        error: 'Failed to validate coupon code. Please try again.',
      })
    } finally {
      setPromoValidating(false)
    }
  }

  const handleRemovePromo = () => {
    setPromoInput('')
    setPromoValidation(null)
  }

  // Check if user is a design partner (convenience tier with 100% off coupon OR no subscription)
  // #3301: With Stripe subscriptions at $0, status is 'active' not 'none'
  const isDesignPartner = billingStatus?.planTier === 'convenience' && (
    billingStatus?.status === 'none' ||
    billingStatus?.coupon?.percentOff === 100
  )

  // #4028: Internal and partner orgs should never see upgrade prompts or "GAL free" label.
  const isInternalOrg = billingStatus?.audienceTier === 'internal'
  const isPartnerOrg = billingStatus?.audienceTier === 'partners'
  const isPrivilegedOrg = isInternalOrg || isPartnerOrg

  // #4219: Check if subscription has payment issues
  const isPastDue = billingStatus?.status === 'past_due'

  // Check if user has an active paid subscription
  const hasPaidSubscription = billingStatus?.status && billingStatus.status !== 'none'

  // Check if user is on free tier (can upgrade to convenience)
  // #4028: Privileged orgs (internal/partners) are never treated as "free tier" for UI purposes
  const isFreeTier = !isPrivilegedOrg && (billingStatus?.planTier === 'free' || !billingStatus?.planTier)

  // BUG-010/011 + #4202: keep seat display/cost math finite and stable.
  const {
    seatsUsed,
    seatLimit,
    isUnlimitedSeats,
    seatsAvailable,
    seatUsagePercent,
    isOverSeatLimit,
    pricePerSeat,
    monthlyCost,
  } = deriveBillingSeatMetrics({
    rawSeatsUsed: billingStatus?.seatsUsed,
    rawSeatLimit: billingStatus?.seatLimit,
    planTier: billingStatus?.planTier,
  })

  // Annual pricing: 2 months free (~17% off), billed as annual lump sum
  const ANNUAL_PRICES: Record<string, { yearly: number; monthlyEquiv: number }> = {
    convenience: { yearly: 100, monthlyEquiv: 8.33 },
    enforcement: { yearly: 250, monthlyEquiv: 20.83 },
  }

  if (!user) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="dashboard-card p-8 text-center">
          <CreditCard className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Sign in Required</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Please sign in to view billing information.</p>
        </div>
      </div>
    )
  }

  // #4203 Phase 2: Internal/partner orgs — show read-only plan info, no billing management.
  // This check uses the audience tier from the feature flags context (not billing API)
  // so it works even before billing status loads, providing immediate gating.
  if (audienceTier === 'internal' || audienceTier === 'partners') {
    return <PrivilegedOrgBillingView tier={audienceTier as 'internal' | 'partners'} />
  }

  // #4203 Phase 1: Non-admin users in public orgs — show friendly restricted page.
  // Uses the workspace admin check from user.adminOrganizations, not billing API.
  if (!isWorkspaceAdmin && !isDemoMode()) {
    return <BillingAccessRestricted />
  }

  if (isLoading || billingLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="dashboard-card p-8 text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin" style={{ color: 'var(--accent)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl sm:text-2xl font-bold mb-2 tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Billing
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Manage your subscription and view usage
        </p>
      </div>

      {/* #4219: Payment failure warning */}
      {isPastDue && !isPrivilegedOrg && (
        <div
          className="mb-6 p-4 rounded-lg flex items-center justify-between"
          style={{
            backgroundColor: 'var(--status-danger-light)',
            border: '1px solid var(--status-danger)',
          }}
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--status-danger)' }} />
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Payment failed
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {billingStatus?.lastPaymentFailedAt ? (() => {
                  const failedMs = new Date(billingStatus.lastPaymentFailedAt!).getTime()
                  const graceDays = Math.max(0, Math.ceil((7 * 24 * 60 * 60 * 1000 - (Date.now() - failedMs)) / (24 * 60 * 60 * 1000)))
                  return graceDays > 0
                    ? `Update your payment method within ${graceDays} day${graceDays === 1 ? '' : 's'} to keep access to paid features.`
                    : 'Your grace period has expired. Update your payment method to restore access.'
                })() : 'Please update your payment method to continue using paid features.'}
              </p>
            </div>
          </div>
          <button
            onClick={handleManageBilling}
            disabled={portalLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors"
            style={{
              backgroundColor: 'var(--status-danger)',
              color: '#fff',
            }}
          >
            {portalLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CreditCard className="w-3.5 h-3.5" />
            )}
            Update Payment
          </button>
        </div>
      )}

      {/* #4202: Over seat limit warning */}
      {isOverSeatLimit && !isPrivilegedOrg && (
        <div
          className="mb-6 p-4 rounded-lg flex items-center gap-3"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--status-warning) 12%, transparent)',
            border: '1px solid var(--status-warning)',
          }}
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--status-warning)' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Over seat limit
            </p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Your workspace has {seatsUsed} member{seatsUsed !== 1 ? 's' : ''} but your plan allows {seatLimit}.
              {isFreeTier
                ? ' Upgrade your plan to add more seats.'
                : ' Purchase additional seats to stay within your limit.'}
            </p>
          </div>
        </div>
      )}

      {/* Coupon banner (#3300) — shows for URL-provided coupons or validated promo codes */}
      {couponCode && isFreeTier && (
        <div
          className="mb-6 p-4 rounded-lg flex items-center gap-3"
          style={{
            backgroundColor: 'var(--accent-bg)',
            border: '1px solid var(--accent)',
          }}
        >
          <Gift className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
            Coupon <strong>{couponCode}</strong> will be applied at checkout.
          </p>
        </div>
      )}

      {/* Success banner */}
      {successMessage && (
        <div
          className="mb-6 p-4 rounded-lg flex items-center justify-between"
          style={{
            backgroundColor: 'var(--status-success-light)',
            border: '1px solid var(--status-success)',
          }}
        >
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--status-success)' }} />
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{successMessage}</p>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="p-1 rounded hover:opacity-70 transition-opacity"
          >
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      )}

      {/* Error banner */}
      {errorMessage && (
        <div
          className="mb-6 p-4 rounded-lg flex items-center justify-between"
          style={{
            backgroundColor: 'var(--status-danger-light)',
            border: '1px solid var(--status-danger)',
          }}
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--status-danger)' }} />
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="p-1 rounded hover:opacity-70 transition-opacity"
          >
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      )}


      {/* Current Plan */}
      {/* #4028: Internal / partner orgs — show access tier, hide all upgrade prompts */}
      {isPrivilegedOrg ? (
        <div className="dashboard-card p-6 mb-6 shadow-md hover:shadow-xl transition-all duration-300 ring-2 ring-[var(--border-default)] shadow-none">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--accent-bg)' }}
            >
              <Shield className="w-6 h-6" style={{ color: 'var(--accent)' }} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  {isInternalOrg ? 'Internal Access' : 'Partner Access'}
                </h2>
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}
                >
                  {isInternalOrg ? 'Internal' : 'Partner'}
                </span>
              </div>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                {isInternalOrg
                  ? 'This is an internal Scheduler Systems organization. Full platform access is included.'
                  : 'This organization has partner access. Full platform access is included.'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  'Auto-Discovery of AI coding tool configs',
                  'Approved Config management',
                  'CLI sync for developers',
                  'Unlimited organizations',
                  'Unlimited repositories',
                  'Priority support',
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 flex-shrink-0 text-[var(--accent-neon)]" />
                    <span style={{ color: 'var(--text-secondary)' }}>{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : isFreeTier ? (
        /* Free Tier - Show upgrade option */
        <div className="dashboard-card p-6 mb-6 shadow-md hover:shadow-xl transition-all duration-300">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <Shield className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  GAL Free
                </h2>
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
                >
                  Up to 5 developers
                </span>
              </div>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Basic access for small teams. Upgrade to Convenience for unlimited developers and priority support.
              </p>

              {/* Free tier features */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {[
                  'Auto-Discovery of AI coding tool configs',
                  'Approved Config management',
                  'CLI sync for developers',
                  'Up to 5 developers',
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 flex-shrink-0 text-[var(--accent-neon)]" />
                    <span style={{ color: 'var(--text-secondary)' }}>{feature}</span>
                  </div>
                ))}
              </div>

              {/* #3631: Promo code input */}
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => setPromoExpanded(!promoExpanded)}
                  className="flex items-center gap-1.5 text-sm transition-colors hover:opacity-80"
                  style={{ color: 'var(--accent)' }}
                >
                  <Tag className="w-3.5 h-3.5" />
                  Have a promo code?
                  {promoExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                {promoExpanded && (
                  <div className="mt-3">
                    {promoValidation?.valid ? (
                      <div
                        className="flex items-center justify-between p-3 rounded-lg"
                        style={{
                          backgroundColor: 'var(--accent-bg)',
                          border: '1px solid var(--accent)',
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {promoValidation.code}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {promoValidation.percentOff
                                ? `${promoValidation.percentOff}% off`
                                : promoValidation.amountOff
                                  ? `$${(promoValidation.amountOff / 100).toFixed(2)} off`
                                  : 'Discount applied'}
                              {promoValidation.duration === 'forever'
                                ? ' forever'
                                : promoValidation.duration === 'once'
                                  ? ' (first payment)'
                                  : promoValidation.duration === 'repeating'
                                    ? ' (limited time)'
                                    : ''}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={handleRemovePromo}
                          className="p-1 rounded hover:opacity-70 transition-opacity"
                          title="Remove promo code"
                        >
                          <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={promoInput}
                          onChange={(e) => {
                            setPromoInput(e.target.value.toUpperCase())
                            if (promoValidation) setPromoValidation(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleValidatePromo()
                            }
                          }}
                          placeholder="e.g. PARTNER-GRANT"
                          className="flex-1 px-3 py-2 rounded-lg text-sm"
                          style={{
                            backgroundColor: 'var(--bg-secondary)',
                            border: `1px solid ${promoValidation && !promoValidation.valid ? 'var(--status-danger)' : 'var(--border-subtle)'}`,
                            color: 'var(--text-primary)',
                            outline: 'none',
                          }}
                          disabled={promoValidating}
                        />
                        <button
                          onClick={handleValidatePromo}
                          disabled={promoValidating || !promoInput.trim()}
                          className="btn-secondary px-4 py-2 text-sm"
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          {promoValidating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Apply'
                          )}
                        </button>
                      </div>
                    )}

                    {promoValidation && !promoValidation.valid && (
                      <p className="mt-2 text-xs" style={{ color: 'var(--status-danger)' }}>
                        {promoValidation.error || 'Invalid or expired promo code.'}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Upgrade buttons — Monthly and Annual side by side */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => handleUpgrade('convenience', 'monthly')}
                  disabled={checkoutLoading}
                  className="btn-primary flex-1"
                >
                  {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                  Upgrade to Convenience — $10/seat/month
                </button>

                <button
                  onClick={() => handleUpgrade('convenience', 'yearly')}
                  disabled={checkoutLoading}
                  className="btn-primary flex-1"
                >
                  {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                  Upgrade Annual — $100/seat/year · All Convenience features · 2 months free · $8.33/mo · Save 17%
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Convenience Tier */
        <div
          className="dashboard-card p-6 mb-6 shadow-md hover:shadow-xl transition-all duration-300 ring-2 ring-[var(--border-default)] shadow-none"
        >
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'var(--accent-bg)' }}
            >
              {isDesignPartner ? (
                <Gift className="w-6 h-6" style={{ color: 'var(--accent)' }} />
              ) : (
                <Shield className="w-6 h-6" style={{ color: 'var(--accent)' }} />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  GAL Convenience
                </h2>
                {isDesignPartner && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}
                  >
                    Design Partner
                  </span>
                )}
              </div>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                {isDesignPartner
                  ? "You're part of our Design Partner program. Enjoy full access to GAL Convenience features at no cost."
                  : 'Full access to AI agent governance features for your workspace.'}
              </p>

              {/* Features included */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {[
                  'Auto-Discovery of AI coding tool configs',
                  'Approved Config management',
                  'CLI sync for developers',
                  'Unlimited organizations',
                  'Unlimited repositories',
                  'Priority support'
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 flex-shrink-0 text-[var(--accent-neon)]" />
                    <span style={{ color: 'var(--text-secondary)' }}>{feature}</span>
                  </div>
                ))}
              </div>

              {/* Manage Subscription button for paid subscribers */}
              {hasPaidSubscription && (
                <button
                  onClick={handleManageBilling}
                  disabled={portalLoading}
                  className="btn-secondary"
                >
                  {portalLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Settings className="w-4 h-4 mr-2" />
                  )}
                  Manage Subscription
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Seat Usage Card */}
      <div className="dashboard-card p-6 mb-6 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-[var(--accent-neon)]" />
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Seat Usage
          </h3>
        </div>

        {/* Seat count display */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {seatsUsed} of {isUnlimitedSeats ? 'Unlimited' : seatLimit} seats used
            </span>
            <span className="text-sm font-medium" style={{ color: seatsAvailable === 0 && !isUnlimitedSeats ? 'var(--status-danger-text)' : 'var(--interactive-primary)' }}>
              {isUnlimitedSeats ? 'Unlimited' : seatsAvailable} available
            </span>
          </div>

          {/* Progress bar */}
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${seatUsagePercent}%`,
                backgroundColor: seatUsagePercent >= 90 ? 'var(--status-danger)' : seatUsagePercent >= 75 ? 'var(--status-warning)' : 'var(--interactive-primary)'
              }}
            />
          </div>
        </div>

        {/* Monthly cost (for paid plans) */}
        {!isFreeTier && !isDesignPartner && hasPaidSubscription && (
          <div
            className="p-3 rounded-lg mb-4"
            style={{ backgroundColor: 'var(--bg-tertiary)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Monthly cost</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                  ${monthlyCost}<span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>/month</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {seatsUsed} seat{seatsUsed !== 1 ? 's' : ''} × ${pricePerSeat}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Seat management info */}
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {hasPaidSubscription
            ? 'Seats are adjusted automatically when developers join via invite. You can also manage seats in the Stripe Customer Portal.'
            : isPrivilegedOrg
              ? `${isInternalOrg ? 'Internal' : 'Partner'} orgs have unlimited seats.`
              : isFreeTier
                ? 'Free tier includes up to 5 developers. Upgrade to add more seats.'
                : 'Design Partners have unlimited seats during the early access period.'}
        </p>
      </div>

      {/* Account Status */}
      <div className="dashboard-card p-6 mb-6 shadow-sm hover:shadow-md transition-all duration-200">
        <h3 className="text-sm font-medium mb-4" style={{ color: 'var(--text-primary)' }}>
          Account Status
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Plan</span>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {isInternalOrg ? 'Internal Access' : isPartnerOrg ? 'Partner Access' : isFreeTier ? 'Free' : isDesignPartner ? 'Convenience (Design Partner)' : billingStatus?.planTier === 'enforcement' ? 'Enforcement' : 'Convenience'}
            </span>
          </div>
          <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Price</span>
            <div className="flex items-center gap-2">
              {isPrivilegedOrg ? (
                <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Included</span>
              ) : isFreeTier ? (
                <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Free (up to 5 devs)</span>
              ) : isDesignPartner ? (
                <>
                  <span className="text-sm line-through" style={{ color: 'var(--text-muted)' }}>$10/seat/month</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>Free</span>
                </>
              ) : (
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  ${pricePerSeat}/seat/month
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Organizations</span>
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              {organizations.length}
            </span>
          </div>
          {billingStatus?.currentPeriodEnd && hasPaidSubscription && (
            <div className="flex items-center justify-between py-2">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {billingStatus.cancelAtPeriodEnd ? 'Access until' : 'Next billing'}
              </span>
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {new Date(billingStatus.currentPeriodEnd).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {/* Manage Subscription button for paying customers */}
        {hasPaidSubscription && (
          <button
            onClick={handleManageBilling}
            disabled={portalLoading}
            className="btn-secondary w-full mt-4"
          >
            {portalLoading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Settings className="w-4 h-4 mr-2" />
            )}
            Manage Subscription
          </button>
        )}
      </div>

      {/* Upgrade Plans — hidden for internal/partner orgs (#4028) */}
      {!isPrivilegedOrg && <div className="dashboard-card p-6 mb-6 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-[var(--accent-neon)]" />
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Upgrade Your Plan
          </h3>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Unlock advanced governance features with higher tiers.
          {isDesignPartner && ' As a Design Partner, you\'ll get special pricing.'}
        </p>

        {/* Billing interval toggle */}
        <div className="flex items-center gap-1 mb-4 p-1 rounded-lg w-fit" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          <button
            onClick={() => setBillingInterval('monthly')}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={billingInterval === 'monthly'
              ? { backgroundColor: 'var(--interactive-primary)', color: 'var(--text-on-accent)' }
              : { color: 'var(--text-secondary)' }}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingInterval('yearly')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            style={billingInterval === 'yearly'
              ? { backgroundColor: 'var(--interactive-primary)', color: 'var(--text-on-accent)' }
              : { color: 'var(--text-secondary)' }}
          >
            Annual
            <span
              className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
              style={{ backgroundColor: 'var(--accent-neon)', color: '#000' }}
            >
              2 months free
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Enforcement Tier */}
          <div
            className="p-4 rounded-lg shadow-sm hover:shadow-lg transition-all duration-300"
            style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-[var(--accent-neon)]" />
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Enforcement</span>
            </div>
            <p className="text-xs mb-3 font-semibold text-[var(--accent-neon)]">
              {billingInterval === 'yearly'
                ? '$20.83/dev/mo · billed $250/yr'
                : '$25/dev/month'}
            </p>
            <ul className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <li>Everything in Convenience</li>
              <li>Policy enforcement at runtime</li>
              <li>Audit logging</li>
              <li>Team management</li>
            </ul>
            <button
              onClick={() => handleUpgrade('enforcement')}
              disabled={checkoutLoading}
              className="btn-secondary w-full mt-3 text-xs"
            >
              {billingInterval === 'yearly'
                ? 'Upgrade to Enforcement — $20.83/seat/mo'
                : 'Upgrade to Enforcement — $25/seat/mo'}
            </button>
          </div>

          {/* Enterprise Tier */}
          <div
            className="p-4 rounded-lg shadow-sm hover:shadow-lg transition-all duration-300"
            style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-5 h-5 text-[var(--accent-neon)]" />
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Enterprise</span>
            </div>
            <p className="text-xs mb-3 font-semibold text-[var(--accent-neon)]">
              Custom pricing
            </p>
            <ul className="space-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <li>Everything in Enforcement</li>
              <li>SSO / SAML</li>
              <li>Custom integrations</li>
              <li>Dedicated support</li>
            </ul>
            <a
              href="mailto:enterprise@gal.run"
              className="btn-secondary w-full mt-3 text-xs inline-flex items-center justify-center"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </div>}

      {/* Contact for billing questions */}
      <div className="dashboard-card p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Questions about billing or your subscription?
          </p>
        </div>
        <a
          href="mailto:support@gal.run"
          className="text-sm flex items-center gap-1 transition-colors hover:opacity-80"
          style={{ color: 'var(--accent)' }}
        >
          Contact us
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}
