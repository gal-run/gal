'use client'

/**
 * ReviewPrompt Component (#6209)
 *
 * Dismissible inline banner asking engaged users to leave a G2 review.
 *
 * Display conditions (ALL must be true):
 *   - Desktop viewport (>= 768px wide)
 *   - User has 7+ completed sessions in the last 7 days
 *   - Has not been asked in the last 60 days (localStorage dedupe per user)
 *
 * Copy is honest-feedback framed — NEVER solicits positive ratings.
 * Clicking either button writes the timestamp (60-day cooldown).
 */

import { useEffect, useMemo, useState } from 'react'
import { X, Star } from 'lucide-react'
import type { Session } from '@gal/types'

interface ReviewPromptProps {
  sessions: Session[]
  userId?: string
  reviewUrl?: string
}

const DEFAULT_REVIEW_URL = 'https://www.g2.com/products/gal/reviews'
const STORAGE_KEY_PREFIX = 'gal-review-ask-v1-'
const COOLDOWN_DAYS = 60
const COMPLETED_THRESHOLD = 7
const WINDOW_DAYS = 7
const DESKTOP_BREAKPOINT_PX = 768

function storageKeyForUser(userId: string | undefined): string {
  return `${STORAGE_KEY_PREFIX}${userId || 'anonymous'}`
}

function isWithinLastDays(date: Date, days: number): boolean {
  const now = Date.now()
  const diffMs = now - date.getTime()
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000
}

function coerceDate(value: string | Date | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  const parsed = new Date(value)
  return isNaN(parsed.getTime()) ? null : parsed
}

export function countRecentCompletedSessions(sessions: Session[]): number {
  let count = 0
  for (const session of sessions) {
    if (session.status !== 'TERMINATED') continue
    // Use terminatedAt when available, otherwise fall back to lastActivityAt or createdAt
    const end =
      coerceDate(session.terminatedAt) ||
      coerceDate(session.lastActivityAt) ||
      coerceDate(session.createdAt)
    if (!end) continue
    if (isWithinLastDays(end, WINDOW_DAYS)) count += 1
  }
  return count
}

function readLastAskedAt(userId: string | undefined): Date | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKeyForUser(userId))
    if (!raw) return null
    const parsed = new Date(raw)
    return isNaN(parsed.getTime()) ? null : parsed
  } catch {
    return null
  }
}

function writeLastAskedAt(userId: string | undefined): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKeyForUser(userId), new Date().toISOString())
  } catch {
    // Ignore storage errors (e.g. private browsing, quota exceeded)
  }
}

export function ReviewPrompt({ sessions, userId, reviewUrl }: ReviewPromptProps) {
  const [mounted, setMounted] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [recentlyAsked, setRecentlyAsked] = useState<boolean>(true)

  const effectiveReviewUrl = reviewUrl || DEFAULT_REVIEW_URL

  // Initialise client-only state — avoids SSR/hydration mismatch.
  useEffect(() => {
    setMounted(true)

    const checkViewport = () => {
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT_PX)
    }
    checkViewport()
    window.addEventListener('resize', checkViewport)

    const lastAsked = readLastAskedAt(userId)
    if (!lastAsked) {
      setRecentlyAsked(false)
    } else {
      setRecentlyAsked(isWithinLastDays(lastAsked, COOLDOWN_DAYS))
    }

    return () => window.removeEventListener('resize', checkViewport)
  }, [userId])

  const eligibleByCount = useMemo(
    () => countRecentCompletedSessions(sessions) >= COMPLETED_THRESHOLD,
    [sessions],
  )

  const handleLeaveReview = () => {
    writeLastAskedAt(userId)
    setDismissed(true)
    if (typeof window !== 'undefined') {
      window.open(effectiveReviewUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const handleNotNow = () => {
    writeLastAskedAt(userId)
    setDismissed(true)
  }

  if (!mounted) return null
  if (!isDesktop) return null
  if (dismissed) return null
  if (recentlyAsked) return null
  if (!eligibleByCount) return null

  return (
    <div
      role="region"
      aria-label="Review prompt"
      data-testid="review-prompt"
      className="mb-3 flex items-start gap-3 rounded-lg px-4 py-3"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: 'var(--accent-bg)' }}
      >
        <Star className="h-4 w-4" style={{ color: 'var(--accent)' }} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
          Love GAL? A 2-minute review on G2 helps other teams find us.{' '}
          <span style={{ color: 'var(--text-secondary)' }}>
            Honest feedback only — no pressure on rating.
          </span>
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={handleLeaveReview}
            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--text-on-accent)',
            }}
          >
            Leave review →
          </button>
          <button
            type="button"
            onClick={handleNotNow}
            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            Not now
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleNotNow}
        aria-label="Dismiss review prompt"
        className="flex-shrink-0 rounded p-1 transition-colors hover:bg-[var(--bg-tertiary)]"
        style={{ color: 'var(--text-muted)' }}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export default ReviewPrompt
