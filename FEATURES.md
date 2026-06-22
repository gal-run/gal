# Feature tiers & the `development` flag

gal organizes user-facing features into three tiers and gates not-yet-working
features behind a **`development` flag**, so the shipped surface only advertises
what actually works. This file is the source of truth for what is stable vs.
in-development — docs/UI claims should derive from it, and CI should fail if a
`development` feature is advertised as live.

## Tiers

| Tier | What | How it's gated |
|------|------|----------------|
| **convenience** | Works today: `gal hooks install` (git SDLC hooks), bundled MCP servers (`gal mcp terminal\|vision\|browser`), config discover/standardize/sync. | Shipped (stable). |
| **enforcement** | Policy enforcement — the C reference-monitor kernel and the PreToolUse blocking gate. Built and unit-tested but **not yet wired to a runnable command**. | `development` flag (off by default). |
| **enterprise** | EE / hosted-cloud features (`//go:build cloud` services, `ee/` packages). | Compile-time (`//go:build cloud`) + license. |

## The `development` flag

A feature whose status is **development** is **not advertised and not callable**
unless `GAL_DEVELOPMENT=1` (or `true`). This keeps the shipped surface honest:
nothing claims to work that doesn't.

- **Default (unset):** development features are hidden and rejected as if they do not exist.
- **`GAL_DEVELOPMENT=1`:** development features are surfaced — for contributors and testing.

First gate landed: `services/mcp-gateway` — its 10 MCP tools are stub implementations
(`// --- Tool implementations (stubs) ---`) returning hardcoded success. They are now
tagged `development` and hidden from `tools/list` + rejected by `tools/call` unless the
flag is set (see `mcp_development_test.go`).

## Current status (2026-06-22)

| Feature | Tier | Status |
|---------|------|--------|
| `gal hooks install` (git SDLC hooks) | convenience | stable |
| MCP servers (`gal mcp terminal\|vision\|browser`) | convenience | stable |
| config discover / standardize / sync | convenience | stable (hosted: needs an account) |
| mcp-gateway MCP tools (compliance, config, discovery, governance, memory, org, policy, session, swarm, team) | enforcement | **development** (stub implementations — gated) |
| per-tool blocking / PreToolUse gate / kernel runtime wiring | enforcement | **development** (built, not exposed by a command) |
| cloud control-plane services | enterprise | `//go:build cloud` |

> Roadmap: gate the remaining `development` surfaces (CLI `update`/`vscode`/`chrome`
> stubs, computer-use-mcp), derive docs/UI claims from this table, and add a CI guard
> that fails if a `development` feature is reachable un-flagged. See the v1.0
> stabilization goal.
