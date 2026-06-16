# Service SDK Boundary

The GAL agent-network repo owns network interoperability contracts and adapter helpers.

## Source Of Truth Rule

Product APIs remain the source of truth for product behavior. The bundled
agent definition contracts in this package define what a GAL-compatible agent
is. This repo defines how agents advertise over the network, accept delegated
tasks through network adapters, report state, return artifacts, and preserve
auditability across transports.

GAL-compatible does not mean every agent belongs to the `example.com`
governance-lawyer product. `example.com`, Stratus, Business Ops, ops-triage,
finance, development, sales, support, and other GAL forms keep their own product
or workforce behavior. The SDK should provide portable network envelopes and
helpers without importing any one product identity as the default.

## First Consumers

- product and service APIs
- infrastructure service agents
- future CLI, MCP, and A2A adapters

## Package Surface

`@gal-run/agent-network` is published under Apache-2.0.

It now exposes:

- compatibility aliases over the bundled Agent Card and task lifecycle contracts
- health and status response contracts
- `createGalServiceSdk(...)` for Agent Card validation, task creation, task transitions, scope checks, health/status responses, MCP descriptor derivation, and A2A adapter metadata
- `createGalHttpJsonAgentClient(...)` for product adapters that expose Agent
  Card discovery and delegated task creation through authenticated HTTP/JSON
- `GalSwarmWaveLedgerEnvelope` and related event metadata types for carrying
  swarm wave ledger events across transports without defining persistence
- bridge interfaces for direct API execution, queue workers, and Gal Code background sessions

The bridge interfaces are intentionally dependency-injected. Consumers supply the real runtime, queue, or API implementation. The bundled agent definition contracts own the stable agent definition shape; this package owns network interoperability; product repos own their product APIs and runtime wiring.

## Runtime Boundary

The SDK must not import Google ADK, OpenAI Agents SDK, provider SDKs, or product-specific domain code. Those remain optional adapters or product implementations outside this package.

The SDK may describe a Gal Code background-session bridge because GAL owns that runtime path, but it must receive the actual launcher from the consumer. This keeps the shared package portable while ensuring consumers do not duplicate task/runtime glue.

## HTTP/JSON Client Boundary

`createGalHttpJsonAgentClient(...)` is the reusable client for the centralized
fabric to call deployed product/service agents such as Stratus.

The client owns only transport mechanics:

- normalized Agent Card fetches;
- delegated task creation;
- bearer/service-token headers supplied by the caller;
- request and correlation ID forwarding;
- `{ task, agentCard }` response normalization;
- structured HTTP error metadata.

It does not own product scopes, product credentials, product domain behavior, or
retry orchestration. Those remain in the GAL control plane and the product
runtime.

## Swarm Wave Ledger Boundary

Swarm wave ledger contracts in this package are transport envelopes only. They
name wave, lease, worker, event, task correlation, parent task, artifact, and
evidence metadata so products and runtimes can exchange event records
consistently. The ledger database, retention policy, replay model, and
idempotency storage remain owned by the runtime or product that persists the
events.
