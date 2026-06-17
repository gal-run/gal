# Changelog

All notable changes to the GAL Chrome Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-01-29

### Added
- Initial release of GAL Chrome Extension
- Popup UI with GitHub OAuth authentication
- Organization selector and command browsing
- Floating widget button on supported sites
- Command palette overlay (Cmd+Shift+P)
- Search and filter commands
- Copy to clipboard functionality
- Support for multiple AI platforms:
  - LLM Chat: Claude.ai, ChatGPT, Gemini
  - Code: GitHub (Copilot)
  - Image: Midjourney, Ideogram, Leonardo
  - Video: Runway, Pika
- Chrome storage integration for session persistence
- GAL API integration (same auth as Dashboard)
- Dark mode UI with GAL brand styling
- Keyboard shortcuts (Cmd+Shift+P)

### Technical Details
- React 18 + TypeScript
- Vite bundler
- Tailwind CSS
- Chrome Manifest V3
- Lucide React icons
