# Enterprise Agent Card Profile

This document defines the minimal enterprise Agent Card profile for GAL Agent Fabric participants.

All agents in the GAL ecosystem MUST expose an Agent Card conforming to this profile. The profile extends the A2A v0.3.0 specification with enterprise-specific requirements.

## Base Structure

```json
{
  "schemaVersion": "0.3.0",
  "name": "string - Human-readable agent name",
  "description": "string - What this agent does",
  "url": "string - Primary endpoint URL",
  "preferredTransport": "grpc | jsonrpc | rest",
  "additionalInterfaces": ["AgentInterface"],
  "version": "string - Agent implementation version",
  "capabilities": "AgentCapabilities",
  "authentication": "SecurityScheme",
  "skills": ["AgentSkill"],
  "provider": "AgentProvider",
  "documentationUrl": "string - Optional docs link",
  "defaultInputModes": ["string"],
  "defaultOutputModes": ["string"],
  "extensions": ["AgentExtension"],
  "x-enterprise": "EnterpriseMetadata"
}
```

## Required Fields

### Core Identity

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schemaVersion` | string | Yes | MUST be `"0.3.0"` for A2A compatibility |
| `name` | string | Yes | Human-readable name, e.g., `"GAL Policy Agent"` |
| `description` | string | Yes | One-sentence capability summary |
| `url` | string | Yes | Primary service endpoint |
| `preferredTransport` | string | Yes | One of: `grpc`, `jsonrpc`, `rest` |
| `version` | string | Yes | SemVer of agent implementation |

### Provider Information

```json
{
  "provider": {
    "organization": "Example Org",
    "url": "https://example.com"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `provider.organization` | string | Yes | Owning organization name |
| `provider.url` | string | Yes | Organization URL |

### Capabilities

```json
{
  "capabilities": {
    "streaming": true,
    "pushNotifications": true,
    "stateTransitionHistory": true
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `streaming` | boolean | No | false | Supports SSE/gRPC streaming |
| `pushNotifications` | boolean | No | false | Supports webhook callbacks |
| `stateTransitionHistory` | boolean | No | false | Returns task history |

### Authentication

```json
{
  "authentication": {
    "schemes": ["bearer"]
  }
}
```

Enterprise agents MUST declare authentication requirements. Supported schemes:

| Scheme | Use Case |
|--------|----------|
| `bearer` | OAuth 2.0 / JWT tokens |
| `basic` | Username/password (internal only) |
| `apikey` | API key header |
| `mtls` | Mutual TLS |

### Skills

Each skill represents a distinct capability the agent can perform.

```json
{
  "skills": [
    {
      "id": "policy.approve",
      "name": "Approve Policy",
      "description": "Approve a policy proposal for enforcement",
      "tags": ["policy", "governance", "approval"],
      "inputSchema": {
        "type": "object",
        "properties": {
          "policyId": { "type": "string" },
          "comment": { "type": "string" }
        },
        "required": ["policyId"]
      },
      "outputSchema": {
        "type": "object",
        "properties": {
          "approved": { "type": "boolean" },
          "effectiveAt": { "type": "string", "format": "date-time" }
        }
      }
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique skill identifier, dot-notation recommended |
| `name` | string | Yes | Human-readable skill name |
| `description` | string | Yes | What this skill does |
| `tags` | string[] | No | Categories for discovery |
| `inputSchema` | JSON Schema | No | Expected input shape |
| `outputSchema` | JSON Schema | No | Expected output shape |

## Enterprise Extension (`x-enterprise`)

The `x-enterprise` extension adds enterprise-specific metadata:

```json
{
  "x-enterprise": {
    "tenantId": "string - Tenant/organization ID",
    "serviceId": "string - Unique service identifier",
    "auditLevel": "full | minimal | none",
    "dataClassification": "public | internal | confidential | restricted",
    "owner": {
      "team": "string - Owning team name",
      "contact": "string - Contact email or Slack"
    },
    "slo": {
      "responseTime": "string - Target response time, e.g., '500ms'",
      "availability": "number - Target availability %, e.g., 99.9"
    },
    "allowedCallers": ["string - List of allowed service IDs, or '*' for all"]
  }
}
```

### Enterprise Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tenantId` | string | Yes | Tenant/organization scope for multi-tenant |
| `serviceId` | string | Yes | Unique identifier within the GAL fabric |
| `auditLevel` | string | No | Audit detail level (default: `minimal`) |
| `dataClassification` | string | No | Data sensitivity level (default: `internal`) |
| `owner.team` | string | Yes | Owning team for operational contacts |
| `owner.contact` | string | Yes | Contact for issues/questions |
| `slo.responseTime` | string | No | Target response time for synchronous ops |
| `slo.availability` | number | No | Target availability percentage |
| `allowedCallers` | string[] | No | Service IDs allowed to call (default: `["*"]`) |

## Transport Interfaces

### gRPC Interface (Preferred for Internal)

```json
{
  "additionalInterfaces": [
    {
      "protocolId": "grpc",
      "transportProtocol": "grpc",
      "uri": "https://grpc.example.com:443",
      "metadata": {
        "protoPackage": "gal.agent.v1",
        "serviceName": "PolicyAgent"
      }
    }
  ]
}
```

### JSON-RPC Interface (Standard A2A)

```json
{
  "additionalInterfaces": [
    {
      "protocolId": "jsonrpc",
      "transportProtocol": "jsonrpc",
      "uri": "https://example.com/a2a"
    }
  ]
}
```

### REST Interface (Compatibility)

```json
{
  "additionalInterfaces": [
    {
      "protocolId": "rest",
      "transportProtocol": "rest",
      "uri": "https://agent.example.com/v1/agent"
    }
  ]
}
```

## Full Example: GAL Policy Agent

```json
{
  "schemaVersion": "0.3.0",
  "name": "GAL Policy Agent",
  "description": "Enforce GAL governance policies across coding and background sessions",
  "url": "https://grpc.example.com:443",
  "preferredTransport": "grpc",
  "version": "0.1.0",
  "provider": {
    "organization": "Example Org",
    "url": "https://example.com"
  },
  "capabilities": {
    "streaming": true,
    "pushNotifications": true,
    "stateTransitionHistory": true
  },
  "authentication": {
    "schemes": ["bearer"]
  },
  "skills": [
    {
      "id": "policy.list",
      "name": "List Policies",
      "description": "List all policies for a workspace",
      "tags": ["policy", "list", "read"],
      "inputSchema": {
        "type": "object",
        "properties": {
          "workspaceId": { "type": "string" },
          "status": { "type": "string", "enum": ["draft", "approved", "deprecated"] }
        },
        "required": ["workspaceId"]
      }
    },
    {
      "id": "policy.approve",
      "name": "Approve Policy",
      "description": "Approve a policy for enforcement",
      "tags": ["policy", "governance", "approval"],
      "inputSchema": {
        "type": "object",
        "properties": {
          "policyId": { "type": "string" },
          "comment": { "type": "string" }
        },
        "required": ["policyId"]
      }
    },
    {
      "id": "policy.check",
      "name": "Check Policy",
      "description": "Check if a work context is allowed by policy",
      "tags": ["policy", "compliance", "check"],
      "inputSchema": {
        "type": "object",
        "properties": {
          "workspaceId": { "type": "string" },
          "context": { "$ref": "#/definitions/WorkContext" }
        },
        "required": ["workspaceId", "context"]
      }
    }
  ],
  "additionalInterfaces": [
    {
      "protocolId": "jsonrpc",
      "transportProtocol": "jsonrpc",
      "uri": "https://example.com/a2a"
    },
    {
      "protocolId": "rest",
      "transportProtocol": "rest",
      "uri": "https://agent.example.com/v1/agent/policy"
    }
  ],
  "x-enterprise": {
    "tenantId": "*",
    "serviceId": "gal.policy",
    "auditLevel": "full",
    "dataClassification": "confidential",
    "owner": {
      "team": "GAL Core",
      "contact": "gal-core@example.com"
    },
    "slo": {
      "responseTime": "500ms",
      "availability": 99.9
    },
    "allowedCallers": ["*"]
  }
}
```

## Discovery

Agent Cards should be published at:

```
https://{service-domain}/.well-known/agent-card.json
```

For GAL fabric services, this resolves to:

- GAL Policy Agent: `https://example.com/.well-known/agent-card.json`
- Stratus Status Agent: `https://stratus.example.com/.well-known/agent-card.json`
- Business Ops Admin: `https://ops.example.com/.well-known/agent-card.json`

## Validation

All Agent Cards MUST validate against:

1. A2A v0.3.0 JSON Schema (from specification)
2. Enterprise profile JSON Schema (this document)
3. Organization-specific policy constraints

## Version Compatibility

| Agent Card Version | A2A Spec | Notes |
|-------------------|----------|-------|
| 0.1.0 | 0.3.0 | Initial enterprise profile |

Breaking changes to this profile will increment the minor version. Additive changes may increment patch version.

## References

- A2A Agent Card Specification: https://a2a-protocol.org/v0.3.0/specification/#5-agent-discovery-the-agent-card
- JSON Schema: https://json-schema.org/
- Issue: gal-run/agent-network#14
