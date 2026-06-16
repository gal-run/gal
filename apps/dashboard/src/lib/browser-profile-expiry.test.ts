import { describe, expect, it } from 'vitest';

import { formatBrowserProfileExpiry, isBrowserProfileExpired } from './browser-profile-expiry';

describe('browser profile expiry helpers', () => {
  it('treats future epoch seconds as active', () => {
    expect(isBrowserProfileExpired(1_775_633_333.618392, 1_774_464_600_000)).toBe(false);
  });

  it('treats past epoch seconds as expired', () => {
    expect(isBrowserProfileExpired(1_774_400_000, 1_774_464_600_000)).toBe(true);
  });

  it('formats epoch seconds using a real calendar date', () => {
    expect(formatBrowserProfileExpiry(1_775_633_333.618392)).not.toBe('Unknown');
  });

  it('accepts ISO strings for compatibility', () => {
    expect(isBrowserProfileExpired('2026-04-07T00:00:00.000Z', Date.UTC(2026, 2, 25))).toBe(false);
  });
});
