import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api", () => ({
  createBrowserProfile: vi.fn(),
}));

vi.mock("../src/lib/browser-profile-export", () => ({
  buildPlaywrightStorageState: vi.fn(() => ({
    cookies: [{ name: "sid", value: "cookie-value" }],
    origins: [{ origin: "https://github.com", localStorage: [] }],
  })),
  extractLocalStorageForTab: vi.fn(),
  fetchCookiesForTab: vi.fn(),
}));

import {
  diagnoseMissingBrowserAuth,
  listCapturableBrowserProfileTabs,
  saveBrowserProfileFromTab,
} from "../src/lib/browser-profile-capture";
import { createBrowserProfile } from "../src/lib/api";
import {
  extractLocalStorageForTab,
  fetchCookiesForTab,
} from "../src/lib/browser-profile-export";

describe("browser profile capture helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies supported, dashboard, and missing-site-access tabs", async () => {
    const permissionsApi = {
      contains: vi.fn(async (request: chrome.permissions.Permissions) => {
        if (request.permissions?.includes("cookies")) return false;
        if (request.origins?.includes("https://aistudio.google.com/*")) return false;
        return true;
      }),
    };

    const inventory = await listCapturableBrowserProfileTabs({
      permissionsApi: permissionsApi as any,
      runtime: {
        getManifest: () => ({
          host_permissions: ["https://github.com/*", "https://app.gal.run/*"],
          optional_host_permissions: ["https://aistudio.google.com/*"],
        }),
      },
      tabsApi: {
        query: vi.fn().mockResolvedValue([
          {
            id: 1,
            url: "https://app.gal.run/browser-profiles",
            title: "GAL Dashboard",
            active: true,
          },
          {
            id: 2,
            url: "https://github.com/example-org/example-repo",
            title: "GitHub Repo",
            active: false,
          },
          {
            id: 3,
            url: "https://aistudio.google.com/prompts",
            title: "AI Studio",
            active: false,
          },
        ]),
        get: vi.fn(),
      } as any,
    });

    expect(inventory.cookiesPermissionGranted).toBe(false);
    expect(inventory.tabs).toEqual([
      expect.objectContaining({
        tabId: 2,
        hostname: "github.com",
        captureState: "ready",
        reason: expect.stringContaining("Cookie access has not been granted yet"),
      }),
      expect.objectContaining({
        tabId: 3,
        hostname: "aistudio.google.com",
        captureState: "needs_site_access",
      }),
      expect.objectContaining({
        tabId: 1,
        hostname: "app.gal.run",
        captureState: "unsupported",
      }),
    ]);
  });

  it("extracts and uploads a profile for a ready tab", async () => {
    vi.mocked(fetchCookiesForTab).mockResolvedValue([
      {
        name: "sid",
        value: "cookie-value",
        domain: ".github.com",
        path: "/",
      },
    ] as any);
    vi.mocked(extractLocalStorageForTab).mockResolvedValue({
      origin: "https://github.com",
      localStorage: [{ name: "token", value: "abc" }],
    });
    vi.mocked(createBrowserProfile).mockResolvedValue({
      success: true,
      id: "profile-123",
    });

    const result = await saveBrowserProfileFromTab(42, "GitHub Production", {
      permissionsApi: {
        contains: vi.fn(async () => true),
      } as any,
      runtime: {
        getManifest: () => ({
          host_permissions: ["https://github.com/*"],
          optional_host_permissions: [],
        }),
      },
      tabsApi: {
        get: vi.fn().mockResolvedValue({
          id: 42,
          url: "https://github.com/settings/profile",
          title: "GitHub Settings",
          active: false,
        }),
        query: vi.fn(),
      } as any,
    });

    expect(createBrowserProfile).toHaveBeenCalledWith({
      name: "GitHub Production",
      domains: ["github.com"],
      storageState: JSON.stringify({
        cookies: [{ name: "sid", value: "cookie-value" }],
        origins: [{ origin: "https://github.com", localStorage: [] }],
      }),
    });
    expect(result).toEqual({
      profileId: "profile-123",
      savedName: "GitHub Production",
      domain: "github.com",
      suggestedName: "github.com",
      storageState: JSON.stringify({
        cookies: [{ name: "sid", value: "cookie-value" }],
        origins: [{ origin: "https://github.com", localStorage: [] }],
      }),
      cookieCount: 1,
      localStorageEntryCount: 1,
    });
  });

  it("explains cookie permission requirements only when local-storage capture is insufficient", async () => {
    const permissionsApi = {
      contains: vi.fn(async (request: chrome.permissions.Permissions) => {
        if (request.permissions?.includes("cookies")) return false;
        if (request.origins?.includes("https://github.com/*")) return true;
        return false;
      }),
    };

    await expect(
      diagnoseMissingBrowserAuth("https://github.com/settings/profile", {
        permissionsApi: permissionsApi as any,
      }),
    ).resolves.toContain("cookie access is not granted yet");
  });
});
