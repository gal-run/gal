'use client'

/**
 * FeedbackWidget - Floating feedback collection widget (Issue #1111)
 *
 * A non-intrusive floating button in the bottom-right corner that expands
 * into a feedback form. Supports quick thumbs up/down with optional
 * reason selection and comment.
 *
 * Features:
 * - Floating action button (always visible)
 * - Quick thumbs up/down rating
 * - Reason selection for negative feedback
 * - Optional comment field
 * - Frequency capping (max 1 prompt per session)
 * - Respects user opt-out
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { MessageSquare, ThumbsUp, ThumbsDown, X, Send, Check } from 'lucide-react'
import { api } from '@/lib/api'

type FeedbackRating = 'positive' | 'negative'
type NegativeFeedbackReason =
  | 'inaccurate'
  | 'not-helpful'
  | 'too-slow'
  | 'confusing-ui'
  | 'missing-feature'
  | 'other'

const REASON_LABELS: Record<NegativeFeedbackReason, string> = {
  'inaccurate': 'Inaccurate',
  'not-helpful': 'Not helpful',
  'too-slow': 'Too slow',
  'confusing-ui': 'Confusing UI',
  'missing-feature': 'Missing feature',
  'other': 'Other',
}

const FEEDBACK_DISMISSED_KEY = 'gal-feedback-dismissed'
const FEEDBACK_SUBMITTED_KEY = 'gal-feedback-submitted-at'

interface FeedbackWidgetProps {
  /** Optional action context for the feedback */
  context?: {
    action?: string
    location?: string
  }
}

type WidgetState = 'button' | 'rating' | 'reason' | 'comment' | 'submitted'

export function FeedbackWidget({ context }: FeedbackWidgetProps): React.ReactElement | null {
  const [state, setState] = useState<WidgetState>('button')
  const [rating, setRating] = useState<FeedbackRating | null>(null)
  const [reason, setReason] = useState<NegativeFeedbackReason | null>(null)
  const [comment, setComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [recentlySubmitted, setRecentlySubmitted] = useState(false)
  const widgetRef = useRef<HTMLDivElement>(null)

  // Read sessionStorage/localStorage only on the client (avoids SSR ReferenceError)
  useEffect(() => {
    try {
      setIsDismissed(sessionStorage.getItem(FEEDBACK_DISMISSED_KEY) === 'true')
    } catch {
      // sessionStorage unavailable
    }
    try {
      const lastSubmitted = localStorage.getItem(FEEDBACK_SUBMITTED_KEY)
      setRecentlySubmitted(
        lastSubmitted
          ? Date.now() - parseInt(lastSubmitted, 10) < 24 * 60 * 60 * 1000 // 24 hours
          : false
      )
    } catch {
      // localStorage unavailable
    }
  }, [])

  // Close widget when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node) && state !== 'button' && state !== 'submitted') {
        setState('button')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [state])

  const handleDismiss = useCallback(() => {
    try {
      sessionStorage.setItem(FEEDBACK_DISMISSED_KEY, 'true')
    } catch {
      // sessionStorage unavailable
    }
    setIsDismissed(true)
    setState('button')
  }, [])

  const handleRating = useCallback((selectedRating: FeedbackRating) => {
    setRating(selectedRating)
    if (selectedRating === 'positive') {
      setState('comment')
    } else {
      setState('reason')
    }
  }, [])

  const handleReasonSelect = useCallback((selectedReason: NegativeFeedbackReason) => {
    setReason(selectedReason)
    setState('comment')
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!rating) return
    setIsSubmitting(true)

    try {
      await api.submitFeedback({
        rating,
        reason: reason || undefined,
        comment: comment.trim() || undefined,
        product: 'dashboard',
        context: {
          action: context?.action,
          location: context?.location || window.location.pathname,
        },
      })

      localStorage.setItem(FEEDBACK_SUBMITTED_KEY, String(Date.now()))
      setState('submitted')

      // Auto-close after 2 seconds
      setTimeout(() => {
        setState('button')
        setRating(null)
        setReason(null)
        setComment('')
      }, 2000)
    } catch {
      // Silently fail - don't block user
      setState('button')
    } finally {
      setIsSubmitting(false)
    }
  }, [rating, reason, comment, context])

  // Don't render if dismissed or recently submitted
  if (isDismissed || recentlySubmitted) {
    // Still show the button but collapsed
    if (state !== 'button') {
      setState('button')
    }
  }

  return (
    <div
      ref={widgetRef}
      className="fixed bottom-6 right-6 z-50"
      data-testid="feedback-widget"
    >
      {/* Floating Button */}
      {state === 'button' && (
        <button
          onClick={() => setState('rating')}
          className="group flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all duration-200 hover:shadow-xl"
          style={{
            background: 'var(--interactive-primary)',
            color: 'var(--text-on-accent)',
          }}
          aria-label="Send feedback"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="text-sm font-medium">Feedback</span>
        </button>
      )}

      {/* Rating Step */}
      {state === 'rating' && (
        <div
          className="w-72 rounded-xl shadow-2xl border p-4"
          style={{
            background: 'var(--surface-overlay)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              How's GAL working for you?
            </h3>
            <button
              onClick={handleDismiss}
              className="p-1 rounded-md hover:bg-[var(--surface-overlay-hover)] transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => handleRating('positive')}
              className="flex flex-col items-center gap-1.5 px-6 py-3 rounded-lg border transition-all duration-200 hover:scale-105"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'var(--surface-base)',
              }}
            >
              <ThumbsUp className="w-6 h-6 text-[var(--text-secondary)]" />
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Good</span>
            </button>
            <button
              onClick={() => handleRating('negative')}
              className="flex flex-col items-center gap-1.5 px-6 py-3 rounded-lg border transition-all duration-200 hover:scale-105"
              style={{
                borderColor: 'var(--border-subtle)',
                background: 'var(--surface-base)',
              }}
            >
              <ThumbsDown className="w-6 h-6 text-[var(--status-danger-text)]" />
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Needs work</span>
            </button>
          </div>
        </div>
      )}

      {/* Reason Step (negative feedback) */}
      {state === 'reason' && (
        <div
          className="w-72 rounded-xl shadow-2xl border p-4"
          style={{
            background: 'var(--surface-overlay)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              What could be better?
            </h3>
            <button
              onClick={handleDismiss}
              className="p-1 rounded-md hover:bg-[var(--surface-overlay-hover)] transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(REASON_LABELS) as [NegativeFeedbackReason, string][]).map(
              ([key, label]) => (
                <button
                  key={key}
                  onClick={() => handleReasonSelect(key)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 hover:scale-105"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    background: 'var(--surface-base)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {label}
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Comment Step */}
      {state === 'comment' && (
        <div
          className="w-80 rounded-xl shadow-2xl border p-4"
          style={{
            background: 'var(--surface-overlay)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {rating === 'positive' ? 'Glad to hear! Anything to add?' : 'Tell us more (optional)'}
            </h3>
            <button
              onClick={handleDismiss}
              className="p-1 rounded-md hover:bg-[var(--surface-overlay-hover)] transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
          {reason && (
            <div className="mb-2">
              <span
                className="inline-flex px-2 py-0.5 rounded-full text-xs"
                style={{
                  background: 'var(--surface-base)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {REASON_LABELS[reason]}
              </span>
            </div>
          )}
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your thoughts..."
            maxLength={2000}
            rows={3}
            className="w-full px-3 py-2 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--border-subtle)]"
            style={{
              background: 'var(--surface-base)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            autoFocus
          />
          <div className="flex items-center justify-between mt-3">
            <button
              onClick={handleDismiss}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              Skip
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50"
              style={{
                background: 'var(--interactive-primary)',
                color: 'var(--text-on-accent)',
              }}
            >
              <Send className="w-3.5 h-3.5" />
              {isSubmitting ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {/* Submitted Confirmation */}
      {state === 'submitted' && (
        <div
          className="w-64 rounded-xl shadow-2xl border p-4 text-center"
          style={{
            background: 'var(--surface-overlay)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
            style={{ backgroundColor: 'var(--status-success-light)' }}
          >
            <Check className="w-5 h-5" style={{ color: 'var(--status-success-text)' }} />
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            Thanks for your feedback!
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Your input helps us improve GAL.
          </p>
        </div>
      )}
    </div>
  )
}
