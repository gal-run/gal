# gal-ide-use-mcp-oss

GAL IDE Use MCP server — VS Code automation for AI agents via Playwright Electron.

Provides MCP tools for launching VS Code, executing commands, clicking text, reading content, taking screenshots, and installing extensions.

## Install

```bash
npm install
npm run build
```

## Usage

Run via stdio transport:

```bash
node dist/index.js
```

Or configure in your MCP client.

## Tools

- `gal-ide-use_launch` — Launch VS Code via Electron automation
- `gal-ide-use_run_command` — Execute a command palette command
- `gal-ide-use_click_text` — Click visible workbench text
- `gal-ide-use_get_text` — Read visible text from the window
- `gal-ide-use_screenshot` — Capture screenshot of the VS Code window
- `gal-ide-use_get_gal_status` — Return status bar text mentioning GAL
- `gal-ide-use_install_extension` — Install a VS Code extension
- `gal-ide-use_close` — Close the automation session

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
