/**
 * Example Enterprise Agent Cards for GAL Services
 *
 * Reference implementations of Enterprise Agent Cards for services
 * in the GAL Agent Fabric.
 *
 * @see docs/enterprise-agent-card-profile.md
 */

import {
  type EnterpriseAgentCard,
  A2A_SCHEMA_VERSION,
} from './enterprise-agent-card.js'

export const GAL_POLICY_AGENT_CARD: EnterpriseAgentCard = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'GAL Policy Agent',
  description: 'Enforce GAL governance policies across coding and background sessions',
  url: 'https://grpc.example.com:443',
  preferredTransport: 'grpc',
  version: '0.1.0',
  provider: {
    organization: 'Example Org',
    url: 'https://example.com',
  },
  capabilities: {
    streaming: true,
    pushNotifications: true,
    stateTransitionHistory: true,
  },
  authentication: {
    schemes: ['bearer'],
  },
  skills: [
    {
      id: 'policy.list',
      name: 'List Policies',
      description: 'List all policies for a workspace',
      tags: ['policy', 'list', 'read'],
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'approved', 'deprecated'] },
        },
        required: ['workspaceId'],
      },
    },
    {
      id: 'policy.approve',
      name: 'Approve Policy',
      description: 'Approve a policy for enforcement',
      tags: ['policy', 'governance', 'approval'],
      inputSchema: {
        type: 'object',
        properties: {
          policyId: { type: 'string' },
          comment: { type: 'string' },
        },
        required: ['policyId'],
      },
    },
    {
      id: 'policy.check',
      name: 'Check Policy',
      description: 'Check if a work context is allowed by policy',
      tags: ['policy', 'compliance', 'check'],
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string' },
          context: {
            type: 'object',
            properties: {
              workType: { type: 'string' },
              repo: { type: 'string' },
              issueNumber: { type: 'number' },
              issueTitle: { type: 'string' },
            },
          },
        },
        required: ['workspaceId', 'context'],
      },
    },
  ],
  additionalInterfaces: [
    {
      protocolId: 'jsonrpc',
      transportProtocol: 'jsonrpc',
      uri: 'https://example.com/a2a',
    },
    {
      protocolId: 'rest',
      transportProtocol: 'rest',
      uri: 'https://agent.example.com/v1/agent/policy',
    },
  ],
  'x-enterprise': {
    tenantId: '*',
    serviceId: 'gal.policy',
    auditLevel: 'full',
    dataClassification: 'confidential',
    owner: {
      team: 'GAL Core',
      contact: 'gal-core@example.com',
    },
    slo: {
      responseTime: '500ms',
      availability: 99.9,
    },
    allowedCallers: ['*'],
  },
}

export const STRATUS_STATUS_AGENT_CARD: EnterpriseAgentCard = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Stratus Status Agent',
  description: 'Infrastructure status monitoring and incident management for GAL services',
  url: 'https://grpc.stratus.example.com:443',
  preferredTransport: 'grpc',
  version: '0.1.0',
  provider: {
    organization: 'Example Org',
    url: 'https://example.com',
  },
  capabilities: {
    streaming: true,
    pushNotifications: true,
    stateTransitionHistory: true,
  },
  authentication: {
    schemes: ['bearer', 'apikey'],
  },
  skills: [
    {
      id: 'status.get',
      name: 'Get Service Status',
      description: 'Get the current status of a service or infrastructure component',
      tags: ['status', 'monitoring', 'health'],
      inputSchema: {
        type: 'object',
        properties: {
          serviceId: { type: 'string' },
          includeDependencies: { type: 'boolean' },
        },
        required: ['serviceId'],
      },
    },
    {
      id: 'incident.create',
      name: 'Create Incident',
      description: 'Create a new incident for infrastructure issues',
      tags: ['incident', 'alert', 'create'],
      inputSchema: {
        type: 'object',
        properties: {
          serviceId: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['serviceId', 'severity', 'title'],
      },
    },
    {
      id: 'incident.update',
      name: 'Update Incident',
      description: 'Update an existing incident with new information',
      tags: ['incident', 'update'],
      inputSchema: {
        type: 'object',
        properties: {
          incidentId: { type: 'string' },
          status: { type: 'string', enum: ['investigating', 'identified', 'monitoring', 'resolved'] },
          message: { type: 'string' },
        },
        required: ['incidentId'],
      },
    },
  ],
  additionalInterfaces: [
    {
      protocolId: 'jsonrpc',
      transportProtocol: 'jsonrpc',
      uri: 'https://stratus.example.com/a2a',
    },
    {
      protocolId: 'rest',
      transportProtocol: 'rest',
      uri: 'https://api.stratus.example.com/v1/agent/status',
    },
  ],
  'x-enterprise': {
    tenantId: '*',
    serviceId: 'stratus.status',
    auditLevel: 'full',
    dataClassification: 'internal',
    owner: {
      team: 'GAL Infrastructure',
      contact: 'infra@example.com',
    },
    slo: {
      responseTime: '200ms',
      availability: 99.99,
    },
    allowedCallers: ['*'],
  },
}

export const BUSINESS_OPS_ADMIN_CARD: EnterpriseAgentCard = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Business Ops Admin Agent',
  description: 'Business operations and administrative task automation for GAL',
  url: 'https://grpc.ops.example.com:443',
  preferredTransport: 'grpc',
  version: '0.1.0',
  provider: {
    organization: 'Example Org',
    url: 'https://example.com',
  },
  capabilities: {
    streaming: true,
    pushNotifications: false,
    stateTransitionHistory: true,
  },
  authentication: {
    schemes: ['bearer'],
  },
  skills: [
    {
      id: 'billing.get',
      name: 'Get Billing Info',
      description: 'Retrieve billing information for a workspace',
      tags: ['billing', 'read', 'workspace'],
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string' },
          period: { type: 'string' },
        },
        required: ['workspaceId'],
      },
    },
    {
      id: 'usage.report',
      name: 'Generate Usage Report',
      description: 'Generate a usage report for a workspace',
      tags: ['usage', 'report', 'analytics'],
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string' },
          startDate: { type: 'string', format: 'date' },
          endDate: { type: 'string', format: 'date' },
        },
        required: ['workspaceId', 'startDate', 'endDate'],
      },
    },
    {
      id: 'workspace.list',
      name: 'List Workspaces',
      description: 'List all workspaces for an organization',
      tags: ['workspace', 'list', 'organization'],
      inputSchema: {
        type: 'object',
        properties: {
          organizationId: { type: 'string' },
        },
        required: ['organizationId'],
      },
    },
  ],
  additionalInterfaces: [
    {
      protocolId: 'rest',
      transportProtocol: 'rest',
      uri: 'https://api.ops.example.com/v1/agent',
    },
  ],
  'x-enterprise': {
    tenantId: '*',
    serviceId: 'business-ops.admin',
    auditLevel: 'minimal',
    dataClassification: 'confidential',
    owner: {
      team: 'Business Operations',
      contact: 'ops@example.com',
    },
    slo: {
      responseTime: '1s',
      availability: 99.5,
    },
    allowedCallers: ['gal.policy', 'stratus.status'],
  },
}

export const PILOTLIGHT_AGENT_CARD: EnterpriseAgentCard = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Pilotlight Agent',
  description: 'Quick-start and onboarding automation for new GAL users',
  url: 'https://grpc.pilotlight.example.com:443',
  preferredTransport: 'grpc',
  version: '0.1.0',
  provider: {
    organization: 'Example Org',
    url: 'https://example.com',
  },
  capabilities: {
    streaming: false,
    pushNotifications: true,
    stateTransitionHistory: false,
  },
  authentication: {
    schemes: ['bearer'],
  },
  skills: [
    {
      id: 'onboard.start',
      name: 'Start Onboarding',
      description: 'Begin the onboarding process for a new user',
      tags: ['onboarding', 'user', 'setup'],
      inputSchema: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          workspaceId: { type: 'string' },
        },
        required: ['userId', 'workspaceId'],
      },
    },
    {
      id: 'onboard.status',
      name: 'Get Onboarding Status',
      description: 'Check the status of a user onboarding flow',
      tags: ['onboarding', 'status'],
      inputSchema: {
        type: 'object',
        properties: {
          onboardingId: { type: 'string' },
        },
        required: ['onboardingId'],
      },
    },
    {
      id: 'quickstart.generate',
      name: 'Generate Quickstart Config',
      description: 'Generate initial configuration for a new workspace',
      tags: ['quickstart', 'config', 'setup'],
      inputSchema: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string' },
          template: { type: 'string', enum: ['default', 'enterprise', 'solo'] },
        },
        required: ['workspaceId'],
      },
    },
  ],
  additionalInterfaces: [
    {
      protocolId: 'jsonrpc',
      transportProtocol: 'jsonrpc',
      uri: 'https://pilotlight.example.com/a2a',
    },
  ],
  'x-enterprise': {
    tenantId: '*',
    serviceId: 'pilotlight.onboard',
    auditLevel: 'minimal',
    dataClassification: 'internal',
    owner: {
      team: 'GAL Core',
      contact: 'gal-core@example.com',
    },
    allowedCallers: ['*'],
  },
}

export const EXAMPLE_AGENT_CARDS: EnterpriseAgentCard[] = [
  GAL_POLICY_AGENT_CARD,
  STRATUS_STATUS_AGENT_CARD,
  BUSINESS_OPS_ADMIN_CARD,
  PILOTLIGHT_AGENT_CARD,
]
