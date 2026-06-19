export type ClassificationLevel = "UNCLASSIFIED" | "CONFIDENTIAL" | "SECRET" | "TOP_SECRET"

export const ClassificationLevels: Record<ClassificationLevel, number> = {
  UNCLASSIFIED: 0,
  CONFIDENTIAL: 1,
  SECRET: 2,
  TOP_SECRET: 3,
} as const

export type OperationType =
  | "code_generation"
  | "documentation"
  | "analysis"
  | "vulnerability_scan"
  | "code_review"
  | "security_analysis"

export type TokenType = "CORRELATION" | "SESSION" | "CAPABILITY" | "API_ACCESS"

export type TokenStatus = "CREATED" | "ISSUED" | "ACTIVE" | "EXPIRED" | "REVOKED"

export type SanitizationViolationType =
  | "secret_detected"
  | "pii_detected"
  | "steganography_detected"
  | "vulnerability_detected"
  | "classification_violation"
  | "suspicious_pattern"
  | "malformed_content"

export type SanitizationSeverity = "low" | "medium" | "high" | "critical"

export interface SanitizationViolation {
  type: SanitizationViolationType
  severity: SanitizationSeverity
  description: string
  location?: {
    start?: number
    end?: number
  }
  redacted?: boolean
}

export interface SanitizationReport {
  allowed: boolean
  sanitized_content?: string
  classification: ClassificationLevel
  redactions: number
  violations: SanitizationViolation[]
  metadata?: Record<string, unknown>
}

export interface TokenClaims {
  token_id: string
  type: TokenType
  classification: ClassificationLevel
  user_id: string
  session_id: string
  operations: OperationType[]
  model_access?: string[]
  issued_at: number
  expires_at: number
}

export interface ValidationResult {
  valid: boolean
  reason?: string
  claims?: TokenClaims
  token_id?: string
}

export interface GuardHealthStatus {
  status: "healthy" | "degraded" | "unhealthy"
  timestamp: number
  version: string
  components: {
    sanitization: boolean
    token_validator: boolean
    audit_log: boolean
  }
}

export interface AuditEvent {
  event_id: string
  event_type:
    | "INPUT_SANITIZED"
    | "OUTPUT_SANITIZED"
    | "INPUT_BLOCKED"
    | "OUTPUT_BLOCKED"
    | "TOKEN_ISSUED"
    | "TOKEN_VALIDATED"
    | "TOKEN_REVOKED"
    | "CLASSIFICATION_VIOLATION"
  timestamp: number
  severity: "info" | "warning" | "critical"
  component: string
  user_id?: string
  session_id?: string
  request_id?: string
  classification?: ClassificationLevel
  details?: Record<string, unknown>
}

export interface ContextDocument {
  document_id: string
  classification: ClassificationLevel
  content_hash?: string
}

export interface AIRequestContext {
  request_id: string
  session_id: string
  user_id?: string
  model: string
  provider_id: string
  classification: ClassificationLevel
  context_documents?: ContextDocument[]
  operations?: OperationType[]
}

export function classificationToString(level: number): ClassificationLevel {
  switch (level) {
    case 0:
      return "UNCLASSIFIED"
    case 1:
      return "CONFIDENTIAL"
    case 2:
      return "SECRET"
    case 3:
      return "TOP_SECRET"
    default:
      return "UNCLASSIFIED"
  }
}

export function classificationToNumber(level: ClassificationLevel): number {
  return ClassificationLevels[level]
}

export function canAccessClassification(userLevel: ClassificationLevel, resourceLevel: ClassificationLevel): boolean {
  return classificationToNumber(userLevel) >= classificationToNumber(resourceLevel)
}
