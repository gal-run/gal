'use client'

import React from 'react'
import { Loader2 } from 'lucide-react'

import { BRANDING } from '@/lib/branding'

export function LoginRedirectState() {
  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div
          className="card p-8 text-center"
          data-testid="login-redirect-state"
          role="status"
          aria-live="polite"
        >
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-raised)]">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold gradient-text mb-2">
            {BRANDING.missionControlName}
          </h1>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Redirecting to your dashboard...
          </h2>
          <p className="text-[var(--text-secondary)] text-sm">
            We found an active session. Taking you to the page you requested.
          </p>
        </div>
      </div>
    </div>
  )
}
