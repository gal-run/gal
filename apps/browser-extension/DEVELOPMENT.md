# Development Guide

## Prerequisites

- Node.js 20+
- pnpm 8+
- Chrome or Chromium browser

## Setup

```bash
# Install dependencies
pnpm install

# Copy icons to public (one-time)
bash scripts/copy-icons.sh
```

## Development Workflow

### 1. Build the Extension

```bash
# Production build
pnpm build

# Development mode (watch)
pnpm dev
```

### 2. Load in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select the `dist/` folder

### 3. Make Changes

- Edit source files in `src/`
- Run `pnpm build` to rebuild
- Click "Reload" in `chrome://extensions/` to apply changes

**Hot Reload**: Use `pnpm dev` for automatic rebuilds on file changes. You still need to manually reload the extension in Chrome.

## Testing

### Manual Testing Checklist

**Popup UI:**
- [ ] Extension icon shows in toolbar
- [ ] Click icon opens popup
- [ ] Login with GitHub works
- [ ] Organization selector shows orgs
- [ ] Commands load and display
- [ ] Search filters commands
- [ ] Copy button copies to clipboard
- [ ] Logout clears session

**Content Script:**
- [ ] Floating button appears on supported sites
- [ ] Click button opens command palette
- [ ] Keyboard shortcut (Cmd+Shift+P) works
- [ ] Search filters commands
- [ ] Click command copies to clipboard
- [ ] Esc closes palette
- [ ] Backdrop click closes palette

**Supported Sites:**
- [ ] claude.ai
- [ ] chatgpt.com
- [ ] gemini.google.com
- [ ] github.com
- [ ] midjourney.com
- [ ] ideogram.ai
- [ ] leonardo.ai
- [ ] runwayml.com
- [ ] pika.art

### API Integration

Test with different API environments:

```bash
# Production (default)
pnpm build

# Local
VITE_API_URL=http://localhost:3000 pnpm build

# Local with Sentry enabled
VITE_API_URL=http://localhost:3000 \
VITE_SENTRY_DSN=https://examplePublicKey@o0.ingest.sentry.io/0 \
pnpm build
```

## Debugging

### Extension Console

1. Right-click extension icon → "Inspect popup"
2. Or go to `chrome://extensions/` → "Inspect views: service worker"

### Content Script Console

1. Open site developer tools (F12)
2. Check Console for `[GAL]` logs

### Common Issues

**Commands not loading:**
- Check Network tab for API errors
- Verify auth token in Chrome DevTools → Application → Storage → Local Storage

**Floating button not appearing:**
- Check Console for content script errors
- Verify site is in `host_permissions` list in manifest.json

**OAuth not working:**
- Check `chrome.identity.launchWebAuthFlow` permissions
- Verify redirect URI matches API configuration

**Sentry not reporting:**
- Inspect the extension service worker console for `[GAL] Sentry is disabled because VITE_SENTRY_DSN is not configured.`
- Verify the build environment exported `VITE_SENTRY_DSN`

## File Structure

```
src/
├── popup/               # Extension popup
│   ├── App.tsx         # Main app logic
│   ├── main.tsx        # Entry point
│   └── index.html      # HTML template
├── content/            # Content scripts (injected)
│   ├── FloatingWidget.tsx
│   └── content.tsx
├── background/         # Service worker
│   └── service-worker.ts
├── components/         # Shared components
│   ├── CommandCard.tsx
│   ├── CommandList.tsx
│   └── LoginView.tsx
├── lib/               # Core utilities
│   ├── api.ts         # API client
│   └── storage.ts     # Chrome storage
└── styles/            # Global styles
    ├── globals.css
    └── content.css
```

## Build Output

```
dist/
├── popup.html          # Popup HTML
├── background.js       # Service worker
├── content.js          # Content script
├── manifest.json       # Extension manifest
├── icons/              # Extension icons
└── assets/             # Bundled JS/CSS
```

## Release Process

1. Update version in `package.json` and `manifest.json`
2. Build: `pnpm build`
3. Test manually in Chrome
4. Package: `pnpm package` (creates `gal-extension.zip`)
5. Upload to Chrome Web Store

## Architecture Notes

### OAuth Flow

1. User clicks "Sign in with GitHub" in popup
2. Extension calls `/auth/github` to get OAuth URL
3. `chrome.identity.launchWebAuthFlow` opens OAuth popup
4. User authorizes on GitHub
5. API redirects to callback with token
6. Extension stores token in Chrome storage
7. Token included in subsequent API requests

### Storage

- **Chrome Storage API** for persistence (not localStorage)
- Isolated per-extension (secure)
- Survives browser restarts
- Keys: `authToken`, `userId`, `userLogin`, `selectedOrg`, etc.

### Content Script Injection

- Runs in isolated world (can't access page JS)
- Can modify DOM and inject UI
- Communicates with background via `chrome.runtime.sendMessage`
- Styles injected inline to avoid CSP issues

## TypeScript

Strict mode enabled. No `any` types allowed (warn only).

## Linting

```bash
pnpm lint
```

Fix issues before committing.
