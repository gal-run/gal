# Transport Interoperability Profile

This profile defines the `v0.1.0` transport semantics for Agent Network services.
Product APIs remain the source of truth. `@gal/agents` defines the canonical
Agent Card and task contracts. A2A, gRPC, HTTP/JSON, GraphQL, MCP, and CLI
surfaces are adapters over those product APIs and must not create separate
business logic.

## Operation Classes

Use synchronous reads when the operation is fast, side-effect free, and can
return a complete answer inside the caller deadline. Use task delegation for
long-running, mutating, audited, or agent-executed work.

| Class | Examples | Required behavior |
| --- | --- | --- |
| Synchronous read | status lookup, capability discovery, readiness check | Return directly with request or correlation ID |
| Delegated task | policy change, deployment action, background session, cross-product status proof | Create a `GalServiceTask`, persist audit state, and expose progress and final outcome |
| Streaming task | long-running agent execution, probe run with intermediate evidence | Stream progress events only after the durable task exists |

## Transport Semantics

| Transport | Role | Semantics | Non-goals |
| --- | --- | --- | --- |
| `a2a` | Enterprise agent delegation protocol | Task creation, status polling, progress events, artifacts, cancellation, and final outcome | Direct product database access or dashboard-specific workflows |
| `grpc` | First internal reference transport where typed boundaries help | Typed methods, explicit deadlines, status codes, cancellation, and optional server streaming | Locking the contract to a single wire format |
| `http_json` | Compatibility path for product integrations and automation | REST-style `POST` task creation, `GET` task status, JSON status output, retry headers | Replacing A2A as the enterprise delegation model |
| `graphql` | Query and typed product API adapter | Read-heavy product capability access through existing product resolvers | Owning task execution state outside `GalServiceTask` |
| `mcp` | Tool/context access for model runtimes | Tools and resources that call the same product API or Agent Network task endpoints | Acting as the cross-enterprise delegation protocol |
| `cli` | Human and agent command interface | Non-interactive commands over product API or Agent Network task endpoints | Embedding product business logic in command handlers |

## Deadlines And Cancellation

Every delegated task request must include or derive a deadline. Adapters should
reject work that cannot be started before the deadline and should mark running
tasks as `canceled` when caller-initiated cancellation is accepted. Cancellation
must be audited with actor identity and reason.

## Retries And Idempotency

Task creation should support idempotency keys where the caller may retry after a
network failure. Retried requests with the same key and input should return the
existing task. Retried requests with conflicting input must fail safely and
include the original correlation ID when available.

## Auth And Audit

All transports must preserve:

- caller identity
- callee service ID
- delegated scopes
- authorization method
- correlation ID
- request ID when available
- task transition actor and reason
- artifact and evidence references

Adapters must not log tokens, prompts, tool arguments, tenant secrets, signed
URLs, or unredacted upstream responses.

## Swarm Wave Ledger Events

Swarm wave ledger events use `GalSwarmWaveLedgerEnvelope` as a portable
transport envelope for append-only event streams. The envelope carries `waveId`,
optional `leaseId` and `workerId`, `eventType`, task correlation metadata,
artifact references, and evidence references.

The envelope intentionally reuses `GalServiceTask`, `GalServiceArtifact`,
`GalServiceActorIdentity`, task state, correlation ID, and parent task ID
contracts. It does not define persistence, storage indexes, replay semantics, or
ledger ownership. Runtimes that persist wave events should store the envelope as
transport evidence around the existing task contract rather than creating a
second task model.

## HTTP/JSON Agent Client

`@gal/agent-network` exports `createGalHttpJsonAgentClient(...)` as the shared
HTTP/JSON caller primitive for product/service agents.

The minimum interoperable product adapter exposes:

- `GET /api/agent-network/agent-card`
- `POST /api/agent-network/tasks`

The client forwards `Authorization: Bearer <token>` when the caller supplies a
service token, plus `X-Request-ID` and `X-Correlation-ID` when available. Task
responses should return either a raw `GalServiceTask` or `{ task, agentCard }`.
Non-2xx responses should return safe JSON with `code` and `error` or `message`.
If the server sends `Retry-After`, the client preserves it on
`GalHttpJsonAgentClientError`.

The first deployed proof of this profile is the GAL API to Stratus
`stratus.control` fleet-status task path. Future product/service agents should
use the same client shape instead of hand-rolling request and response handling.

## Product Issue Gate Contract

`@gal/agent-network` defines `business-ops.product-issue-gate.evaluate` as the
shared task contract for product-status issue-gate decisions. Existing Business
Ops Admin `/issue-gate` responses remain HTTP/JSON compatibility records, but
callers should normalize them with `normalizeProductStatusIssueGateRecord(...)`
before surfacing enforcement decisions. The normalized contract carries a stable
decision, reason code, human message, required actions, classification, product
mapping, and issue identity so CLI, MCP, dashboard, HTTP/JSON, and future gRPC
adapters render the same policy result.

## Runtime Boundaries

`gal-run/gal-agents` owns the shared agent definition contracts and package
artifacts. `gal-run/agent-network` owns network interoperability contracts and
transport profiles. GAL runtime owns service endpoints, queue/session execution,
policy enforcement, and audit hooks. Product repos such as Stratus own
product-specific adapters that expose domain capabilities through the shared
contract.

## v0.1.0 Compatibility Notes

- `GalServiceTransport` values are stable for the internal `v0.1.0` release.
- The task lifecycle is the common state model across A2A, gRPC, and HTTP/JSON.
- Runtime health endpoints are described by the health/status contracts but are
  implemented by GAL or product adapters.
- Stratus adapter work should wait for this package artifact, then map one
  Stratus capability through the shared task contract without duplicating
  backend business logic.
