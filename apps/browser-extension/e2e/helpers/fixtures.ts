import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  EXTENSION_PATH,
  getExtensionId,
  openExtensionPopup,
} from "./extension";

/**
 * Custom Playwright fixtures that provide a shared browser context with the
 * GAL Chrome extension pre-loaded.
 *
 * Usage:
 *   import { test, expect } from '../helpers/fixtures'
 *
 *   test('my test', async ({ extensionContext, extensionId, openPopup }) => { ... })
 */

// Worker-scoped fixtures: shared across all tests in the worker process
export interface ExtensionWorkerFixtures {
  /** Chromium persistent context with the extension loaded */
  extensionContext: BrowserContext;
  /** The runtime extension ID assigned by Chrome */
  extensionId: string;
}

// Test-scoped fixtures: fresh per test
export interface ExtensionTestFixtures {
  /** Helper to open a fresh popup page */
  openPopup: () => Promise<Page>;
}

export const test = base.extend<ExtensionTestFixtures, ExtensionWorkerFixtures>(
  {
    // Worker-scoped: spin up one browser context per worker with the extension
    // loaded, shared across all tests to avoid the overhead of restarting Chrome.
    extensionContext: [
      async (_, use) => {
        const context = await chromium.launchPersistentContext("", {
          headless: false,
          args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            "--headless=new",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-default-apps",
            "--disable-popup-blocking",
          ],
        });
        await use(context);
        await context.close();
      },
      { scope: "worker" },
    ],

    extensionId: [
      async ({ extensionContext }, use) => {
        const id = await getExtensionId(extensionContext);
        await use(id);
      },
      { scope: "worker" },
    ],

    // Test-scoped helper to open a fresh popup page per test
    openPopup: async ({ extensionContext, extensionId }, use) => {
      await use(() => openExtensionPopup(extensionContext, extensionId));
    },
  },
);

export { expect } from "@playwright/test";
