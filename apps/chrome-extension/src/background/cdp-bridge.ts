/**
 * Opt-in CDP page-driving bridge.
 *
 * Folds the proven `gal-chrome` capability into the governance extension. When — and
 * only when — the user explicitly opts in (a feature flag in storage.local plus the
 * runtime-granted `debugger` permission), the service worker connects OUT to the local
 * gal-chrome MCP server over WebSocket and drives the active tab via chrome.debugger
 * (CDP) + chrome.tabs/tabGroups. This is the same action protocol the standalone
 * gal-chrome spike used (see apps/gal-chrome); it is the working successor to
 * mcp/gal-browser-use-service's stubbed ChromeBridge (whose HTTP-to-extension idea
 * can't work in MV3 — the extension connects out instead).
 *
 * Default users are unaffected: nothing connects, no permission is requested, and no
 * "started debugging this browser" banner appears unless someone turns it on.
 */

const BRIDGE_URL = "ws://127.0.0.1:8777";
const FEATURE_FLAG_KEY = "cdpPageDrivingEnabled";
const KEEPALIVE_ALARM = "cdp-keepalive";

let socket: WebSocket | null = null;
let attachedTab: number | null = null;

interface BridgeCommand {
  id?: number;
  action?: string;
  params?: Record<string, unknown>;
}

function log(...args: unknown[]): void {
  console.log("[gal cdp-bridge]", ...args);
}

async function isEnabled(): Promise<boolean> {
  try {
    const r = await chrome.storage.local.get(FEATURE_FLAG_KEY);
    return r[FEATURE_FLAG_KEY] === true;
  } catch {
    return false;
  }
}

async function hasDebuggerPermission(): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ permissions: ["debugger"] });
  } catch {
    return false;
  }
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] ?? (await chrome.tabs.query({ active: true }))[0];
}

async function ensureAttached(): Promise<number> {
  const tab = await activeTab();
  if (!tab?.id) throw new Error("no active tab");
  if (attachedTab !== tab.id) {
    try {
      await chrome.debugger.attach({ tabId: tab.id }, "1.3");
    } catch (e) {
      if (!String(e).includes("already attached")) throw e;
    }
    attachedTab = tab.id;
    await chrome.debugger.sendCommand({ tabId: tab.id }, "Page.enable", {});
  }
  return tab.id;
}

function cdp(
  tabId: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<unknown> {
  return chrome.debugger.sendCommand({ tabId }, method, params ?? {});
}

async function evalExpr(tabId: number, expression: string): Promise<unknown> {
  const r = (await cdp(tabId, "Runtime.evaluate", {
    expression,
    returnByValue: true,
  })) as { result?: { value?: unknown } };
  return r.result?.value;
}

async function handle(msg: BridgeCommand): Promise<unknown> {
  const action = msg.action ?? "";
  const params = msg.params ?? {};

  if (action === "ping") return { ok: true, ext: "gal" };

  // --- tab management (chrome.tabs / chrome.tabGroups) ---
  if (action === "tabs_list") {
    const tabs = await chrome.tabs.query({});
    return {
      tabs: tabs.map((t) => ({
        id: t.id,
        index: t.index,
        url: t.url,
        title: t.title,
        active: t.active,
      })),
    };
  }
  if (action === "tabs_new") {
    const t = await chrome.tabs.create({
      url: (params.url as string) || "about:blank",
      active: true,
    });
    attachedTab = null;
    return { id: t.id, url: t.url };
  }
  if (action === "tabs_select") {
    await chrome.tabs.update(params.id as number, { active: true });
    attachedTab = null;
    return { selected: params.id };
  }
  if (action === "tabs_close") {
    await chrome.tabs.remove(params.id as number);
    attachedTab = null;
    return { closed: params.id };
  }
  if (action === "group_tab") {
    const gid = await chrome.tabs.group({ tabIds: [params.tab_id as number] });
    const title = (params.title as string) || "gal";
    const color = ((params.color as string) ||
      "cyan") as chrome.tabGroups.UpdateProperties["color"];
    await chrome.tabGroups.update(gid, { title, color });
    return { groupId: gid, title, color };
  }

  // --- page driving via CDP (chrome.debugger) ---
  const tabId = await ensureAttached();
  if (action === "navigate") {
    const url = String(params.url ?? "");
    if (url === "back") {
      await cdp(tabId, "Runtime.evaluate", { expression: "history.back()" });
    } else if (url === "forward") {
      await cdp(tabId, "Runtime.evaluate", { expression: "history.forward()" });
    } else {
      await cdp(tabId, "Page.navigate", { url });
    }
    await new Promise((r) => setTimeout(r, 1200));
    return { url: await evalExpr(tabId, "location.href") };
  }
  if (action === "screenshot") {
    const r = (await cdp(tabId, "Page.captureScreenshot", { format: "png" })) as {
      data?: string;
    };
    return { data: r.data, data_len: (r.data ?? "").length };
  }
  if (action === "eval") {
    return { result: await evalExpr(tabId, String(params.expression ?? "")) };
  }
  if (action === "get_text") {
    return {
      text: await evalExpr(
        tabId,
        "document.body ? document.body.innerText.slice(0,20000) : ''",
      ),
    };
  }
  if (action === "click") {
    const x = params.x as number;
    const y = params.y as number;
    const cc = (params.clickCount as number) || 1;
    await cdp(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await cdp(tabId, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      buttons: 1,
      clickCount: cc,
    });
    await cdp(tabId, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      buttons: 0,
      clickCount: cc,
    });
    return { clicked: [x, y] };
  }
  if (action === "type") {
    await cdp(tabId, "Input.insertText", { text: (params.text as string) || "" });
    return { typed: ((params.text as string) || "").length };
  }
  if (action === "key") {
    const k = (params.key as string) || "Enter";
    const vk: Record<string, number> = {
      Enter: 13,
      Tab: 9,
      Backspace: 8,
      Escape: 27,
      ArrowDown: 40,
      ArrowUp: 38,
      ArrowLeft: 37,
      ArrowRight: 39,
    };
    const base: Record<string, unknown> = { key: k, code: k };
    if (vk[k]) base.windowsVirtualKeyCode = vk[k];
    await cdp(tabId, "Input.dispatchKeyEvent", { type: "keyDown", ...base });
    await cdp(tabId, "Input.dispatchKeyEvent", { type: "keyUp", ...base });
    return { key: k };
  }
  if (action === "scroll") {
    await cdp(tabId, "Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: (params.x as number) || 100,
      y: (params.y as number) || 100,
      deltaX: (params.scroll_x as number) || 0,
      deltaY: (params.scroll_y as number) || 0,
    });
    return { scrolled: (params.scroll_y as number) || 0 };
  }
  throw new Error("unknown action: " + action);
}

function connect(): void {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  try {
    socket = new WebSocket(BRIDGE_URL);
  } catch {
    return;
  }
  socket.onopen = () => socket?.send(JSON.stringify({ hello: "gal" }));
  socket.onmessage = (ev: MessageEvent) => {
    let msg: BridgeCommand;
    try {
      msg = JSON.parse(String(ev.data)) as BridgeCommand;
    } catch {
      return;
    }
    if (msg.id === undefined) return;
    void handle(msg)
      .then((result) => socket?.send(JSON.stringify({ id: msg.id, result })))
      .catch((e) => socket?.send(JSON.stringify({ id: msg.id, error: String(e) })));
  };
  socket.onclose = () => {
    socket = null;
  };
  socket.onerror = () => {
    try {
      socket?.close();
    } catch {
      // ignore — onclose resets the socket
    }
  };
}

/**
 * Called at service-worker boot. No-op unless the user has opted in. When enabled,
 * starts the keepalive alarm and connects to the MCP server.
 */
export async function initCdpBridge(): Promise<void> {
  if (!(await isEnabled()) || !(await hasDebuggerPermission())) return;
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.25 });
  connect();
  log("enabled — connecting to gal-chrome MCP server at", BRIDGE_URL);
}

// Reconnect on the keepalive alarm (MV3 service workers are short-lived). Gated so a
// disabled extension never reconnects or spams the closed socket.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) return;
  void (async () => {
    if (!(await isEnabled()) || !(await hasDebuggerPermission())) return;
    if (!socket || socket.readyState > WebSocket.OPEN) connect();
  })();
});

/**
 * Handles the popup/UI opt-in messages (CDP_ENABLE / CDP_DISABLE / CDP_STATUS).
 * CDP_ENABLE requests the `debugger` permission at runtime (the consent gate).
 */
export function handleCdpMessage(
  message: { type?: string },
  sendResponse: (response?: unknown) => void,
): void {
  const type = message.type ?? "";
  if (type === "CDP_ENABLE") {
    void (async () => {
      try {
        const granted = await chrome.permissions.request({
          permissions: ["debugger"],
        });
        if (!granted) {
          sendResponse({ enabled: false, error: "debugger permission not granted" });
          return;
        }
        await chrome.storage.local.set({ [FEATURE_FLAG_KEY]: true });
        await initCdpBridge();
        sendResponse({ enabled: true });
      } catch (e) {
        sendResponse({ enabled: false, error: String(e) });
      }
    })();
    return;
  }
  if (type === "CDP_DISABLE") {
    void (async () => {
      await chrome.storage.local.set({ [FEATURE_FLAG_KEY]: false });
      try {
        socket?.close();
      } catch {
        // ignore
      }
      socket = null;
      if (attachedTab !== null) {
        try {
          await chrome.debugger.detach({ tabId: attachedTab });
        } catch {
          // ignore — tab may already be detached
        }
        attachedTab = null;
      }
      await chrome.alarms.clear(KEEPALIVE_ALARM);
      sendResponse({ enabled: false });
    })();
    return;
  }
  if (type === "CDP_STATUS") {
    void (async () => {
      sendResponse({
        enabled: await isEnabled(),
        hasPermission: await hasDebuggerPermission(),
        connected: socket?.readyState === WebSocket.OPEN,
      });
    })();
    return;
  }
  sendResponse({ error: `unknown CDP message: ${type}` });
}
