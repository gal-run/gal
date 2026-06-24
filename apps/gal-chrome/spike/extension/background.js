// gal-chrome-spike background service worker.
// Connects OUT to a local bridge (the MCP service) over WebSocket, receives {id, action,
// params}, and drives the REAL active Chrome tab via chrome.debugger (CDP) — the same CDP
// surface gal-browser uses, but on the user's real browser instead of a spawned headless one.
const BRIDGE = "ws://127.0.0.1:8777";
let socket = null;
let attachedTab = null;

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || (await chrome.tabs.query({ active: true }))[0];
}

async function ensureAttached() {
  const tab = await activeTab();
  if (!tab) throw new Error("no active tab");
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

function cdp(tabId, method, params) {
  return chrome.debugger.sendCommand({ tabId }, method, params || {});
}

async function handle(msg) {
  const { action, params = {} } = msg;
  if (action === "ping") return { ok: true, ext: "gal-chrome-spike" };
  const tabId = await ensureAttached();
  if (action === "navigate") {
    await cdp(tabId, "Page.navigate", { url: params.url });
    await new Promise((r) => setTimeout(r, 1200));
    const r = await cdp(tabId, "Runtime.evaluate", { expression: "location.href", returnByValue: true });
    return { url: r.result.value };
  }
  if (action === "screenshot") {
    const r = await cdp(tabId, "Page.captureScreenshot", { format: "png" });
    return { data_len: (r.data || "").length };
  }
  if (action === "eval") {
    const r = await cdp(tabId, "Runtime.evaluate", { expression: params.expression, returnByValue: true });
    return { result: r.result && r.result.value };
  }
  if (action === "click") {
    const o = { x: params.x, y: params.y, button: "left", clickCount: 1 };
    await cdp(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", ...o });
    await cdp(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", ...o });
    return { clicked: [params.x, params.y] };
  }
  throw new Error("unknown action: " + action);
}

function connect() {
  try {
    socket = new WebSocket(BRIDGE);
  } catch (e) {
    setTimeout(connect, 1000);
    return;
  }
  socket.onopen = () => socket.send(JSON.stringify({ hello: "gal-chrome-spike" }));
  socket.onmessage = async (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.id === undefined) return;
    try {
      const result = await handle(msg);
      socket.send(JSON.stringify({ id: msg.id, result }));
    } catch (e) {
      socket.send(JSON.stringify({ id: msg.id, error: String(e) }));
    }
  };
  socket.onclose = () => setTimeout(connect, 1000);
  socket.onerror = () => { try { socket.close(); } catch (e) {} };
}

connect();
// MV3 keepalive: a live WebSocket keeps the worker alive; the alarm reconnects if it drops.
chrome.alarms.create("keepalive", { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener(() => {
  if (!socket || socket.readyState > 1) connect();
});
