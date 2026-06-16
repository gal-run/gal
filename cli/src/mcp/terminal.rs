use crate::mcp::{
    param_array, param_str, param_str_or, param_u32, param_u32_or, param_u64_or, ContentItem,
    McpServer, Tool, ToolResult,
};
use portable_pty::cmdbuilder::CommandBuilder;
use portable_pty::{Child, PtyPair, PtySize, PtySystem};
use serde_json::Value;
use std::collections::HashMap;
use std::io::Write;
use std::io::{BufRead, Read};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tracing::info;
use uuid::Uuid;

struct PtyState {
    _pair: PtyPair,
    #[allow(dead_code)]
    reader: Box<dyn Read + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send>,
    exited: Arc<AtomicBool>,
}

struct TerminalSession {
    id: String,
    command: String,
    args: Vec<String>,
    cwd: String,
    output: Arc<Mutex<String>>,
    closed: bool,
    exit_code: Option<i32>,
    pty: Option<Mutex<PtyState>>,
}

pub struct TerminalMcpServer {
    sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
    pty_system: Mutex<Box<dyn PtySystem + Send>>,
    project_path: String,
}

impl TerminalMcpServer {
    pub fn new(project_path: Option<String>) -> Self {
        let pty_system = portable_pty::native_pty_system();
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            pty_system: Mutex::new(pty_system),
            project_path: project_path.unwrap_or_else(|| {
                std::env::current_dir()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| "/".to_string())
            }),
        }
    }

    fn get_session_output(&self, session_id: &str) -> Result<String, String> {
        let sessions = self.sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| format!("Unknown terminal session: {}", session_id))?;
        let output = session.output.lock().map_err(|e| format!("Output lock error: {}", e))?;
        Ok(output.clone())
    }

    fn list_sessions_inner(&self) -> Result<Vec<Value>, String> {
        let sessions = self.sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
        Ok(sessions
            .values()
            .map(|s| {
                serde_json::json!({
                    "session_id": s.id,
                    "command": s.command,
                    "args": s.args,
                    "cwd": s.cwd,
                    "closed": s.closed,
                    "exit_code": s.exit_code,
                })
            })
            .collect())
    }

    fn destroy_session_inner(&self, session_id: &str) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| format!("Lock error: {}", e))?;
        if let Some(mut session) = sessions.remove(session_id) {
            session.closed = true;
            if let Some(ref pty_mutex) = session.pty {
                if let Ok(mut pty_state) = pty_mutex.lock() {
                    let _ = pty_state.child.kill();
                    pty_state.exited.store(true, Ordering::SeqCst);
                }
            }
        }
        Ok(())
    }

    async fn wait_for_output(
        output: &Arc<Mutex<String>>,
        target: &str,
        timeout_ms: u64,
    ) -> Result<(), String> {
        let started = std::time::Instant::now();
        loop {
            {
                let out = output.lock().map_err(|e| format!("Lock error: {}", e))?;
                if out.contains(target) {
                    return Ok(());
                }
            }
            if started.elapsed().as_millis() as u64 >= timeout_ms {
                return Err(format!("Wait for pattern timed out after {}ms", timeout_ms));
            }
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        }
    }
}

fn to_json_content(payload: Value) -> ToolResult {
    ToolResult::json(&payload)
}

fn tools_list() -> Vec<Tool> {
    vec![
        Tool {
            name: "terminal_create_session".to_string(),
            description: "Create a PTY-backed terminal session for interactive CLI automation.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"command":{"type":"string","description":"Executable to launch"},"args":{"type":"array","description":"Command arguments","items":{"type":"string"}},"cwd":{"type":"string","description":"Working directory (default: project path)"},"env":{"type":"object","description":"Extra environment variables","additionalProperties":{"type":"string"}},"cols":{"type":"number","description":"Terminal width in columns (default: 120)"},"rows":{"type":"number","description":"Terminal height in rows (default: 40)"}},"required":["command"]}"#).ok(),
        },
        Tool {
            name: "terminal_exec".to_string(),
            description: "Run a one-shot command in a PTY and wait for it to exit or time out.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"command":{"type":"string","description":"Executable to launch"},"args":{"type":"array","description":"Command arguments","items":{"type":"string"}},"cwd":{"type":"string","description":"Working directory (default: project path)"},"env":{"type":"object","description":"Extra environment variables","additionalProperties":{"type":"string"}},"timeout_ms":{"type":"number","description":"Maximum wait time before the session is killed (default: 15000)"},"cols":{"type":"number","description":"Terminal width in columns (default: 120)"},"rows":{"type":"number","description":"Terminal height in rows (default: 40)"}},"required":["command"]}"#).ok(),
        },
        Tool {
            name: "terminal_write".to_string(),
            description: "Write text into an existing terminal session.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"session_id":{"type":"string","description":"Terminal session id"},"text":{"type":"string","description":"Text to send to the PTY"}},"required":["session_id","text"]}"#).ok(),
        },
        Tool {
            name: "terminal_read".to_string(),
            description: "Read buffered output from a terminal session.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"session_id":{"type":"string","description":"Terminal session id"},"last_chars":{"type":"number","description":"Return only the final N characters instead of the full buffer"}},"required":["session_id"]}"#).ok(),
        },
        Tool {
            name: "terminal_wait_for".to_string(),
            description: "Wait until terminal output contains a substring.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"session_id":{"type":"string","description":"Terminal session id"},"text":{"type":"string","description":"Substring to wait for"},"timeout_ms":{"type":"number","description":"Maximum wait time in milliseconds (default: 10000)"}},"required":["session_id","text"]}"#).ok(),
        },
        Tool {
            name: "terminal_resize".to_string(),
            description: "Resize an existing terminal session.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"session_id":{"type":"string","description":"Terminal session id"},"cols":{"type":"number","description":"Terminal width in columns"},"rows":{"type":"number","description":"Terminal height in rows"}},"required":["session_id","cols","rows"]}"#).ok(),
        },
        Tool {
            name: "terminal_list_sessions".to_string(),
            description: "List active terminal sessions tracked by the server.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{}}"#).ok(),
        },
        Tool {
            name: "terminal_close_session".to_string(),
            description: "Close a terminal session and release the PTY.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"session_id":{"type":"string","description":"Terminal session id"}},"required":["session_id"]}"#).ok(),
        },
        Tool {
            name: "terminal_screenshot".to_string(),
            description: "Take a screenshot of the terminal or screen. Returns base64-encoded PNG image.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"window":{"type":"string","description":"Window to capture: 'screen' (default), 'window' (frontmost window), or 'selection' (interactive selection)"},"output_path":{"type":"string","description":"Optional path to save screenshot. If not provided, returns base64."}},"required":[]}"#).ok(),
        },
        Tool {
            name: "terminal_render".to_string(),
            description: "Render terminal session output as text with ANSI colors preserved.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"session_id":{"type":"string","description":"Terminal session id to render"},"cols":{"type":"number","description":"Terminal width in columns (default: 120)"},"rows":{"type":"number","description":"Terminal height in rows (default: 40)"}},"required":["session_id"]}"#).ok(),
        },
    ]
}

#[async_trait::async_trait]
impl McpServer for TerminalMcpServer {
    fn list_tools(&self) -> Vec<Tool> {
        tools_list()
    }

    async fn call_tool(&self, name: &str, args: Value) -> Option<ToolResult> {
        match name {
            "terminal_create_session" => Some(self.handle_create_session(args).await),
            "terminal_exec" => Some(self.handle_exec(args).await),
            "terminal_write" => Some(self.handle_write(args)),
            "terminal_read" => Some(self.handle_read(args)),
            "terminal_wait_for" => Some(self.handle_wait_for(args).await),
            "terminal_resize" => Some(self.handle_resize(args)),
            "terminal_list_sessions" => Some(self.handle_list_sessions()),
            "terminal_close_session" => Some(self.handle_close_session(args)),
            "terminal_screenshot" => Some(self.handle_screenshot(args).await),
            "terminal_render" => Some(self.handle_render(args)),
            _ => None,
        }
    }
}

impl TerminalMcpServer {
    async fn create_pty_session(
        &self,
        command: &str,
        command_args: &[String],
        cwd: &str,
        cols: u16,
        rows: u16,
        env: HashMap<String, String>,
    ) -> Result<TerminalSession, String> {
        let pty_system = self.pty_system.lock().map_err(|e| format!("PTY lock error: {}", e))?;
        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let mut cmd = CommandBuilder::new(command);
        for arg in command_args {
            cmd.arg(arg.as_str());
        }
        cmd.cwd(cwd);
        for (key, value) in &env {
            cmd.env(key.as_str(), value.as_str());
        }
        cmd.env("TERM", "xterm-256color");

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to get reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to get writer: {}", e))?;

        let session_id = Uuid::new_v4().to_string();
        let output = Arc::new(Mutex::new(String::new()));
        let output_clone = output.clone();
        let exited = Arc::new(AtomicBool::new(false));
        let exited_clone = exited.clone();

        std::thread::spawn(move || {
            let mut buf_reader = std::io::BufReader::new(reader);
            let mut line = String::new();
            loop {
                line.clear();
                match buf_reader.read_line(&mut line) {
                    Ok(0) => break,
                    Ok(_) => {
                        if let Ok(mut out) = output_clone.lock() {
                            out.push_str(&line);
                        }
                    }
                    Err(_) => break,
                }
            }
            exited_clone.store(true, Ordering::SeqCst);
        });

        let session = TerminalSession {
            id: session_id.clone(),
            command: command.to_string(),
            args: command_args.to_vec(),
            cwd: cwd.to_string(),
            output,
            closed: false,
            exit_code: None,
            pty: Some(Mutex::new(PtyState {
                _pair: pair,
                reader: Box::new(std::io::empty()),
                writer,
                child,
                exited,
            })),
        };

        Ok(session)
    }

    async fn handle_create_session(&self, args: Value) -> ToolResult {
        let command = match param_str(&args, "command") {
            Some(c) if !c.is_empty() => c,
            _ => return ToolResult::error("command is required"),
        };

        let command_args = param_array(&args, "args");
        let cwd = param_str_or(&args, "cwd", &self.project_path);
        let cols = param_u32_or(&args, "cols", 120) as u16;
        let rows = param_u32_or(&args, "rows", 40) as u16;
        let env = crate::mcp::param_map(&args, "env");

        match self.create_pty_session(&command, &command_args, &cwd, cols, rows, env).await {
            Ok(session) => {
                let id = session.id.clone();
                if let Ok(mut sessions) = self.sessions.lock() {
                    sessions.insert(id.clone(), session);
                }
                to_json_content(serde_json::json!({
                    "session_id": id,
                    "cwd": cwd,
                    "command": command,
                    "args": command_args,
                }))
            }
            Err(e) => {
                info!("PTY creation failed, falling back to spawn: {}", e);
                let env = crate::mcp::param_map(&args, "env");
                let mut cmd = std::process::Command::new(&command);
                cmd.args(&command_args);
                cmd.current_dir(&cwd);
                cmd.env("TERM", "xterm-256color");
                for (k, v) in env {
                    cmd.env(&k, &v);
                }

                match cmd.spawn() {
                    Ok(_child) => {
                        let session_id = Uuid::new_v4().to_string();
                        let session = TerminalSession {
                            id: session_id.clone(),
                            command: command.clone(),
                            args: command_args.clone(),
                            cwd: cwd.clone(),
                            output: Arc::new(Mutex::new(String::new())),
                            closed: false,
                            exit_code: None,
                            pty: None,
                        };

                        if let Ok(mut sessions) = self.sessions.lock() {
                            sessions.insert(session_id.clone(), session);
                        }

                        to_json_content(serde_json::json!({
                            "session_id": session_id,
                            "cwd": cwd,
                            "command": command,
                            "args": command_args,
                            "transport": "spawn",
                            "fallback_reason": e,
                        }))
                    }
                    Err(e2) => ToolResult::error(format!("Failed to spawn process: {}", e2)),
                }
            }
        }
    }

    async fn handle_exec(&self, args: Value) -> ToolResult {
        let command = match param_str(&args, "command") {
            Some(c) if !c.is_empty() => c,
            _ => return ToolResult::error("command is required"),
        };

        let command_args: Vec<String> = param_array(&args, "args");
        let cwd = param_str_or(&args, "cwd", &self.project_path);
        let timeout_ms = param_u64_or(&args, "timeout_ms", 15_000);
        let cols = param_u32_or(&args, "cols", 120) as u16;
        let rows = param_u32_or(&args, "rows", 40) as u16;
        let env = crate::mcp::param_map(&args, "env");

        match self.create_pty_session(&command, &command_args, &cwd, cols, rows, env).await {
            Ok(session) => {
                let output = session.output.clone();
                let exited = session
                    .pty
                    .as_ref()
                    .map(|p| {
                        p.lock()
                            .map(|s| s.exited.clone())
                            .unwrap_or_else(|_| Arc::new(AtomicBool::new(true)))
                    })
                    .unwrap_or_else(|| Arc::new(AtomicBool::new(true)));

                let id = session.id.clone();
                if let Ok(mut sessions) = self.sessions.lock() {
                    sessions.insert(id.clone(), session);
                }

                let started = std::time::Instant::now();
                loop {
                    if exited.load(Ordering::SeqCst) {
                        break;
                    }
                    if started.elapsed().as_millis() as u64 >= timeout_ms {
                        let _ = self.destroy_session_inner(&id);
                        return ToolResult::error(format!(
                            "terminal_exec({}) timed out after {}ms",
                            command, timeout_ms
                        ));
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                }

                let output_str = output.lock().map(|o| o.clone()).unwrap_or_default();
                let _ = self.destroy_session_inner(&id);

                to_json_content(serde_json::json!({
                    "output": output_str,
                    "exit_code": 0,
                    "transport": "pty",
                }))
            }
            Err(e) => {
                info!("PTY exec failed, falling back to spawn: {}", e);
                let env = crate::mcp::param_map(&args, "env");
                let result =
                    run_one_shot_process(&command, &command_args, &cwd, &env, timeout_ms).await;
                match result {
                    Ok((output, exit_code)) => to_json_content(serde_json::json!({
                        "output": output,
                        "exit_code": exit_code,
                        "transport": "spawn",
                        "fallback_reason": e,
                    })),
                    Err(e2) => ToolResult::error(format!("Execution failed: {}", e2)),
                }
            }
        }
    }

    fn handle_write(&self, args: Value) -> ToolResult {
        let session_id = match param_str(&args, "session_id") {
            Some(id) => id,
            None => return ToolResult::error("session_id is required"),
        };
        let text = match param_str(&args, "text") {
            Some(t) if !t.is_empty() => t,
            _ => return ToolResult::error("text is required"),
        };

        let sessions = match self.sessions.lock() {
            Ok(s) => s,
            Err(e) => return ToolResult::error(format!("Lock error: {}", e)),
        };

        let session = match sessions.get(&session_id) {
            Some(s) => s,
            None => return ToolResult::error(format!("Unknown terminal session: {}", session_id)),
        };

        if let Some(ref pty_mutex) = session.pty {
            if let Ok(mut pty_state) = pty_mutex.lock() {
                let _ = pty_state.writer.write_all(text.as_bytes());
                let _ = pty_state.writer.flush();
                return to_json_content(serde_json::json!({"success": true, "session_id": session_id}));
            }
        }

        ToolResult::error("Cannot write to this session (no PTY writer available)")
    }

    fn handle_read(&self, args: Value) -> ToolResult {
        let session_id = match param_str(&args, "session_id") {
            Some(id) => id,
            None => return ToolResult::error("session_id is required"),
        };

        let output = match self.get_session_output(&session_id) {
            Ok(o) => o,
            Err(e) => return ToolResult::error(e),
        };

        let last_chars = param_u32(&args, "last_chars");
        let truncated = match last_chars {
            Some(n) => {
                let n = n as usize;
                if n < output.len() {
                    output[output.len() - n..].to_string()
                } else {
                    output.clone()
                }
            }
            None => output.clone(),
        };

        let sessions = self.sessions.lock().map_err(|e| e.to_string());
        let (closed, exit_code) = match sessions {
            Ok(s) => s
                .get(&session_id)
                .map(|s| (s.closed, s.exit_code))
                .unwrap_or((true, None)),
            Err(_) => (true, None),
        };

        to_json_content(serde_json::json!({
            "session_id": session_id,
            "output": truncated,
            "closed": closed,
            "exit_code": exit_code,
        }))
    }

    async fn handle_wait_for(&self, args: Value) -> ToolResult {
        let session_id = match param_str(&args, "session_id") {
            Some(id) => id,
            None => return ToolResult::error("session_id is required"),
        };
        let text = match param_str(&args, "text") {
            Some(t) if !t.is_empty() => t,
            _ => return ToolResult::error("text is required"),
        };
        let timeout_ms = param_u64_or(&args, "timeout_ms", 10_000);

        let output_arc = {
            let sessions = match self.sessions.lock() {
                Ok(s) => s,
                Err(e) => return ToolResult::error(format!("Lock error: {}", e)),
            };
            match sessions.get(&session_id) {
                Some(s) => s.output.clone(),
                None => {
                    return ToolResult::error(format!(
                        "Unknown terminal session: {}",
                        session_id
                    ))
                }
            }
        };

        match Self::wait_for_output(&output_arc, &text, timeout_ms).await {
            Ok(()) => {
                let output = output_arc.lock().map(|o| o.clone()).unwrap_or_default();
                to_json_content(serde_json::json!({
                    "session_id": session_id,
                    "matched": true,
                    "output": output,
                }))
            }
            Err(e) => ToolResult::error(e),
        }
    }

    fn handle_resize(&self, args: Value) -> ToolResult {
        let session_id = match param_str(&args, "session_id") {
            Some(id) => id,
            None => return ToolResult::error("session_id is required"),
        };
        let cols = param_u32_or(&args, "cols", 80) as u16;
        let rows = param_u32_or(&args, "rows", 24) as u16;

        let sessions = match self.sessions.lock() {
            Ok(s) => s,
            Err(e) => return ToolResult::error(format!("Lock error: {}", e)),
        };

        let session = match sessions.get(&session_id) {
            Some(s) => s,
            None => return ToolResult::error(format!("Unknown terminal session: {}", session_id)),
        };

        if let Some(ref pty_mutex) = session.pty {
            if let Ok(pty_state) = pty_mutex.lock() {
                let _ = pty_state._pair.master.resize(PtySize {
                    rows,
                    cols,
                    pixel_width: 0,
                    pixel_height: 0,
                });
            }
        }

        to_json_content(serde_json::json!({
            "success": true,
            "session_id": session_id,
            "cols": cols,
            "rows": rows,
        }))
    }

    fn handle_list_sessions(&self) -> ToolResult {
        match self.list_sessions_inner() {
            Ok(sessions) => to_json_content(serde_json::json!({ "sessions": sessions })),
            Err(e) => ToolResult::error(e),
        }
    }

    fn handle_close_session(&self, args: Value) -> ToolResult {
        let session_id = match param_str(&args, "session_id") {
            Some(id) => id,
            None => return ToolResult::error("session_id is required"),
        };

        match self.destroy_session_inner(&session_id) {
            Ok(()) => {
                to_json_content(serde_json::json!({"success": true, "session_id": session_id}))
            }
            Err(e) => ToolResult::error(e),
        }
    }

    async fn handle_screenshot(&self, args: Value) -> ToolResult {
        let window = param_str_or(&args, "window", "screen");
        let output_path = param_str(&args, "output_path");

        let tmp_path = output_path.unwrap_or_else(|| {
            format!(
                "{}/gal-screenshot-{}.png",
                std::env::temp_dir().to_string_lossy(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis())
                    .unwrap_or(0),
            )
        });

        let (capture_cmd, capture_args) = if cfg!(target_os = "macos") {
            match window.as_str() {
                "window" => ("screencapture", vec!["-l", "0", &tmp_path]),
                "selection" => ("screencapture", vec!["-i", &tmp_path]),
                _ => ("screencapture", vec!["-x", &tmp_path]),
            }
        } else if cfg!(target_os = "linux") {
            match window.as_str() {
                "window" => ("gnome-screenshot", vec!["-w", "-f", &tmp_path]),
                _ => ("gnome-screenshot", vec!["-f", &tmp_path]),
            }
        } else {
            return ToolResult::error(format!("Screenshot not supported on this platform"));
        };

        let mut child = match std::process::Command::new(capture_cmd)
            .args(&capture_args)
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                return ToolResult::error(format!("Screenshot failed: {}", e));
            }
        };

        let _ = child.wait();

        if param_str(&args, "output_path").is_some() {
            return to_json_content(serde_json::json!({
                "success": true,
                "path": tmp_path,
            }));
        }

        match std::fs::read(&tmp_path) {
            Ok(data) => {
                let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
                let _ = std::fs::remove_file(&tmp_path);
                ToolResult::with_content(vec![ContentItem::image(encoded, "image/png")])
            }
            Err(e) => ToolResult::error(format!("Failed to read screenshot: {}", e)),
        }
    }

    fn handle_render(&self, args: Value) -> ToolResult {
        let session_id = match param_str(&args, "session_id") {
            Some(id) => id,
            None => return ToolResult::error("session_id is required"),
        };

        let output = match self.get_session_output(&session_id) {
            Ok(o) => o,
            Err(e) => return ToolResult::error(e),
        };

        let cols = param_u32_or(&args, "cols", 120) as usize;
        let rows = param_u32_or(&args, "rows", 40) as usize;
        let max_chars = cols * rows;

        let truncated: String = if output.len() > max_chars {
            output[output.len() - max_chars..].to_string()
        } else {
            output
        };

        to_json_content(serde_json::json!({
            "session_id": session_id,
            "cols": cols,
            "rows": rows,
            "output": truncated,
            "note": "Output contains ANSI escape codes. Use an ANSI renderer to display.",
        }))
    }
}

async fn run_one_shot_process(
    command: &str,
    args: &[String],
    cwd: &str,
    env: &HashMap<String, String>,
    timeout_ms: u64,
) -> Result<(String, i32), String> {
    let mut cmd = std::process::Command::new(command);
    cmd.args(args);
    cmd.current_dir(cwd);
    cmd.env("TERM", "xterm-256color");
    for (k, v) in env {
        cmd.env(k, v);
    }
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn: {}", e))?;

    let timed_out = Arc::new(AtomicBool::new(false));
    let timed_out_clone = timed_out.clone();

    let pid = child.id();
    let kill_handle = tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(timeout_ms)).await;
        timed_out_clone.store(true, Ordering::SeqCst);
        let _ = std::process::Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .spawn();
    });

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let mut output = String::new();

    if let Some(stdout) = stdout {
        let mut reader = std::io::BufReader::new(stdout);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => output.push_str(&line),
                Err(_) => break,
            }
        }
    }

    if let Some(stderr) = stderr {
        let mut reader = std::io::BufReader::new(stderr);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => output.push_str(&line),
                Err(_) => break,
            }
        }
    }

    kill_handle.abort();

    if timed_out.load(Ordering::SeqCst) {
        return Err(format!(
            "terminal_exec({}) timed out after {}ms",
            command, timeout_ms
        ));
    }

    let status = child.wait().map_err(|e| format!("Wait error: {}", e))?;
    let exit_code = status.code().unwrap_or(0);

    Ok((output, exit_code))
}
