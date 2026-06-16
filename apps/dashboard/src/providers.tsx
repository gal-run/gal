'use client'

import { ThemeProvider } from '@/contexts/ThemeContext'
import { FeatureFlagsProvider } from '@/contexts/FeatureFlagsContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { DemoAuthProvider } from '@/contexts/DemoAuthContext'
import { SentryErrorBoundary } from '@/components/SentryErrorBoundary'
import { UserContextProvider } from '@/hooks/useUserContext'
import { isEeEnabled } from '@/ee/license.js'
import { CoreServicesProvider } from '@/ee/contexts/CoreServicesContext'

const isDemoMode = process.env['NEXT_PUBLIC_DEMO_MODE'] === 'true'

// Enterprise gate for the cross-org repository layer.
//
// `CoreServicesProvider` (src/ee/contexts) is backed by the vendored
// @gal/api/client repositories (src/ee/vendored-gal-api/**) and is the seam for
// multi-tenant / cross-org data access. It is Enterprise-only and is mounted
// ONLY when a valid GAL Enterprise license key is present (isEeEnabled()).
//
// In the default single-tenant OSS (free) build it is NOT mounted: CORE pages
// (dashboard, interactive session) read the current single workspace through the
// CORE api client (src/lib/api.ts `getOrganizations`) rather than this cross-org
// repository layer. See src/ee/README.md and docs/EE.md.
const EE_ENABLED = isEeEnabled()

function EnterpriseProviders({ children }: { children: React.ReactNode }) {
  if (!EE_ENABLED) return <>{children}</>
  return <CoreServicesProvider>{children}</CoreServicesProvider>
}

export function AuthProviders({ children }: { children: React.ReactNode }) {
  return (
    <SentryErrorBoundary>
      <ThemeProvider>
        <FeatureFlagsProvider>
          {isDemoMode ? (
            <DemoAuthProvider>
              {children}
            </DemoAuthProvider>
          ) : (
            <AuthProvider>
              {children}
            </AuthProvider>
          )}
        </FeatureFlagsProvider>
      </ThemeProvider>
    </SentryErrorBoundary>
  )
}

export function DashboardProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProviders>
      <UserContextProvider>
        <EnterpriseProviders>
          {children}
        </EnterpriseProviders>
      </UserContextProvider>
    </AuthProviders>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DashboardProviders>
      {children}
    </DashboardProviders>
  )
}
