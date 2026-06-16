# ADR-001: A2A Protocol as Enterprise Agent Collaboration Baseline

## Status

Proposed

## Context

Example Org operates multiple products (GAL, Stratus, Business Ops Admin, Pilotlight) that currently function as isolated tools. Each product exposes its own API, dashboard, CLI, or MCP server, but lacks a standardized mechanism for inter-agent delegation and collaboration.

The enterprise requires every product to become a "service-as-software" - a deployed agent-facing service that can:
- Accept tasks from other agents
- Use its product API as the source of truth
- Collaborate with other services-as-software
- Return audited results with full provenance

Several agent communication protocols exist:
- **A2A (Agent-to-Agent Protocol)** - Open standard from Google/LinkedIn, v0.3.0
- **MCP (Model Context Protocol)** - Anthropic's tool/context protocol
- **OpenAI Agents SDK handoffs** - OpenAI's orchestration mechanism
- **Agent Network Protocol (openANP)** - Broader public-agent-network research

## Decision

Adopt **A2A Protocol v0.3.0** as the baseline for enterprise agent-to-agent communication within the GAL Agent Fabric.

### Rationale

1. **Purpose-fit for delegation**: A2A is explicitly designed for agent-to-agent task delegation, not just tool invocation. It provides Task lifecycle, status tracking, artifacts, and push notifications - exactly what enterprise service-to-service calls need.

2. **Transport flexibility**: A2A supports JSON-RPC 2.0, gRPC, and HTTP+JSON/REST. This allows:
   - gRPC as the first internal reference transport (typed boundaries, deadlines, streaming)
   - HTTP/JSON for compatibility with existing integrations
   - JSON-RPC for standard A2A clients

3. **Enterprise-ready security model**: A2A delegates auth to standard HTTP mechanisms (OAuth2, API keys), supports TLS, and aligns with existing enterprise identity infrastructure. No custom auth schemes required.

4. **Agent Cards for discovery**: The Agent Card provides a standardized metadata format for:
   - Identity and capabilities declaration
   - Authentication requirements
   - Skill/input schemas
   - Transport endpoints

5. **Opaque execution model**: A2A treats agents as opaque - they don't share internal state, memory, or tools. This matches our product boundary requirements where each product API remains the source of truth.

6. **Standard governance**: A2A is governed under The Linux Foundation with contributions from Google, LinkedIn, and others. It has a clear specification versioning process.

### Protocol Role Separation

| Protocol | Role | Scope |
|----------|------|-------|
| **A2A** | Enterprise delegation protocol | Cross-product task delegation, status, artifacts, audit |
| **MCP** | Tool/context interface | Model runtime access to tools, resources, prompts |
| **gRPC** | Internal transport | Typed service boundaries, deadlines, streaming (A2A binding) |
| **HTTP/JSON** | Compatibility transport | REST-style access for integrations (A2A binding) |

A2A and MCP are complementary:
- **A2A** = "Delegate this task to that agent, track progress, return artifacts"
- **MCP** = "Here are tools and context you can use right now"

## Consequences

### Positive

- Clear separation between delegation (A2A) and tool/context access (MCP)
- Standard Agent Card format enables consistent discovery and capability declaration
- Multiple transport options allow gradual internal migration to gRPC
- Alignment with industry standard reduces custom protocol debt
- Task lifecycle provides natural audit trail hooks

### Negative

- Learning curve for teams unfamiliar with A2A
- Must implement A2A server/adapter layer for each product
- gRPC proto definitions must stay synchronized with A2A semantics
- A2A is v0.3.0 - some spec churn expected

### Mitigations

- Create shared `@gal/agent-network` SDK helpers for A2A server/client
- Define enterprise Agent Card profile with required fields
- Document transport mapping patterns
- Monitor A2A spec evolution and contribute feedback

## Alternatives Considered

### Pure MCP for Everything

MCP is designed for tool/context access, not task delegation. It lacks:
- Task lifecycle management
- Push notifications
- Artifact management
- Multi-turn task coordination

Using MCP for delegation would require building these features on top, creating custom protocol debt.

### OpenAI Agents SDK Handoffs

OpenAI's handoff mechanism is:
- Tied to OpenAI's runtime
- Not an open wire protocol
- Designed for single-orchestrator scenarios

While useful for orchestration patterns, it's not suitable as the cross-enterprise wire protocol.

### Agent Network Protocol (openANP)

OpenANP focuses on broader public agent networks with:
- Decentralized identity
- Blockchain settlement
- Multi-operator governance

These features are out of scope for the centralized GAL fabric. A2A provides the needed delegation semantics without the extra complexity.

### Custom Protocol

Building a custom protocol would:
- Duplicate A2A's work
- Lack ecosystem tooling
- Require more documentation
- Increase onboarding friction

A2A's open governance and industry backing provide better long-term maintainability.

## Implementation Path

1. **Phase 1**: Define enterprise Agent Card profile (this ADR)
2. **Phase 2**: Implement A2A server skeleton in GAL API
3. **Phase 3**: Create first product adapter (Business Ops Admin → GAL)
4. **Phase 4**: Add gRPC transport for internal high-performance paths
5. **Phase 5**: Expand to additional products (Stratus, Pilotlight)

## References

- A2A Protocol v0.3.0 Specification: https://a2a-protocol.org/v0.3.0/specification/
- A2A Enterprise Features: https://a2a-protocol.org/v0.3.0/topics/enterprise-ready/
- A2A Agent Discovery: https://a2a-protocol.org/v0.3.0/topics/agent-discovery/
- MCP Specification: https://modelcontextprotocol.io/specification/2024-11-05/
- Issue: gal-run/agent-network#14
