# gal-vision-mcp-oss

Vision capabilities MCP server using Gemini via Google AI Studio (API key) or Vertex AI (ADC).

## Features

- **Image Analysis** - General-purpose image understanding
- **OCR** - Extract text from screenshots, code editors, terminals
- **UI to Artifact** - Convert UI screenshots to code, specs, or prompts
- **Error Diagnosis** - Analyze error screenshots and suggest fixes
- **Technical Diagrams** - Interpret architecture, flow, UML, ER diagrams
- **Data Visualization** - Read charts and dashboards
- **UI Diff Check** - Compare two UI screenshots for regression testing
- **Video Analysis** - Analyze videos (≤8MB, MP4/MOV/M4V/WebM)

## Prerequisites

- Node.js >= 20.0.0
- **Option A (Recommended)**: Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
- **Option B**: Google Cloud Project with Vertex AI API enabled and ADC

## Installation

Add to your `.gal-code/gal-code.json`:

```json
{
  "mcp": {
    "gal-vision": {
      "type": "local",
      "command": ["node", "/path/to/gal-vision-mcp-oss/dist/index.js"],
      "environment": {
        "GEMINI_API_KEY": "your-api-key",
        "VISION_MODEL": "gemini-2.5-flash"
      },
      "enabled": true
    }
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Gemini API key (preferred auth) | - |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID (fallback auth) | - |
| `VERTEX_AI_LOCATION` | Vertex AI region | `us-central1` |
| `VISION_MODEL` | Gemini model ID | `gemini-2.5-flash` |

## Authentication

**Option A: API Key (Recommended)**
```bash
# Get your key from https://aistudio.google.com/apikey
export GEMINI_API_KEY="your-api-key"
```

**Option B: Vertex AI with ADC**
```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT="your-project-id"
```

## Available Models

Run to list models available with your API key:
```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_KEY" | jq -r '.models[].name'
```

Recommended: `gemini-2.5-flash` (fast, cost-effective)

## Usage

Once configured, agents can use the vision tools:

```
# General image analysis
Analyze this screenshot: screenshot.png

# OCR for code/terminal
Extract text from this terminal output: terminal.png

# UI to code
Convert this UI design to React code: ui-mockup.png

# Error diagnosis
What's wrong in this error screenshot? error.png
```

## Tools Reference

| Tool | Description |
|------|-------------|
| `image_analysis` | General-purpose image understanding |
| `extract_text_from_screenshot` | OCR for code, terminals, documents |
| `ui_to_artifact` | Convert UI to code/spec/description |
| `diagnose_error_screenshot` | Analyze errors and suggest fixes |
| `understand_technical_diagram` | Interpret architecture/diagrams |
| `analyze_data_visualization` | Read charts and dashboards |
| `ui_diff_check` | Compare two UI screenshots |
| `video_analysis` | Analyze video content (≤8MB) |

## Cost

Gemini 2.0 Flash pricing (as of 2025):
- ~$0.0001 per image
- ~$0.00002 per video frame

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm run build

# Run tests
pnpm test

# Start locally
pnpm start
```

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
