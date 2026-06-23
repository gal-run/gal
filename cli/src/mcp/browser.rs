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
use chromiumoxide::cdp::js_protocol::runtime::EventConsoleApiCalled;
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

fn tools_list() -> Vec<Tool> {
    vec![
        Tool {
            name: "browser_launch".to_string(),
            description: "Launch a headless Chrome instance for browser automation.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"headless":{"type":"boolean","description":"Run in headless mode (default: true)"},"start_url":{"type":"string","description":"Optional page to open after launch"},"width":{"type":"number","description":"Window width (default: 1280)"},"height":{"type":"number","description":"Window height (default: 720)"}},"required":[]}"#).ok(),
        },
        Tool {
            name: "browser_navigate".to_string(),
            description: "Navigate the browser to a URL.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"url":{"type":"string","description":"URL to navigate to"}},"required":["url"]}"#).ok(),
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
            description: "Read console messages (log/error/warn) captured since launch. Optional 'pattern' substring filter.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"pattern":{"type":"string","description":"Only return messages containing this substring"}},"required":[]}"#).ok(),
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
            "browser_close" => Some(self.handle_close().await),
            _ => None,
        }
    }
}

// =============================================================================
// Tool Handlers
// =============================================================================

impl BrowserMcpServer {
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

                if let Ok(mut events) = page.event_listener::<EventConsoleApiCalled>().await {
                    let buf = console.clone();
                    tokio::spawn(async move {
                        while let Some(ev) = events.next().await {
                            let line = ev
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
                            let mut b = buf.lock().await;
                            if b.len() < 1000 {
                                b.push(line);
                            }
                        }
                    });
                }

                let _ = page.execute(NetworkEnableParams::default()).await;
                if let Ok(mut events) = page.event_listener::<EventRequestWillBeSent>().await {
                    let buf = network.clone();
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
        let guard = match self.get_browser().await {
            Ok(g) => g,
            Err(e) => return ToolResult::error(e),
        };
        let instance = guard.as_ref().unwrap();
        let msgs = instance.console.lock().await;
        let filtered: Vec<&String> = msgs
            .iter()
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
                let tree = result.value().and_then(|v| v.as_str()).unwrap_or("[]").to_string();
                ToolResult::json(&serde_json::json!({ "success": true, "elements": tree }))
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
