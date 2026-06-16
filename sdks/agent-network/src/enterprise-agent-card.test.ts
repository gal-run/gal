import { describe, expect, it } from 'vitest'

import {
  A2A_SCHEMA_VERSION,
  type EnterpriseAgentCard,
} from './enterprise-agent-card.js'
import {
  assertValidEnterpriseAgentCard,
  getInterfaceByProtocol,
  getSkillById,
  isCallerAllowed,
  isValidEnterpriseAgentCard,
  validateEnterpriseAgentCard,
} from './enterprise-agent-card-validation.js'
import {
  BUSINESS_OPS_ADMIN_CARD,
  EXAMPLE_AGENT_CARDS,
  GAL_POLICY_AGENT_CARD,
  PILOTLIGHT_AGENT_CARD,
  STRATUS_STATUS_AGENT_CARD,
} from './example-agent-cards.js'
import {
  INVALID_AUTH_EMPTY_SCHEMES,
  INVALID_AUTH_INVALID_SCHEME,
  INVALID_EMPTY_OBJECT,
  INVALID_EMPTY_SKILLS,
  INVALID_ENTERPRISE_MISSING_OWNER,
  INVALID_ENTERPRISE_MISSING_SERVICE_ID,
  INVALID_INTERFACE_INVALID_URI,
  INVALID_INVALID_AUDIT_LEVEL,
  INVALID_INVALID_DATA_CLASSIFICATION,
  INVALID_INVALID_TRANSPORT,
  INVALID_INVALID_URL,
  INVALID_INVALID_VERSION,
  INVALID_MISSING_ENTERPRISE,
  INVALID_MISSING_NAME,
  INVALID_MISSING_PROVIDER,
  INVALID_NOT_OBJECT,
  INVALID_NULL,
  INVALID_SKILL_MISSING_ID,
  INVALID_WRONG_SCHEMA_VERSION,
  VALID_FULL_AGENT_CARD,
  VALID_MINIMAL_AGENT_CARD,
} from './test-fixtures.js'

describe('Enterprise Agent Card Types', () => {
  it('defines the A2A schema version constant', () => {
    expect(A2A_SCHEMA_VERSION).toBe('0.3.0')
  })
})

describe('validateEnterpriseAgentCard', () => {
  describe('valid cards', () => {
    it('accepts a minimal valid agent card', () => {
      const result = validateEnterpriseAgentCard(VALID_MINIMAL_AGENT_CARD)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('accepts a fully specified agent card', () => {
      const result = validateEnterpriseAgentCard(VALID_FULL_AGENT_CARD)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })

    it('accepts all example GAL service cards', () => {
      for (const card of EXAMPLE_AGENT_CARDS) {
        const result = validateEnterpriseAgentCard(card)
        expect(result.valid, `Card ${card.name} should be valid`).toBe(true)
        expect(result.errors, `Card ${card.name} should have no errors`).toEqual([])
      }
    })
  })

  describe('invalid cards', () => {
    it('rejects non-object values', () => {
      expect(validateEnterpriseAgentCard(INVALID_NOT_OBJECT).valid).toBe(false)
      expect(validateEnterpriseAgentCard(INVALID_NULL).valid).toBe(false)
      expect(validateEnterpriseAgentCard(INVALID_EMPTY_OBJECT).valid).toBe(false)
    })

    it('rejects missing required name', () => {
      const result = validateEnterpriseAgentCard(INVALID_MISSING_NAME)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('name is required and must be a non-empty string')
    })

    it('rejects wrong schema version', () => {
      const result = validateEnterpriseAgentCard(INVALID_WRONG_SCHEMA_VERSION)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('schemaVersion must be "0.3.0"')
    })

    it('rejects invalid URL', () => {
      const result = validateEnterpriseAgentCard(INVALID_INVALID_URL)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('url is required and must be a valid URL')
    })

    it('rejects invalid transport', () => {
      const result = validateEnterpriseAgentCard(INVALID_INVALID_TRANSPORT)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('preferredTransport must be one of: grpc, jsonrpc, rest')
    })

    it('rejects invalid semver version', () => {
      const result = validateEnterpriseAgentCard(INVALID_INVALID_VERSION)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('version is required and must be a valid semver string')
    })

    it('rejects missing provider', () => {
      const result = validateEnterpriseAgentCard(INVALID_MISSING_PROVIDER)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('provider is required and must be an object')
    })

    it('rejects empty skills array', () => {
      const result = validateEnterpriseAgentCard(INVALID_EMPTY_SKILLS)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('skills is required and must be a non-empty array')
    })

    it('rejects skill missing id', () => {
      const result = validateEnterpriseAgentCard(INVALID_SKILL_MISSING_ID)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('skills[0].id is required')
    })

    it('rejects empty auth schemes', () => {
      const result = validateEnterpriseAgentCard(INVALID_AUTH_EMPTY_SCHEMES)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('authentication.schemes is required and must be a non-empty array')
    })

    it('rejects invalid auth scheme', () => {
      const result = validateEnterpriseAgentCard(INVALID_AUTH_INVALID_SCHEME)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('invalid scheme'))).toBe(true)
    })

    it('rejects missing enterprise extension', () => {
      const result = validateEnterpriseAgentCard(INVALID_MISSING_ENTERPRISE)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('x-enterprise extension is required for enterprise agents')
    })

    it('rejects missing enterprise serviceId', () => {
      const result = validateEnterpriseAgentCard(INVALID_ENTERPRISE_MISSING_SERVICE_ID)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('x-enterprise.serviceId is required')
    })

    it('rejects missing enterprise owner', () => {
      const result = validateEnterpriseAgentCard(INVALID_ENTERPRISE_MISSING_OWNER)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('x-enterprise.owner is required')
    })

    it('rejects invalid interface URI', () => {
      const result = validateEnterpriseAgentCard(INVALID_INTERFACE_INVALID_URI)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('uri must be a valid URL'))).toBe(true)
    })

    it('rejects invalid audit level', () => {
      const result = validateEnterpriseAgentCard(INVALID_INVALID_AUDIT_LEVEL)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('x-enterprise.auditLevel must be one of: full, minimal, none')
    })

    it('rejects invalid data classification', () => {
      const result = validateEnterpriseAgentCard(INVALID_INVALID_DATA_CLASSIFICATION)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain(
        'x-enterprise.dataClassification must be one of: public, internal, confidential, restricted',
      )
    })
  })
})

describe('assertValidEnterpriseAgentCard', () => {
  it('does not throw for valid cards', () => {
    expect(() => assertValidEnterpriseAgentCard(VALID_MINIMAL_AGENT_CARD)).not.toThrow()
  })

  it('throws for invalid cards', () => {
    expect(() => assertValidEnterpriseAgentCard(INVALID_MISSING_NAME)).toThrow(
      'Invalid Enterprise Agent Card',
    )
  })
})

describe('isValidEnterpriseAgentCard', () => {
  it('returns true for valid cards', () => {
    expect(isValidEnterpriseAgentCard(VALID_MINIMAL_AGENT_CARD)).toBe(true)
  })

  it('returns false for invalid cards', () => {
    expect(isValidEnterpriseAgentCard(INVALID_MISSING_NAME)).toBe(false)
  })
})

describe('getSkillById', () => {
  it('returns skill when found', () => {
    const skill = getSkillById(GAL_POLICY_AGENT_CARD, 'policy.approve')
    expect(skill).toBeDefined()
    expect(skill?.name).toBe('Approve Policy')
  })

  it('returns undefined when not found', () => {
    const skill = getSkillById(GAL_POLICY_AGENT_CARD, 'nonexistent.skill')
    expect(skill).toBeUndefined()
  })
})

describe('getInterfaceByProtocol', () => {
  it('returns interface when found', () => {
    const iface = getInterfaceByProtocol(GAL_POLICY_AGENT_CARD, 'rest')
    expect(iface).toBeDefined()
    expect(iface?.uri).toBe('https://agent.example.com/v1/agent/policy')
  })

  it('returns undefined when not found', () => {
    const iface = getInterfaceByProtocol(PILOTLIGHT_AGENT_CARD, 'rest')
    expect(iface).toBeUndefined()
  })
})

describe('isCallerAllowed', () => {
  it('allows all callers when allowedCallers includes wildcard', () => {
    expect(isCallerAllowed(GAL_POLICY_AGENT_CARD['x-enterprise'], 'any.service')).toBe(true)
  })

  it('allows specific callers in the list', () => {
    expect(isCallerAllowed(BUSINESS_OPS_ADMIN_CARD['x-enterprise'], 'gal.policy')).toBe(true)
    expect(isCallerAllowed(BUSINESS_OPS_ADMIN_CARD['x-enterprise'], 'stratus.status')).toBe(true)
  })

  it('blocks callers not in the list', () => {
    expect(isCallerAllowed(BUSINESS_OPS_ADMIN_CARD['x-enterprise'], 'unknown.service')).toBe(false)
  })

  it('allows all callers when allowedCallers is undefined', () => {
    const metadata = { ...PILOTLIGHT_AGENT_CARD['x-enterprise'] }
    delete (metadata as Record<string, unknown>).allowedCallers
    expect(isCallerAllowed(metadata, 'any.service')).toBe(true)
  })
})

describe('example agent cards', () => {
  it('GAL Policy Agent has correct structure', () => {
    expect(GAL_POLICY_AGENT_CARD.name).toBe('GAL Policy Agent')
    expect(GAL_POLICY_AGENT_CARD.skills).toHaveLength(3)
    expect(GAL_POLICY_AGENT_CARD['x-enterprise'].serviceId).toBe('gal.policy')
  })

  it('Stratus Status Agent has correct structure', () => {
    expect(STRATUS_STATUS_AGENT_CARD.name).toBe('Stratus Status Agent')
    expect(STRATUS_STATUS_AGENT_CARD.skills).toHaveLength(3)
    expect(STRATUS_STATUS_AGENT_CARD['x-enterprise'].serviceId).toBe('stratus.status')
  })

  it('Business Ops Admin has correct structure', () => {
    expect(BUSINESS_OPS_ADMIN_CARD.name).toBe('Business Ops Admin Agent')
    expect(BUSINESS_OPS_ADMIN_CARD.skills).toHaveLength(3)
    expect(BUSINESS_OPS_ADMIN_CARD['x-enterprise'].serviceId).toBe('business-ops.admin')
    expect(BUSINESS_OPS_ADMIN_CARD['x-enterprise'].allowedCallers).toEqual([
      'gal.policy',
      'stratus.status',
    ])
  })

  it('Pilotlight Agent has correct structure', () => {
    expect(PILOTLIGHT_AGENT_CARD.name).toBe('Pilotlight Agent')
    expect(PILOTLIGHT_AGENT_CARD.skills).toHaveLength(3)
    expect(PILOTLIGHT_AGENT_CARD['x-enterprise'].serviceId).toBe('pilotlight.onboard')
  })
})
