//! Browser MCP Server
//!
//! Ported from `chrome-extension-gal-server.ts`. Provides headless browser
//! automation via Chrome DevTools Protocol (CDP) using the `chromiumoxide` crate.
//!
//! Tools:
//! - launch_browser: Launch a headless Chrome instance
//! - navigate: Navigate to a URL
//! - screenshot: Take a screenshot
//! - click: Click an element by selector
//! - type_text: Type text into an element
//! - get_text: Get text content of an element
//! - get_page_text: Get all visible text on the page
//! - execute_script: Run JavaScript in the page
//! - close_browser: Close the browser

use crate::mcp::{
    param_bool_or, param_str, param_u64_or, ContentItem, McpServer, Tool, ToolResult,
};
use chromiumoxide::cdp::browser_protocol::network::{
    EnableParams as NetworkEnableParams, EventRequestWillBeSent,
};
use chromiumoxide::cdp::browser_protocol::dom::SetFileInputFilesParams;
use chromiumoxide::cdp::browser_protocol::emulation::SetDeviceMetricsOverrideParams;
use chromiumoxide::cdp::browser_protocol::page::Viewport;
use chromiumoxide::cdp::browser_protocol::target::CreateTargetParams;
use chromiumoxide::cdp::browser_protocol::input::{
    DispatchKeyEventParams, DispatchKeyEventType, DispatchMouseEventParams,
    DispatchMouseEventType, InsertTextParams, MouseButton,
};
use chromiumoxide::cdp::js_protocol::runtime::EventConsoleApiCalled;
use chromiumoxide::layout::Point;
use futures::StreamExt;
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;
use tracing::warn;

// =============================================================================
// Browser Session
// =============================================================================

struct BrowserInstance {
    #[allow(dead_code)]
    browser: chromiumoxide::Browser,
    page: chromiumoxide::Page,
    /// Captured console messages (console.log/error/warn ...), newest last.
    console: Arc<Mutex<Vec<String>>>,
    /// Captured network requests ("METHOD url"), newest last.
    network: Arc<Mutex<Vec<String>>>,
}

pub struct BrowserMcpServer {
    browser: Arc<Mutex<Option<BrowserInstance>>>,
}

impl BrowserMcpServer {
    pub fn new() -> Self {
        Self {
            browser: Arc::new(Mutex::new(None)),
        }
    }

    async fn get_browser(&self) -> Result<tokio::sync::MutexGuard<'_, Option<BrowserInstance>>, String> {
        let guard = self.browser.lock().await;
        if guard.is_none() {
            return Err("No active browser. Call launch_browser first.".to_string());
        }
        Ok(guard)
    }

    async fn close_browser_inner(&self) {
        let mut guard = self.browser.lock().await;
        if let Some(instance) = guard.take() {
            drop(instance); // Drop closes the browser
        }
    }
}

// =============================================================================
// Tool Definitions
// =============================================================================

/// Attach console + network capture to a page, pushing into the shared buffers. Used for the
/// launch page AND for tabs opened via browser_tab_new (so read_console/read_network see every
/// tab, not just the first).
async fn attach_capture(
    page: &chromiumoxide::Page,
    console: Arc<Mutex<Vec<String>>>,
    network: Arc<Mutex<Vec<String>>>,
) {
    if let Ok(mut events) = page.event_listener::<EventConsoleApiCalled>().await {
        let buf = console;
        tokio::spawn(async move {
            while let Some(ev) = events.next().await {
                let body = ev
                    .args
                    .iter()
                    .filter_map(|a| {
                        a.value
                            .as_ref()
                            .map(|v| v.to_string())
                            .or_else(|| a.description.clone())
                    })
                    .collect::<Vec<_>>()
                    .join(" ");
                let line = format!("[{}] {}", ev.r#type.as_ref(), body);
                let mut b = buf.lock().await;
                if b.len() < 1000 {
                    b.push(line);
                }
            }
        });
    }
    let _ = page.execute(NetworkEnableParams::default()).await;
    if let Ok(mut events) = page.event_listener::<EventRequestWillBeSent>().await {
        let buf = network;
        tokio::spawn(async move {
            while let Some(ev) = events.next().await {
                let line = format!("{} {}", ev.request.method, ev.request.url);
                let mut b = buf.lock().await;
                if b.len() < 1000 {
                    b.push(line);
                }
            }
        });
    }
}

fn tools_list() -> Vec<Tool> {
    vec![
        Tool {
            name: "browser_launch".to_string(),
            description: "Launch a headless Chrome instance for browser automation.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"headless":{"type":"boolean","description":"Run in headless mode (default: true)"},"start_url":{"type":"string","description":"Optional page to open after launch"},"width":{"type":"number","description":"Window width (default: 1280)"},"height":{"type":"number","description":"Window height (default: 720)"}},"required":[]}"#).ok(),
        },
        Tool {
            name: "browser_navigate".to_string(),
            description: "Navigate the browser to a URL, or go through history with \"back\"/\"forward\".".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"url":{"type":"string","description":"URL to navigate to, or \"back\"/\"forward\" for history navigation"}},"required":["url"]}"#).ok(),
        },
        Tool {
            name: "browser_screenshot".to_string(),
            description: "Capture a screenshot of the current page as a PNG.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"output_path":{"type":"string","description":"Optional path to save screenshot. If not provided, returns base64."}},"required":[]}"#).ok(),
        },
        Tool {
            name: "browser_click".to_string(),
            description: "Click an element on the page by CSS selector.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"selector":{"type":"string","description":"CSS selector for the element to click"}},"required":["selector"]}"#).ok(),
        },
        Tool {
            name: "browser_type_text".to_string(),
            description: "Type text into an input element identified by CSS selector.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"selector":{"type":"string","description":"CSS selector for the input element"},"text":{"type":"string","description":"Text to type into the element"},"clear_first":{"type":"boolean","description":"Clear the element before typing (default: true)"}},"required":["selector","text"]}"#).ok(),
        },
        Tool {
            name: "browser_get_text".to_string(),
            description: "Get the text content of an element by CSS selector.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"selector":{"type":"string","description":"CSS selector for the element"}},"required":["selector"]}"#).ok(),
        },
        Tool {
            name: "browser_get_page_text".to_string(),
            description: "Get all visible text content from the current page.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{}}"#).ok(),
        },
        Tool {
            name: "browser_execute_script".to_string(),
            description: "Execute JavaScript in the context of the current page.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"script":{"type":"string","description":"JavaScript code to execute"}},"required":["script"]}"#).ok(),
        },
        Tool {
            name: "browser_read_console".to_string(),
            description: "Read console messages (each prefixed with its level, e.g. [error]) captured since launch. Optional 'pattern' substring filter and 'onlyErrors' to return just errors/exceptions.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"pattern":{"type":"string","description":"Only return messages containing this substring"},"onlyErrors":{"type":"boolean","description":"Return only error/exception messages (default false)"}},"required":[]}"#).ok(),
        },
        Tool {
            name: "browser_read_network".to_string(),
            description: "Read network requests (\"METHOD url\") captured since launch. Optional 'pattern' substring filter.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"pattern":{"type":"string","description":"Only return requests whose URL contains this substring"}},"required":[]}"#).ok(),
        },
        Tool {
            name: "browser_read_a11y".to_string(),
            description: "Read a semantic accessibility snapshot of the page: visible interactive/landmark elements as {role, name, x, y} (click coordinates). Like an accessibility tree — for reliable, non-pixel element targeting.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{},"required":[]}"#).ok(),
        },
        Tool {
            name: "browser_computer".to_string(),
            description: "Coordinate-based computer-use on the page (like the reference computer tool): click/move/drag/scroll/type/key at pixel coordinates. Coordinates are CSS pixels in the page viewport — pair with browser_read_a11y (which returns element {x,y}) or browser_screenshot. Use this for a coordinate-driven agent; use browser_click/browser_type_text for selector-driven flows.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"action":{"type":"string","enum":["left_click","right_click","middle_click","double_click","triple_click","move","scroll","left_click_drag","type","key"],"description":"The interaction to perform."},"x":{"type":"number","description":"Target X (CSS px). Required for clicks/move/drag-end; scroll anchor."},"y":{"type":"number","description":"Target Y (CSS px)."},"start_x":{"type":"number","description":"Drag start X (left_click_drag)."},"start_y":{"type":"number","description":"Drag start Y."},"scroll_x":{"type":"number","description":"Horizontal wheel delta (scroll)."},"scroll_y":{"type":"number","description":"Vertical wheel delta (scroll); positive scrolls down."},"text":{"type":"string","description":"For action=type: the text. For action=key: the key name (e.g. Enter, Tab, ArrowDown)."},"modifiers":{"type":"string","description":"Modifier keys held during the action, e.g. \"ctrl+shift\"."}},"required":["action"]}"#).ok(),
        },
        Tool {
            name: "browser_resize".to_string(),
            description: "Resize the render viewport (e.g. to test responsive layouts or set an HD capture size).".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"width":{"type":"number","description":"Viewport width in CSS px"},"height":{"type":"number","description":"Viewport height in CSS px"}},"required":["width","height"]}"#).ok(),
        },
        Tool {
            name: "browser_batch".to_string(),
            description: "Run a sequence of browser tool calls in one round trip. Each item is {name, arguments} — the same shape you'd pass standalone. Actions run sequentially and stop on the first error. Cannot be nested.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"actions":{"type":"array","description":"Ordered tool calls","items":{"type":"object","properties":{"name":{"type":"string"},"arguments":{"type":"object"}},"required":["name"]}}},"required":["actions"]}"#).ok(),
        },
        Tool {
            name: "browser_zoom".to_string(),
            description: "Capture a hi-res screenshot of a page region (CSS px). Parity with the reference zoom — for inspecting small UI detail.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"x":{"type":"number"},"y":{"type":"number"},"width":{"type":"number"},"height":{"type":"number"},"output_path":{"type":"string","description":"Optional path to save PNG; otherwise base64"}},"required":["x","y","width","height"]}"#).ok(),
        },
        Tool {
            name: "browser_form_input".to_string(),
            description: "Set a form element's value by CSS selector (text/number inputs, textarea, select, checkbox/radio). Dispatches input+change.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"selector":{"type":"string"},"value":{"description":"String/number for inputs & selects; boolean for checkbox/radio"}},"required":["selector","value"]}"#).ok(),
        },
        Tool {
            name: "browser_file_upload".to_string(),
            description: "Upload local file(s) to a file <input> identified by CSS selector (CDP setFileInputFiles — no native dialog).".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"selector":{"type":"string","description":"CSS selector for the file input"},"paths":{"type":"array","items":{"type":"string"},"description":"Absolute file paths"}},"required":["selector","paths"]}"#).ok(),
        },
        Tool {
            name: "browser_find".to_string(),
            description: "Find visible interactive elements whose accessible name/text/placeholder/aria-label/id matches a query. Returns up to 20 {role, name, x, y} for coordinate targeting (pairs with browser_computer).".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"query":{"type":"string","description":"Text to match (case-insensitive); empty returns all interactive elements"}},"required":["query"]}"#).ok(),
        },
        Tool {
            name: "browser_tab_new".to_string(),
            description: "Open a new tab (and make it active). Optional start URL.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"url":{"type":"string","description":"Optional URL to open (default about:blank)"}},"required":[]}"#).ok(),
        },
        Tool {
            name: "browser_tab_list".to_string(),
            description: "List open tabs as {index, url, active}.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{}}"#).ok(),
        },
        Tool {
            name: "browser_tab_select".to_string(),
            description: "Switch the active tab by index (from browser_tab_list).".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"index":{"type":"number"}},"required":["index"]}"#).ok(),
        },
        Tool {
            name: "browser_tab_close".to_string(),
            description: "Close a tab by index; if it was active, the first remaining tab becomes active.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"index":{"type":"number"}},"required":["index"]}"#).ok(),
        },
        Tool {
            name: "browser_close".to_string(),
            description: "Close the browser and release all resources.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{}}"#).ok(),
        },
    ]
}

// =============================================================================
// McpServer trait implementation
// =============================================================================

#[async_trait::async_trait]
impl McpServer for BrowserMcpServer {
    fn list_tools(&self) -> Vec<Tool> {
        tools_list()
    }

    async fn call_tool(&self, name: &str, args: Value) -> Option<ToolResult> {
        match name {
            "browser_launch" => Some(self.handle_launch(args).await),
            "browser_navigate" => Some(self.handle_navigate(args).await),
            "browser_screenshot" => Some(self.handle_screenshot(args).await),
            "browser_click" => Some(self.handle_click(args).await),
            "browser_type_text" => Some(self.handle_type_text(args).await),
            "browser_get_text" => Some(self.handle_get_text(args).await),
            "browser_get_page_text" => Some(self.handle_get_page_text().await),
            "browser_execute_script" => Some(self.handle_execute_script(args).await),
            "browser_read_console" => Some(self.handle_read_console(args).await),
            "browser_read_network" => Some(self.handle_read_network(args).await),
            "browser_read_a11y" => Some(self.handle_read_a11y().await),
            "browser_computer" => Some(self.handle_computer(args).await),
            "browser_resize" => Some(self.handle_resize(args).await),
            "browser_batch" => Some(self.handle_batch(args).await),
            "browser_zoom" => Some(self.handle_zoom(args).await),
            "browser_form_input" => Some(self.handle_form_input(args).await),
            "browser_file_upload" => Some(self.handle_file_upload(args).await),
            "browser_find" => Some(self.handle_find(args).await),
            "browser_tab_new" => Some(self.handle_tab_new(args).await),
            "browser_tab_list" => Some(self.handle_tab_list().await),
            "browser_tab_select" => Some(self.handle_tab_select(args).await),
            "browser_tab_close" => Some(self.handle_tab_close(args).await),
            "browser_close" => Some(self.handle_close().await),
            _ => None,
        }
    }
}

// =============================================================================
// Tool Handlers
// =============================================================================

/// Map common key names to a Windows virtual-key code so CDP delivers a real key event
/// (printable text goes through the `type` action / Input.insertText instead).
fn vk_code(key: &str) -> Option<i64> {
    Some(match key {
        "Enter" | "Return" => 13,
        "Tab" => 9,
        "Escape" | "Esc" => 27,
        "Backspace" => 8,
        "Delete" | "Del" => 46,
        "ArrowUp" | "Up" => 38,
        "ArrowDown" | "Down" => 40,
        "ArrowLeft" | "Left" => 37,
        "ArrowRight" | "Right" => 39,
        "Home" => 36,
        "End" => 35,
        "PageUp" => 33,
        "PageDown" => 34,
        " " | "Space" => 32,
        _ => return None,
    })
}

impl BrowserMcpServer {
    /// Coordinate-based computer-use on the page — parity with the reference `computer` tool.
    /// Synthesizes real CDP input events (mouse + keyboard) at pixel coordinates so a
    /// coordinate model can drive the page directly, no per-element selector required.
    async fn handle_computer(&self, args: Value) -> ToolResult {
        async fn send(page: &chromiumoxide::Page, params: DispatchMouseEventParams) -> Result<(), String> {
            page.execute(params)
                .await
                .map(|_| ())
                .map_err(|e| format!("mouse event failed: {}", e))
        }

        let action = match param_str(&args, "action") {
            Some(a) => a,
            None => return ToolResult::error("action is required"),
        };
        let getf = |k: &str| args.get(k).and_then(|v| v.as_f64());
        let mods: i64 = {
            let mut m = 0;
            if let Some(s) = param_str(&args, "modifiers") {
                for part in s.to_lowercase().split('+') {
                    m |= match part.trim() {
                        "alt" | "option" => 1,
                        "ctrl" | "control" => 2,
                        "meta" | "cmd" | "command" => 4,
                        "shift" => 8,
                        _ => 0,
                    };
                }
            }
            m
        };

        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };
        let instance = guard.as_ref().unwrap();
        let page = &instance.page;

        match action.as_str() {
            "left_click" | "right_click" | "middle_click" | "double_click" | "triple_click" => {
                let (x, y) = match (getf("x"), getf("y")) {
                    (Some(x), Some(y)) => (x, y),
                    _ => return ToolResult::error("x and y are required for clicks"),
                };
                let counts: i64 = match action.as_str() {
                    "double_click" => 2,
                    "triple_click" => 3,
                    _ => 1,
                };
                let button = || match action.as_str() {
                    "right_click" => MouseButton::Right,
                    "middle_click" => MouseButton::Middle,
                    _ => MouseButton::Left,
                };
                let _ = page.move_mouse(Point::new(x, y)).await;
                for c in 1..=counts {
                    let down = match DispatchMouseEventParams::builder()
                        .r#type(DispatchMouseEventType::MousePressed)
                        .x(x)
                        .y(y)
                        .button(button())
                        .click_count(c)
                        .buttons(1)
                        .modifiers(mods)
                        .build()
                    {
                        Ok(p) => p,
                        Err(e) => return ToolResult::error(e),
                    };
                    if let Err(e) = send(page, down).await {
                        return ToolResult::error(e);
                    }
                    let up = match DispatchMouseEventParams::builder()
                        .r#type(DispatchMouseEventType::MouseReleased)
                        .x(x)
                        .y(y)
                        .button(button())
                        .click_count(c)
                        .buttons(0)
                        .modifiers(mods)
                        .build()
                    {
                        Ok(p) => p,
                        Err(e) => return ToolResult::error(e),
                    };
                    if let Err(e) = send(page, up).await {
                        return ToolResult::error(e);
                    }
                }
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                ToolResult::json(&serde_json::json!({"success": true, "action": action, "x": x, "y": y}))
            }
            "move" => {
                let (x, y) = match (getf("x"), getf("y")) {
                    (Some(x), Some(y)) => (x, y),
                    _ => return ToolResult::error("x and y are required for move"),
                };
                match page.move_mouse(Point::new(x, y)).await {
                    Ok(_) => ToolResult::json(&serde_json::json!({"success": true, "action": "move", "x": x, "y": y})),
                    Err(e) => ToolResult::error(format!("move failed: {}", e)),
                }
            }
            "scroll" => {
                let x = getf("x").unwrap_or(0.0);
                let y = getf("y").unwrap_or(0.0);
                let dx = getf("scroll_x").unwrap_or(0.0);
                let dy = getf("scroll_y").unwrap_or(0.0);
                let wheel = match DispatchMouseEventParams::builder()
                    .r#type(DispatchMouseEventType::MouseWheel)
                    .x(x)
                    .y(y)
                    .delta_x(dx)
                    .delta_y(dy)
                    .modifiers(mods)
                    .build()
                {
                    Ok(p) => p,
                    Err(e) => return ToolResult::error(e),
                };
                match send(page, wheel).await {
                    Ok(_) => ToolResult::json(&serde_json::json!({"success": true, "action": "scroll", "scroll_x": dx, "scroll_y": dy})),
                    Err(e) => ToolResult::error(e),
                }
            }
            "left_click_drag" => {
                let (sx, sy) = match (getf("start_x"), getf("start_y")) {
                    (Some(a), Some(b)) => (a, b),
                    _ => return ToolResult::error("start_x and start_y are required for left_click_drag"),
                };
                let (x, y) = match (getf("x"), getf("y")) {
                    (Some(a), Some(b)) => (a, b),
                    _ => return ToolResult::error("x and y (drag end) are required for left_click_drag"),
                };
                let _ = page.move_mouse(Point::new(sx, sy)).await;
                let steps = [
                    (DispatchMouseEventType::MousePressed, sx, sy, 1i64, 1i64),
                    (DispatchMouseEventType::MouseMoved, x, y, 0, 1),
                    (DispatchMouseEventType::MouseReleased, x, y, 1, 0),
                ];
                for (ty, ex, ey, cc, btns) in steps {
                    let p = match DispatchMouseEventParams::builder()
                        .r#type(ty)
                        .x(ex)
                        .y(ey)
                        .button(MouseButton::Left)
                        .click_count(cc)
                        .buttons(btns)
                        .modifiers(mods)
                        .build()
                    {
                        Ok(p) => p,
                        Err(e) => return ToolResult::error(e),
                    };
                    if let Err(e) = send(page, p).await {
                        return ToolResult::error(e);
                    }
                }
                ToolResult::json(&serde_json::json!({"success": true, "action": "left_click_drag", "from": [sx, sy], "to": [x, y]}))
            }
            "type" => {
                let text = match param_str(&args, "text") {
                    Some(t) => t,
                    None => return ToolResult::error("text is required for type"),
                };
                let p = match InsertTextParams::builder().text(text).build() {
                    Ok(p) => p,
                    Err(e) => return ToolResult::error(e),
                };
                match page.execute(p).await {
                    Ok(_) => ToolResult::json(&serde_json::json!({"success": true, "action": "type"})),
                    Err(e) => ToolResult::error(format!("type failed: {}", e)),
                }
            }
            "key" => {
                let key = match param_str(&args, "text") {
                    Some(k) => k,
                    None => return ToolResult::error("text (the key name) is required for key"),
                };
                let vk = vk_code(&key);
                for ty in [DispatchKeyEventType::KeyDown, DispatchKeyEventType::KeyUp] {
                    let mut b = DispatchKeyEventParams::builder()
                        .r#type(ty)
                        .key(key.clone())
                        .modifiers(mods);
                    if let Some(code) = vk {
                        b = b.windows_virtual_key_code(code);
                    }
                    let p = match b.build() {
                        Ok(p) => p,
                        Err(e) => return ToolResult::error(e),
                    };
                    if let Err(e) = page
                        .execute(p)
                        .await
                        .map_err(|e| format!("key failed: {}", e))
                    {
                        return ToolResult::error(e);
                    }
                }
                ToolResult::json(&serde_json::json!({"success": true, "action": "key", "key": key}))
            }
            other => ToolResult::error(format!("unknown computer action: {}", other)),
        }
    }

    async fn handle_resize(&self, args: Value) -> ToolResult {
        let width = param_u64_or(&args, "width", 0);
        let height = param_u64_or(&args, "height", 0);
        if width == 0 || height == 0 {
            return ToolResult::error("width and height are required");
        }
        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };
        let instance = guard.as_ref().unwrap();
        match SetDeviceMetricsOverrideParams::builder()
            .width(width as i64)
            .height(height as i64)
            .device_scale_factor(1.0)
            .mobile(false)
            .build()
        {
            Ok(metrics) => match instance.page.execute(metrics).await {
                Ok(_) => ToolResult::json(&serde_json::json!({"success": true, "width": width, "height": height})),
                Err(e) => ToolResult::error(format!("Resize failed: {}", e)),
            },
            Err(e) => ToolResult::error(format!("Failed to build resize params: {}", e)),
        }
    }

    async fn handle_batch(&self, args: Value) -> ToolResult {
        let actions = match args.get("actions").and_then(|v| v.as_array()) {
            Some(a) => a.clone(),
            None => return ToolResult::error("actions (array) is required"),
        };
        let mut ran = Vec::new();
        for (i, item) in actions.iter().enumerate() {
            let name = match item.get("name").and_then(|v| v.as_str()) {
                Some(n) => n.to_string(),
                None => return ToolResult::error(format!("actions[{}] is missing 'name'", i)),
            };
            if name == "browser_batch" {
                return ToolResult::error("browser_batch cannot be nested");
            }
            let sub_args = item
                .get("arguments")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            // Box::pin breaks the call_tool -> handle_batch async recursion cycle.
            match Box::pin(self.call_tool(&name, sub_args)).await {
                Some(r) if r.isError == Some(true) => {
                    return ToolResult::json(&serde_json::json!({
                        "success": false, "stopped_at": i, "name": name, "ran": ran,
                    }));
                }
                Some(_) => ran.push(serde_json::json!({"index": i, "name": name})),
                None => return ToolResult::error(format!("unknown tool in batch: {}", name)),
            }
        }
        ToolResult::json(&serde_json::json!({"success": true, "count": ran.len(), "ran": ran}))
    }

    async fn handle_zoom(&self, args: Value) -> ToolResult {
        let getf = |k: &str| args.get(k).and_then(|v| v.as_f64());
        let (x, y, w, h) = match (getf("x"), getf("y"), getf("width"), getf("height")) {
            (Some(x), Some(y), Some(w), Some(h)) => (x, y, w, h),
            _ => return ToolResult::error("zoom requires x, y, width, height"),
        };
        let output_path = param_str(&args, "output_path");
        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };
        let instance = guard.as_ref().unwrap();
        let clip = match Viewport::builder().x(x).y(y).width(w).height(h).scale(1.0).build() {
            Ok(v) => v,
            Err(e) => return ToolResult::error(format!("bad clip region: {}", e)),
        };
        let params = chromiumoxide::page::ScreenshotParams::builder().clip(clip).build();
        match instance.page.screenshot(params).await {
            Ok(data) => {
                if let Some(path) = &output_path {
                    match std::fs::write(path, &data) {
                        Ok(_) => ToolResult::json(&serde_json::json!({"success": true, "path": path})),
                        Err(e) => ToolResult::error(format!("Failed to save zoom: {}", e)),
                    }
                } else {
                    let encoded = base64::Engine::encode(
                        &base64::engine::general_purpose::STANDARD,
                        &data,
                    );
                    ToolResult::with_content(vec![ContentItem::image(encoded, "image/png")])
                }
            }
            Err(e) => ToolResult::error(format!("Zoom failed: {}", e)),
        }
    }

    async fn handle_form_input(&self, args: Value) -> ToolResult {
        let selector = match param_str(&args, "selector") {
            Some(s) => s,
            None => return ToolResult::error("selector is required"),
        };
        let value = args.get("value").cloned().unwrap_or(Value::Null);
        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };
        let instance = guard.as_ref().unwrap();
        let js = format!(
            r#"(() => {{
                const el = document.querySelector({sel});
                if (!el) return 'not-found';
                const v = {val};
                if (el.type === 'checkbox' || el.type === 'radio') {{ el.checked = !!v; }}
                else {{ el.value = v; }}
                el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                return 'ok';
            }})()"#,
            sel = serde_json::to_string(&selector).unwrap_or_else(|_| "\"\"".into()),
            val = serde_json::to_string(&value).unwrap_or_else(|_| "null".into()),
        );
        match instance.page.evaluate(js.as_str()).await {
            Ok(_) => ToolResult::json(&serde_json::json!({"success": true, "selector": selector})),
            Err(e) => ToolResult::error(format!("form_input failed: {}", e)),
        }
    }

    async fn handle_file_upload(&self, args: Value) -> ToolResult {
        let selector = match param_str(&args, "selector") {
            Some(s) => s,
            None => return ToolResult::error("selector is required"),
        };
        let paths: Vec<String> = match args.get("paths").and_then(|v| v.as_array()) {
            Some(a) => a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect(),
            None => return ToolResult::error("paths (array) is required"),
        };
        if paths.is_empty() {
            return ToolResult::error("paths must be a non-empty array");
        }
        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };
        let instance = guard.as_ref().unwrap();
        let element = match instance.page.find_element(&selector).await {
            Ok(e) => e,
            Err(e) => return ToolResult::error(format!("file input not found '{}': {}", selector, e)),
        };
        let mut builder = SetFileInputFilesParams::builder().node_id(element.node_id.clone());
        for p in &paths {
            builder = builder.file(p.clone());
        }
        let params = match builder.build() {
            Ok(p) => p,
            Err(e) => return ToolResult::error(format!("setFileInputFiles build: {}", e)),
        };
        match instance.page.execute(params).await {
            Ok(_) => ToolResult::json(&serde_json::json!({"success": true, "selector": selector, "count": paths.len()})),
            Err(e) => ToolResult::error(format!("file_upload failed: {}", e)),
        }
    }

    async fn handle_find(&self, args: Value) -> ToolResult {
        let query = match param_str(&args, "query") {
            Some(q) => q.to_lowercase(),
            None => return ToolResult::error("query is required"),
        };
        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };
        let instance = guard.as_ref().unwrap();
        let js = format!(
            r#"(() => {{
                const q = {q};
                const out = [];
                const els = document.querySelectorAll('a,button,input,select,textarea,[role],[onclick],[tabindex]');
                for (const el of els) {{
                    const r = el.getBoundingClientRect();
                    if (r.width === 0 || r.height === 0) continue;
                    const name = (el.getAttribute('aria-label') || el.textContent || el.value || el.placeholder || el.getAttribute('title') || '').trim();
                    const hay = (name + ' ' + (el.getAttribute('name') || '') + ' ' + (el.id || '')).toLowerCase();
                    if (q && !hay.includes(q)) continue;
                    out.push({{ role: el.getAttribute('role') || el.tagName.toLowerCase(), name: name.slice(0, 80), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }});
                    if (out.length >= 20) break;
                }}
                return JSON.stringify(out);
            }})()"#,
            q = serde_json::to_string(&query).unwrap_or_else(|_| "\"\"".into()),
        );
        match instance.page.evaluate(js.as_str()).await {
            Ok(result) => {
                let raw = result
                    .value()
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "[]".to_string());
                let parsed: Value = serde_json::from_str(&raw).unwrap_or_else(|_| Value::Array(vec![]));
                ToolResult::json(&serde_json::json!({"success": true, "matches": parsed}))
            }
            Err(e) => ToolResult::error(format!("find failed: {}", e)),
        }
    }

    async fn handle_tab_new(&self, args: Value) -> ToolResult {
        let url = param_str(&args, "url").unwrap_or_else(|| "about:blank".to_string());
        let mut guard = self.browser.lock().await;
        let instance = match guard.as_mut() {
            Some(i) => i,
            None => return ToolResult::error("No active browser. Call launch_browser first."),
        };
        match instance.browser.new_page(CreateTargetParams::new(url.clone())).await {
            Ok(page) => {
                // Capture this tab's console/network into the shared buffers too, so
                // read_console/read_network see tabs opened via tab_new (not just the launch tab).
                attach_capture(&page, instance.console.clone(), instance.network.clone()).await;
                instance.page = page;
                ToolResult::json(&serde_json::json!({"success": true, "url": url}))
            }
            Err(e) => ToolResult::error(format!("tab_new failed: {}", e)),
        }
    }

    async fn handle_tab_list(&self) -> ToolResult {
        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };
        let instance = guard.as_ref().unwrap();
        let active = instance.page.target_id().clone();
        match instance.browser.pages().await {
            Ok(pages) => {
                let mut tabs = Vec::new();
                for (i, p) in pages.iter().enumerate() {
                    let url = p.url().await.ok().flatten().unwrap_or_default();
                    tabs.push(serde_json::json!({"index": i, "url": url, "active": p.target_id() == &active}));
                }
                ToolResult::json(&serde_json::json!({"success": true, "tabs": tabs}))
            }
            Err(e) => ToolResult::error(format!("tab_list failed: {}", e)),
        }
    }

    async fn handle_tab_select(&self, args: Value) -> ToolResult {
        let index = args.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let mut guard = self.browser.lock().await;
        let instance = match guard.as_mut() {
            Some(i) => i,
            None => return ToolResult::error("No active browser."),
        };
        let pages = match instance.browser.pages().await {
            Ok(p) => p,
            Err(e) => return ToolResult::error(format!("tab_select failed: {}", e)),
        };
        match pages.get(index) {
            Some(p) => {
                instance.page = p.clone();
                ToolResult::json(&serde_json::json!({"success": true, "index": index}))
            }
            None => ToolResult::error(format!("no tab at index {}", index)),
        }
    }

    async fn handle_tab_close(&self, args: Value) -> ToolResult {
        let index = args.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let mut guard = self.browser.lock().await;
        let instance = match guard.as_mut() {
            Some(i) => i,
            None => return ToolResult::error("No active browser."),
        };
        let pages = match instance.browser.pages().await {
            Ok(p) => p,
            Err(e) => return ToolResult::error(format!("tab_close failed: {}", e)),
        };
        let target = match pages.get(index) {
            Some(p) => p.clone(),
            None => return ToolResult::error(format!("no tab at index {}", index)),
        };
        let was_active = target.target_id() == instance.page.target_id();
        if let Err(e) = target.close().await {
            return ToolResult::error(format!("tab_close failed: {}", e));
        }
        if was_active {
            if let Ok(remaining) = instance.browser.pages().await {
                if let Some(p) = remaining.first() {
                    instance.page = p.clone();
                }
            }
        }
        ToolResult::json(&serde_json::json!({"success": true, "closed": index}))
    }

    async fn handle_launch(&self, args: Value) -> ToolResult {
        // Close existing browser if any
        self.close_browser_inner().await;

        let headless = param_bool_or(&args, "headless", true);
        let start_url = param_str(&args, "start_url");
        let width = param_u64_or(&args, "width", 1280) as u32;
        let height = param_u64_or(&args, "height", 720) as u32;

        let mut config_builder = chromiumoxide::BrowserConfig::builder()
            .window_size(width, height);
        if !headless {
            config_builder = config_builder.with_head();
        }
        let config = match config_builder.build() {
            Ok(c) => c,
            Err(e) => return ToolResult::error(format!("Failed to build browser config: {}", e)),
        };

        match chromiumoxide::Browser::launch(config).await {
            Ok((mut browser, mut handler)) => {
                // Spawn the handler in the background
                tokio::spawn(async move {
                    loop {
                        match handler.next().await {
                            Some(_event) => {}
                            None => break,
                        }
                    }
                });

                // Create a new page
                let page = match browser.new_page("about:blank").await {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = browser.close().await;
                        return ToolResult::error(format!("Failed to create page: {}", e));
                    }
                };

                // Capture console + network BEFORE navigating, so the start
                // page's logs/requests are recorded.
                let console = Arc::new(Mutex::new(Vec::<String>::new()));
                let network = Arc::new(Mutex::new(Vec::<String>::new()));
                attach_capture(&page, console.clone(), network.clone()).await;

                // Navigate to start URL if provided
                if let Some(url) = &start_url {
                    if let Err(e) = page.goto(url).await {
                        warn!("Failed to navigate to start URL: {}", e);
                    }
                }

                let mut guard = self.browser.lock().await;
                *guard = Some(BrowserInstance {
                    browser,
                    page,
                    console,
                    network,
                });

                ToolResult::json(&serde_json::json!({
                    "success": true,
                    "headless": headless,
                    "start_url": start_url,
                }))
            }
            Err(e) => ToolResult::error(format!("Failed to launch browser: {}", e)),
        }
    }

    async fn handle_navigate(&self, args: Value) -> ToolResult {
        let url = match param_str(&args, "url") {
            Some(u) => u,
            None => return ToolResult::error("url is required"),
        };

        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };

        let instance = guard.as_ref().unwrap();
        // Parity with the reference navigate: "back"/"forward" do history navigation.
        let lower = url.to_lowercase();
        if lower == "back" || lower == "forward" {
            let js = if lower == "back" {
                "window.history.back()"
            } else {
                "window.history.forward()"
            };
            return match instance.page.evaluate(js).await {
                Ok(_) => {
                    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                    ToolResult::json(&serde_json::json!({"success": true, "navigated": lower}))
                }
                Err(e) => ToolResult::error(format!("History navigation failed: {}", e)),
            };
        }
        match instance.page.goto(&url).await {
            Ok(_) => {
                // Wait a moment for the page to render
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                ToolResult::json(&serde_json::json!({
                    "success": true,
                    "url": url,
                }))
            }
            Err(e) => ToolResult::error(format!("Navigation failed: {}", e)),
        }
    }

    async fn handle_screenshot(&self, args: Value) -> ToolResult {
        let output_path = param_str(&args, "output_path");

        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };

        let instance = guard.as_ref().unwrap();
        match instance.page.screenshot(chromiumoxide::page::ScreenshotParams::builder().build()).await {
            Ok(data) => {
                if let Some(path) = &output_path {
                    match std::fs::write(path, &data) {
                        Ok(_) => ToolResult::json(&serde_json::json!({
                            "success": true,
                            "path": path,
                        })),
                        Err(e) => ToolResult::error(format!("Failed to save screenshot: {}", e)),
                    }
                } else {
                    let encoded = base64::Engine::encode(
                        &base64::engine::general_purpose::STANDARD,
                        &data,
                    );
                    ToolResult::with_content(vec![ContentItem::image(encoded, "image/png")])
                }
            }
            Err(e) => ToolResult::error(format!("Screenshot failed: {}", e)),
        }
    }

    async fn handle_click(&self, args: Value) -> ToolResult {
        let selector = match param_str(&args, "selector") {
            Some(s) => s,
            None => return ToolResult::error("selector is required"),
        };

        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };

        let instance = guard.as_ref().unwrap();

        // Find the element and click it
        match instance.page.find_element(&selector).await {
            Ok(element) => match element.click().await {
                Ok(_) => {
                    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
                    ToolResult::json(&serde_json::json!({
                        "success": true,
                        "selector": selector,
                    }))
                }
                Err(e) => ToolResult::error(format!("Click failed: {}", e)),
            },
            Err(e) => ToolResult::error(format!("Element not found with selector '{}': {}", selector, e)),
        }
    }

    async fn handle_type_text(&self, args: Value) -> ToolResult {
        let selector = match param_str(&args, "selector") {
            Some(s) => s,
            None => return ToolResult::error("selector is required"),
        };
        let text = match param_str(&args, "text") {
            Some(t) => t,
            None => return ToolResult::error("text is required"),
        };
        let clear_first = param_bool_or(&args, "clear_first", true);

        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };

        let instance = guard.as_ref().unwrap();

        match instance.page.find_element(&selector).await {
            Ok(element) => {
                if clear_first {
                    // Clear the field first by clicking to focus
                    let _ = element.click().await;
                }

                match element.click().await {
                    Ok(_) => {
                        // Type the text using JavaScript for reliability
                        let js = format!(
                            r#"
                            (() => {{
                                const el = document.querySelector({:?});
                                if (el) {{
                                    el.value = {:?};
                                    el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                                    el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                                    return true;
                                }}
                                return false;
                            }})()
                            "#,
                            selector, text
                        );

                        match instance.page.evaluate(js.as_str()).await {
                            Ok(_) => ToolResult::json(&serde_json::json!({
                                "success": true,
                                "selector": selector,
                            })),
                            Err(e) => ToolResult::error(format!("Type text failed: {}", e)),
                        }
                    }
                    Err(e) => ToolResult::error(format!("Failed to focus element: {}", e)),
                }
            }
            Err(e) => ToolResult::error(format!("Element not found with selector '{}': {}", selector, e)),
        }
    }

    async fn handle_get_text(&self, args: Value) -> ToolResult {
        let selector = match param_str(&args, "selector") {
            Some(s) => s,
            None => return ToolResult::error("selector is required"),
        };

        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };

        let instance = guard.as_ref().unwrap();

        let js = format!(
            r#"
            (() => {{
                const el = document.querySelector({:?});
                return el ? el.textContent || el.innerText || '' : '';
            }})()
            "#,
            selector
        );

        match instance.page.evaluate(js.as_str()).await {
            Ok(result) => {
                // The result should be a string
                let text = result
                    .value()
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_default();

                ToolResult::success(text)
            }
            Err(e) => ToolResult::error(format!("Failed to get text: {}", e)),
        }
    }

    async fn handle_get_page_text(&self) -> ToolResult {
        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };

        let instance = guard.as_ref().unwrap();

        let js = r#"
            (() => {
                const body = document.body;
                if (!body) return '';
                return body.innerText || '';
            })()
        "#;

        // Use Runtime.evaluate (page.evaluate) — the JS is an expression/IIFE,
        // not a bare function declaration, so evaluate_function rejects it with
        // "Given expression does not evaluate to a function".
        match instance.page.evaluate(js).await {
            Ok(result) => {
                let text = result
                    .value()
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_default();
                ToolResult::success(text)
            }
            Err(e) => ToolResult::error(format!("Failed to get page text: {}", e)),
        }
    }

    async fn handle_execute_script(&self, args: Value) -> ToolResult {
        let script = match param_str(&args, "script") {
            Some(s) => s,
            None => return ToolResult::error("script is required"),
        };

        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };

        let instance = guard.as_ref().unwrap();

        match instance.page.evaluate(script.as_str()).await {
            Ok(result) => {
                let value = result
                    .value()
                    .map(|v| v.to_string())
                    .unwrap_or_else(|| "null".to_string());
                ToolResult::json(&serde_json::json!({
                    "success": true,
                    "result": value,
                }))
            }
            Err(e) => ToolResult::error(format!("Script execution failed: {}", e)),
        }
    }

    async fn handle_read_console(&self, args: Value) -> ToolResult {
        let pattern = param_str(&args, "pattern");
        let only_errors = param_bool_or(&args, "onlyErrors", false);
        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };
        let instance = guard.as_ref().unwrap();
        let msgs = instance.console.lock().await;
        let filtered: Vec<&String> = msgs
            .iter()
            .filter(|m| !only_errors || m.starts_with("[error") || m.starts_with("[assert") || m.to_lowercase().contains("exception"))
            .filter(|m| pattern.as_ref().map(|p| m.contains(p)).unwrap_or(true))
            .collect();
        ToolResult::json(&serde_json::json!({
            "success": true,
            "count": filtered.len(),
            "messages": filtered,
        }))
    }

    async fn handle_read_network(&self, args: Value) -> ToolResult {
        let pattern = param_str(&args, "pattern");
        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };
        let instance = guard.as_ref().unwrap();
        let reqs = instance.network.lock().await;
        let filtered: Vec<&String> = reqs
            .iter()
            .filter(|m| pattern.as_ref().map(|p| m.contains(p)).unwrap_or(true))
            .collect();
        ToolResult::json(&serde_json::json!({
            "success": true,
            "count": filtered.len(),
            "requests": filtered,
        }))
    }

    async fn handle_read_a11y(&self) -> ToolResult {
        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };
        let instance = guard.as_ref().unwrap();
        // Semantic accessibility snapshot via the page: role + accessible name +
        // click coordinates for visible interactive/landmark elements. Gives the
        // agent a non-pixel, role-based view of the page (like an a11y tree).
        let js = r#"
            (() => {
                const roleOf = (el) => {
                    const r = el.getAttribute('role'); if (r) return r;
                    const t = el.tagName.toLowerCase();
                    const m = {a:'link',button:'button',input:(el.type||'textbox'),select:'combobox',
                               textarea:'textbox',h1:'heading',h2:'heading',h3:'heading',
                               nav:'navigation',main:'main',img:'img',label:'label'};
                    return m[t] || (el.hasAttribute('onclick') ? 'button' : null);
                };
                const nameOf = (el) => (el.getAttribute('aria-label') || el.getAttribute('placeholder')
                    || el.getAttribute('alt') || (el.innerText||'').trim().slice(0,80) || el.value || '').trim();
                const out = [];
                document.querySelectorAll('a,button,input,select,textarea,[role],h1,h2,h3,nav,main,label,[onclick]')
                  .forEach(el => {
                    const role = roleOf(el); if (!role) return;
                    const rc = el.getBoundingClientRect();
                    if (rc.width === 0 && rc.height === 0) return;
                    out.push({role, name: nameOf(el),
                              x: Math.round(rc.left + rc.width/2), y: Math.round(rc.top + rc.height/2)});
                  });
                return JSON.stringify(out.slice(0, 200));
            })()
        "#;
        match instance.page.evaluate(js).await {
            Ok(result) => {
                // The page returns the snapshot as a JSON string; decode it so
                // `elements` is a real array, not a JSON-encoded string.
                let tree_str = result.value().and_then(|v| v.as_str()).unwrap_or("[]");
                let elements: Value =
                    serde_json::from_str(tree_str).unwrap_or_else(|_| Value::Array(Vec::new()));
                ToolResult::json(&serde_json::json!({ "success": true, "elements": elements }))
            }
            Err(e) => ToolResult::error(format!("Failed to read a11y tree: {}", e)),
        }
    }

    async fn handle_close(&self) -> ToolResult {
        self.close_browser_inner().await;
        ToolResult::json(&serde_json::json!({
            "success": true,
        }))
    }
}
