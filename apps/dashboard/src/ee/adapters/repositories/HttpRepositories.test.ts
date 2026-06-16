import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HttpScanResultRepository,
  HttpUserRepository,
  HttpSubscriptionRepository,
  type HttpClientConfig,
} from '@gal/api/client';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const testConfig: HttpClientConfig = {
  apiUrl: 'http://localhost:3000',
  authToken: 'test-token',
};

describe('HttpScanResultRepository', () => {
  let repo: HttpScanResultRepository;

  beforeEach(() => {
    repo = new HttpScanResultRepository(testConfig);
    mockFetch.mockReset();
  });

  it('can be instantiated', () => {
    expect(repo).toBeInstanceOf(HttpScanResultRepository);
  });

  it('findByOrganization returns array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scans: [] }),
    });

    const result = await repo.findByOrganization('test-org');
    expect(Array.isArray(result)).toBe(true);
  });

  it('findLatestByRepo returns null on 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ error: '404 Not Found' }),
    });

    const result = await repo.findLatestByRepo('test-org', 'test-repo', 'claude');
    expect(result).toBeNull();
  });

  it('uses credentials include for cookie auth', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ scans: [] }),
    });

    await repo.findByOrganization('test-org');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        credentials: 'include',
      })
    );
  });
});

describe('HttpUserRepository', () => {
  let repo: HttpUserRepository;

  beforeEach(() => {
    repo = new HttpUserRepository(testConfig);
    mockFetch.mockReset();
  });

  it('can be instantiated', () => {
    expect(repo).toBeInstanceOf(HttpUserRepository);
  });

  it('findByGithubId returns null on 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ error: '404 Not Found' }),
    });

    const result = await repo.findByGithubId(12345);
    expect(result).toBeNull();
  });

  it('findByLogin returns null on 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ error: '404 Not Found' }),
    });

    const result = await repo.findByLogin('test-user');
    expect(result).toBeNull();
  });
});

describe('HttpSubscriptionRepository', () => {
  let repo: HttpSubscriptionRepository;

  beforeEach(() => {
    repo = new HttpSubscriptionRepository(testConfig);
    mockFetch.mockReset();
  });

  it('can be instantiated', () => {
    expect(repo).toBeInstanceOf(HttpSubscriptionRepository);
  });

  it('findByOrganization returns null on 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ error: '404 Not Found' }),
    });

    const result = await repo.findByOrganization('test-org');
    expect(result).toBeNull();
  });
});
