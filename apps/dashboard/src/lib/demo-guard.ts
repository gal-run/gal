/**
 * demo-guard — utilities for read-only enforcement in demo mode.
 *
 * When NEXT_PUBLIC_DEMO_MODE=true, mutation actions (create, update, delete,
 * approve, etc.) should be intercepted so demo visitors cannot accidentally
 * modify real data or hit auth-gated endpoints.
 *
 * Usage:
 *
 *   import { demoGuard, isDemoMode } from '@/lib/demo-guard'
 *
 *   // Option 1 — wrap a mutation action
 *   const result = demoGuard(() => api.approveConfig(org, config))
 *   if (result === undefined) return // blocked in demo mode
 *
 *   // Option 2 — check before performing side-effects
 *   if (isDemoMode()) { showDemoToast(); return }
 *   await api.deleteSession(id)
 */

/** Returns true when the app is running in live-demo mode. */
export function isDemoMode(): boolean {
  return process.env['NEXT_PUBLIC_DEMO_MODE'] === 'true'
}

/**
 * Wraps a mutation action with a demo-mode guard.
 *
 * - When NOT in demo mode: executes and returns the action's result.
 * - When IN demo mode: logs a warning, shows a console message (a toast
 *   integration can be added by callers via the `onBlocked` callback), and
 *   returns `fallback` (defaults to `undefined`).
 */
export function demoGuard<T>(
  action: () => T,
  options?: {
    /** Optional message to show instead of the default. */
    message?: string
    /** Optional callback when the action is blocked (e.g. show a toast). */
    onBlocked?: (message: string) => void
    /** Value to return when blocked. Defaults to `undefined`. */
    fallback?: T
  }
): T | undefined {
  if (!isDemoMode()) {
    return action()
  }

  const msg =
    options?.message ??
    "This is a live demo — sign up to take this action"

  console.warn('[Demo] Action blocked in demo mode:', msg)

  if (options?.onBlocked) {
    options.onBlocked(msg)
  }

  return options?.fallback
}
