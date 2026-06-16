# Agent Network Goals

`gal-run/agent-network` is the GAL Agent Fabric: the GAL-operated communications fabric for deployed agents.

It exists so GAL-compatible agents can discover, trust, address, delegate to, observe, and audit each other without moving product domain logic out of product APIs.

## Naming Boundary

GAL is the ecosystem and operating umbrella. `example.com` is one product form
inside that ecosystem, focused on governance/legal workflows.

The Agent Network should therefore be described as the GAL ecosystem fabric, not
as the `example.com` product itself. A deployed governance-lawyer agent from
`example.com` can use the fabric alongside Stratus, Business Ops, ops-triage,
finance, development, sales, support, and other product or workforce agents.

This keeps the organization naming coherent while preserving product boundaries:

- `gal-agents` defines the shared compatible-agent contracts;
- `agent-network` defines communication and coordination between deployed
  agents;
- `example.com` owns governance/legal product behavior;
- Stratus owns infrastructure product behavior;
- future GAL forms own their own product or workforce behavior.

## Primary Goal

Provide the shared communication and coordination layer for deployed GAL agents.

The fabric should own:

- agent registry and Agent Card lookup;
- routing and addressing;
- delegated task envelopes;
- task lifecycle, deadlines, cancellation, and retries;
- identity, delegated auth, scopes, and policy checks;
- progress and status events;
- artifact references and evidence links;
- audit and provenance records;
- A2A, HTTP/JSON, gRPC, MCP, CLI, dashboard, and SDK adapter metadata.

## Agent Types

The fabric must support both product/service agents and workforce agents, but
the rollout order matters.

Product or service agents are the first production target. They represent stable
product or service capabilities and usually sit in front of a real product API,
worker, queue, background session, or adapter.

Examples:

- `gal.policy`
- `gal.ops-triage`
- `stratus.status`
- `business-ops.lifecycle`
- `scheduler.intake`
- `financial.imports`

Workforce agents are employee-like role agents. They represent a job function,
such as development, sales, legal intake, finance operations, infrastructure
operations, or customer support. Workforce agents should use the fabric to
delegate to product/service agents instead of owning product domain logic
directly.

```text
workforce agent
        |
        v
GAL Agent Fabric
        |
        +--> product/service agent
        +--> product/service agent
        +--> product/service agent
```

The fastest production path is product/service agents first, then workforce
agents as orchestration callers on top of them.

## CLI And API Relationship

The fabric is not only about APIs, and CLI is related.

Product APIs remain the source of truth for product behavior. CLI, MCP,
dashboard, A2A, HTTP/JSON, gRPC, and SDK surfaces are adapters over the same
agent contract. A CLI command may be a valid way to invoke or operate an agent,
but it must not become a separate business-logic source of truth.

CLI adapters are useful for:

- local development and conformance checks;
- human-supervised operations;
- non-interactive automation;
- break-glass or maintenance paths;
- agents that are easiest to invoke through an existing command surface.

When a CLI participates in the fabric, it should produce structured task IDs,
status, artifacts, exit codes, and audit metadata. It should also preserve caller
identity, scopes, correlation IDs, deadlines, and policy decisions.

## Deployment Model

The production deployment model is centralized coordination with distributed execution.

```text
caller / product / agent
        |
        v
GAL Agent Fabric control plane
        |
        +--> GAL worker or Gal Code background session
        +--> Stratus adapter
        +--> Business Ops Admin adapter
        +--> ops-triage worker
        +--> future product agents
```

The fabric control plane should be deployed by GAL first, likely inside `gal-api` or a GAL-owned service. Product runtimes stay responsible for executing their own capabilities.

## Layer Responsibilities

- `gal-agents` defines what an agent is.
- `agent-network` defines how deployed agents communicate and coordinate.
- GAL runtime owns the first fabric control-plane implementation.
- Product runtimes own product-specific execution and adapters.
- Stratus is a participant in the fabric, not the owner of the whole fabric.

The repo package should provide contracts and SDK helpers. Runtime endpoints, queues, sessions, workers, and credentials belong in GAL or product runtime repos.

## Centralized First

The current production goal is not a decentralized public agent internet.

The correct first architecture is:

- centralized GAL-operated registry, routing, policy, task state, and audit;
- distributed execution in GAL and product runtimes;
- tamper-evident audit records and artifact hashes;
- no blockchain dependency.

This gives GAL operational control, clear policy enforcement, and fast internal adoption.

## Federation Later

Federated or decentralized agent networking is a separate future concern.

It may become useful if independent external operators need to coordinate agents without trusting one GAL-operated control plane. That future work belongs in the separate `agent-federation` research repo and should explore:

- cross-operator identity;
- signed task receipts;
- verifiable audit chains;
- third-party notarization;
- decentralized discovery;
- settlement or reputation only if a real external need appears.

Blockchain is not the current goal. The useful near-term property is tamper-evident provenance, which can be achieved with signed envelopes, append-only event logs, hash-linked records, artifact hashes, and immutable release/deploy evidence.

## OpenClaw Inspiration

OpenClaw is useful as product inspiration for:

- gateway-style ergonomics;
- local-first agent development;
- plugin or skill packaging;
- clear security posture;
- visible audit and operator controls.

Do not copy its one-user trust model into GAL production. GAL needs enterprise identity, delegated scopes, approvals, tenant-safe boundaries, audit, and runtime separation.

## First Vertical Slice

The next milestone should prove one real deployed internal agent end to end.

Preferred slice:

1. `gal.ops-triage` is defined in `gal-agents`.
2. A GAL-owned runtime executes at least one safe supervised triage task.
3. The deployed agent is registered or discoverable through the fabric.
4. A caller creates a delegated task through the fabric contract.
5. The fabric enforces scopes and records policy/audit context.
6. The runtime reports progress, artifacts, status, and final outcome.
7. Mutating actions require human approval or an explicit policy decision.

## Success Criteria

This repo is successful when:

- one deployed agent can call or delegate to another through the shared contract;
- the call is authenticated, authorized, auditable, and tied to durable task state;
- product APIs remain the source of truth for product behavior;
- adapters expose capabilities without duplicating domain logic;
- status, artifacts, and evidence can be traced across the full task lifecycle;
- federation and blockchain research do not block the centralized GAL fabric.

## Non-Goals

This repo must not own:

- canonical agent definition schemas;
- product domain logic;
- production execution of every agent;
- GAL dashboard or API deployment ownership;
- public marketplace publishing;
- blockchain consensus or token mechanics;
- decentralized multi-operator governance for the first production version.
