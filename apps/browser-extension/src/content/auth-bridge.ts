/**
 * Auth Bridge Content Script
 *
 * Runs on https://app.gal.run/* to sync auth state between the GAL dashboard
 * and the Chrome extension in both directions.
 *
 * Dashboard → Extension: Fetches the session JWT via /auth/extension-token
 *   (request includes the httpOnly gal_session cookie automatically) and
 *   sends it to the background service worker for storage.
 *
 * Extension → Dashboard: Listens for GAL_PUSH_TOKEN messages from the
 *   background script and calls POST /auth/token-to-cookie to convert
 *   the extension Bearer token into a dashboard session cookie.
 */

const API_BASE_URL = "https://api.gal.run";
const DASHBOARD_RPC_REQUEST = "GAL_EXTENSION_RPC_REQUEST";
const DASHBOARD_RPC_RESPONSE = "GAL_EXTENSION_RPC_RESPONSE";

type DashboardRpcMethod =
  | "GAL_PING"
  | "GAL_OPEN_POPUP"
  | "GAL_BROWSER_PROFILE_LIST_TABS"
  | "GAL_BROWSER_PROFILE_CAPTURE";

function postDashboardRpcResponse(
  requestId: string,
  response: {
    ok: boolean;
    result?: unknown;
    error?: string;
  },
): void {
  window.postMessage(
    {
      source: "gal-extension",
      type: DASHBOARD_RPC_RESPONSE,
      requestId,
      ...response,
    },
    window.location.origin,
  );
}

async function syncDashboardToExtension(): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/extension-token`, {
      credentials: "include",
    });
    if (!response.ok) return;
    const { token } = await response.json();
    if (token) {
      chrome.runtime.sendMessage({ type: "GAL_STORE_TOKEN", token });
    }
  } catch {
    // Dashboard may not be logged in — that's fine
  }
}

async function syncExtensionToDashboard(token: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/token-to-cookie`, {
      method: "POST",
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
    // Reload so the dashboard picks up the new session cookie
    window.location.reload();
  } catch {
    // Non-critical — extension is still logged in
  }
}

// Dashboard → Extension on page load
syncDashboardToExtension();

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== window.location.origin) {
    return;
  }

  const message = event.data as
    | {
        source?: string;
        type?: string;
        requestId?: string;
        method?: DashboardRpcMethod;
        payload?: Record<string, unknown>;
      }
    | undefined;

  if (
    !message ||
    message.source !== "gal-dashboard" ||
    message.type !== DASHBOARD_RPC_REQUEST ||
    typeof message.requestId !== "string" ||
    typeof message.method !== "string"
  ) {
    return;
  }

  void chrome.runtime
    .sendMessage({
      type: message.method,
      ...(message.payload || {}),
    })
    .then((response) => {
      if (response?.ok === false) {
        postDashboardRpcResponse(message.requestId!, {
          ok: false,
          error:
            typeof response.error === "string"
              ? response.error
              : "The GAL Chrome extension request failed.",
        });
        return;
      }

      const result =
        response && Object.prototype.hasOwnProperty.call(response, "result")
          ? response.result
          : response;
      postDashboardRpcResponse(message.requestId!, { ok: true, result });
    })
    .catch((error) => {
      postDashboardRpcResponse(message.requestId!, {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "The GAL Chrome extension did not respond.",
      });
    });
});

// Extension → Dashboard: receive token from background script
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "GAL_PUSH_TOKEN_TO_DASHBOARD" && message.token) {
    syncExtensionToDashboard(message.token);
  }
});
