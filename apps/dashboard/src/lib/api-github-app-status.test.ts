import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./api";

describe("APIClient.getGitHubAppStatus (#1359)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the refresh endpoint when refresh=true is requested", async () => {
    const fetchSpy = vi.spyOn(api, "fetchWithAuth").mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        hasInstallations: true,
        installations: [
          {
            organization: "Scheduler-Systems",
            installed: true,
            installationId: 123,
            installedAt: "2026-03-17T12:00:00.000Z",
            permissions: { contents: "read" },
            repositorySelection: "all",
          },
        ],
        totalInstalled: 1,
        totalOrgs: 1,
      }),
    } as any);

    const status = await api.getGitHubAppStatus({ refresh: true });

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3000/github/installation-status?refresh=true",
      expect.objectContaining({ timeoutMs: 10000 }),
    );
    expect(status).toEqual({
      installed: true,
      organizations: ["Scheduler-Systems"],
      installations: [
        {
          organization: "Scheduler-Systems",
          installed: true,
          installationId: 123,
          installedAt: "2026-03-17T12:00:00.000Z",
          permissions: { contents: "read" },
          repositorySelection: "all",
        },
      ],
      hasInstallations: true,
      totalInstalled: 1,
      totalOrgs: 1,
    });
  });

  it("uses the non-refresh endpoint by default", async () => {
    const fetchSpy = vi.spyOn(api, "fetchWithAuth").mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        hasInstallations: false,
        installations: [],
        totalInstalled: 0,
        totalOrgs: 0,
      }),
    } as any);

    const status = await api.getGitHubAppStatus();

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3000/github/installation-status",
      expect.objectContaining({ timeoutMs: 10000 }),
    );
    expect(status).toEqual({
      installed: false,
      organizations: [],
      installations: [],
      hasInstallations: false,
      totalInstalled: 0,
      totalOrgs: 0,
    });
  });

  it("falls back to organizations when installation-status returns non-OK", async () => {
    vi.spyOn(api, "fetchWithAuth").mockResolvedValue({
      ok: false,
    } as any);
    vi.spyOn(api, "getOrganizations").mockResolvedValue([
      { name: "Scheduler-Systems" } as any,
      { name: "Another-Org" } as any,
    ]);

    const status = await api.getGitHubAppStatus();

    expect(status).toEqual({
      installed: true,
      organizations: ["Scheduler-Systems", "Another-Org"],
      installations: [],
      hasInstallations: true,
    });
  });

  it("returns disconnected status on network errors", async () => {
    vi.spyOn(api, "fetchWithAuth").mockRejectedValue(new Error("network down"));

    const status = await api.getGitHubAppStatus();

    expect(status).toEqual({
      installed: false,
      organizations: [],
      installations: [],
      hasInstallations: false,
    });
  });

  it("returns disconnected status when the request times out", async () => {
    vi.spyOn(api, "fetchWithAuth").mockRejectedValue(new Error("Request timeout"));

    const status = await api.getGitHubAppStatus();

    expect(status).toEqual({
      installed: false,
      organizations: [],
      installations: [],
      hasInstallations: false,
    });
  });
});
