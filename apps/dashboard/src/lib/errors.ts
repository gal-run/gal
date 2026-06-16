/**
 * Error utilities for user-friendly error messages
 *
 * SECURITY: Never expose raw error messages to users as they may contain
 * sensitive implementation details, stack traces, or internal paths.
 */

// Known error patterns and their user-friendly messages
const ERROR_PATTERNS: Array<{ pattern: RegExp | string; message: string }> = [
  { pattern: 'Not Found', message: 'The requested resource was not found.' },
  { pattern: 'Unauthorized', message: 'Please sign in to continue.' },
  { pattern: 'Forbidden', message: 'You don\'t have permission to access this resource.' },
  { pattern: 'Network Error', message: 'Unable to connect to the server. Please check your internet connection.' },
  { pattern: 'Failed to fetch', message: 'Unable to connect to the server. Please try again.' },
  { pattern: 'ECONNREFUSED', message: 'Server is not responding. Please try again later.' },
  { pattern: 'rate limit', message: 'Too many requests. Please wait a moment and try again.' },
  { pattern: 'timeout', message: 'Request timed out. Please try again.' },
  { pattern: /github.*not found/i, message: 'GitHub App needs reinstallation. Go to Settings → GitHub → Install GAL App' },
  { pattern: /installation.*not found/i, message: 'GitHub App is not installed. Go to Settings → GitHub → Install GAL App' },
  { pattern: 'JWT expired', message: 'Your session has expired. Please sign in again.' },
  { pattern: 'invalid token', message: 'Your session is invalid. Please sign in again.' },
  // Firestore infrastructure errors - never expose to users
  { pattern: /FAILED_PRECONDITION/i, message: 'Unable to load data. Please try again later.' },
  { pattern: /PERMISSION_DENIED.*permissions/i, message: "You don't have permission to access this data." },
  // US11 T079/T081: Collaborator access error messages
  { pattern: 'Admin access required', message: 'Admin access required to manage these settings. Contact your organization admin.' },
  { pattern: 'ACCESS_DENIED', message: 'You don\'t have access to this repository. You must be a collaborator to sync configs from it.' },
  { pattern: /don't have access to/i, message: 'You don\'t have access to this repository. The owner may have removed your collaborator access.' },
  { pattern: /must be a collaborator/i, message: 'You must be a collaborator on this repository to use its configurations.' },
  { pattern: /collaborator access/i, message: 'Collaborator access required. Ask the repository owner to add you as a collaborator.' },
]

/**
 * Convert an error to a user-friendly message
 *
 * @param error - The error object or message
 * @param fallback - Fallback message if no pattern matches (default: generic message)
 * @returns User-friendly error message
 */
export function getUserFriendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  // Get the error message string
  let errorMessage: string
  if (error instanceof Error) {
    errorMessage = error.message
  } else if (typeof error === 'string') {
    errorMessage = error
  } else {
    return fallback
  }

  // Check against known patterns
  for (const { pattern, message } of ERROR_PATTERNS) {
    if (typeof pattern === 'string') {
      if (errorMessage.toLowerCase().includes(pattern.toLowerCase())) {
        return message
      }
    } else if (pattern.test(errorMessage)) {
      return message
    }
  }

  // If no pattern matches, return the fallback
  // DON'T return the raw error message as it may contain sensitive info
  return fallback
}

/**
 * Check if an error indicates the user needs to re-authenticate
 */
export function isAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const authPatterns = ['unauthorized', 'jwt expired', 'invalid token', 'session expired', '401']
  return authPatterns.some(p => message.toLowerCase().includes(p))
}

/**
 * Check if an error is a network/connection error
 */
export function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  const networkPatterns = ['network error', 'failed to fetch', 'econnrefused', 'timeout', 'offline']
  return networkPatterns.some(p => message.toLowerCase().includes(p))
}
