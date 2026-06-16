// Force dynamic rendering for all auth pages - they use useAuth() and localStorage
// which require browser runtime and cannot be statically pre-rendered
export const dynamic = 'force-dynamic'

import { AuthProviders } from '@/providers'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProviders>
      <div className="min-h-screen bg-[var(--surface-base)]">
        {children}
      </div>
    </AuthProviders>
  )
}
