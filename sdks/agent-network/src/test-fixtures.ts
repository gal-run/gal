/**
 * Test Fixtures for Enterprise Agent Card Validation
 *
 * Provides valid and invalid test fixtures for unit tests.
 */

import {
  type EnterpriseAgentCard,
  A2A_SCHEMA_VERSION,
} from './enterprise-agent-card.js'

export const VALID_MINIMAL_AGENT_CARD: EnterpriseAgentCard = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Test Agent',
  description: 'A minimal test agent for validation',
  url: 'https://test.example.com:443',
  preferredTransport: 'grpc',
  version: '1.0.0',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  capabilities: {},
  authentication: {
    schemes: ['bearer'],
  },
  skills: [
    {
      id: 'test.skill',
      name: 'Test Skill',
      description: 'A test skill',
    },
  ],
  'x-enterprise': {
    tenantId: 'test-tenant',
    serviceId: 'test.agent',
    owner: {
      team: 'Test Team',
      contact: 'test@example.com',
    },
  },
}

export const VALID_FULL_AGENT_CARD: EnterpriseAgentCard = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Full Test Agent',
  description: 'A fully specified test agent with all optional fields',
  url: 'https://full-test.example.com:443',
  preferredTransport: 'jsonrpc',
  version: '2.1.0-beta.1',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
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
      id: 'full.skill.read',
      name: 'Read Data',
      description: 'Read data from the agent',
      tags: ['read', 'data'],
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
        },
        required: ['id'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          data: { type: 'object' },
        },
      },
    },
    {
      id: 'full.skill.write',
      name: 'Write Data',
      description: 'Write data to the agent',
      tags: ['write', 'data'],
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          data: { type: 'object' },
        },
        required: ['id', 'data'],
      },
    },
  ],
  additionalInterfaces: [
    {
      protocolId: 'grpc',
      transportProtocol: 'grpc',
      uri: 'https://grpc.full-test.example.com:443',
      metadata: {
        protoPackage: 'test.agent.v1',
        serviceName: 'TestAgent',
      },
    },
    {
      protocolId: 'rest',
      transportProtocol: 'rest',
      uri: 'https://api.full-test.example.com/v1',
    },
  ],
  documentationUrl: 'https://docs.full-test.example.com',
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json', 'text/markdown'],
  'x-enterprise': {
    tenantId: 'full-test-tenant',
    serviceId: 'full.test.agent',
    auditLevel: 'full',
    dataClassification: 'confidential',
    owner: {
      team: 'Full Test Team',
      contact: 'full-test@example.com',
    },
    slo: {
      responseTime: '250ms',
      availability: 99.95,
    },
    allowedCallers: ['gal.policy', 'stratus.status'],
  },
}

export const INVALID_MISSING_NAME = {
  schemaVersion: A2A_SCHEMA_VERSION,
  description: 'Missing name field',
  url: 'https://test.example.com',
  preferredTransport: 'grpc',
  version: '1.0.0',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  authentication: { schemes: ['bearer'] },
  skills: [{ id: 'test.skill', name: 'Test', description: 'Test' }],
  'x-enterprise': {
    tenantId: 'test',
    serviceId: 'test.agent',
    owner: { team: 'Test', contact: 'test@example.com' },
  },
}

export const INVALID_WRONG_SCHEMA_VERSION = {
  schemaVersion: '0.2.0',
  name: 'Test Agent',
  description: 'Wrong schema version',
  url: 'https://test.example.com',
  preferredTransport: 'grpc',
  version: '1.0.0',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  authentication: { schemes: ['bearer'] },
  skills: [{ id: 'test.skill', name: 'Test', description: 'Test' }],
  'x-enterprise': {
    tenantId: 'test',
    serviceId: 'test.agent',
    owner: { team: 'Test', contact: 'test@example.com' },
  },
}

export const INVALID_INVALID_URL = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Test Agent',
  description: 'Invalid URL',
  url: 'not-a-valid-url',
  preferredTransport: 'grpc',
  version: '1.0.0',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  authentication: { schemes: ['bearer'] },
  skills: [{ id: 'test.skill', name: 'Test', description: 'Test' }],
  'x-enterprise': {
    tenantId: 'test',
    serviceId: 'test.agent',
    owner: { team: 'Test', contact: 'test@example.com' },
  },
}

export const INVALID_INVALID_TRANSPORT = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Test Agent',
  description: 'Invalid transport',
  url: 'https://test.example.com',
  preferredTransport: 'websocket',
  version: '1.0.0',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  authentication: { schemes: ['bearer'] },
  skills: [{ id: 'test.skill', name: 'Test', description: 'Test' }],
  'x-enterprise': {
    tenantId: 'test',
    serviceId: 'test.agent',
    owner: { team: 'Test', contact: 'test@example.com' },
  },
}

export const INVALID_INVALID_VERSION = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Test Agent',
  description: 'Invalid version',
  url: 'https://test.example.com',
  preferredTransport: 'grpc',
  version: 'not-semver',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  authentication: { schemes: ['bearer'] },
  skills: [{ id: 'test.skill', name: 'Test', description: 'Test' }],
  'x-enterprise': {
    tenantId: 'test',
    serviceId: 'test.agent',
    owner: { team: 'Test', contact: 'test@example.com' },
  },
}

export const INVALID_MISSING_PROVIDER = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Test Agent',
  description: 'Missing provider',
  url: 'https://test.example.com',
  preferredTransport: 'grpc',
  version: '1.0.0',
  authentication: { schemes: ['bearer'] },
  skills: [{ id: 'test.skill', name: 'Test', description: 'Test' }],
  'x-enterprise': {
    tenantId: 'test',
    serviceId: 'test.agent',
    owner: { team: 'Test', contact: 'test@example.com' },
  },
}

export const INVALID_EMPTY_SKILLS = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Test Agent',
  description: 'Empty skills array',
  url: 'https://test.example.com',
  preferredTransport: 'grpc',
  version: '1.0.0',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  authentication: { schemes: ['bearer'] },
  skills: [],
  'x-enterprise': {
    tenantId: 'test',
    serviceId: 'test.agent',
    owner: { team: 'Test', contact: 'test@example.com' },
  },
}

export const INVALID_SKILL_MISSING_ID = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Test Agent',
  description: 'Skill missing id',
  url: 'https://test.example.com',
  preferredTransport: 'grpc',
  version: '1.0.0',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  authentication: { schemes: ['bearer'] },
  skills: [{ name: 'Test', description: 'Test' }],
  'x-enterprise': {
    tenantId: 'test',
    serviceId: 'test.agent',
    owner: { team: 'Test', contact: 'test@example.com' },
  },
}

export const INVALID_AUTH_EMPTY_SCHEMES = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Test Agent',
  description: 'Empty auth schemes',
  url: 'https://test.example.com',
  preferredTransport: 'grpc',
  version: '1.0.0',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  authentication: { schemes: [] },
  skills: [{ id: 'test.skill', name: 'Test', description: 'Test' }],
  'x-enterprise': {
    tenantId: 'test',
    serviceId: 'test.agent',
    owner: { team: 'Test', contact: 'test@example.com' },
  },
}

export const INVALID_AUTH_INVALID_SCHEME = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Test Agent',
  description: 'Invalid auth scheme',
  url: 'https://test.example.com',
  preferredTransport: 'grpc',
  version: '1.0.0',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  authentication: { schemes: ['invalid-scheme'] },
  skills: [{ id: 'test.skill', name: 'Test', description: 'Test' }],
  'x-enterprise': {
    tenantId: 'test',
    serviceId: 'test.agent',
    owner: { team: 'Test', contact: 'test@example.com' },
  },
}

export const INVALID_MISSING_ENTERPRISE = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Test Agent',
  description: 'Missing enterprise extension',
  url: 'https://test.example.com',
  preferredTransport: 'grpc',
  version: '1.0.0',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  authentication: { schemes: ['bearer'] },
  skills: [{ id: 'test.skill', name: 'Test', description: 'Test' }],
}

export const INVALID_ENTERPRISE_MISSING_SERVICE_ID = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Test Agent',
  description: 'Missing serviceId',
  url: 'https://test.example.com',
  preferredTransport: 'grpc',
  version: '1.0.0',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  authentication: { schemes: ['bearer'] },
  skills: [{ id: 'test.skill', name: 'Test', description: 'Test' }],
  'x-enterprise': {
    tenantId: 'test',
    owner: { team: 'Test', contact: 'test@example.com' },
  },
}

export const INVALID_ENTERPRISE_MISSING_OWNER = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Test Agent',
  description: 'Missing owner',
  url: 'https://test.example.com',
  preferredTransport: 'grpc',
  version: '1.0.0',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  authentication: { schemes: ['bearer'] },
  skills: [{ id: 'test.skill', name: 'Test', description: 'Test' }],
  'x-enterprise': {
    tenantId: 'test',
    serviceId: 'test.agent',
  },
}

export const INVALID_INTERFACE_INVALID_URI = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Test Agent',
  description: 'Invalid interface URI',
  url: 'https://test.example.com',
  preferredTransport: 'grpc',
  version: '1.0.0',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  authentication: { schemes: ['bearer'] },
  skills: [{ id: 'test.skill', name: 'Test', description: 'Test' }],
  additionalInterfaces: [
    {
      protocolId: 'rest',
      transportProtocol: 'rest',
      uri: 'not-a-valid-uri',
    },
  ],
  'x-enterprise': {
    tenantId: 'test',
    serviceId: 'test.agent',
    owner: { team: 'Test', contact: 'test@example.com' },
  },
}

export const INVALID_INVALID_AUDIT_LEVEL = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Test Agent',
  description: 'Invalid audit level',
  url: 'https://test.example.com',
  preferredTransport: 'grpc',
  version: '1.0.0',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  authentication: { schemes: ['bearer'] },
  skills: [{ id: 'test.skill', name: 'Test', description: 'Test' }],
  'x-enterprise': {
    tenantId: 'test',
    serviceId: 'test.agent',
    auditLevel: 'invalid',
    owner: { team: 'Test', contact: 'test@example.com' },
  },
}

export const INVALID_INVALID_DATA_CLASSIFICATION = {
  schemaVersion: A2A_SCHEMA_VERSION,
  name: 'Test Agent',
  description: 'Invalid data classification',
  url: 'https://test.example.com',
  preferredTransport: 'grpc',
  version: '1.0.0',
  provider: {
    organization: 'Test Org',
    url: 'https://test.example.com',
  },
  authentication: { schemes: ['bearer'] },
  skills: [{ id: 'test.skill', name: 'Test', description: 'Test' }],
  'x-enterprise': {
    tenantId: 'test',
    serviceId: 'test.agent',
    dataClassification: 'secret',
    owner: { team: 'Test', contact: 'test@example.com' },
  },
}

export const INVALID_NOT_OBJECT = 'not an object'

export const INVALID_NULL = null

export const INVALID_EMPTY_OBJECT = {}
