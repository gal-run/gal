'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

/**
 * Legacy /background-agents list route → unified /sessions page (#6107).
 *
 * Redirect is done client-side via useRouter().replace rather than the server
 * `redirect()` helper: this route is rendered inside the force-dynamic, client
 * `(dashboard)` layout, where a server-thrown NEXT_REDIRECT surfaces to the
 * browser as an unhandled client-side exception (blank "Application error"
 * page) instead of a clean navigation — which is exactly what demo visitors
 * hit on the public live demo (#507). Replacing keeps the legacy URL out of
 * history and lands the visitor on /sessions with a brief, neutral spinner.
 */
export default function BackgroundAgentsRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/sessions')
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
    </div>
  )
}
