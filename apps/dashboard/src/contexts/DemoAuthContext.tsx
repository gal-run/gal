'use client'

/**
 * DemoAuthProvider — used only when NEXT_PUBLIC_DEMO_MODE=true.
 *
 * Provides a fake demo user into the real AuthContext so that all existing
 * `useAuth()` calls across the dashboard receive the demo user without any
 * per-component changes.  No real Firebase or API calls are made.
 */

import { type ReactNode } from 'react'
import { AuthContext } from '@/contexts/AuthContext'
import type { User } from '@/lib/auth-types'

// ---------------------------------------------------------------------------
// Demo user — realistic fake data, no real GitHub account
// ---------------------------------------------------------------------------

export const DEMO_USER: User = {
  id: 'sarah-chen-0001',
  githubId: 1001,
  login: 'sarah-chen',
  name: 'Sarah Chen',
  email: 'sarah@acme-corp.com',
  avatarUrl: 'https://avatars.githubusercontent.com/u/1001',
  organizations: ['acme-corp'],
  adminOrganizations: ['acme-corp'],
  isAdmin: true,
  providers: ['github'],
}

// ---------------------------------------------------------------------------
// Provider — injects demo values into the real AuthContext
// ---------------------------------------------------------------------------

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const demoValue = {
    user: DEMO_USER,
    isLoading: false,
    isAuthenticated: true,
    isConfigured: true,
    isAdmin: true,
    isGoogleConfigured: false,
    hasGitHubProvider: true,
    authError: null as null,
    login: () => {
      if (typeof window !== 'undefined') {
        window.location.href = 'https://app.gal.run/signup'
      }
    },
    logout: async () => {
      if (typeof window !== 'undefined') {
        window.location.href = 'https://gal.run'
      }
    },
    checkAuth: async () => { /* no-op in demo */ },
    signInWithGoogle: async () => {
      if (typeof window !== 'undefined') {
        window.location.href = 'https://app.gal.run/signup'
      }
    },
  }

  return (
    <AuthContext.Provider value={demoValue}>
      {children}
    </AuthContext.Provider>
  )
}
