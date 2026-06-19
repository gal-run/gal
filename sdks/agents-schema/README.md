# GAL Agents

Canonical contract definitions for GAL-compatible agents.

This package defines **what an agent is**: the Agent Card, capabilities,
delegated task contracts, identity, scopes, artifacts, health/status responses,
and the validation helpers that go with them. It intentionally does **not**
define how agents are discovered, routed, governed, queued, credentialed, or
executed.

## GAL Naming Boundary

In this repo, **GAL** means the broader GAL ecosystem, brand, and compatibility
layer. A GAL-compatible agent can be a governance/legal agent, an infrastructure
service agent, an operations agent, or a future workforce/role agent. This
package defines the common shape they all share.

## Install

```bash
npm install @gal-run/gal-agents
```

## Usage

```ts
import {
  GAL_AGENT_CARD_SCHEMA_VERSION,
  validateGalAgentCard,
  isGalAgentTaskState,
  type GalAgentCard,
} from '@gal-run/gal-agents'

const card: GalAgentCard = {
  schemaVersion: GAL_AGENT_CARD_SCHEMA_VERSION,
  // ...agent definition
}

validateGalAgentCard(card)
```

## What this package exports

- **Schema versions** — `gal.agent-card.v1`, `gal.agent-task.v1`,
  `gal.agent-health.v1`, `gal.agent-status.v1`.
- **Type definitions** — `GalAgentCard`, `GalAgentCapability`, `GalAgentTask`,
  `GalAgentHealthResponse`, `GalAgentStatusResponse`, and the supporting
  identity, auth, artifact, governance, and SLO types.
- **State machines** — task, health, and component state constants plus the
  `isGalAgent*State` runtime guards.
- **Validation** — `validateGalAgentCard` enforces the canonical Agent Card
  invariants.
- **Governed swarm role cards** — `GAL_SWARM_WORKER_AGENT_CARD`,
  `GAL_SWARM_VERIFIER_AGENT_CARD`, and `GAL_SWARM_RECONCILER_AGENT_CARD`
  (see [docs/swarm-roles.md](docs/swarm-roles.md)).

## Boundary

`@gal-run/gal-agents` owns agent definitions only.

If this package owned runtime execution, routing, credentials, or deployment, it
would force every agent into one operational model. Keeping it definition-only
lets the same agent contract work across many execution paths — HTTP/A2A
endpoints, CLI commands, queue workers, background sessions, jobs, MCP-backed
services, and product-specific adapters.

An Agent Card may *describe* endpoints and supported runtimes, but this package
does not deploy or operate them.

## Development

```bash
npm install
npm run build      # tsc -> dist/
npm test           # vitest run
npm run type-check # tsc --noEmit
```

## License

[Apache-2.0](LICENSE)
