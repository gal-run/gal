export type BrowserProfileExpiry = number | string | null | undefined;

function parseBrowserProfileExpiryMs(expiresAt: BrowserProfileExpiry): number | null {
  if (expiresAt === null || expiresAt === undefined || expiresAt === '') {
    return null;
  }

  if (typeof expiresAt === 'number') {
    return expiresAt > 1_000_000_000_000 ? expiresAt : expiresAt * 1000;
  }

  const numeric = Number(expiresAt);
  if (!Number.isNaN(numeric) && expiresAt.trim() !== '') {
    return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  }

  const parsed = Date.parse(expiresAt);
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatBrowserProfileExpiry(expiresAt: BrowserProfileExpiry): string {
  const expiryMs = parseBrowserProfileExpiryMs(expiresAt);
  if (expiryMs === null) return 'Unknown';

  return new Date(expiryMs).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function isBrowserProfileExpired(
  expiresAt: BrowserProfileExpiry,
  nowMs: number = Date.now(),
): boolean {
  const expiryMs = parseBrowserProfileExpiryMs(expiresAt);
  if (expiryMs === null) return false;
  return expiryMs < nowMs;
}
