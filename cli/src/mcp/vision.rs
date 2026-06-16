//! Vision MCP Server
//!
//! Ported from `vision-gal-server.ts`. Provides image and video analysis via
//! the Gemini API (Google AI Studio or Vertex AI).
//!
//! Tools:
//! - analyze_image: General-purpose image understanding
//! - extract_text: OCR text from screenshot
//! - ui_to_artifact: Convert UI screenshot to code/spec
//! - diagnose_error: Analyze error screenshot
//! - understand_diagram: Interpret technical diagram
//! - analyze_chart: Analyze data visualization
//! - diff_ui: Compare two UI screenshots
//! - analyze_video: Analyze a video file

use crate::mcp::{
    param_str, param_str_or, McpServer, Tool, ToolResult,
};
use serde_json::Value;
use std::collections::HashMap;
use tracing::{info, warn};

#[allow(dead_code)]
const SERVER_NAME: &str = "gal-vision";
#[allow(dead_code)]
const SERVER_VERSION: &str = "0.1.0";

// =============================================================================
// Gemini API Client
// =============================================================================

struct GeminiClient {
    api_key: String,
    model: String,
    client: reqwest::Client,
}

impl GeminiClient {
    fn from_env() -> Result<Self, String> {
        let api_key = std::env::var("GEMINI_API_KEY")
            .or_else(|_| {
                // Try reading from ~/.gal/config.json
                let config_path = dirs::home_dir()
                    .map(|p| p.join(".gal").join("config.json"));
                if let Some(path) = config_path {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(config) = serde_json::from_str::<Value>(&content) {
                            if let Some(key) = config.get("apiKey").and_then(|v| v.as_str()) {
                                return Ok(key.to_string());
                            }
                        }
                    }
                }
                Err("GEMINI_API_KEY not set".to_string())
            })?;

        let model = std::env::var("VISION_MODEL").unwrap_or_else(|_| "gemini-2.5-flash".to_string());

        Ok(Self {
            api_key,
            model,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(120))
                .build()
                .map_err(|e| format!("Failed to create HTTP client: {}", e))?,
        })
    }

    async fn generate_content(&self, parts: Vec<Value>) -> Result<String, String> {
        // Key goes in the x-goog-api-key header (below), NOT the URL query — a key
        // in the URL leaks via reqwest's error Display (which echoes the full URL)
        // back through the MCP transport / logs on any transport-layer failure.
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            self.model
        );

        let body = serde_json::json!({
            "contents": [
                {
                    "role": "user",
                    "parts": parts,
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 8192,
            }
        });

        let response = self
            .client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
            .json(&body)
            .send()
            .await
            // without_url() strips the request URL from the error so a key (or any
            // URL-embedded secret) can never be reflected back to the caller/logs.
            .map_err(|e| format!("API request failed: {}", e.without_url()))?;

        let status = response.status();
        let response_body: Value = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        if !status.is_success() {
            let error_msg = response_body
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown API error");
            return Err(format!("Gemini API error ({}): {}", status.as_u16(), error_msg));
        }

        // Extract text from the response
        let text = response_body
            .get("candidates")
            .and_then(|c| c.as_array())
            .and_then(|c| c.first())
            .and_then(|c| c.get("content"))
            .and_then(|c| c.get("parts"))
            .and_then(|p| p.as_array())
            .and_then(|p| p.first())
            .and_then(|p| p.get("text"))
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string();

        Ok(text)
    }

    async fn analyze_image(&self, image_data: &str, mime_type: &str, prompt: &str) -> Result<String, String> {
        let parts = vec![
            serde_json::json!({
                "text": prompt,
            }),
            serde_json::json!({
                "inlineData": {
                    "mimeType": mime_type,
                    "data": image_data,
                },
            }),
        ];
        self.generate_content(parts).await
    }

    async fn analyze_video_base64(&self, video_data: &str, mime_type: &str, prompt: &str) -> Result<String, String> {
        let parts = vec![
            serde_json::json!({
                "text": prompt,
            }),
            serde_json::json!({
                "inlineData": {
                    "mimeType": mime_type,
                    "data": video_data,
                },
            }),
        ];
        self.generate_content(parts).await
    }
}

// =============================================================================
// Helper functions
// =============================================================================

fn mime_type_from_path(file_path: &str) -> String {
    let ext = file_path
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "m4v" => "video/x-m4v",
        "webm" => "video/webm",
        "avi" => "video/x-msvideo",
        _ => "application/octet-stream",
    }
    .to_string()
}

fn is_image_mime(mime: &str) -> bool {
    mime.starts_with("image/")
}

fn is_video_mime(mime: &str) -> bool {
    mime.starts_with("video/")
}

fn read_asset_as_base64(project_path: &str, input_path: &str) -> Result<(String, String, String), String> {
    // Try resolving relative to project path first, then as absolute
    let candidate = std::path::Path::new(project_path).join(input_path);
    let file_path = if candidate.exists() {
        candidate
    } else if std::path::Path::new(input_path).exists() {
        std::path::Path::new(input_path).to_path_buf()
    } else {
        return Err(format!("File not found: {} (searched from {})", input_path, project_path));
    };

    let data = std::fs::read(&file_path)
        .map_err(|e| format!("Failed to read file {}: {}", file_path.display(), e))?;

    let mime_type = mime_type_from_path(file_path.to_str().unwrap_or(""));

    // Check video size limit (8MB)
    if is_video_mime(&mime_type) {
        let size_mb = data.len() as f64 / (1024.0 * 1024.0);
        if size_mb > 8.0 {
            return Err(format!("Video file too large: {:.2}MB (max 8MB)", size_mb));
        }
    }

    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);

    Ok((encoded, file_path.to_string_lossy().to_string(), mime_type))
}

// =============================================================================
// Vision MCP Server
// =============================================================================

pub struct VisionMcpServer {
    client: Option<GeminiClient>,
    project_path: String,
}

impl VisionMcpServer {
    pub fn new(project_path: Option<String>) -> Self {
        let client = match GeminiClient::from_env() {
            Ok(c) => {
                info!("Vision MCP initialized with Gemini API");
                Some(c)
            }
            Err(e) => {
                warn!("Vision MCP initialized without API key: {}", e);
                None
            }
        };

        Self {
            client,
            project_path: project_path.unwrap_or_else(|| {
                std::env::current_dir()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|_| "/".to_string())
            }),
        }
    }
}

// =============================================================================
// Tool Definitions
// =============================================================================

fn tools_list() -> Vec<Tool> {
    vec![
        Tool {
            name: "image_analysis".to_string(),
            description: "General-purpose image understanding. Analyze any image and describe its contents, answer questions, or extract information.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"image_path":{"type":"string","description":"Path to the image file (relative to cwd or absolute)"},"prompt":{"type":"string","description":"Custom analysis prompt (default: describe the image)"}},"required":["image_path"]}"#).ok(),
        },
        Tool {
            name: "extract_text_from_screenshot".to_string(),
            description: "OCR screenshots for code, terminals, docs, and general text. Extracts text content from images with high accuracy.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"image_path":{"type":"string","description":"Path to the screenshot image file"},"context":{"type":"string","description":"Context hint (e.g., 'terminal output', 'code editor', 'document')"}},"required":["image_path"]}"#).ok(),
        },
        Tool {
            name: "ui_to_artifact".to_string(),
            description: "Turn UI screenshots into code, prompts, specs, or descriptions. Useful for replicating UI designs or generating implementation code.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"image_path":{"type":"string","description":"Path to the UI screenshot"},"output_type":{"type":"string","enum":["code","spec","description","prompt"],"description":"Desired output type"},"framework":{"type":"string","description":"Target framework (e.g., 'react', 'vue', 'html/css')"}},"required":["image_path","output_type"]}"#).ok(),
        },
        Tool {
            name: "diagnose_error_screenshot".to_string(),
            description: "Analyze error snapshots and propose actionable fixes. Useful for debugging terminal errors, IDE error messages, or application crashes.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"image_path":{"type":"string","description":"Path to the error screenshot"},"context":{"type":"string","description":"Additional context about what was being attempted"}},"required":["image_path"]}"#).ok(),
        },
        Tool {
            name: "understand_technical_diagram".to_string(),
            description: "Interpret architecture, flow, UML, ER, and system diagrams. Extracts structure and explains the technical concepts.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"image_path":{"type":"string","description":"Path to the diagram image"},"diagram_type":{"type":"string","enum":["architecture","flow","uml","er","network","other"],"description":"Type of diagram (auto-detected if not specified)"}},"required":["image_path"]}"#).ok(),
        },
        Tool {
            name: "analyze_data_visualization".to_string(),
            description: "Read charts and dashboards to surface insights and trends. Extracts data points and provides analytical insights.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"image_path":{"type":"string","description":"Path to the chart/dashboard image"},"focus":{"type":"string","description":"Specific aspect to focus on (e.g., 'trends', 'anomalies', 'comparison')"}},"required":["image_path"]}"#).ok(),
        },
        Tool {
            name: "ui_diff_check".to_string(),
            description: "Compare two UI screenshots to flag visual or implementation drift. Useful for regression testing.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"image_path_1":{"type":"string","description":"Path to the first (baseline) UI screenshot"},"image_path_2":{"type":"string","description":"Path to the second (comparison) UI screenshot"},"threshold":{"type":"string","enum":["strict","moderate","lenient"],"description":"Sensitivity of comparison (default: moderate)"}},"required":["image_path_1","image_path_2"]}"#).ok(),
        },
        Tool {
            name: "video_analysis".to_string(),
            description: "Inspect videos (local files <=8MB; MP4/MOV/M4V/WebM) to describe scenes, moments, and entities.".to_string(),
            inputSchema: serde_json::from_str(r#"{"type":"object","properties":{"video_path":{"type":"string","description":"Path to the video file (max 8MB)"},"prompt":{"type":"string","description":"Custom analysis prompt (default: summarize the video)"}},"required":["video_path"]}"#).ok(),
        },
    ]
}

// =============================================================================
// Tool result helpers
// =============================================================================

fn success(text: &str) -> ToolResult {
    ToolResult::success(text.to_string())
}

fn error_result(prefix: &str, error: &str) -> ToolResult {
    ToolResult::error(format!("{}: {}", prefix, error))
}

// =============================================================================
// McpServer trait implementation
// =============================================================================

#[async_trait::async_trait]
impl McpServer for VisionMcpServer {
    fn list_tools(&self) -> Vec<Tool> {
        tools_list()
    }

    async fn call_tool(&self, name: &str, args: Value) -> Option<ToolResult> {
        match name {
            "image_analysis" => Some(self.handle_image_analysis(args).await),
            "extract_text_from_screenshot" => Some(self.handle_extract_text(args).await),
            "ui_to_artifact" => Some(self.handle_ui_to_artifact(args).await),
            "diagnose_error_screenshot" => Some(self.handle_diagnose_error(args).await),
            "understand_technical_diagram" => Some(self.handle_understand_diagram(args).await),
            "analyze_data_visualization" => Some(self.handle_analyze_chart(args).await),
            "ui_diff_check" => Some(self.handle_diff_ui(args).await),
            "video_analysis" => Some(self.handle_video_analysis(args).await),
            _ => None,
        }
    }
}

// =============================================================================
// Tool Handlers
// =============================================================================

impl VisionMcpServer {
    fn get_client(&self) -> Result<&GeminiClient, ToolResult> {
        self.client.as_ref().ok_or_else(|| {
            ToolResult::error(
                "GEMINI_API_KEY not set. Set the GEMINI_API_KEY environment variable or configure it in ~/.gal/config.json"
            )
        })
    }

    async fn handle_image_analysis(&self, args: Value) -> ToolResult {
        let client = match self.get_client() {
            Ok(c) => c,
            Err(e) => return e,
        };

        let image_path = match param_str(&args, "image_path") {
            Some(p) => p,
            None => return ToolResult::error("image_path is required"),
        };

        let prompt = param_str_or(&args, "prompt", "Analyze this image and provide a detailed description of its contents.");

        let (data, _file_path, mime_type) = match read_asset_as_base64(&self.project_path, &image_path)
        {
            Ok(v) => v,
            Err(e) => return error_result("Error analyzing image", &e),
        };

        if !is_image_mime(&mime_type) {
            return error_result("Error analyzing image", &format!("Not an image file: {}", mime_type));
        }

        match client.analyze_image(&data, &mime_type, &prompt).await {
            Ok(text) => success(&text),
            Err(e) => error_result("Error analyzing image", &e),
        }
    }

    async fn handle_extract_text(&self, args: Value) -> ToolResult {
        let client = match self.get_client() {
            Ok(c) => c,
            Err(e) => return e,
        };

        let image_path = match param_str(&args, "image_path") {
            Some(p) => p,
            None => return ToolResult::error("image_path is required"),
        };

        let context = param_str(&args, "context");
        let context_hint = context
            .map(|c| format!("Context: {}. ", c))
            .unwrap_or_default();

        let prompt = format!(
            "{}Extract all text from this image. Preserve formatting, indentation, and structure as much as possible. If this is code, preserve the exact syntax. If this is terminal output, preserve the exact output format.",
            context_hint
        );

        let (data, _file_path, mime_type) = match read_asset_as_base64(&self.project_path, &image_path)
        {
            Ok(v) => v,
            Err(e) => return error_result("Error extracting text", &e),
        };

        if !is_image_mime(&mime_type) {
            return error_result("Error extracting text", &format!("Not an image file: {}", mime_type));
        }

        match client.analyze_image(&data, &mime_type, &prompt).await {
            Ok(text) => success(&text),
            Err(e) => error_result("Error extracting text", &e),
        }
    }

    async fn handle_ui_to_artifact(&self, args: Value) -> ToolResult {
        let client = match self.get_client() {
            Ok(c) => c,
            Err(e) => return e,
        };

        let image_path = match param_str(&args, "image_path") {
            Some(p) => p,
            None => return ToolResult::error("image_path is required"),
        };

        let output_type = match param_str(&args, "output_type") {
            Some(t) => t,
            None => return ToolResult::error("output_type is required"),
        };

        let framework = param_str(&args, "framework");
        let framework_hint = framework
            .map(|f| format!("Target framework: {}. ", f))
            .unwrap_or_default();

        let prompts: HashMap<&str, &str> = [
            ("code", "Generate implementation code for this UI. Use modern best practices and clean, maintainable code. Include all necessary styling."),
            ("spec", "Create a detailed specification for this UI. Include layout, colors, typography, spacing, components, and interactions."),
            ("description", "Describe this UI in detail, including layout, design patterns, visual hierarchy, and user experience considerations."),
            ("prompt", "Create a detailed prompt that could be used to generate this UI. Include all visual and structural details."),
        ].iter().cloned().collect();

        let base_prompt = prompts.get(output_type.as_str()).unwrap_or(&"Describe this UI in detail.");
        let prompt = format!("{}{}", framework_hint, base_prompt);

        let (data, _file_path, mime_type) = match read_asset_as_base64(&self.project_path, &image_path)
        {
            Ok(v) => v,
            Err(e) => return error_result("Error converting UI to artifact", &e),
        };

        if !is_image_mime(&mime_type) {
            return error_result(
                "Error converting UI to artifact",
                &format!("Not an image file: {}", mime_type),
            );
        }

        match client.analyze_image(&data, &mime_type, &prompt).await {
            Ok(text) => success(&text),
            Err(e) => error_result("Error converting UI to artifact", &e),
        }
    }

    async fn handle_diagnose_error(&self, args: Value) -> ToolResult {
        let client = match self.get_client() {
            Ok(c) => c,
            Err(e) => return e,
        };

        let image_path = match param_str(&args, "image_path") {
            Some(p) => p,
            None => return ToolResult::error("image_path is required"),
        };

        let context = param_str(&args, "context");
        let context_hint = context
            .map(|c| format!("Context: {}\n\n", c))
            .unwrap_or_default();

        let prompt = format!(
            "{}Analyze this error screenshot. Identify:
1. The error type and message
2. The likely root cause
3. Step-by-step actionable fixes
4. Prevention tips if applicable

Be specific and practical in your suggestions.",
            context_hint
        );

        let (data, _file_path, mime_type) = match read_asset_as_base64(&self.project_path, &image_path)
        {
            Ok(v) => v,
            Err(e) => return error_result("Error diagnosing screenshot", &e),
        };

        if !is_image_mime(&mime_type) {
            return error_result(
                "Error diagnosing screenshot",
                &format!("Not an image file: {}", mime_type),
            );
        }

        match client.analyze_image(&data, &mime_type, &prompt).await {
            Ok(text) => success(&text),
            Err(e) => error_result("Error diagnosing screenshot", &e),
        }
    }

    async fn handle_understand_diagram(&self, args: Value) -> ToolResult {
        let client = match self.get_client() {
            Ok(c) => c,
            Err(e) => return e,
        };

        let image_path = match param_str(&args, "image_path") {
            Some(p) => p,
            None => return ToolResult::error("image_path is required"),
        };

        let diagram_type = param_str(&args, "diagram_type");
        let type_hint = diagram_type
            .map(|t| format!("This is a {} diagram. ", t))
            .unwrap_or_default();

        let prompt = format!(
            "{}Analyze this technical diagram and provide:
1. A summary of what the diagram represents
2. Key components/entities and their roles
3. Relationships and data flows
4. Technical implications and considerations
5. If applicable, suggest improvements or potential issues

Be thorough and precise in your analysis.",
            type_hint
        );

        let (data, _file_path, mime_type) = match read_asset_as_base64(&self.project_path, &image_path)
        {
            Ok(v) => v,
            Err(e) => return error_result("Error analyzing diagram", &e),
        };

        if !is_image_mime(&mime_type) {
            return error_result("Error analyzing diagram", &format!("Not an image file: {}", mime_type));
        }

        match client.analyze_image(&data, &mime_type, &prompt).await {
            Ok(text) => success(&text),
            Err(e) => error_result("Error analyzing diagram", &e),
        }
    }

    async fn handle_analyze_chart(&self, args: Value) -> ToolResult {
        let client = match self.get_client() {
            Ok(c) => c,
            Err(e) => return e,
        };

        let image_path = match param_str(&args, "image_path") {
            Some(p) => p,
            None => return ToolResult::error("image_path is required"),
        };

        let focus = param_str(&args, "focus");
        let focus_hint = focus
            .map(|f| format!("Focus on: {}. ", f))
            .unwrap_or_default();

        let prompt = format!(
            "{}Analyze this data visualization and provide:
1. Chart type and what it represents
2. Key data points and values (extract specific numbers where visible)
3. Trends, patterns, and insights
4. Notable anomalies or outliers
5. Conclusions and recommendations based on the data

Be precise with numbers and thorough with insights.",
            focus_hint
        );

        let (data, _file_path, mime_type) = match read_asset_as_base64(&self.project_path, &image_path)
        {
            Ok(v) => v,
            Err(e) => return error_result("Error analyzing visualization", &e),
        };

        if !is_image_mime(&mime_type) {
            return error_result(
                "Error analyzing visualization",
                &format!("Not an image file: {}", mime_type),
            );
        }

        match client.analyze_image(&data, &mime_type, &prompt).await {
            Ok(text) => success(&text),
            Err(e) => error_result("Error analyzing visualization", &e),
        }
    }

    async fn handle_diff_ui(&self, args: Value) -> ToolResult {
        let client = match self.get_client() {
            Ok(c) => c,
            Err(e) => return e,
        };

        let image_path_1 = match param_str(&args, "image_path_1") {
            Some(p) => p,
            None => return ToolResult::error("image_path_1 is required"),
        };
        let image_path_2 = match param_str(&args, "image_path_2") {
            Some(p) => p,
            None => return ToolResult::error("image_path_2 is required"),
        };

        let threshold = param_str_or(&args, "threshold", "moderate");

        let first = match read_asset_as_base64(&self.project_path, &image_path_1) {
            Ok(v) => v,
            Err(e) => return error_result("Error comparing UI screenshots", &e),
        };
        let second = match read_asset_as_base64(&self.project_path, &image_path_2) {
            Ok(v) => v,
            Err(e) => return error_result("Error comparing UI screenshots", &e),
        };

        if !is_image_mime(&first.2) || !is_image_mime(&second.2) {
            return error_result(
                "Error comparing UI screenshots",
                "Both files must be images",
            );
        }

        let thresholds: HashMap<&str, &str> = [
            ("strict", "Report any differences, no matter how small."),
            (
                "moderate",
                "Report noticeable differences that could affect user experience.",
            ),
            (
                "lenient",
                "Only report significant differences that change functionality or major visual elements.",
            ),
        ]
        .iter()
        .cloned()
        .collect();

        let sensitivity = thresholds.get(threshold.as_str()).unwrap_or(&"Report noticeable differences.");

        // Analyze baseline
        let baseline_prompt =
            "Analyze this baseline UI screenshot and describe its key elements, layout, colors, and structure.";
        let baseline_analysis = match client
            .analyze_image(&first.0, &first.2, baseline_prompt)
            .await
        {
            Ok(t) => t,
            Err(e) => return error_result("Error analyzing baseline", &e),
        };

        // Analyze comparison
        let comparison_prompt =
            "Analyze this comparison UI screenshot and describe its key elements, layout, colors, and structure.";
        let comparison_analysis = match client
            .analyze_image(&second.0, &second.2, comparison_prompt)
            .await
        {
            Ok(t) => t,
            Err(e) => return error_result("Error analyzing comparison", &e),
        };

        let file_name_1 = std::path::Path::new(&image_path_1)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| image_path_1.clone());
        let file_name_2 = std::path::Path::new(&image_path_2)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| image_path_2.clone());

        let combined_prompt = format!(
            "Compare these two UI screenshots.

Baseline: {}
Comparison: {}

Sensitivity: {}

Provide:
1. Overall similarity assessment (percentage if possible)
2. List of differences found (position, element, nature of change)
3. Severity of each difference (critical, major, minor, trivial)
4. Whether this represents a regression or intended change
5. Recommendations

BASELINE ANALYSIS:
{}

COMPARISON ANALYSIS:
{}

Now provide the diff comparison analysis.",
            file_name_1, file_name_2, sensitivity, baseline_analysis, comparison_analysis
        );

        match client
            .analyze_image(&first.0, &first.2, &combined_prompt)
            .await
        {
            Ok(text) => success(&text),
            Err(e) => error_result("Error comparing UI screenshots", &e),
        }
    }

    async fn handle_video_analysis(&self, args: Value) -> ToolResult {
        let client = match self.get_client() {
            Ok(c) => c,
            Err(e) => return e,
        };

        let video_path = match param_str(&args, "video_path") {
            Some(p) => p,
            None => return ToolResult::error("video_path is required"),
        };

        let prompt = param_str_or(
            &args,
            "prompt",
            "Analyze this video and provide:\n\
             1. Overall summary of what happens\n\
             2. Key scenes and moments (with timestamps if possible)\n\
             3. People, objects, and entities detected\n\
             4. Actions and events\n\
             5. Audio/transcript if speech is present\n\
             6. Notable visual or audio elements",
        );

        let (data, _file_path, mime_type) = match read_asset_as_base64(&self.project_path, &video_path)
        {
            Ok(v) => v,
            Err(e) => return error_result("Error analyzing video", &e),
        };

        if !is_video_mime(&mime_type) {
            return error_result(
                "Error analyzing video",
                &format!("Not a video file: {}. Supported formats: MP4, MOV, M4V, WebM", mime_type),
            );
        }

        match client
            .analyze_video_base64(&data, &mime_type, &prompt)
            .await
        {
            Ok(text) => success(&text),
            Err(e) => error_result("Error analyzing video", &e),
        }
    }
}
