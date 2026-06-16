# GAL MCP Server

Enterprise governance for AI coding agents. The GAL MCP server connects Claude Code, Cursor, Copilot, Codex, Windsurf, Cline, and Amp to your organization's GAL instance for policy enforcement and configuration management.

The supported stdio entrypoint is the public GAL CLI:

```bash
gal mcp server
```

## Getting Started

Add this to your MCP config:

```json
{
  "mcpServers": {
    "gal": {
      "command": "gal",
      "args": ["mcp", "server"]
    }
  }
}
```

> [!NOTE]
> `gal mcp server` reuses the authenticated GAL CLI on the machine, including
> `~/.gal/config.json` for auth and workspace selection.

## Setup by Client

<details>
<summary>Claude Code</summary>

**Via CLI (recommended):**

```bash
claude mcp add gal --scope user -- gal mcp server
```

**Or manually** — add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "gal": {
      "command": "gal",
      "args": ["mcp", "server"]
    }
  }
}
```

</details>

<details>
<summary>Cursor</summary>

Add to Cursor MCP settings (Settings → MCP → Edit Config):

```json
{
  "mcpServers": {
    "gal": {
      "command": "gal",
      "args": ["mcp", "server"]
    }
  }
}
```

</details>

<details>
<summary>Codex (OpenAI)</summary>

**Via CLI (recommended):**

```bash
codex mcp add gal -- gal mcp server
```

**Or manually** — add to `~/.codex/config.toml`:

```toml
[mcp_servers.gal]
command = "gal"
args = ["mcp", "server"]
```

</details>

<details>
<summary>GitHub Copilot</summary>

**Via CLI (recommended):**

Run `/mcp add` in GitHub Copilot CLI and follow the prompts to add:

```
name: gal
command: gal mcp server
```

**Or manually** — add to your IDE's Copilot MCP config (location varies by IDE):

```json
{
  "mcpServers": {
    "gal": {
      "command": "gal",
      "args": ["mcp", "server"]
    }
  }
}
```

</details>

<details>
<summary>Cline</summary>

Open Cline settings → MCP Servers → Add Server:

```json
{
  "mcpServers": {
    "gal": {
      "command": "gal",
      "args": ["mcp", "server"]
    }
  }
}
```

</details>

<details>
<summary>Windsurf</summary>

Add to Windsurf MCP settings (Windsurf → Settings → MCP):

```json
{
  "mcpServers": {
    "gal": {
      "command": "gal",
      "args": ["mcp", "server"]
    }
  }
}
```

</details>

<details>
<summary>Amp</summary>

**Via CLI (recommended):**

```bash
amp mcp add gal -- gal mcp server
```

**Or manually** — add to `~/.amp/mcp.json`:

```json
{
  "mcpServers": {
    "gal": {
      "command": "gal",
      "args": ["mcp", "server"]
    }
  }
}
```

</details>

## Requirements

- Node.js 20+
- A GAL account ([sign up at gal.run](https://gal.run))

## Available Tools

The GAL MCP server exposes the following tools to AI coding agents:

| Tool | Description |
|------|-------------|
| `gal_register_session` | Register agent session with GAL dashboard |
| `gal_claim_task` | Atomically claim a GitHub issue to prevent duplicate work |
| `gal_report_progress` | Report task progress and current branch |
| `gal_get_directives` | Check for instructions from orchestrator sessions |
| `gal_send_directive` | Send instructions to another agent session |
| `gal_dispatch_agent` | Spawn a new background agent |
| `gal_resume_session` | Resume a terminated background agent session with a new prompt |
| `gal_list_sessions` | List all active agent sessions |

## Documentation

Full documentation at [docs.gal.run](https://docs.gal.run).
