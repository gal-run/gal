/**
 * Telemetry helpers shared across GAL clients.
 *
 * `createBeforeSend` builds a Sentry `beforeSend` hook that scrubs
 * potentially identifying data from error events before they leave the
 * client. It is intentionally provider-agnostic: it operates on the loosely
 * typed Sentry event shape so it can be reused without a hard dependency on a
 * specific Sentry SDK version.
 */

/** Minimal structural shape of a Sentry event relevant to scrubbing. */
export interface ScrubbableEvent {
  user?: Record<string, unknown> | null;
  request?: Record<string, unknown> | null;
  server_name?: string;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BeforeSendOptions {
  /**
   * When false (the default), user identity fields are removed from events.
   * Set true only in contexts where identifying the user is required and
   * consented to.
   */
  keepUser?: boolean;
}

/**
 * Create a `beforeSend` hook that strips identifying fields from events.
 *
 * - Removes the `user` object (id, email, ip, username) unless `keepUser`.
 * - Removes request cookies, headers, and query strings.
 * - Removes the reporting host name.
 *
 * Returns the scrubbed event, or null to drop it (never drops here).
 */
export function createBeforeSend(options: BeforeSendOptions = {}) {
  const { keepUser = false } = options;

  return function beforeSend(
    event: ScrubbableEvent,
  ): ScrubbableEvent | null {
    if (!event) return event;

    if (!keepUser && event.user) {
      delete event.user;
    }

    if (event.request) {
      const request = event.request as Record<string, unknown>;
      delete request.cookies;
      delete request.headers;
      delete request.query_string;
      delete request.data;
    }

    if (event.server_name) {
      delete event.server_name;
    }

    return event;
  };
}
