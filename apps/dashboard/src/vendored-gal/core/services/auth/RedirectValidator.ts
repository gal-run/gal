/**
 * Validation result for redirect URIs
 */
export interface RedirectValidationResult {
  isValid: boolean
  sanitizedUri?: string
  reason?: string
}

/**
 * RedirectValidator - Framework-agnostic redirect URI validation
 *
 * SECURITY: Validates redirect URIs to prevent open redirect attacks
 *
 * Allowed patterns:
 * - CLI: http://localhost:PORT or http://127.0.0.1:PORT (exact match, no path manipulation)
 * - Dashboard: Relative paths starting with / (no protocol, no //)
 * - Firebase Preview: https://gal-{env}-dashboard--{channel}.web.app (PR preview deployments)
 */
export class RedirectValidator {
  /**
   * Firebase Hosting preview URL patterns for PR deployments
   * Format: https://gal-run-dashboard--{preview-channel}.web.app
   */
  private readonly allowedPreviewPatterns = [
    /^https:\/\/gal-run-dashboard--[a-z0-9-]+\.web\.app$/,
    // Also allow the main production dashboard URL
    /^https:\/\/app\.gal\.run$/,
  ]

  /**
   * Validate and sanitize a redirect URI
   *
   * @param uri - The redirect URI to validate
   * @returns Validation result with sanitized URI if valid
   */
  validate(uri: string | undefined): RedirectValidationResult {
    if (!uri) {
      return { isValid: false, reason: 'No URI provided' }
    }

    // CLI redirect - must be exact localhost/127.0.0.1 with port
    if (uri.startsWith('http://localhost:') || uri.startsWith('http://127.0.0.1:')) {
      return this.validateLocalhost(uri)
    }

    // Firebase Preview redirect - must match allowed preview URL patterns
    if (uri.startsWith('https://')) {
      return this.validateFirebasePreview(uri)
    }

    // Dashboard redirect - must be relative path only
    if (uri.startsWith('/')) {
      return this.validateRelativePath(uri)
    }

    // Anything else is rejected
    return {
      isValid: false,
      reason: `URI does not match any allowed patterns: ${uri}`,
    }
  }

  /**
   * Validate localhost redirect for CLI
   * SECURITY: Strict validation to prevent user:pass@host attacks
   */
  private validateLocalhost(uri: string): RedirectValidationResult {
    try {
      const parsed = new URL(uri)

      // Verify hostname is exactly localhost or 127.0.0.1 (prevent user:pass@host attacks)
      if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        return {
          isValid: false,
          reason: `Invalid hostname for localhost redirect: ${parsed.hostname}`,
        }
      }

      // Verify protocol is http (not https for localhost)
      if (parsed.protocol !== 'http:') {
        return {
          isValid: false,
          reason: `Invalid protocol for localhost redirect: ${parsed.protocol}`,
        }
      }

      // Verify port is numeric
      if (!parsed.port || !/^\d+$/.test(parsed.port)) {
        return {
          isValid: false,
          reason: 'Localhost redirect must include numeric port',
        }
      }

      // Return sanitized URL (removes any sneaky characters)
      const sanitizedUri = `http://${parsed.hostname}:${parsed.port}${parsed.pathname}`
      return {
        isValid: true,
        sanitizedUri,
      }
    } catch (error) {
      return {
        isValid: false,
        reason: `Failed to parse localhost redirect: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  /**
   * Validate Firebase preview URL redirect
   * This enables OAuth to redirect back to PR preview dashboards
   */
  private validateFirebasePreview(uri: string): RedirectValidationResult {
    try {
      const parsed = new URL(uri)
      // Extract just the origin (no path) for pattern matching
      const origin = parsed.origin

      // Check against allowed Firebase preview patterns
      const isAllowedPreview = this.allowedPreviewPatterns.some((pattern) =>
        pattern.test(origin)
      )

      if (!isAllowedPreview) {
        return {
          isValid: false,
          reason: `HTTPS URI does not match allowed Firebase preview patterns: ${uri}`,
        }
      }

      // Return sanitized origin + path (no query string to prevent token leakage)
      const sanitizedPath = parsed.pathname || '/'
      const sanitizedUri = `${origin}${sanitizedPath}`

      return {
        isValid: true,
        sanitizedUri,
      }
    } catch (error) {
      return {
        isValid: false,
        reason: `Failed to parse HTTPS redirect: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  /**
   * Validate relative path redirect for dashboard
   * SECURITY: Block protocol-relative URLs and protocol injection
   */
  private validateRelativePath(uri: string): RedirectValidationResult {
    const decodedUri = this.decodeRelativePath(uri)
    if (!decodedUri) {
      return {
        isValid: false,
        reason: 'Relative redirect contains malformed encoding',
      }
    }

    if (!decodedUri.startsWith('/')) {
      return {
        isValid: false,
        reason: 'Relative redirects must start with /',
      }
    }

    // Block protocol-relative URLs like //evil.com
    if (decodedUri.startsWith('//')) {
      return {
        isValid: false,
        reason: 'Protocol-relative URLs are not allowed',
      }
    }

    // Block any URL that contains :// anywhere (protocol injection)
    if (decodedUri.includes('://')) {
      return {
        isValid: false,
        reason: 'URLs with protocol indicators are not allowed',
      }
    }

    // Block attempts to navigate to external sites via encoded characters
    // or other tricks like /\evil.com
    if (
      decodedUri.includes('\\') ||
      decodedUri.includes('\n') ||
      decodedUri.includes('\r')
    ) {
      return {
        isValid: false,
        reason: 'URLs with suspicious characters are not allowed',
      }
    }

    return {
      isValid: true,
      sanitizedUri: decodedUri,
    }
  }

  private decodeRelativePath(uri: string): string | null {
    try {
      return decodeURIComponent(uri)
    } catch {
      return null
    }
  }

  /**
   * Get allowed preview patterns (for testing/debugging)
   */
  getAllowedPreviewPatterns(): RegExp[] {
    return [...this.allowedPreviewPatterns]
  }
}
