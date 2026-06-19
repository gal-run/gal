# GAL Chrome Extension

Chrome extension for accessing organization-approved AI agent commands and policies.

## Features

- **Popup UI**: Quick access to commands from extension icon
- **Floating Widget**: On-page command palette (bottom-right button)
- **Keyboard Shortcut**: `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
- **GitHub OAuth**: Same authentication as Dashboard
- **Multi-Platform**: Works on Claude.ai, ChatGPT, Gemini, GitHub, and more

## Supported Sites

- **LLM Chat**: claude.ai, chatgpt.com, gemini.google.com
- **Code**: github.com (Copilot)
- **Image**: midjourney.com, ideogram.ai, leonardo.ai
- **Video**: runwayml.com, pika.art

## Development

```bash
# Install dependencies
pnpm install

# Build extension
pnpm build

# Watch mode (rebuild on changes)
pnpm watch

# Development mode
pnpm dev
```

## Loading in Chrome

1. Build the extension: `pnpm build`
2. Open Chrome: `chrome://extensions/`
3. Enable "Developer mode" (top-right)
4. Click "Load unpacked"
5. Select the `dist/` folder

## Project Structure

```
src/
├── popup/               # Extension popup UI
│   ├── App.tsx         # Main popup component
│   ├── main.tsx        # Popup entry point
│   └── index.html      # Popup HTML
├── content/            # Content scripts (injected into pages)
│   ├── FloatingWidget.tsx  # Floating button + command palette
│   └── content.tsx     # Content script entry
├── background/         # Background service worker
│   └── service-worker.ts
├── components/         # Shared React components
│   ├── CommandCard.tsx
│   ├── CommandList.tsx
│   └── LoginView.tsx
├── lib/               # Core utilities
│   ├── api.ts         # GAL API client
│   └── storage.ts     # Chrome storage helpers
└── styles/            # Global styles
    ├── globals.css
    └── content.css
```

## API Integration

The extension uses the same GAL API as the Dashboard:

- **Auth**: GitHub OAuth via `chrome.identity.launchWebAuthFlow`
- **Storage**: Chrome storage API for session persistence
- **Commands**: Fetched from `/organizations/:org/approved-config`

## Security

- Auth tokens stored in Chrome storage (isolated per-extension)
- HTTPS only for API requests
- Content Security Policy enforced
- Minimal host permissions

## Configuration

Set build-time environment variables as needed:

```bash
VITE_API_URL=https://api.gal.run \
VITE_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 \
pnpm build
```

Defaults to production (`https://api.gal.run`) if not set.
Sentry remains disabled unless `VITE_SENTRY_DSN` is provided.

## Release

```bash
# Build for production
pnpm build

# Create ZIP for Chrome Web Store
cd dist && zip -r ../gal-extension.zip . && cd ..
```

### GitHub Actions Release

This repo has an independent release workflow. Trigger dry-run via:
```
gh workflow run release.yml -f dry_run=true
```

For production release, push a version tag:
```bash
git tag v0.0.xxx && git push origin v0.0.xxx
```

## Tech Stack

- React 18 + TypeScript
- Vite (bundler)
- Tailwind CSS
- Chrome Manifest V3
- Lucide React (icons)
