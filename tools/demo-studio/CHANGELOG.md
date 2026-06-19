# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-26

### Added
- Screen recording engine with FFmpeg integration
- Smart zoom effects with easing functions (linear, ease-in, ease-out, ease-in-out)
- Cursor smoothing and click highlight animations
- Keystroke overlay display for keyboard shortcuts
- Text overlay support for annotations
- TTS voiceover integration (OpenAI, ElevenLabs)
- Multi-track timeline editor for video editing
- MCP server with 10 tools for AI agent control
- DemoScriptRunner for orchestrating recording + effects from JSON
- WindowDetector for listing and finding windows (macOS)
- ScreenCapture for screenshots and frame capture
- CLI with commands: record, windows, screenshot, create, run, edit, render, mcp
- Scriptable demo format with 7 step types
- 5 example demo scripts
- Unit tests (45 tests, 4 test files)
- CI workflow for build, lint, and test
- CodeQL security analysis
- Release workflow for npm publishing

### CLI Commands
- `demo-studio record` - Start screen recording
- `demo-studio windows` - List available windows
- `demo-studio screenshot` - Capture screenshots
- `demo-studio create` - Create demo script template
- `demo-studio run` - Execute demo script
- `demo-studio edit` - Edit video with effects
- `demo-studio render` - Render from script
- `demo-studio mcp` - Start MCP server

### MCP Tools
- `start_recording` - Begin screen recording
- `stop_recording` - End recording and save
- `add_zoom_region` - Add zoom effect region
- `add_click_marker` - Add click animation
- `add_keystroke_overlay` - Show keyboard shortcut
- `add_text_overlay` - Add text annotation
- `set_cursor_style` - Configure cursor appearance
- `add_voiceover` - Add TTS narration
- `export_video` - Render final video
- `run_demo_script` - Execute demo script

### Output Quality Presets
- Draft (CRF 28, ultrafast)
- Standard (CRF 23, fast)
- High (CRF 18, medium)
- Production (CRF 12, slow)

### Supported Platforms
- macOS 10.15+ (primary)
- Windows/Linux support planned
