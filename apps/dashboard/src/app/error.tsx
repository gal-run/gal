"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)]">
      <div className="text-center p-8 max-w-md">
        <div className="w-16 h-16 mx-auto rounded-full bg-[var(--status-danger-light)] flex items-center justify-center mb-6">
          <svg
            className="w-8 h-8 text-[var(--status-danger)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)] mb-3">
          Something went wrong
        </h1>
        <p className="text-[var(--text-muted)] mb-6 text-sm">
          {error.message ||
            "An unexpected error occurred. The error has been reported."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-[var(--interactive-primary)] text-[var(--text-on-accent)] rounded-lg hover:bg-[var(--interactive-primary-hover)] transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-[var(--surface-raised)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--surface-overlay)] transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}
