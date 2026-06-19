import { describe, expect, it, vi } from "vitest";

import {
  buildPlaywrightStorageState,
  extractLocalStorageForTab,
  fetchCookiesForTab,
  getRootDomain,
} from "../src/lib/browser-profile-export";

describe("browser profile export helpers", () => {
  it("derives a root domain for subdomains", () => {
    expect(getRootDomain("app.github.com")).toBe(".github.com");
    expect(getRootDomain("github.com")).toBe(".github.com");
  });

  it("fetches cookies across url, hostname, and root-domain queries without duplicates", async () => {
    const getAll = vi
      .fn()
      .mockResolvedValueOnce([
        { name: "sid", domain: ".github.com", path: "/", value: "one" },
      ])
      .mockResolvedValueOnce([
        { name: "sid", domain: ".github.com", path: "/", value: "one" },
        { name: "user", domain: "app.github.com", path: "/", value: "two" },
      ])
      .mockResolvedValueOnce([
        { name: "sid", domain: ".github.com", path: "/", value: "one" },
      ]);

    const cookies = await fetchCookiesForTab("https://app.github.com/dashboard", {
      getAll,
    } as any);

    expect(getAll).toHaveBeenNthCalledWith(1, {
      url: "https://app.github.com/dashboard",
    });
    expect(getAll).toHaveBeenNthCalledWith(2, {
      domain: "app.github.com",
    });
    expect(getAll).toHaveBeenNthCalledWith(3, {
      domain: ".github.com",
    });
    expect(cookies).toEqual([
      { name: "sid", domain: ".github.com", path: "/", value: "one" },
      { name: "user", domain: "app.github.com", path: "/", value: "two" },
    ]);
  });

  it("extracts current-origin localStorage via MAIN-world executeScript", async () => {
    const executeScript = vi.fn().mockResolvedValue([
      {
        result: {
          origin: "https://github.com",
          localStorage: [
            { name: "token", value: "abc" },
            { name: "theme", value: "dark" },
          ],
        },
      },
    ]);

    const snapshot = await extractLocalStorageForTab(42, {
      executeScript,
    } as any);

    expect(executeScript).toHaveBeenCalledOnce();
    expect(executeScript.mock.calls[0][0]).toMatchObject({
      target: { tabId: 42 },
      world: "MAIN",
    });
    expect(snapshot).toEqual({
      origin: "https://github.com",
      localStorage: [
        { name: "token", value: "abc" },
        { name: "theme", value: "dark" },
      ],
    });
  });

  it("builds Playwright storage state from cookies and localStorage", () => {
    const state = buildPlaywrightStorageState(
      [
        {
          name: "sid",
          value: "cookie-value",
          domain: ".github.com",
          path: "/",
          expirationDate: 1_775_633_333,
          httpOnly: true,
          secure: true,
          sameSite: "lax",
        },
      ] as any,
      {
        origin: "https://github.com",
        localStorage: [{ name: "token", value: "abc" }],
      },
    );

    expect(state).toEqual({
      cookies: [
        {
          name: "sid",
          value: "cookie-value",
          domain: ".github.com",
          path: "/",
          expires: 1_775_633_333,
          httpOnly: true,
          secure: true,
          sameSite: "lax",
        },
      ],
      origins: [
        {
          origin: "https://github.com",
          localStorage: [{ name: "token", value: "abc" }],
        },
      ],
    });
  });
});
