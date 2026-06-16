# GAL CLI

**Enterprise governance platform for AI coding agents.**

The GAL CLI enforces organizational AI agent policies, manages agent configurations,
runs MCP servers, and provides SDLC lifecycle management — all from the terminal.

## Quick Install

```bash
curl -fsSL https://gal.run/install.sh | sh
```

This downloads the latest release binary for your OS and architecture
and installs it to `/usr/local/bin/gal` (or `~/.local/bin/gal` if you do not
have sudo access).

After installing, verify it works:

```bash
gal --version
```

> **Note:** `https://gal.run/install.sh` will resolve once the GAL website is
> deployed. Until then, use the raw GitHub URL:
> ```bash
> curl -fsSL https://raw.githubusercontent.com/gal-run/gal-cli-oss/main/install.sh | sh
> ```

## Manual Install

1. Go to the [releases page](https://github.com/gal-run/gal-cli-oss/releases).
2. Download the archive for your platform:
   - `gal-x86_64-apple-darwin.tar.gz` — macOS Intel
   - `gal-aarch64-apple-darwin.tar.gz` — macOS Apple Silicon
   - `gal-x86_64-unknown-linux-gnu.tar.gz` — Linux AMD64
   - `gal-aarch64-unknown-linux-gnu.tar.gz` — Linux ARM64
3. Extract and install:
   ```bash
   tar -xzf gal-*.tar.gz
   sudo install -m 755 gal /usr/local/bin/gal
   ```

## Commands

The CLI ships **53 commands** covering every aspect of the GAL platform:

| Command | Description |
|---------|-------------|
| `auth` | Authenticate with GitHub |
| `sync` | Download latest approved config from your organization |
| `status` | Show current agent configuration status |
| `approved-config` | Manage approved agent configurations |
| `propose` | Propose new agent configurations |
| `join` | Join an organization |
| `agent-session` | Manage agent sessions |
| `queue` | Queue management |
| `workflow` | Workflow management |
| `admin` | Administrative operations |
| `discover` | Discover repos and AI configs across the organization |
| `scan` | Scan for AI agent configuration files |
| `approve` | Approve proposals and manage approvals |
| `audit` | Query and manage audit logs |
| `browser` | Browser profile management |
| `check` | Validate configurations and check health |
| `compliance` | Compliance reporting and auditing |
| `distribute` | Distribute configurations across the organization |
| `docs` | Generate documentation from configuration |
| `enforce` | Install enforcement hooks |
| `feedback` | Submit feedback to GAL |
| `fetch` | Fetch configuration and logs |
| `flags` | Manage feature flags |
| `fleet` | Manage fleet members |
| `governance` | Governance policy management |
| `hooks` | Install and manage git hooks |
| `init` | Initialize GAL in a project |
| `install` | Install or reinstall the GAL CLI |
| `maintain` | Maintenance operations |
| `memory` | Shared memory management |
| `ops` | Operational commands (orgs, sessions) |
| `policy` | Policy management |
| `protect` | Protection and guard rules |
| `quality` | Quality checks |
| `research` | Research operations |
| `run` | Run tasks and check their status |
| `sandbox` | Sandbox management and validation |
| `sdlc` | SDLC lifecycle management |
| `security` | Security scanning |
| `setup` | Setup wizard |
| `swarm` | Swarm orchestration |
| `template` | Template management |
| `test` | Test framework |
| `trigger` | Trigger management |
| `uninstall` | Uninstall GAL CLI |
| `update` | Update GAL CLI |
| `work` | Work item management |
| `workspace` | Workspace management |
| `terminal` | Terminal MCP server |
| `vision` | Vision MCP server |
| `vscode` | VS Code MCP server |
| `mcp` | MCP (Model Context Protocol) servers for AI coding agents |

## Authentication

`gal auth login` uses a GitHub OAuth loopback flow with a **fail-closed CSRF `state`
check** — the CLI binds to a random loopback port, sends a one-time `state` nonce, and
accepts the returned token only if the server echoes the **same** `state` back. This
requires a gal server that implements the loopback `state` echo. Hosted support on
`api.gal.run` is **rolling out**; until it lands, point `--api-url` / `GAL_API_URL` at a
server that supports it (self-hosted go-services `auth-svc`), or wait for the rollout.
The strict check is intentional: it prevents OAuth token-injection (login CSRF).

## MCP Servers

The CLI bundles **3 MCP servers** for AI coding agent integration:

- **Terminal** — PTY-based terminal session management (replaces `node-pty`)
- **Vision** — Image/video analysis via Gemini API
- **Browser** — Headless Chrome browser automation (replaces Playwright)

Run any MCP server with:
```bash
gal mcp terminal
gal mcp vision
gal mcp browser
```

## Build from Source

### Prerequisites

- [Rust](https://rustup.rs/) 1.75 or later

### Build

```bash
# Clone the repo
git clone https://github.com/gal-run/gal-cli-oss.git
cd gal-cli-oss

# Build release binary
cargo build --release

# The binary is at target/release/gal
./target/release/gal --version
```

### Cross-compile for other platforms

```bash
# macOS ARM (Apple Silicon)
cargo build --release --target aarch64-apple-darwin

# macOS Intel
cargo build --release --target x86_64-apple-darwin

# Linux AMD64
cargo build --release --target x86_64-unknown-linux-gnu

# Linux ARM64
cargo build --release --target aarch64-unknown-linux-gnu
```

## Migration from TypeScript CLI

This Rust CLI is the replacement for the previous TypeScript-based `@gal-run/cli`.
If you have the old version installed, uninstall it first:

```bash
npm uninstall -g @gal-run/cli
# or
yarn global remove @gal-run/cli
```

Then install the new CLI:

```bash
curl -fsSL https://gal.run/install.sh | sh
```

**Key differences:**

- **~5.8 MB** single static binary — no npm, Node.js, or dependency installation
- **3 integrated MCP servers** — no separate process management
- Self-updating via `gal update`
- Faster startup (no Node.js bootstrap delay)

## Release

New releases are published automatically via GitHub Actions when a tag matching
`v*` is pushed. See `.github/workflows/release.yml` for details.

To create a release manually:

```bash
./scripts/release.sh
```

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
