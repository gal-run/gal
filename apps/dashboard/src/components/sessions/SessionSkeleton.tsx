'use client'

/**
 * SessionSkeleton (GAL-571)
 *
 * Loading skeleton UI for session list and session details.
 * Provides visual feedback during session data loading.
 */

interface SessionSkeletonProps {
  count?: number
}

/**
 * Animated skeleton line component.
 */
function SkeletonLine({
  width = 'w-full',
  height = 'h-4',
}: {
  width?: string
  height?: string
}) {
  return (
    <div
      className={`${width} ${height} rounded animate-pulse`}
      style={{ backgroundColor: 'var(--border-default)' }}
    />
  )
}

/**
 * Skeleton card for individual session in list.
 */
function SessionCardSkeleton() {
  return (
    <div
      className="p-4 rounded-lg border"
      style={{
        backgroundColor: 'var(--surface-overlay)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          {/* Session name */}
          <SkeletonLine width="w-48" height="h-5" />

          {/* Status badge */}
          <div className="flex items-center gap-2">
            <SkeletonLine width="w-20" height="h-6" />
            <SkeletonLine width="w-32" height="h-4" />
          </div>

          {/* Session details */}
          <div className="flex items-center gap-4">
            <SkeletonLine width="w-24" height="h-3" />
            <SkeletonLine width="w-28" height="h-3" />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <SkeletonLine width="w-20" height="h-8" />
          <SkeletonLine width="w-8" height="h-8" />
        </div>
      </div>
    </div>
  )
}

/**
 * Skeleton for session list loading state.
 */
export function SessionListSkeleton({ count = 3 }: SessionSkeletonProps) {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-6">
        <SkeletonLine width="w-40" height="h-6" />
        <SkeletonLine width="w-32" height="h-10" />
      </div>

      {/* Stats cards skeleton */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="p-4 rounded-lg"
            style={{ backgroundColor: 'var(--surface-overlay)' }}
          >
            <SkeletonLine width="w-16" height="h-8" />
            <SkeletonLine width="w-20" height="h-4" />
          </div>
        ))}
      </div>

      {/* Session cards skeleton */}
      <div className="space-y-3">
        {[...Array(count)].map((_, i) => (
          <SessionCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}

/**
 * Skeleton for terminal page loading state.
 */
export function TerminalSkeleton() {
  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--terminal-bg)' }}>
      {/* Header skeleton */}
      <div
        className="p-4 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-3">
          <SkeletonLine width="w-8" height="h-8" />
          <SkeletonLine width="w-48" height="h-6" />
          <SkeletonLine width="w-20" height="h-5" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonLine width="w-24" height="h-8" />
          <SkeletonLine width="w-8" height="h-8" />
        </div>
      </div>

      {/* Terminal area skeleton */}
      <div className="flex-1 p-4 space-y-2">
        <SkeletonLine width="w-3/4" height="h-4" />
        <SkeletonLine width="w-1/2" height="h-4" />
        <SkeletonLine width="w-2/3" height="h-4" />
        <SkeletonLine width="w-1/3" height="h-4" />
        <SkeletonLine width="w-4/5" height="h-4" />
        <div className="pt-4">
          <div className="flex items-center gap-2">
            <SkeletonLine width="w-4" height="h-4" />
            <SkeletonLine width="w-40" height="h-4" />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Small loading spinner for inline use.
 */
export function SessionLoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }

  return (
    <div
      className={`${sizeClasses[size]} animate-spin rounded-full border-2`}
      style={{
        borderColor: 'var(--border-subtle)',
        borderTopColor: 'var(--text-primary)',
      }}
    />
  )
}

export default SessionListSkeleton
