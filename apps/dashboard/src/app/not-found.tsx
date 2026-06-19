import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-4">Page Not Found</h1>
      <p className="text-[var(--text-muted)] mb-6">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link href="/" className="text-[var(--status-success)] hover:underline">
        Go to Home
      </Link>
    </div>
  )
}
