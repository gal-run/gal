// gal-chrome background service worker.
// Connects OUT to the local gal-chrome MCP server over WebSocket, receives {id, action, params},
// and drives the user's REAL Chrome: page content via chrome.debugger (CDP) — the same surface
// gal-browser uses — and tabs via chrome.tabs. (Per ADR 0001, gal-chrome is a separate
// component from gal-browser, not a rename.)
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

async function evalExpr(tabId, expression) {
  const r = await cdp(tabId, "Runtime.evaluate", { expression, returnByValue: true });
  return r.result && r.result.value;
}

async function handle(msg) {
  const { action, params = {} } = msg;

  // --- meta ---
  if (action === "ping") return { ok: true, ext: "gal-chrome" };

  // --- tab management (chrome.tabs) ---
  if (action === "tabs_list") {
    const tabs = await chrome.tabs.query({});
    return { tabs: tabs.map((t) => ({ id: t.id, index: t.index, url: t.url, title: t.title, active: t.active })) };
  }
  if (action === "tabs_new") {
    const t = await chrome.tabs.create({ url: params.url || "about:blank", active: true });
    attachedTab = null;
    return { id: t.id, url: t.url };
  }
  if (action === "tabs_select") {
    await chrome.tabs.update(params.id, { active: true });
    attachedTab = null;
    return { selected: params.id };
  }
  if (action === "tabs_close") {
    await chrome.tabs.remove(params.id);
    attachedTab = null;
    return { closed: params.id };
  }

  // --- page driving (CDP via chrome.debugger) ---
  const tabId = await ensureAttached();
  if (action === "navigate") {
    const url = String(params.url || "");
    if (url === "back") { await cdp(tabId, "Runtime.evaluate", { expression: "history.back()" }); }
    else if (url === "forward") { await cdp(tabId, "Runtime.evaluate", { expression: "history.forward()" }); }
    else { await cdp(tabId, "Page.navigate", { url }); }
    await new Promise((r) => setTimeout(r, 1200));
    return { url: await evalExpr(tabId, "location.href") };
  }
  if (action === "screenshot") {
    const r = await cdp(tabId, "Page.captureScreenshot", { format: "png" });
    return { data: r.data, data_len: (r.data || "").length };
  }
  if (action === "eval") {
    return { result: await evalExpr(tabId, params.expression) };
  }
  if (action === "get_text") {
    return { text: await evalExpr(tabId, "document.body ? document.body.innerText.slice(0,20000) : ''") };
  }
  if (action === "click") {
    const x = params.x, y = params.y, cc = params.clickCount || 1;
    await cdp(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await cdp(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: cc });
    await cdp(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: cc });
    return { clicked: [x, y] };
  }
  if (action === "type") {
    await cdp(tabId, "Input.insertText", { text: params.text || "" });
    return { typed: (params.text || "").length };
  }
  if (action === "key") {
    const k = params.key || "Enter";
    const vk = { Enter: 13, Tab: 9, Backspace: 8, Escape: 27, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39 }[k];
    const base = { key: k, code: k };
    if (vk) base.windowsVirtualKeyCode = vk;
    await cdp(tabId, "Input.dispatchKeyEvent", { type: "keyDown", ...base });
    await cdp(tabId, "Input.dispatchKeyEvent", { type: "keyUp", ...base });
    return { key: k };
  }
  if (action === "scroll") {
    await cdp(tabId, "Input.dispatchMouseEvent", {
      type: "mouseWheel", x: params.x || 100, y: params.y || 100,
      deltaX: params.scroll_x || 0, deltaY: params.scroll_y || 0,
    });
    return { scrolled: params.scroll_y || 0 };
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
  socket.onopen = () => socket.send(JSON.stringify({ hello: "gal-chrome" }));
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
chrome.alarms.create("keepalive", { periodInMinutes: 0.25 });
chrome.alarms.onAlarm.addListener(() => {
  if (!socket || socket.readyState > 1) connect();
});
