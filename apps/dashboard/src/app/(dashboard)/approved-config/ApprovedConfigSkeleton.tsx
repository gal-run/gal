export function ApprovedConfigSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8 animate-pulse">
      {/* Page header */}
      <div className="h-8 w-48 bg-[var(--skeleton-bg)] rounded-lg mb-2" />
      <div className="h-4 w-80 bg-[var(--skeleton-bg)] rounded mb-1" />
      <div className="h-3 w-96 bg-[var(--skeleton-bg)] rounded mb-8 opacity-60" />
      {/* Card */}
      <div className="border border-[var(--border-subtle)] rounded-xl p-6 mb-4">
        <div className="h-5 w-36 bg-[var(--skeleton-bg)] rounded mb-6" />
        <div className="flex gap-2 mb-6">
          {['w-24', 'w-28', 'w-20', 'w-24', 'w-24'].map((w, i) => (
            <div key={i} className={`h-8 ${w} bg-[var(--skeleton-bg)] rounded-full`} />
          ))}
        </div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-[var(--skeleton-bg)] rounded-lg mb-3 opacity-60" />
        ))}
      </div>
    </div>
  )
}
