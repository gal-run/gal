/**
 * Enterprise Agent Card Validation Utilities
 *
 * Validates Agent Cards against A2A v0.3.0 schema and enterprise profile requirements.
 *
 * @see docs/enterprise-agent-card-profile.md
 */

import {
  type A2ATransport,
  type AgentSkill,
  type AgentInterface,
  type EnterpriseAgentCard,
  type EnterpriseAgentCardValidationResult,
  type EnterpriseMetadata,
  A2A_SCHEMA_VERSION,
  isA2ATransport,
  isAuthScheme,
  isAuditLevel,
  isDataClassification,
} from './enterprise-agent-card.js'

export function validateEnterpriseAgentCard(card: unknown): EnterpriseAgentCardValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!isRecord(card)) {
    return { valid: false, errors: ['Agent Card must be an object'], warnings: [] }
  }

  validateCoreFields(card, errors)
  validateProvider(card, errors)
  validateCapabilities(card, warnings)
  validateAuthentication(card, errors)
  validateSkills(card, errors)
  validateInterfaces(card, errors)
  validateEnterpriseExtension(card, errors, warnings)

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateCoreFields(card: Record<string, unknown>, errors: string[]): void {
  if (card.schemaVersion !== A2A_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be "${A2A_SCHEMA_VERSION}"`)
  }

  if (typeof card.name !== 'string' || card.name.trim() === '') {
    errors.push('name is required and must be a non-empty string')
  }

  if (typeof card.description !== 'string' || card.description.trim() === '') {
    errors.push('description is required and must be a non-empty string')
  }

  if (typeof card.url !== 'string' || !isValidUrl(card.url)) {
    errors.push('url is required and must be a valid URL')
  }

  if (!isA2ATransport(card.preferredTransport)) {
    errors.push(`preferredTransport must be one of: grpc, jsonrpc, rest`)
  }

  if (typeof card.version !== 'string' || !isValidSemVer(card.version)) {
    errors.push('version is required and must be a valid semver string')
  }
}

function validateProvider(card: Record<string, unknown>, errors: string[]): void {
  const provider = card.provider

  if (!isRecord(provider)) {
    errors.push('provider is required and must be an object')
    return
  }

  if (typeof provider.organization !== 'string' || provider.organization.trim() === '') {
    errors.push('provider.organization is required')
  }

  if (typeof provider.url !== 'string' || !isValidUrl(provider.url)) {
    errors.push('provider.url is required and must be a valid URL')
  }
}

function validateCapabilities(card: Record<string, unknown>, warnings: string[]): void {
  const capabilities = card.capabilities

  if (!isRecord(capabilities)) {
    warnings.push('capabilities is recommended for declaring agent features')
    return
  }

  if (capabilities.streaming !== undefined && typeof capabilities.streaming !== 'boolean') {
    warnings.push('capabilities.streaming should be a boolean')
  }

  if (capabilities.pushNotifications !== undefined && typeof capabilities.pushNotifications !== 'boolean') {
    warnings.push('capabilities.pushNotifications should be a boolean')
  }

  if (capabilities.stateTransitionHistory !== undefined && typeof capabilities.stateTransitionHistory !== 'boolean') {
    warnings.push('capabilities.stateTransitionHistory should be a boolean')
  }
}

function validateAuthentication(card: Record<string, unknown>, errors: string[]): void {
  const authentication = card.authentication

  if (!isRecord(authentication)) {
    errors.push('authentication is required')
    return
  }

  const schemes = authentication.schemes

  if (!Array.isArray(schemes) || schemes.length === 0) {
    errors.push('authentication.schemes is required and must be a non-empty array')
    return
  }

  for (const scheme of schemes) {
    if (!isAuthScheme(scheme)) {
      errors.push(`authentication.schemes contains invalid scheme: ${String(scheme)}`)
    }
  }
}

function validateSkills(card: Record<string, unknown>, errors: string[]): void {
  const skills = card.skills

  if (!Array.isArray(skills) || skills.length === 0) {
    errors.push('skills is required and must be a non-empty array')
    return
  }

  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i]
    if (!isRecord(skill)) {
      errors.push(`skills[${i}] must be an object`)
      continue
    }

    validateSkill(skill, i, errors)
  }
}

function validateSkill(skill: Record<string, unknown>, index: number, errors: string[]): void {
  if (typeof skill.id !== 'string' || skill.id.trim() === '') {
    errors.push(`skills[${index}].id is required`)
  }

  if (typeof skill.name !== 'string' || skill.name.trim() === '') {
    errors.push(`skills[${index}].name is required`)
  }

  if (typeof skill.description !== 'string' || skill.description.trim() === '') {
    errors.push(`skills[${index}].description is required`)
  }

  if (skill.tags !== undefined && !isStringArray(skill.tags)) {
    errors.push(`skills[${index}].tags must be an array of strings`)
  }

  if (skill.inputSchema !== undefined && !isRecord(skill.inputSchema)) {
    errors.push(`skills[${index}].inputSchema must be an object`)
  }

  if (skill.outputSchema !== undefined && !isRecord(skill.outputSchema)) {
    errors.push(`skills[${index}].outputSchema must be an object`)
  }
}

function validateInterfaces(card: Record<string, unknown>, errors: string[]): void {
  const interfaces = card.additionalInterfaces

  if (interfaces === undefined) {
    return
  }

  if (!Array.isArray(interfaces)) {
    errors.push('additionalInterfaces must be an array')
    return
  }

  for (let i = 0; i < interfaces.length; i++) {
    const iface = interfaces[i]
    if (!isRecord(iface)) {
      errors.push(`additionalInterfaces[${i}] must be an object`)
      continue
    }

    validateInterface(iface, i, errors)
  }
}

function validateInterface(iface: Record<string, unknown>, index: number, errors: string[]): void {
  if (typeof iface.protocolId !== 'string' || iface.protocolId.trim() === '') {
    errors.push(`additionalInterfaces[${index}].protocolId is required`)
  }

  if (!isA2ATransport(iface.transportProtocol)) {
    errors.push(`additionalInterfaces[${index}].transportProtocol must be one of: grpc, jsonrpc, rest`)
  }

  if (typeof iface.uri !== 'string' || !isValidUrl(iface.uri)) {
    errors.push(`additionalInterfaces[${index}].uri must be a valid URL`)
  }
}

function validateEnterpriseExtension(
  card: Record<string, unknown>,
  errors: string[],
  warnings: string[],
): void {
  const enterprise = card['x-enterprise']

  if (!isRecord(enterprise)) {
    errors.push('x-enterprise extension is required for enterprise agents')
    return
  }

  validateEnterpriseMetadata(enterprise, errors, warnings)
}

function validateEnterpriseMetadata(
  metadata: Record<string, unknown>,
  errors: string[],
  warnings: string[],
): void {
  if (typeof metadata.tenantId !== 'string') {
    errors.push('x-enterprise.tenantId is required')
  }

  if (typeof metadata.serviceId !== 'string' || metadata.serviceId.trim() === '') {
    errors.push('x-enterprise.serviceId is required')
  }

  if (metadata.auditLevel !== undefined && !isAuditLevel(metadata.auditLevel)) {
    errors.push('x-enterprise.auditLevel must be one of: full, minimal, none')
  }

  if (metadata.dataClassification !== undefined && !isDataClassification(metadata.dataClassification)) {
    errors.push('x-enterprise.dataClassification must be one of: public, internal, confidential, restricted')
  }

  validateOwner(metadata, errors, warnings)

  validateSlo(metadata, warnings)

  validateAllowedCallers(metadata, warnings)
}

function validateOwner(metadata: Record<string, unknown>, errors: string[], warnings: string[]): void {
  const owner = metadata.owner

  if (!isRecord(owner)) {
    errors.push('x-enterprise.owner is required')
    return
  }

  if (typeof owner.team !== 'string' || owner.team.trim() === '') {
    errors.push('x-enterprise.owner.team is required')
  }

  if (typeof owner.contact !== 'string' || owner.contact.trim() === '') {
    errors.push('x-enterprise.owner.contact is required')
  }
}

function validateSlo(metadata: Record<string, unknown>, warnings: string[]): void {
  const slo = metadata.slo

  if (slo === undefined) {
    return
  }

  if (!isRecord(slo)) {
    warnings.push('x-enterprise.slo should be an object')
    return
  }

  if (slo.responseTime !== undefined && typeof slo.responseTime !== 'string') {
    warnings.push('x-enterprise.slo.responseTime should be a string')
  }

  if (slo.availability !== undefined) {
    if (typeof slo.availability !== 'number' || slo.availability < 0 || slo.availability > 100) {
      warnings.push('x-enterprise.slo.availability should be a number between 0 and 100')
    }
  }
}

function validateAllowedCallers(metadata: Record<string, unknown>, warnings: string[]): void {
  const allowedCallers = metadata.allowedCallers

  if (allowedCallers === undefined) {
    return
  }

  if (!isStringArray(allowedCallers)) {
    warnings.push('x-enterprise.allowedCallers should be an array of strings')
  }
}

function isValidUrl(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }

  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function isValidSemVer(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false
  }

  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
  return semverRegex.test(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function assertValidEnterpriseAgentCard(card: unknown): asserts card is EnterpriseAgentCard {
  const result = validateEnterpriseAgentCard(card)

  if (!result.valid) {
    throw new Error(`Invalid Enterprise Agent Card: ${result.errors.join('; ')}`)
  }
}

export function isValidEnterpriseAgentCard(card: unknown): card is EnterpriseAgentCard {
  return validateEnterpriseAgentCard(card).valid
}

export function getSkillById(card: EnterpriseAgentCard, skillId: string): AgentSkill | undefined {
  return card.skills.find((skill) => skill.id === skillId)
}

export function getInterfaceByProtocol(card: EnterpriseAgentCard, protocol: A2ATransport): AgentInterface | undefined {
  return card.additionalInterfaces?.find((iface) => iface.transportProtocol === protocol)
}

export function isCallerAllowed(metadata: EnterpriseMetadata, callerServiceId: string): boolean {
  const allowed = metadata.allowedCallers

  if (allowed === undefined || allowed.includes('*')) {
    return true
  }

  return allowed.includes(callerServiceId)
}
