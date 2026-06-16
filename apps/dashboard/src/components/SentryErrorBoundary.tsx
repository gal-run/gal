'use client'

/**
 * Global error boundary with Sentry integration.
 * Captures React rendering errors and sends them to Sentry.
 */
import * as Sentry from "@sentry/nextjs";
import { AlertCircle, RefreshCw } from "lucide-react";

function ErrorFallback({
  error,
  resetError,
}: {
  error: Error;
  resetError: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)]">
      <div className="text-center p-8 max-w-md">
        <div className="w-16 h-16 mx-auto rounded-full bg-[var(--status-danger-light)] flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 text-[var(--status-danger)]" />
        </div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-3">
          Something went wrong
        </h1>
        <p className="text-[var(--text-secondary)] mb-6 text-sm">
          {error.message ||
            "An unexpected error occurred. The error has been reported."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={resetError}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--surface-sunken)] text-[var(--text-primary)] rounded-lg hover:bg-[var(--glow-medium)] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[var(--surface-overlay)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--surface-overlay-hover)] transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}

export function SentryErrorBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <ErrorFallback error={error as Error} resetError={resetError} />
      )}
      showDialog={false}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
