'use client'

/**
 * ConfigSkeleton Component
 *
 * Loading skeleton for config expansion that matches the content layout.
 * Task T1: Create ConfigSkeleton Component (FR-001, FR-003)
 *
 * Shows:
 * - Config name header
 * - 2-3 instance rows with repo name placeholders
 * - Content preview area
 */

import { Loader2 } from 'lucide-react'

interface ConfigSkeletonProps {
  instanceCount?: number
}

function SkeletonLine({
  width = 'w-full',
  height = 'h-4',
}: {
  width?: string
  height?: string
}) {
  return (
    <div
      className={`${width} ${height} rounded skeleton-shimmer`}
      style={{ backgroundColor: 'var(--bg-tertiary)' }}
    />
  )
}

export function ConfigSkeleton({ instanceCount = 2 }: ConfigSkeletonProps) {
  return (
    <div
      data-testid="config-skeleton"
      style={{ borderTop: '1px solid var(--border-subtle)' }}
    >
      {/* Loading indicator at top */}
      <div className="p-3 flex items-center gap-2" style={{ color: 'var(--accent)' }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading content...</span>
      </div>

      <div className="p-3 space-y-2">
        {/* Instance rows skeleton */}
        {[...Array(instanceCount)].map((_, idx) => (
          <div
            key={idx}
            className="p-3 rounded-lg"
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {/* Repo name and path */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1 min-w-0 space-y-2">
                <SkeletonLine width="w-32" height="h-4" />
                <SkeletonLine width="w-48" height="h-3" />
              </div>
              <SkeletonLine width="w-8" height="h-8" />
            </div>

            {/* Content preview */}
            <div className="space-y-1">
              <SkeletonLine width="w-full" height="h-3" />
              <SkeletonLine width="w-5/6" height="h-3" />
              <SkeletonLine width="w-4/5" height="h-3" />
            </div>
          </div>
        ))}
      </div>

      {/* Approve button skeleton */}
      <div className="p-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <SkeletonLine width="w-24" height="h-8" />
      </div>

      {/* CSS for shimmer animation */}
      <style>{`
        .skeleton-shimmer {
          background: linear-gradient(
            90deg,
            var(--bg-tertiary) 25%,
            var(--bg-secondary) 50%,
            var(--bg-tertiary) 75%
          );
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}
