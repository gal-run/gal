import { expect, test, chromium, type BrowserContext, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const extensionPath = path.resolve(__dirname, '../../../chrome-extension/dist')

const dashboardFixtureHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>GAL Browser Profiles Fixture</title>
  </head>
  <body>
    <main>
      <h1>GAL Browser Profiles Fixture</h1>
      <p>Extension bridge test harness.</p>
    </main>
  </body>
</html>`

const githubFixtureHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>GitHub Fixture</title>
  </head>
  <body>
    <main>
      <h1>GitHub Fixture</h1>
      <p id="status">local-storage-auth</p>
    </main>
    <script>
      window.localStorage.setItem('galBrowserProfileE2E', 'ok');
    </script>
  </body>
</html>`

const runpodFixtureHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>RunPod Fixture</title>
  </head>
  <body>
    <main>
      <h1>RunPod Fixture</h1>
      <p id="status">optional-host</p>
    </main>
  </body>
</html>`

type ExtensionRpcResponse<T> =
  | { ok: true; result: T }
  | { ok: false; error: string }

type BrowserProfileTabSummary = {
  tabId: number
  url: string
  hostname: string
  title: string
  active: boolean
  captureState: 'ready' | 'needs_cookie_permission' | 'needs_site_access' | 'unsupported'
  reason?: string
}

type BrowserProfileTabInventory = {
  cookiesPermissionGranted: boolean
  tabs: BrowserProfileTabSummary[]
}

type BrowserProfileCaptureResult = {
  profileId: string
  savedName: string
  domain: string
  cookieCount: number
  localStorageEntryCount: number
}

async function callExtensionRpc<T>(
  page: Page,
  method: string,
  payload?: Record<string, unknown>,
): Promise<ExtensionRpcResponse<T>> {
  return page.evaluate(
    ({ method, payload }) =>
      new Promise<ExtensionRpcResponse<T>>((resolve) => {
        const requestId = `gal-extension-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const timeoutId = window.setTimeout(() => {
          window.removeEventListener('message', handleMessage)
          resolve({ ok: false, error: 'Timed out waiting for the GAL extension bridge.' })
        }, 5_000)

        function handleMessage(event: MessageEvent) {
          if (event.source !== window) return
          if (event.origin !== window.location.origin) return

          const data = event.data as
            | {
                source?: string
                type?: string
                requestId?: string
                ok?: boolean
                result?: T
                error?: string
              }
            | undefined

          if (!data || data.source !== 'gal-extension') return
          if (data.type !== 'GAL_EXTENSION_RPC_RESPONSE') return
          if (data.requestId !== requestId) return

          window.clearTimeout(timeoutId)
          window.removeEventListener('message', handleMessage)

          if (data.ok === false) {
            resolve({
              ok: false,
              error: data.error || 'The GAL extension bridge reported a failure.',
            })
            return
          }

          resolve({
            ok: true,
            result: data.result as T,
          })
        }

        window.addEventListener('message', handleMessage)
        window.postMessage(
          {
            source: 'gal-dashboard',
            type: 'GAL_EXTENSION_RPC_REQUEST',
            requestId,
            method,
            payload,
          },
          window.location.origin,
        )
      }),
    { method, payload },
  )
}

test.describe('Browser profile extension harness', () => {
  let context: BrowserContext
  let dashboardPage: Page
  let githubPage: Page
  let userDataDir: string
  let uploadedBrowserProfileBody: {
    name: string
    domains?: string[]
    storageState: string
  } | null = null

  test.beforeAll(async () => {
    userDataDir = await mkdtemp(path.join(os.tmpdir(), 'gal-browser-profile-extension-e2e-'))

    context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: process.env.PW_HEADLESS === '0' ? false : true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
      viewport: { width: 1440, height: 1024 },
    })

    await context.route('https://api.gal.run/**', async (route) => {
      const url = route.request().url()

      if (url.endsWith('/auth/extension-token')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{}',
        })
        return
      }

      if (url.endsWith('/api/browser-profiles')) {
        uploadedBrowserProfileBody = route.request().postDataJSON() as {
          name: string
          domains?: string[]
          storageState: string
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'profile-e2e-1' }),
        })
        return
      }

      await route.fulfill({ status: 204, body: '' })
    })

    await context.route('https://app.gal.run/browser-profiles', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: dashboardFixtureHtml,
      })
    })

    await context.route('https://github.com/gal-browser-profile-e2e', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: githubFixtureHtml,
      })
    })

    await context.route('https://console.runpod.io/gal-browser-profile-e2e', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: runpodFixtureHtml,
      })
    })

    githubPage = await context.newPage()
    await githubPage.goto('https://github.com/gal-browser-profile-e2e')
    await githubPage.waitForLoadState('domcontentloaded')
    await expect(githubPage.locator('#status')).toHaveText('local-storage-auth')

    dashboardPage = await context.newPage()
    await dashboardPage.goto('https://app.gal.run/browser-profiles')
    await dashboardPage.waitForLoadState('domcontentloaded')

    await expect
      .poll(
        () =>
          context
            .serviceWorkers()
            .map((worker) => worker.url())
            .some((url) => url.startsWith('chrome-extension://') && url.endsWith('/background.js')),
      )
      .toBe(true)

    await expect
      .poll(async () => {
        const ping = await callExtensionRpc<{ version?: string }>(dashboardPage, 'GAL_PING')
        return ping.ok
      })
      .toBe(true)
  })

  test.afterAll(async () => {
    await context?.close()
    await rm(userDataDir, { recursive: true, force: true })
  })

  test('captures local-storage auth through the dashboard extension bridge without cookie permission', async () => {
    const ping = await callExtensionRpc<{ version?: string }>(dashboardPage, 'GAL_PING')
    expect(ping.ok).toBe(true)
    if (!ping.ok) throw new Error(ping.error)
    expect(ping.result.version).toMatch(/\d+\.\d+\.\d+/)

    const listedTabs = await callExtensionRpc<BrowserProfileTabInventory>(
      dashboardPage,
      'GAL_BROWSER_PROFILE_LIST_TABS',
    )
    expect(listedTabs.ok).toBe(true)
    if (!listedTabs.ok) throw new Error(listedTabs.error)

    expect(listedTabs.result.cookiesPermissionGranted).toBe(false)
    const githubTab = listedTabs.result.tabs.find((tab) => tab.hostname === 'github.com')
    expect(githubTab).toBeDefined()
    expect(githubTab).toMatchObject({
      captureState: 'ready',
    })
    expect(githubTab?.reason).toContain('Cookie access has not been granted yet')

    const capture = await callExtensionRpc<BrowserProfileCaptureResult>(
      dashboardPage,
      'GAL_BROWSER_PROFILE_CAPTURE',
      {
        tabId: githubTab?.tabId,
        profileName: 'GitHub Fixture',
      },
    )
    expect(capture.ok).toBe(true)
    if (!capture.ok) throw new Error(capture.error)

    expect(capture.result).toMatchObject({
      profileId: 'profile-e2e-1',
      savedName: 'GitHub Fixture',
      domain: 'github.com',
      cookieCount: 0,
      localStorageEntryCount: 1,
    })

    expect(uploadedBrowserProfileBody).toMatchObject({
      name: 'GitHub Fixture',
      domains: ['github.com'],
    })

    const storageState = JSON.parse(uploadedBrowserProfileBody!.storageState) as {
      cookies: unknown[]
      origins: Array<{
        origin: string
        localStorage: Array<{ name: string; value: string }>
      }>
    }

    expect(storageState.cookies).toEqual([])
    expect(storageState.origins).toEqual([
      {
        origin: 'https://github.com',
        localStorage: [{ name: 'galBrowserProfileE2E', value: 'ok' }],
      },
    ])
  })

  test('flags optional-host targets like RunPod as needing site access in a fresh browser', async () => {
    await githubPage.goto('https://console.runpod.io/gal-browser-profile-e2e')
    await githubPage.waitForLoadState('domcontentloaded')
    await expect(githubPage.locator('#status')).toHaveText('optional-host')
    await githubPage.bringToFront()
    await githubPage.waitForTimeout(250)

    const listedTabs = await callExtensionRpc<BrowserProfileTabInventory>(
      dashboardPage,
      'GAL_BROWSER_PROFILE_LIST_TABS',
    )
    expect(listedTabs.ok).toBe(true)
    if (!listedTabs.ok) throw new Error(listedTabs.error)

    const runpodTab = listedTabs.result.tabs.find((tab) => tab.hostname === 'console.runpod.io')
    expect(runpodTab).toBeDefined()
    expect(runpodTab).toMatchObject({
      captureState: 'needs_site_access',
    })
    expect(runpodTab?.reason).toContain('Site access for console.runpod.io has not been granted yet')
  })
})
