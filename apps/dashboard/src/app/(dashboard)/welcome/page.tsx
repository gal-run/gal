'use client'

import Link from 'next/link'
import { CheckCircle, ArrowRight, Chrome } from 'lucide-react'

/**
 * Welcome page — opened by the Chrome extension after first install.
 * Route: /welcome
 */
export default function WelcomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 sm:p-8">
      <div className="max-w-lg w-full text-center">
        {/* Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
          style={{ backgroundColor: 'var(--accent-bg)' }}>
          <Chrome className="w-8 h-8" style={{ color: 'var(--accent)' }} />
        </div>

        {/* Heading */}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3"
          style={{ color: 'var(--text-primary)' }}>
          Welcome to GAL
        </h1>
        <p className="text-base mb-8" style={{ color: 'var(--text-secondary)' }}>
          The GAL Chrome extension has been installed successfully. GAL helps your team
          govern and sync AI coding tool configurations across every repository.
        </p>

        {/* What's next */}
        <div className="text-left space-y-3 mb-8 p-5 rounded-xl border"
          style={{ backgroundColor: 'var(--surface-raised)', borderColor: 'var(--border-subtle)' }}>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
            Next steps
          </p>
          {[
            'Sign in with your GitHub account',
            'Connect your organization\'s repositories',
            'Pull the approved AI coding tool config with the GAL CLI',
          ].map((step) => (
            <div key={step} className="flex items-start gap-3">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{step}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-colors"
          style={{
            backgroundColor: 'var(--interactive-primary)',
            color: 'var(--text-on-accent)',
          }}
        >
          Go to Dashboard
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
