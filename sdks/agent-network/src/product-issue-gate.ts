export const GAL_PRODUCT_ISSUE_GATE_SCHEMA_VERSION = 'gal.product-issue-gate.v1'
export const PRODUCT_STATUS_ISSUE_GATE_SCHEMA_VERSION = 'product-status-issue-gate.v1'
export const GAL_PRODUCT_ISSUE_GATE_TASK_TYPE = 'business-ops.product-issue-gate.evaluate'
export const GAL_PRODUCT_ISSUE_GATE_SCHEMA_REF = 'business-ops-product-issue-gate-v1'
export const GAL_PRODUCT_ISSUE_GATE_SCOPE = 'business-ops:product-issue-gate:evaluate'

export type GalProductIssueGateMode = 'off' | 'warn' | 'block'
export type GalProductIssueGateDecision = 'allow' | 'warn' | 'block'

export interface GalProductIssueGateIssue {
  url?: string
  repo?: string
  number?: number
  title: string
  body?: string
  labels: string[]
  approved?: boolean
}

export interface GalProductIssueGateProduct {
  productId?: string | null
  mapping?: string
}

export interface GalProductIssueGateClassification {
  lane?: string
  workClass?: string | null
  confidence?: string
  broad?: boolean
  reasons?: string[]
}

export interface GalProductIssueGateEnforcement {
  decision: GalProductIssueGateDecision
  canStartDevelopment: boolean
  dispatchState: string
  reasonCode: string
  message: string
  requiredActions: string[]
}

export interface GalProductIssueGateEvaluation {
  schemaVersion: typeof GAL_PRODUCT_ISSUE_GATE_SCHEMA_VERSION
  generatedAt?: string
  source?: string
  issue: GalProductIssueGateIssue
  product?: GalProductIssueGateProduct
  classification?: GalProductIssueGateClassification
  productStatusDecision?: Record<string, unknown> | null
  enforcement: GalProductIssueGateEnforcement
}

export interface ProductStatusIssueGateRecord {
  schema_version?: string
  generated_at?: string
  source?: string
  issue?: {
    url?: string
    repo?: string
    number?: number
    title?: string
    body?: string
    labels?: string[]
    approved?: boolean
  }
  product?: {
    product_id?: string | null
    mapping?: string
  }
  classification?: {
    lane?: string
    work_class?: string | null
    confidence?: string
    broad?: boolean
    reasons?: string[]
  }
  product_status_decision?: Record<string, unknown> | null
  enforcement?: {
    decision?: GalProductIssueGateDecision
    can_start_development?: boolean
    dispatch_state?: string
    reason?: string
    message?: string
    required_actions?: string[]
  }
}

export const GAL_PRODUCT_ISSUE_GATE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    issue: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        repo: { type: 'string' },
        number: { type: 'number' },
        title: { type: 'string' },
        body: { type: 'string' },
        labels: { type: 'array', items: { type: 'string' } },
        approved: { type: 'boolean' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    command: { type: 'string' },
    mode: { type: 'string', enum: ['off', 'warn', 'block'] },
  },
  required: ['issue'],
  additionalProperties: true,
} as const

export const GAL_PRODUCT_ISSUE_GATE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    schemaVersion: { const: GAL_PRODUCT_ISSUE_GATE_SCHEMA_VERSION },
    generatedAt: { type: 'string' },
    source: { type: 'string' },
    issue: { type: 'object' },
    product: { type: 'object' },
    classification: { type: 'object' },
    productStatusDecision: { type: ['object', 'null'] },
    enforcement: {
      type: 'object',
      properties: {
        decision: { type: 'string', enum: ['allow', 'warn', 'block'] },
        canStartDevelopment: { type: 'boolean' },
        dispatchState: { type: 'string' },
        reasonCode: { type: 'string' },
        message: { type: 'string' },
        requiredActions: { type: 'array', items: { type: 'string' } },
      },
      required: [
        'decision',
        'canStartDevelopment',
        'dispatchState',
        'reasonCode',
        'message',
        'requiredActions',
      ],
      additionalProperties: false,
    },
  },
  required: ['schemaVersion', 'issue', 'enforcement'],
  additionalProperties: false,
} as const

export function normalizeProductStatusIssueGateRecord(
  record: ProductStatusIssueGateRecord,
): GalProductIssueGateEvaluation {
  const requiredActions = stringArray(record.enforcement?.required_actions)
  const reasonCode =
    readString(record.enforcement?.reason) ||
    readString(record.enforcement?.dispatch_state) ||
    'product_issue_gate_reason_missing'
  const canStartDevelopment = record.enforcement?.can_start_development === true
  const decision = readDecision(record.enforcement?.decision) ?? (canStartDevelopment ? 'allow' : 'block')
  const dispatchState =
    readString(record.enforcement?.dispatch_state) ||
    (canStartDevelopment ? 'ready' : 'blocked_unknown')

  return {
    schemaVersion: GAL_PRODUCT_ISSUE_GATE_SCHEMA_VERSION,
    generatedAt: readString(record.generated_at),
    source: readString(record.source),
    issue: {
      url: readString(record.issue?.url),
      repo: readString(record.issue?.repo),
      number: typeof record.issue?.number === 'number' ? record.issue.number : undefined,
      title: readString(record.issue?.title) || 'Untitled GitHub issue work item',
      body: readString(record.issue?.body),
      labels: stringArray(record.issue?.labels),
      approved: record.issue?.approved === true ? true : undefined,
    },
    product: record.product
      ? {
          productId:
            typeof record.product.product_id === 'string' || record.product.product_id === null
              ? record.product.product_id
              : undefined,
          mapping: readString(record.product.mapping),
        }
      : undefined,
    classification: record.classification
      ? {
          lane: readString(record.classification.lane),
          workClass:
            typeof record.classification.work_class === 'string' ||
            record.classification.work_class === null
              ? record.classification.work_class
              : undefined,
          confidence: readString(record.classification.confidence),
          broad: typeof record.classification.broad === 'boolean' ? record.classification.broad : undefined,
          reasons: stringArray(record.classification.reasons),
        }
      : undefined,
    productStatusDecision: record.product_status_decision ?? undefined,
    enforcement: {
      decision,
      canStartDevelopment,
      dispatchState,
      reasonCode,
      message:
        readString(record.enforcement?.message) ||
        formatProductIssueGateMessage({
          decision,
          dispatchState,
          reasonCode,
          requiredActions,
        }),
      requiredActions,
    },
  }
}

export function formatProductIssueGateMessage(input: {
  decision: GalProductIssueGateDecision
  dispatchState: string
  reasonCode: string
  requiredActions?: string[]
}): string {
  const primaryAction = input.requiredActions?.find((action) => action.trim().length > 0)
  if (primaryAction) {
    return primaryAction
  }

  if (input.decision === 'allow') {
    return 'Product issue gate allows development to start.'
  }

  if (input.decision === 'warn') {
    return `Product issue gate requires review before development starts (${input.reasonCode || input.dispatchState}).`
  }

  return `Product issue gate blocked development (${input.reasonCode || input.dispatchState}).`
}

function readDecision(value: unknown): GalProductIssueGateDecision | undefined {
  return value === 'allow' || value === 'warn' || value === 'block' ? value : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
