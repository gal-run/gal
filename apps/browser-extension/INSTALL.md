# Installation Guide

## For Users

### Install from Chrome Web Store (Coming Soon)

1. Visit the Chrome Web Store
2. Search for "GAL - Governance Agentic Layer"
3. Click "Add to Chrome"
4. Follow the prompts to complete installation

### Manual Installation (Development/Testing)

1. Download the latest release ZIP from GitHub
2. Extract the ZIP file
3. Open Chrome and go to `chrome://extensions/`
4. Enable "Developer mode" (top-right toggle)
5. Click "Load unpacked"
6. Select the extracted `dist/` folder
7. Extension should now appear in your toolbar

## For Developers

### First-Time Setup

```bash
# Clone the repository
git clone https://github.com/your-org/gal.git
cd gal/apps/chrome-extension

# Install dependencies
pnpm install

# Copy icons from dist to public (one-time)
mkdir -p public/icons
cp dist/icons/* public/icons/

# Build the extension
pnpm build
```

### Load in Chrome

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select the `dist/` folder in `apps/chrome-extension/`
5. Extension loaded! Click the icon to start

### Development Mode

```bash
# Watch mode (rebuilds on file changes)
pnpm dev

# After changes, go to chrome://extensions/ and click "Reload" on the GAL extension
```

## First Use

1. Click the GAL extension icon in your toolbar
2. Click "Sign in with GitHub"
3. Authorize the GAL app (first time only)
4. Select your organization from the dropdown
5. Browse and search commands
6. Click copy button to copy command to clipboard

## Using on Supported Sites

Visit any supported site:
- claude.ai
- chatgpt.com
- gemini.google.com
- github.com
- midjourney.com
- ideogram.ai
- leonardo.ai
- runwayml.com
- pika.art

You'll see:
1. **Floating green button** (bottom-right corner)
2. **Keyboard shortcut**: Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)

Click the button or use the shortcut to open the command palette!

## Troubleshooting

### "Not trusted by Enhanced Safe Browsing" Warning

When installing the GAL extension from the Chrome Web Store, Chrome may display a yellow badge warning:

> "This extension is not trusted by Enhanced Safe Browsing."

**This warning can appear on newer or low-trust extensions and does not mean the extension failed Chrome Web Store review.**

#### Why this happens

Chrome's Enhanced Safe Browsing (ESB) feature flags extensions that have not yet built enough trust with Google. Chrome requires the publisher Google account to have Two Step Verification enabled before publishing or updating extensions, and Google may also consider the extension's age and compliance history before the warning clears.

#### What to do

- Verify the publisher name in the Chrome Web Store listing.
- Click **"Continue to install"** to proceed if you trust the publisher.
- See [Chrome Extension Trust Operations](../../docs/operations/chrome-extension-trust.md) for the publisher-side follow-up that must happen outside the repo.

#### Enterprise users (Enhanced Safe Browsing enforced by policy)

If your organization enforces ESB via Chrome policy and the warning blocks installation, an IT administrator can whitelist the extension by its Chrome Web Store extension ID in the Chrome Enterprise admin console under **Apps & Extensions**.

---

### "Enable on this site" Prompt

For some lower-frequency AI platforms, GAL requests site access the first time you use the extension on that domain.

1. Open the GAL popup
2. Click **Enable on this site**
3. Allow the Chrome permission prompt
4. Reload the page

### Extension Not Loading

- Ensure you selected the `dist/` folder, not the root `chrome-extension/` folder
- Check Chrome DevTools console for errors
- Try rebuilding: `pnpm build`

### Commands Not Showing

- Check you're signed in (click extension icon)
- Verify you have an organization selected
- Check network requests in DevTools for API errors

### Floating Button Not Appearing

- Verify the site is in the supported list
- Check the site permissions in `chrome://extensions/`
- Look for console errors (F12 → Console)

### OAuth Not Working

- Check your API URL is correct
- Verify GitHub App is configured properly
- Try logout and login again

## Permissions

The extension requires these permissions:

- **storage**: Save auth session across browser restarts
- **activeTab**: Read current tab URL for platform detection
- **scripting**: Inject floating widget into pages
- **host_permissions**: Core sites needed at install time (GAL + primary chat surfaces)
- **optional_permissions**: `cookies` and `downloads` are requested on demand when used
- **optional_host_permissions**: Additional AI platforms are requested per-site at runtime ("Enable on this site")

These are standard for browser extensions and required for the features to work.

## Privacy

The extension:
- ✅ Only stores auth tokens in Chrome storage (isolated)
- ✅ Only communicates with GAL API (api.gal.run)
- ✅ Does not track browsing history
- ✅ Does not access page content (except to inject widget)
- ✅ Does not send data to third parties

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/gal/issues
- Documentation: https://docs.gal.run
- Email: support@gal.run
