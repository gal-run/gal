export type BrowserProfileExtensionTabState =
  | 'ready'
  | 'needs_cookie_permission'
  | 'needs_site_access'
  | 'unsupported'

export interface BrowserProfileExtensionTab {
  tabId: number
  title: string
  url: string
  hostname: string
  active: boolean
  captureState: BrowserProfileExtensionTabState
  reason?: string
}

export interface BrowserProfileExtensionInventory {
  cookiesPermissionGranted: boolean
  tabs: BrowserProfileExtensionTab[]
}

export interface BrowserProfileExtensionCaptureResult {
  profileId: string
  savedName: string
  domain: string
  cookieCount: number
  localStorageEntryCount: number
}

type BridgeMethod =
  | 'GAL_PING'
  | 'GAL_OPEN_POPUP'
  | 'GAL_BROWSER_PROFILE_LIST_TABS'
  | 'GAL_BROWSER_PROFILE_CAPTURE'

interface BridgeResponse {
  source?: string
  type?: string
  requestId?: string
  ok?: boolean
  result?: unknown
  error?: string
}

const REQUEST_TYPE = 'GAL_EXTENSION_RPC_REQUEST'
const RESPONSE_TYPE = 'GAL_EXTENSION_RPC_RESPONSE'
const DEFAULT_TIMEOUT_MS = 3000

function getWindowOrThrow(): Window {
  if (typeof window === 'undefined') {
    throw new Error('The browser profile extension bridge is only available in the browser.')
  }

  return window
}

async function callExtensionBridge<T>(
  method: BridgeMethod,
  payload?: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const browserWindow = getWindowOrThrow()
  const requestId = `gal-extension-${Date.now()}-${Math.random().toString(36).slice(2)}`

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      browserWindow.removeEventListener('message', handleMessage)
      browserWindow.clearTimeout(timeoutId)
    }

    const handleMessage = (event: MessageEvent<BridgeResponse>) => {
      if (event.source !== browserWindow) return
      if (event.origin !== browserWindow.location.origin) return
      if (event.data?.source !== 'gal-extension') return
      if (event.data?.type !== RESPONSE_TYPE) return
      if (event.data?.requestId !== requestId) return

      cleanup()

      if (event.data.ok === false) {
        reject(new Error(event.data.error || 'The GAL Chrome extension request failed.'))
        return
      }

      resolve(event.data.result as T)
    }

    const timeoutId = browserWindow.setTimeout(() => {
      cleanup()
      reject(
        new Error(
          'The GAL Chrome extension did not respond. Install it in this browser or refresh the page after signing in.',
        ),
      )
    }, timeoutMs)

    browserWindow.addEventListener('message', handleMessage)
    browserWindow.postMessage(
      {
        source: 'gal-dashboard',
        type: REQUEST_TYPE,
        requestId,
        method,
        payload,
      },
      browserWindow.location.origin,
    )
  })
}

export async function pingBrowserProfileExtension(): Promise<{ version?: string }> {
  return callExtensionBridge<{ version?: string }>('GAL_PING')
}

export async function openBrowserProfileExtensionPopup(): Promise<void> {
  await callExtensionBridge('GAL_OPEN_POPUP')
}

export async function listBrowserProfileExtensionTabs(): Promise<BrowserProfileExtensionInventory> {
  return callExtensionBridge<BrowserProfileExtensionInventory>('GAL_BROWSER_PROFILE_LIST_TABS')
}

export async function captureBrowserProfileViaExtension(data: {
  tabId: number
  profileName?: string
}): Promise<BrowserProfileExtensionCaptureResult> {
  return callExtensionBridge<BrowserProfileExtensionCaptureResult>(
    'GAL_BROWSER_PROFILE_CAPTURE',
    data,
    12000,
  )
}
