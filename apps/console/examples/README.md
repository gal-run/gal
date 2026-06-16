# GAL Examples

This directory contains examples and guides for using GAL.

## Quick Start

```bash
# Install GAL
npm install -g @scheduler-systems/gal-run

# Authenticate
gal auth login

# Sync your organization's approved configuration
gal sync --pull
```

## MCP Server Setup (Copy-Paste)

Use stdio for file-based clients (recommended).

**Claude Code**

```bash
cat <<'JSON' > .mcp.json
{
  "mcpServers": {
    "gal": {
      "command": "npx",
      "args": ["-y", "@scheduler-systems/gal-mcp-session"]
    }
  }
}
JSON
```

**Cursor**

```bash
mkdir -p .cursor
cat <<'JSON' > .cursor/mcp.json
{
  "mcpServers": {
    "gal": {
      "command": "npx",
      "args": ["-y", "@scheduler-systems/gal-mcp-session"]
    }
  }
}
JSON
```

**Windsurf**

```bash
mkdir -p .windsurf
cat <<'JSON' > .windsurf/mcp_config.json
{
  "mcpServers": {
    "gal": {
      "command": "npx",
      "args": ["-y", "@scheduler-systems/gal-mcp-session"]
    }
  }
}
JSON
```

**Gemini CLI**

```bash
mkdir -p .gemini
cat <<'JSON' > .gemini/settings.json
{
  "mcpServers": {
    "gal": {
      "command": "npx",
      "args": ["-y", "@scheduler-systems/gal-mcp-session"]
    }
  }
}
JSON
```

**Codex (OAuth preferred)**

```bash
codex mcp add gal --url https://api.gal.run/mcp
codex mcp login gal
```

If OAuth login fails with `Dynamic client registration not supported`, use bearer-token mode:

```bash
export GAL_AUTH_TOKEN="$(gal auth token)"
codex mcp remove gal
codex mcp add gal --url https://api.gal.run/mcp --bearer-token-env-var GAL_AUTH_TOKEN
```

**Troubleshooting: `Tools: (none)`**

- Ensure `GAL_AUTH_TOKEN` is set in the environment that launches Codex.
- Re-run `codex mcp add ... --bearer-token-env-var GAL_AUTH_TOKEN` after exporting the token.
- Restart Codex after changing environment variables.

## Configuration Examples

After running `gal sync --pull`, your agent configuration will be updated:

**Claude Code**

```
~/.claude/
├── settings.json      # Approved permissions and settings
├── commands/          # Organization-approved commands
└── agents/            # Approved agent definitions
```

**Cursor**

```
~/.cursor/
├── rules/             # Organization rules
└── .cursorrules       # Cursor-specific rules
```

**Windsurf**

```
~/.windsurfrules       # Windsurf rules
```

**Gemini CLI**

```
~/.gemini/
└── settings.json      # Organization-approved settings
```

## Workspace Model Reference

The public repo also includes draft workspace and project config examples:

- [workspace-config.yaml](workspace-config.yaml)
- [project-config.yaml](project-config.yaml)

For reference merge behavior between workspace scope and repo overrides, see:

- [../docs/merge-rules.md](../docs/merge-rules.md)
- [../reference/resolve-config.mjs](../reference/resolve-config.mjs)

For reference filesystem helpers around workspace scope, project scope, and active workspace selection, see:

- [../reference/filesystem-helpers.mjs](../reference/filesystem-helpers.mjs)

For reference document I/O around workspace/project config files and sync-state sidecars, see:

- [../reference/config-documents.mjs](../reference/config-documents.mjs)

## Organization Setup

For administrators setting up GAL for your organization, see the [Admin Guide](https://docs.gal.run/admin).
