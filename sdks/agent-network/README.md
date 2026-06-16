# GAL Agent Network

Home for the GAL Agent Fabric: GAL enterprise agent-network and
service-as-software network contracts.

This repo owns how GAL-compatible agents collaborate across products. Product
APIs remain the source of truth for product behavior. The Agent Card,
capability, task, identity, audit, and status definitions are bundled in this
package as self-contained contracts; this repo provides network
interoperability, transport profiles, adapter metadata, and compatibility
helpers used by A2A, MCP, CLI, dashboard, and service SDK implementations.

## GAL Naming Boundary

In this repo, **GAL** means the GAL ecosystem and operating umbrella, not only
the `example.com` governance-lawyer product.

`example.com` is one GAL product form and can be a participant in the fabric. The
Agent Network is the communications fabric that lets multiple deployed
GAL-compatible agents coordinate across product boundaries.

That means the fabric can connect `example.com` governance/legal agents, Stratus
infrastructure service agents, Business Ops agents, ops-triage agents, and
future workforce/role agents without making all of them the same product.

## Scope

- Network interoperability profile for GAL-compatible agents.
- Self-contained GAL-compatible agent definition contracts with compatibility aliases for the v0.x migration window.
- Service SDK helpers for creating, authorizing, and transitioning auditable network tasks.
- Swarm wave ledger event transport envelopes that reuse the shared task and artifact contracts.
- A2A/MCP descriptor helpers and future generated client packages.
- GAL-operated agent communications fabric goals: [docs/goals.md](docs/goals.md)

## Non-Goals

- Product domain logic.
- GAL dashboard/API deployment ownership.
- CLI/npm/Homebrew distribution.
- VS Code or browser-extension marketplace publishing.

## Operations

- [Governance](docs/governance.md)
- [Goals](docs/goals.md)
- [Actions policy](docs/actions-policy.md)
- [Release runbook](docs/release-runbook.md)
- [Health and status contracts](docs/status-contracts.md)
- [Transport interoperability profile](docs/transport-profile.md)
