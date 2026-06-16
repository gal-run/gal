# GAL Terminal Use MCP

Terminal automation MCP server for AI agents via node-pty. Provides interactive terminal sessions, one-shot command execution, screenshots, and rendered terminal output.

## Tools

| Tool | Description |
|------|-------------|
| `gal-terminal-use_terminal_create_session` | Create a node-pty backed interactive terminal session |
| `gal-terminal-use_terminal_exec` | Run a one-shot command and wait for exit |
| `gal-terminal-use_terminal_write` | Write text into a terminal session |
| `gal-terminal-use_terminal_read` | Read buffered output from a session |
| `gal-terminal-use_terminal_wait_for` | Wait until output contains a substring |
| `gal-terminal-use_terminal_resize` | Resize a terminal session |
| `gal-terminal-use_terminal_list_sessions` | List active terminal sessions |
| `gal-terminal-use_terminal_close_session` | Close a session and release the PTY |
| `gal-terminal-use_terminal_screenshot` | Take a screenshot (macOS/Linux) returning base64 PNG |
| `gal-terminal-use_terminal_render` | Render session output with ANSI codes |

## Prerequisites

- Node.js >= 20.0.0
- macOS or Linux
- Python 3 (for node-pty native build)

## Installation

```bash
npm install @gal-run/gal-terminal-use-mcp
```

Or build from source:

```bash
pnpm install
pnpm run build
```

## Usage

Add to your GAL Code config (`.gal-code/gal-code.json`):

```json
{
  "mcp": {
    "gal-terminal-use": {
      "type": "local",
      "command": ["node", "/path/to/gal-terminal-use-mcp/dist/index.js"],
      "enabled": true
    }
  }
}
```

## Development

```bash
pnpm install
pnpm run build
pnpm start
```
