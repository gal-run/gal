import {
  type BrowserContext,
  type Page,
  chromium,
  expect,
} from "@playwright/test";
import path from "path";

/**
 * Path to the built extension dist directory.
 * Must be built with `pnpm --filter @gal/chrome-extension build` before
 * running E2E tests.
 */
export const EXTENSION_PATH = path.resolve(__dirname, "../../dist");

/**
 * Launch a Chromium browser context with the GAL extension loaded.
 *
 * Use this in tests that need a fresh context per test. For most extension
 * tests, re-use the context from the shared fixture instead.
 *
 * @example
 * const { context, extensionId } = await launchWithExtension()
 * const popup = await openExtensionPopup(context, extensionId)
 * await context.close()
 */
export async function launchWithExtension(): Promise<{
  context: BrowserContext;
  extensionId: string;
}> {
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--headless=new",
    ],
  });

  const extensionId = await getExtensionId(context);
  return { context, extensionId };
}

/**
 * Discover the extension ID assigned by Chrome at runtime.
 *
 * Chrome assigns a deterministic ID based on the extension's public key when
 * installed from the Web Store, but assigns a random ID for unpacked
 * extensions. We probe chrome://extensions or the service worker target to
 * find it.
 */
export async function getExtensionId(context: BrowserContext): Promise<string> {
  // Wait briefly for the service worker to register
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // The service worker target URL contains the extension ID
  const workers = context.serviceWorkers();
  if (workers.length > 0) {
    // chrome-extension://<id>/background.js
    const url = workers[0].url();
    const match = url.match(/chrome-extension:\/\/([a-z]{32})\//);
    if (match) return match[1];
  }

  // Fallback: navigate to extensions page and parse the ID
  const page = await context.newPage();
  await page.goto("chrome://extensions");
  await page.waitForLoadState("domcontentloaded");

  // Extensions page uses a custom element; query through it
  const id = await page.evaluate(() => {
    const manager = document.querySelector("extensions-manager");
    if (!manager) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shadowRoot = (manager as any).shadowRoot;
    if (!shadowRoot) return null;
    const items = shadowRoot.querySelectorAll("extensions-item");
    for (const item of items) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const idEl = (item as any).shadowRoot?.querySelector("#extension-id");
      if (idEl) return idEl.textContent?.trim() ?? null;
    }
    return null;
  });

  await page.close();

  if (!id) {
    throw new Error(
      "Could not determine extension ID. Make sure the extension is built: pnpm --filter @gal/chrome-extension build",
    );
  }
  return id;
}

/**
 * Open the extension popup in a new page.
 *
 * @param context - The browser context with the extension loaded
 * @param extensionId - The extension ID from getExtensionId()
 * @returns A Playwright Page pointing at the popup HTML
 */
export async function openExtensionPopup(
  context: BrowserContext,
  extensionId: string,
): Promise<Page> {
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  const page = await context.newPage();
  await page.goto(popupUrl);
  await page.waitForLoadState("domcontentloaded");
  return page;
}

/**
 * Wait for the content script to inject the GAL shadow root into a page.
 *
 * The content script injects a shadow DOM host element. This helper waits
 * until that element is present, indicating the content script has run.
 *
 * @param page - The page where the content script should inject
 * @param timeout - Max ms to wait (default 10 000)
 */
export async function waitForContentScriptReady(
  page: Page,
  timeout = 10_000,
): Promise<void> {
  await page.waitForFunction(
    () => {
      // The content script creates a shadow host; check for any gal element
      return (
        document.querySelector('[id^="gal-"]') !== null ||
        document.querySelector('[class^="gal-"]') !== null
      );
    },
    { timeout },
  );
}

/**
 * Check whether a content script is injected on the given page.
 * Returns false if no GAL DOM elements are found within the timeout.
 */
export async function isContentScriptInjected(
  page: Page,
  timeout = 5_000,
): Promise<boolean> {
  try {
    await waitForContentScriptReady(page, timeout);
    return true;
  } catch {
    return false;
  }
}

/**
 * Count "Save to GAL" buttons visible on the page.
 * These buttons are injected by the content script over images.
 */
export async function countSaveToGalButtons(page: Page): Promise<number> {
  return page.locator(".gal-clipboard-save-btn").count();
}

/**
 * Wait for at least one "Save to GAL" button to appear on the page.
 *
 * @param page - The page to check
 * @param timeout - Max ms to wait
 */
export async function waitForSaveToGalButton(
  page: Page,
  timeout = 15_000,
): Promise<void> {
  await expect(page.locator(".gal-clipboard-save-btn").first()).toBeAttached({
    timeout,
  });
}
