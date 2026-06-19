'use client'

/**
 * TerminalErrorBoundary (GAL-571)
 *
 * Error boundary component to catch and handle errors in the terminal session.
 * Provides a user-friendly fallback UI when the terminal fails.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import * as Sentry from '@sentry/nextjs'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface TerminalErrorBoundaryProps {
  children: ReactNode
  sessionId: string
  onRetry?: () => void
}

interface TerminalErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class TerminalErrorBoundary extends Component<
  TerminalErrorBoundaryProps,
  TerminalErrorBoundaryState
> {
  constructor(props: TerminalErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<TerminalErrorBoundaryState> {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    Sentry.withScope((scope) => {
      scope.setTag('component', 'TerminalErrorBoundary')
      scope.setTag('session_id', this.props.sessionId)
      scope.setContext('react_error_boundary', {
        componentStack: errorInfo.componentStack,
      })
      Sentry.captureException(error)
    })
    console.error('[TerminalErrorBoundary] Caught error:', error, errorInfo)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null })
    this.props.onRetry?.()
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          className="h-full flex items-center justify-center p-8"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          <div className="text-center max-w-md">
            <div
              className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--status-danger-light)' }}
            >
              <AlertTriangle className="w-8 h-8" style={{ color: 'var(--status-danger)' }} />
            </div>

            <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              Terminal Error
            </h2>

            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Something went wrong with the terminal session. This is usually caused by a
              connection issue or browser compatibility problem.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div
                className="text-left p-3 rounded mb-4 text-xs overflow-auto max-h-32"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--status-danger)',
                  fontFamily: 'monospace',
                }}
              >
                <p className="font-semibold mb-1">Error:</p>
                <p>{this.state.error.message}</p>
                {this.state.errorInfo?.componentStack && (
                  <>
                    <p className="font-semibold mt-2 mb-1">Component Stack:</p>
                    <pre className="whitespace-pre-wrap text-xs">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{
                  backgroundColor: 'var(--interactive-primary)',
                  color: 'var(--text-on-accent)',
                }}
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>

              <a
                href="/sessions"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                Back to Sessions
              </a>
            </div>

            <p className="text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
              Session ID: {this.props.sessionId}
            </p>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default TerminalErrorBoundary
