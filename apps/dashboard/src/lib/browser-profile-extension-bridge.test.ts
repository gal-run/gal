import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  captureBrowserProfileViaExtension,
  listBrowserProfileExtensionTabs,
} from './browser-profile-extension-bridge'

type MessageListener = (event: MessageEvent) => void

function installMockWindow(
  responder: (message: Record<string, unknown>, listener: MessageListener) => void,
) {
  let listener: MessageListener | null = null

  const mockWindow = {
    location: { origin: 'https://app.gal.run' },
    addEventListener: vi.fn((_type: string, nextListener: MessageListener) => {
      listener = nextListener
    }),
    removeEventListener: vi.fn(() => {
      listener = null
    }),
    setTimeout,
    clearTimeout,
    postMessage: vi.fn((message: Record<string, unknown>) => {
      if (!listener) return
      responder(message, listener)
    }),
  }

  vi.stubGlobal('window', mockWindow)

  return mockWindow
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('browser profile extension bridge', () => {
  it('lists available tabs through the extension bridge', async () => {
    installMockWindow((message, listener) => {
      listener({
        source: globalThis.window,
        origin: 'https://app.gal.run',
        data: {
          source: 'gal-extension',
          type: 'GAL_EXTENSION_RPC_RESPONSE',
          requestId: message.requestId,
          ok: true,
          result: {
            cookiesPermissionGranted: true,
            tabs: [
              {
                tabId: 7,
                title: 'GitHub',
                url: 'https://github.com/Scheduler-Systems/gal-run-private',
                hostname: 'github.com',
                active: false,
                captureState: 'ready',
              },
            ],
          },
        },
      } as unknown as MessageEvent)
    })

    await expect(listBrowserProfileExtensionTabs()).resolves.toEqual({
      cookiesPermissionGranted: true,
      tabs: [
        {
          tabId: 7,
          title: 'GitHub',
          url: 'https://github.com/Scheduler-Systems/gal-run-private',
          hostname: 'github.com',
          active: false,
          captureState: 'ready',
        },
      ],
    })
  })

  it('surfaces bridge timeouts clearly', async () => {
    vi.useFakeTimers()
    installMockWindow(() => {})

    const pending = captureBrowserProfileViaExtension({ tabId: 42, profileName: 'GitHub' })
    const rejection = expect(pending).rejects.toThrow(
      'The GAL Chrome extension did not respond. Install it in this browser or refresh the page after signing in.',
    )
    await vi.advanceTimersByTimeAsync(12_000)
    await rejection
  })
})
