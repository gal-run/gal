<p align="center">
  <img src="../../hero-banner.png" alt="GAL - Governance Agentic Layer" width="700">
</p>

<p align="center">
  <a href="https://github.com/gal-run/gal/issues"><img src="https://img.shields.io/github/issues/gal-run/gal" alt="GitHub issues"></a>
  <a href="https://gal.run"><img src="https://img.shields.io/badge/docs-gal.run-blue" alt="Documentation"></a>
  <a href="https://status.scheduler-systems.com"><img src="https://img.shields.io/badge/status-scheduler--systems-green" alt="Service status"></a>
</p>

# GAL Console (legacy config app)

> Relocated from the repo root into `apps/console/` so the root is the monorepo,
> not the old app. This is the legacy config-document app (config-document
> resolver, schemas, examples). Deployed, not published. The canonical monorepo
> README lives at the [repo root](../../README.md).

The easiest way to govern your AI coding agents.

GAL provides centralized configuration management and governance for AI coding agents (Claude Code, Cursor, Windsurf, GitHub Copilot, and more) without disrupting your developers or requiring an architecture overhaul.

**[Get started free at app.gal.run](https://app.gal.run)**

## Service Status

GAL service health is published through the Scheduler Systems status page:

- **Status page:** [status.scheduler-systems.com](https://status.scheduler-systems.com)
- **Machine-readable status:** [status.scheduler-systems.com/status.json](https://status.scheduler-systems.com/status.json)
- **Component map:** [docs/status-components.md](../../docs/status-components.md)

Customer-facing status components currently include GAL API, GAL Code Gateway,
GLM Gateway, Agent Network, GAL-T, extension services, CLI distribution, and
release/update services. When GAL APIs report degraded service, product and
client surfaces should show service-degradation messaging instead of implying
user misconfiguration.

## CLI

Install:

```bash
curl -fsSL https://gal.run/install.sh | bash
```

Local mode:

```bash
# Discover your existing AI agent configs
gal scan

# Standardize them into ~/.gal/config.yaml
gal approve --local

# Distribute the canonical GAL config to your agents
gal sync
```

Org sync:

```bash
gal auth login
gal sync --pull
```

Update with your package manager:

```bash
brew upgrade gal
npm install -g @gal-run/cli@latest
pnpm add -g @gal-run/cli@latest
```

## MCP Server

GAL exposes an MCP server so your AI coding agent can access governance tools directly. Connect your agent to `https://api.gal.run/mcp`:

```json
{
  "mcpServers": {
    "gal": {
      "type": "streamable-http",
      "url": "https://api.gal.run/mcp"
    }
  }
}
```

Authentication is handled automatically via OAuth — your MCP client will be redirected to sign in on first use.

MCP client compatibility is broader than local CLI config support. The list below covers clients that can connect to GAL over MCP; the local CLI support matrix is listed separately under Supported Agents.

### MCP Client configuration

<details>
  <summary>Amp</summary>

Follow the <a href="https://ampcode.com/manual#mcp">Amp MCP guide</a> and use the config provided above.

</details>

<details>
  <summary>Claude Code</summary>

Add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "gal": {
      "type": "streamable-http",
      "url": "https://api.gal.run/mcp"
    }
  }
}
```

Or via CLI:

```bash
claude mcp add gal --type streamable-http https://api.gal.run/mcp
```

</details>

<details>
  <summary>Cline</summary>

Follow the <a href="https://docs.cline.bot/mcp/configuring-mcp-servers">Cline MCP guide</a> and use the config provided above.

</details>

<details>
  <summary>Codex</summary>

Follow the <a href="https://developers.openai.com/codex/mcp/#configure-with-the-cli">Codex MCP guide</a> and use the config provided above.

</details>

<details>
  <summary>Copilot CLI</summary>

Start Copilot CLI and run `/mcp add`, then configure:

- **Server name:** `gal`
- **Server Type:** `Remote (streamable-http)`
- **URL:** `https://api.gal.run/mcp`

</details>

<details>
  <summary>Copilot / VS Code</summary>

Add to your VS Code MCP settings (`.vscode/mcp.json`):

```json
{
  "servers": {
    "gal": {
      "type": "streamable-http",
      "url": "https://api.gal.run/mcp"
    }
  }
}
```

Or follow the <a href="https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server">VS Code MCP guide</a>.

</details>

<details>
  <summary>Cursor</summary>

Go to `Cursor Settings` > `MCP` > `Add new MCP server`. Use the config provided above.

</details>

<details>
  <summary>Gemini CLI</summary>

Follow the <a href="https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md">Gemini CLI MCP guide</a> and use the config provided above.

</details>

<details>
  <summary>Gemini Code Assist</summary>

Follow the <a href="https://cloud.google.com/gemini/docs/codeassist/use-agentic-chat-pair-programmer#configure-mcp-servers">Gemini Code Assist MCP guide</a> and use the config provided above.

</details>

<details>
  <summary>JetBrains AI Assistant & Junie</summary>

Go to `Settings | Tools | AI Assistant | Model Context Protocol (MCP)` > `Add`. Use the config provided above.

For Junie: `Settings | Tools | Junie | MCP Settings` > `Add`.

</details>

<details>
  <summary>Kiro</summary>

Open the IDE Activity Bar or go to `Settings` > `MCP Servers`. Use the config provided above.

</details>

<details>
  <summary>Warp</summary>

Go to `Settings | AI | Manage MCP Servers` > `+ Add`. Follow the <a href="https://docs.warp.dev/knowledge-and-collaboration/mcp#adding-an-mcp-server">Warp MCP guide</a> and use the config provided above.

</details>

<details>
  <summary>Windsurf</summary>

Follow the <a href="https://docs.windsurf.com/windsurf/cascade/mcp#mcp-config-json">Windsurf MCP guide</a> and use the config provided above.

</details>

## Local Model

The current local CLI model is:

- Workspace-scoped GAL config under `~/.gal/config.yaml`
- Repo-scoped overrides under `<repo>/.gal/config.yaml`
- Project overrides take precedence over workspace defaults
- Incremental publication of more local CLI source into this repository

See [docs/workspace-model.md](../../docs/workspace-model.md) for the current scope model and public extraction plan.

## Features

- **Local Scan**: Discover AI agent configs on your machine without auth or cloud setup
- **Local Standardize**: Merge discovered configs into a canonical `~/.gal/config.yaml`
- **Local Sync**: Distribute the canonical GAL config across Claude, Cursor, Copilot, Gemini, Codex, Windsurf, and more
- **MCP Server**: Connect any AI coding agent to your org's governance policies
- **Centralized Management**: One dashboard to manage configs for Claude Code, Cursor, Windsurf, and more
- **Policy Enforcement**: Define and enforce organization-wide standards
- **GitHub Integration**: Native GitHub App for repository discovery and org-backed sync

## Supported Agents

<!-- SUPPORTED_AGENTS_START -->
This table is for local CLI support. MCP client compatibility is broader and is documented separately in the MCP section above.

| Agent | Config Files | Local Scan | Local Sync | Memory |
|-------|-------------|-----------|-----------|--------|
| Claude Code | `.claude/`, `CLAUDE.md` | ✓ | ✓ | Native |
| Cursor | `.cursor/rules/`, `.cursorrules` | ✓ | ✓ | Via GAL |
| GitHub Copilot | `.github/copilot-instructions.md` | ✓ | ✓ | Via GAL |
| Gemini CLI | `.gemini/`, `GEMINI.md` | ✓ | ✓ | Via GAL |
| Codex (OpenAI) | `AGENTS.md` | ✓ | ✓ | Via GAL |
| Windsurf | `.windsurfrules`, `.codeium/windsurf/memories/` | ✓ | ✓ | Native |
| Antigravity | `.gemini/antigravity/` | ✓ | ✓ | Native |
| Amp | `AGENTS.md` | ✓ | ✓ | Via GAL |
<!-- SUPPORTED_AGENTS_END -->

## Documentation

Full documentation at [docs.gal.run](https://docs.gal.run)

## Dashboard

Access your organization's dashboard at [app.gal.run](https://app.gal.run)

## Service Status

Check service health at **[status.scheduler-systems.com](https://status.scheduler-systems.com)** — see [STATUS.md](../../STATUS.md) for component mapping.

## Support

- **Issues**: Use this repository for bug reports and feature requests
- **Discussions**: Community support and questions
- **Status**: Check [status.scheduler-systems.com](https://status.scheduler-systems.com) for service incidents
- **Email**: support@scheduler-systems.com
- **Enterprise**: For enterprise inquiries, contact sales@scheduler-systems.com

## About

GAL is built by [Scheduler Systems](https://scheduler-systems.com), which builds developer tools, scheduling software, and AI governance products.

## License

GAL is licensed under the Apache License 2.0 — see [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE).
