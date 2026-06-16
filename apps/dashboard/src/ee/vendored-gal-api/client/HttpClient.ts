/**
 * HTTP Client Base Class
 *
 * Provides common HTTP request functionality with:
 * - Authorization header management (Bearer token)
 * - Timeout handling with AbortController
 * - JSON error parsing
 * - Configurable defaults
 */

export interface ITokenProvider {
  getToken(): Promise<string | null>
}

export interface HttpClientConfig {
  apiUrl: string
  authToken?: string
  apiKey?: string
  tokenProvider?: ITokenProvider
  credentials?: 'include' | 'omit' | 'same-origin'
  timeoutMs?: number
  headers?: Record<string, string>
}

export class HttpClient {
  constructor(protected config: HttpClientConfig) {}

  protected async fetch(
    path: string,
    options: RequestInit = {},
    timeoutMs: number = 30000
  ): Promise<Response> {
    if (!this.config.apiUrl) {
      throw new Error('API URL not configured. Run: gal config set apiUrl <url>');
    }

    const url = `${this.config.apiUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.config.tokenProvider) {
      const token = await this.config.tokenProvider.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } else if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    } else if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
        ...(this.config.credentials && { credentials: this.config.credentials }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `API request failed: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json() as { error?: string };
          if (errorData && errorData.error) {
            errorMessage = `HTTP ${response.status}: ${errorData.error}`;
          }
        } catch {
          // Ignore JSON parse errors
        }
        throw new Error(errorMessage);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout: ${url} did not respond within ${timeoutMs / 1000} seconds`);
      }
      throw error;
    }
  }

  protected async fetchJson<T>(
    path: string,
    options: RequestInit = {},
    timeoutMs: number = 30000
  ): Promise<T> {
    const response = await this.fetch(path, options, timeoutMs);
    return await response.json() as T;
  }
}
