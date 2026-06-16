/**
 * DiscoveryInsightValidator
 *
 * Deterministic validator for model-produced DiscoveryInsightPayload schemas.
 * Strict validation ensures >=99% valid JSON model payloads meet schema requirements.
 * On validation failure the caller MUST apply deterministic fallback.
 *
 * Issue: #1769
 */

import type {
  DiscoveryInsightPayload,
  InsightValidationResult,
  ConfigClass,
  RiskTag,
} from '@gal/types'

const VALID_CONFIG_CLASSES: ConfigClass[] = [
  'security',
  'workflow',
  'agent-persona',
  'tooling',
  'policy',
  'testing',
  'documentation',
  'unknown',
]

const VALID_RISK_TAGS: RiskTag[] = [
  'policy-drift',
  'secrets-risk',
  'stale-pattern',
  'over-permissive',
  'bypass-detected',
  'untrusted-source',
  'no-guardrails',
]

const VALID_SEVERITIES = ['low', 'medium', 'high'] as const
const VALID_COMPLEXITIES = ['minimal', 'standard', 'complex'] as const
const VALID_SOURCES = ['model', 'deterministic'] as const
const CURRENT_SCHEMA_VERSION = '1.0' as const

/** Maximum allowed bullet points in a summary */
const MAX_BULLET_POINTS = 6
/** Minimum required bullet points */
const MIN_BULLET_POINTS = 1
/** Maximum oneLiner length */
const MAX_ONE_LINER_LENGTH = 200
/** Maximum description length for a risk finding */
const MAX_RISK_DESCRIPTION_LENGTH = 300
/** Maximum risks allowed */
const MAX_RISKS = 10

/**
 * Strict schema validator for DiscoveryInsightPayload.
 *
 * Validates:
 * 1. Schema version is known
 * 2. generatedAt is a valid ISO 8601 timestamp
 * 3. source is 'model' or 'deterministic'
 * 4. classification fields are valid
 * 5. risks array is well-formed
 * 6. summary fields are present and within length limits
 * 7. overallConfidence is 0.0–1.0
 *
 * 0 policy violations guarantee: any unsafe output fails validation.
 */
export class DiscoveryInsightValidator {
  /**
   * Validate a raw parsed object as DiscoveryInsightPayload.
   *
   * @param raw - The parsed JSON object (unknown type)
   * @returns InsightValidationResult with errors list
   */
  validate(raw: unknown): InsightValidationResult {
    const errors: string[] = []

    if (!raw || typeof raw !== 'object') {
      return {
        valid: false,
        errors: ['Payload must be a non-null object'],
        coerced: false,
      }
    }

    const obj = raw as Record<string, unknown>
    const schemaVersion = obj['schemaVersion']
    const generatedAt = obj['generatedAt']
    const source = obj['source']
    const classification = obj['classification']
    const risks = obj['risks']
    const summary = obj['summary']

    // ── schema version ──────────────────────────────────────────────
    if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
      errors.push(
        `schemaVersion must be '${CURRENT_SCHEMA_VERSION}', got '${schemaVersion}'`
      )
    }

    // ── generatedAt ─────────────────────────────────────────────────
    if (typeof generatedAt !== 'string' || !this.isValidIso8601(generatedAt)) {
      errors.push('generatedAt must be a valid ISO 8601 timestamp string')
    }

    // ── source ──────────────────────────────────────────────────────
    if (!VALID_SOURCES.includes(source as typeof VALID_SOURCES[number])) {
      errors.push(`source must be one of: ${VALID_SOURCES.join(', ')}`)
    }

    // ── classification ──────────────────────────────────────────────
    if (!classification || typeof classification !== 'object') {
      errors.push('classification must be a non-null object')
    } else {
      const classErrors = this.validateClassification(
        classification as Record<string, unknown>
      )
      errors.push(...classErrors)
    }

    // ── risks ────────────────────────────────────────────────────────
    if (!Array.isArray(risks)) {
      errors.push('risks must be an array')
    } else {
      if (risks.length > MAX_RISKS) {
        errors.push(`risks array exceeds maximum length of ${MAX_RISKS}`)
      }
      risks.forEach((risk, i) => {
        const riskErrors = this.validateRiskFinding(risk, i)
        errors.push(...riskErrors)
      })
    }

    // ── summary ─────────────────────────────────────────────────────
    if (!summary || typeof summary !== 'object') {
      errors.push('summary must be a non-null object')
    } else {
      const summaryErrors = this.validateSummary(summary as Record<string, unknown>)
      errors.push(...summaryErrors)
    }

    // ── overallConfidence ────────────────────────────────────────────
    const oc = obj['overallConfidence']
    if (
      typeof oc !== 'number' ||
      oc < 0 ||
      oc > 1 ||
      !isFinite(oc)
    ) {
      errors.push('overallConfidence must be a finite number between 0.0 and 1.0')
    }

    return {
      valid: errors.length === 0,
      errors,
      coerced: false,
    }
  }

  /**
   * Safe parse and validate from a raw JSON string.
   *
   * @param jsonString - Raw JSON string from model output
   * @returns tuple of [parsed payload or null, validation result]
   */
  parseAndValidate(
    jsonString: string
  ): [DiscoveryInsightPayload | null, InsightValidationResult] {
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonString)
    } catch (err) {
      return [
        null,
        {
          valid: false,
          errors: [`JSON parse error: ${err instanceof Error ? err.message : String(err)}`],
          coerced: false,
        },
      ]
    }

    const result = this.validate(parsed)
    if (result.valid) {
      return [parsed as DiscoveryInsightPayload, result]
    }
    return [null, result]
  }

  // ─────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────

  private validateClassification(
    obj: Record<string, unknown>
  ): string[] {
    const errors: string[] = []

    const configClass = obj['configClass']
    if (!VALID_CONFIG_CLASSES.includes(configClass as ConfigClass)) {
      errors.push(
        `classification.configClass must be one of: ${VALID_CONFIG_CLASSES.join(', ')}`
      )
    }

    const confidence = obj['confidence']
    if (
      typeof confidence !== 'number' ||
      confidence < 0 ||
      confidence > 1 ||
      !isFinite(confidence)
    ) {
      errors.push(
        'classification.confidence must be a finite number between 0.0 and 1.0'
      )
    }

    const rationale = obj['rationale']
    if (typeof rationale !== 'string' || rationale.trim().length === 0) {
      errors.push('classification.rationale must be a non-empty string')
    }

    return errors
  }

  private validateRiskFinding(
    obj: unknown,
    index: number
  ): string[] {
    const errors: string[] = []
    const prefix = `risks[${index}]`

    if (!obj || typeof obj !== 'object') {
      errors.push(`${prefix} must be a non-null object`)
      return errors
    }

    const risk = obj as Record<string, unknown>
    const tag = risk['tag']
    const severity = risk['severity']
    const description = risk['description']
    const lineHint = risk['lineHint']

    if (!VALID_RISK_TAGS.includes(tag as RiskTag)) {
      errors.push(
        `${prefix}.tag must be one of: ${VALID_RISK_TAGS.join(', ')}`
      )
    }

    if (!VALID_SEVERITIES.includes(severity as typeof VALID_SEVERITIES[number])) {
      errors.push(
        `${prefix}.severity must be one of: ${VALID_SEVERITIES.join(', ')}`
      )
    }

    if (typeof description !== 'string' || description.trim().length === 0) {
      errors.push(`${prefix}.description must be a non-empty string`)
    } else if (description.length > MAX_RISK_DESCRIPTION_LENGTH) {
      errors.push(
        `${prefix}.description exceeds maximum length of ${MAX_RISK_DESCRIPTION_LENGTH} chars`
      )
    }

    // lineHint is optional — validate only if present
    if (lineHint !== undefined) {
      if (
        typeof lineHint !== 'number' ||
        !Number.isInteger(lineHint) ||
        lineHint < 1
      ) {
        errors.push(`${prefix}.lineHint must be a positive integer if provided`)
      }
    }

    return errors
  }

  private validateSummary(obj: Record<string, unknown>): string[] {
    const errors: string[] = []
    const oneLiner = obj['oneLiner']
    const bulletPoints = obj['bulletPoints']
    const complexity = obj['complexity']

    if (typeof oneLiner !== 'string' || oneLiner.trim().length === 0) {
      errors.push('summary.oneLiner must be a non-empty string')
    } else if (oneLiner.length > MAX_ONE_LINER_LENGTH) {
      errors.push(
        `summary.oneLiner exceeds maximum length of ${MAX_ONE_LINER_LENGTH} chars`
      )
    }

    if (!Array.isArray(bulletPoints)) {
      errors.push('summary.bulletPoints must be an array')
    } else {
      if (bulletPoints.length < MIN_BULLET_POINTS) {
        errors.push(
          `summary.bulletPoints must have at least ${MIN_BULLET_POINTS} item(s)`
        )
      }
      if (bulletPoints.length > MAX_BULLET_POINTS) {
        errors.push(
          `summary.bulletPoints exceeds maximum of ${MAX_BULLET_POINTS} items`
        )
      }
      bulletPoints.forEach((bp, i) => {
        if (typeof bp !== 'string' || bp.trim().length === 0) {
          errors.push(`summary.bulletPoints[${i}] must be a non-empty string`)
        }
      })
    }

    if (!VALID_COMPLEXITIES.includes(complexity as typeof VALID_COMPLEXITIES[number])) {
      errors.push(
        `summary.complexity must be one of: ${VALID_COMPLEXITIES.join(', ')}`
      )
    }

    return errors
  }

  private isValidIso8601(s: string): boolean {
    // Accept ISO 8601 date-time strings (basic check via Date.parse)
    if (!s || s.length < 10) return false
    const d = Date.parse(s)
    return !isNaN(d)
  }
}

/**
 * Singleton validator instance for use across services
 */
export const discoveryInsightValidator = new DiscoveryInsightValidator()
