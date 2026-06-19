//! MCP (Model Context Protocol) servers for the GAL CLI.
//!
//! Each MCP server is a separate subprocess that communicates via JSON-RPC 2.0
//! over stdin/stdout. AI coding agents (Claude Code, Cursor, etc.) connect to
//! these servers to access terminal, vision, and browser automation capabilities.
//!
//! Protocol: JSON-RPC 2.0
//! Transport: stdin/stdout (logging goes to stderr)
//! Methods: `tools/list`, `tools/call`

pub mod terminal;
pub mod vision;
pub mod browser;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt::Debug;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tracing::{error, info, warn};

// =============================================================================
// JSON-RPC 2.0 Types
// =============================================================================

/// A JSON-RPC 2.0 request.
#[derive(Debug, Deserialize)]
pub struct JsonRpcRequest {
    pub jsonrpc: String,
    pub id: Value,
    pub method: String,
    #[serde(default)]
    pub params: Option<Value>,
}

/// A JSON-RPC 2.0 successful response.
#[derive(Debug, Serialize)]
pub struct JsonRpcResponse {
    pub jsonrpc: String,
    pub id: Value,
    pub result: Value,
}

/// A JSON-RPC 2.0 error response.
#[derive(Debug, Serialize)]
pub struct JsonRpcErrorResponse {
    pub jsonrpc: String,
    pub id: Value,
    pub error: JsonRpcError,
}

/// JSON-RPC 2.0 error object.
#[derive(Debug, Serialize)]
pub struct JsonRpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

impl JsonRpcError {
    pub fn new(code: i32, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }

    pub fn with_data(code: i32, message: impl Into<String>, data: Value) -> Self {
        Self {
            code,
            message: message.into(),
            data: Some(data),
        }
    }
}

// JSON-RPC error codes
pub const METHOD_NOT_FOUND: i32 = -32601;
pub const INVALID_PARAMS: i32 = -32602;
pub const INTERNAL_ERROR: i32 = -32603;
pub const PARSE_ERROR: i32 = -32700;

// =============================================================================
// MCP Protocol Types
// =============================================================================

/// Schema for a tool parameter - a single property.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolParameter {
    #[serde(rename = "type")]
    pub param_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub items: Option<Box<ToolParameter>>,
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, Value>,
}

/// A tool definition for MCP `tools/list` response.
#[derive(Debug, Clone, Serialize)]
pub struct Tool {
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[allow(non_snake_case)]
    pub inputSchema: Option<Value>,
}

/// Content item in a tool call response.
#[derive(Debug, Serialize)]
pub struct ContentItem {
    #[serde(rename = "type")]
    pub content_type: String,
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[allow(non_snake_case)]
    pub mimeType: Option<String>,
}

impl ContentItem {
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            content_type: "text".to_string(),
            text: Some(text.into()),
            data: None,
            mimeType: None,
        }
    }

    pub fn image(data: impl Into<String>, mime_type: impl Into<String>) -> Self {
        Self {
            content_type: "image".to_string(),
            text: None,
            data: Some(data.into()),
            mimeType: Some(mime_type.into()),
        }
    }
}

/// Result content for a successful tool call.
#[derive(Debug, Serialize)]
pub struct ToolResult {
    pub content: Vec<ContentItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[allow(non_snake_case)]
    pub isError: Option<bool>,
}

impl ToolResult {
    pub fn success(text: impl Into<String>) -> Self {
        Self {
            content: vec![ContentItem::text(text)],
            isError: None,
        }
    }

    pub fn json(value: &impl Serialize) -> Self {
        Self::success(serde_json::to_string(value).unwrap_or_else(|_| "{}".to_string()))
    }

    pub fn error(text: impl Into<String>) -> Self {
        Self {
            content: vec![ContentItem::text(text)],
            isError: Some(true),
        }
    }

    pub fn image(data: impl Into<String>, mime_type: impl Into<String>) -> Self {
        Self {
            content: vec![ContentItem::image(data, mime_type)],
            isError: None,
        }
    }

    pub fn with_content(content: Vec<ContentItem>) -> Self {
        Self {
            content,
            isError: None,
        }
    }
}

// =============================================================================
// MCP Server Trait
// =============================================================================

/// An MCP server that can handle JSON-RPC requests.
#[async_trait::async_trait]
pub trait McpServer: Send + 'static {
    /// Return the list of tools this server provides.
    fn list_tools(&self) -> Vec<Tool>;

    /// Handle a tool call. Return `None` if the tool is not found.
    async fn call_tool(&self, name: &str, args: Value) -> Option<ToolResult>;
}

// =============================================================================
// Stdio Transport
// =============================================================================

/// Run an MCP server over stdin/stdout using JSON-RPC 2.0.
///
/// Reads JSON-RPC requests from stdin, dispatches them to the server,
/// and writes JSON-RPC responses to stdout. All server logs go to stderr.
pub async fn run_stdio_server(server: impl McpServer) {
    let stdin = tokio::io::stdin();
    let reader = BufReader::new(stdin);
    let mut lines = reader.lines();
    let mut stdout = tokio::io::stdout();

    info!("MCP server starting on stdio");

    while let Ok(Some(line)) = lines.next_line().await {
        if line.trim().is_empty() {
            continue;
        }

        let request: JsonRpcRequest = match serde_json::from_str(&line) {
            Ok(req) => req,
            Err(e) => {
                let error_resp = JsonRpcErrorResponse {
                    jsonrpc: "2.0".to_string(),
                    id: Value::Null,
                    error: JsonRpcError::new(PARSE_ERROR, format!("Parse error: {}", e)),
                };
                let resp_line =
                    serde_json::to_string(&error_resp).unwrap_or_else(|_| "{}".to_string());
                let _ = stdout.write_all(resp_line.as_bytes()).await;
                let _ = stdout.write_all(b"\n").await;
                let _ = stdout.flush().await;
                continue;
            }
        };

        let response = handle_request(&server, &request).await;

        let resp_line = serde_json::to_string(&response).unwrap_or_else(|_| "{}".to_string());
        if let Err(e) = stdout.write_all(resp_line.as_bytes()).await {
            error!("Failed to write response: {}", e);
            break;
        }
        if let Err(e) = stdout.write_all(b"\n").await {
            error!("Failed to write newline: {}", e);
            break;
        }
        if let Err(e) = stdout.flush().await {
            error!("Failed to flush stdout: {}", e);
            break;
        }
    }

    info!("MCP server shutting down");
}

async fn handle_request(server: &impl McpServer, request: &JsonRpcRequest) -> Value {
    let id = &request.id;

    match request.method.as_str() {
        "initialize" => {
            let protocol_version = request
                .params
                .as_ref()
                .and_then(|p| p.get("protocolVersion"))
                .and_then(|v| v.as_str())
                .unwrap_or("2024-11-05");
            let result = serde_json::json!({
                "protocolVersion": protocol_version,
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "gal",
                    "version": env!("CARGO_PKG_VERSION"),
                }
            });
            serde_json::to_value(JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: id.clone(),
                result,
            })
            .unwrap_or_default()
        }
        "tools/list" => {
            let tools = server.list_tools();
            let result = serde_json::json!({
                "tools": tools,
            });
            serde_json::to_value(JsonRpcResponse {
                jsonrpc: "2.0".to_string(),
                id: id.clone(),
                result,
            })
            .unwrap_or_default()
        }
        "tools/call" => {
            let params = request.params.as_ref().and_then(|p| p.as_object()).cloned();
            let tool_name = params
                .as_ref()
                .and_then(|p| p.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let arguments = params
                .as_ref()
                .and_then(|p| p.get("arguments"))
                .cloned()
                .unwrap_or(serde_json::Value::Object(Default::default()));

            if tool_name.is_empty() {
                let error = JsonRpcErrorResponse {
                    jsonrpc: "2.0".to_string(),
                    id: id.clone(),
                    error: JsonRpcError::new(INVALID_PARAMS, "Missing tool name"),
                };
                return serde_json::to_value(error).unwrap_or_default();
            }

            match server.call_tool(tool_name, arguments).await {
                Some(result) => {
                    let json_result = serde_json::to_value(&result).unwrap_or_default();
                    serde_json::to_value(JsonRpcResponse {
                        jsonrpc: "2.0".to_string(),
                        id: id.clone(),
                        result: json_result,
                    })
                    .unwrap_or_default()
                }
                None => {
                    let error = JsonRpcErrorResponse {
                        jsonrpc: "2.0".to_string(),
                        id: id.clone(),
                        error: JsonRpcError::new(
                            METHOD_NOT_FOUND,
                            format!("Unknown tool: {}", tool_name),
                        ),
                    };
                    serde_json::to_value(error).unwrap_or_default()
                }
            }
        }
        _ => {
            warn!("Unknown method: {}", request.method);
            let error = JsonRpcErrorResponse {
                jsonrpc: "2.0".to_string(),
                id: id.clone(),
                error: JsonRpcError::new(
                    METHOD_NOT_FOUND,
                    format!("Method not found: {}", request.method),
                ),
            };
            serde_json::to_value(error).unwrap_or_default()
        }
    }
}

// =============================================================================
// Helper functions
// =============================================================================

/// Extract a string parameter from a JSON object.
pub fn param_str(params: &Value, name: &str) -> Option<String> {
    params.get(name).and_then(|v| v.as_str()).map(|s| s.to_string())
}

/// Extract a string parameter with a default.
pub fn param_str_or(params: &Value, name: &str, default: &str) -> String {
    param_str(params, name).unwrap_or_else(|| default.to_string())
}

/// Extract a number parameter as u32.
pub fn param_u32(params: &Value, name: &str) -> Option<u32> {
    params.get(name).and_then(|v| v.as_u64()).map(|n| n as u32)
}

/// Extract a number parameter as u32 with a default.
pub fn param_u32_or(params: &Value, name: &str, default: u32) -> u32 {
    param_u32(params, name).unwrap_or(default)
}

/// Extract a number parameter as u64.
pub fn param_u64(params: &Value, name: &str) -> Option<u64> {
    params.get(name).and_then(|v| v.as_u64())
}

/// Extract a number parameter as u64 with a default.
pub fn param_u64_or(params: &Value, name: &str, default: u64) -> u64 {
    param_u64(params, name).unwrap_or(default)
}

/// Extract an array parameter as a Vec<String>.
pub fn param_array(params: &Value, name: &str) -> Vec<String> {
    params
        .get(name)
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

/// Extract a map parameter as HashMap<String, String>.
pub fn param_map(params: &Value, name: &str) -> std::collections::HashMap<String, String> {
    params
        .get(name)
        .and_then(|v| v.as_object())
        .map(|obj| {
            obj.iter()
                .map(|(k, v)| (k.clone(), v.as_str().unwrap_or("").to_string()))
                .collect()
        })
        .unwrap_or_default()
}

/// Extract a boolean parameter.
pub fn param_bool(params: &Value, name: &str) -> Option<bool> {
    params.get(name).and_then(|v| v.as_bool())
}

/// Extract a boolean parameter with a default.
pub fn param_bool_or(params: &Value, name: &str, default: bool) -> bool {
    param_bool(params, name).unwrap_or(default)
}
