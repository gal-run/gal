import type { GalEvalAdapter, GalEvalCase, GalEvalSuite } from '../core/types.js'

export interface EmailTriagePolicy {
  labelMappings?: Array<{ match: string; label: string }>
  taskSignals?: string[]
  archiveSignals?: string[]
  sensitiveSignals?: string[]
  keepInInboxSignals?: string[]
}

export interface EmailTriageInput {
  from: string
  fromEmail?: string
  senderName?: string
  subject: string
  body?: string
  type?: string
}

export interface EmailTriageDecision {
  label: string
  createTask: boolean
  archive: boolean
}

export const emailRulesAdapter: GalEvalAdapter = {
  id: 'email-rules',

  async evaluateCase(testCase, suite) {
    return { ...classifyEmailTriageInput(testCase.input as unknown as EmailTriageInput, policyFromSuite(suite)) }
  },
}

export function classifyEmailTriageInput(
  input: EmailTriageInput,
  policy: EmailTriagePolicy = {},
): EmailTriageDecision {
  const from = `${input.senderName ?? ''} ${input.fromEmail ?? input.from}`.trim()
  const subject = input.subject
  const body = input.body ?? ''
  const text = `${from} ${subject} ${body} ${input.type ?? ''}`.toLowerCase()
  const domain = domainFromInput(input)
  const label = classifyLabel(from, domain, text, policy)
  const sensitive = containsAny(text, policy.sensitiveSignals ?? defaultSensitiveSignals)
  const createTask = !sensitive && containsAny(text, policy.taskSignals ?? defaultTaskSignals)
  const keepInInbox =
    sensitive ||
    createTask ||
    containsAny(text, policy.keepInInboxSignals ?? defaultKeepInInboxSignals)
  const archive =
    !keepInInbox && containsAny(text, policy.archiveSignals ?? defaultArchiveSignals)

  return { label, createTask, archive }
}

export function evaluateEmailCase(testCase: GalEvalCase, suite: GalEvalSuite): EmailTriageDecision {
  return classifyEmailTriageInput(testCase.input as unknown as EmailTriageInput, policyFromSuite(suite))
}

function classifyLabel(from: string, domain: string, text: string, policy: EmailTriagePolicy): string {
  for (const mapping of policy.labelMappings ?? defaultLabelMappings) {
    if (matches(mapping.match, from, domain, text)) {
      return sanitizeLabel(mapping.label)
    }
  }

  if (domain) {
    const parts = domain.split('.')
    return sanitizeLabel(parts.length > 1 ? parts[parts.length - 2] : parts[0])
  }

  const sender = from.match(/[a-z0-9][a-z0-9 -]*/i)?.[0]
  return sender ? sanitizeLabel(sender) : 'uncategorized'
}

function policyFromSuite(suite: GalEvalSuite): EmailTriagePolicy {
  const policy = suite.metadata?.['policy']
  return policy && typeof policy === 'object' ? (policy as EmailTriagePolicy) : {}
}

function domainFromInput(input: EmailTriageInput): string {
  const candidate = input.fromEmail ?? input.from
  const emailMatch = candidate.match(/@([a-z0-9.-]+)/i)
  if (emailMatch) {
    return emailMatch[1].toLowerCase()
  }

  const domainMatch = candidate.match(/(?:^|[\s<])([a-z0-9-]+\.[a-z0-9.-]+)/i)
  return domainMatch ? domainMatch[1].toLowerCase() : ''
}

function containsAny(text: string, patterns: string[]): boolean {
  return patterns.some(pattern => text.includes(pattern.toLowerCase()))
}

function matches(match: string, from: string, domain: string, text: string): boolean {
  const normalized = match.toLowerCase()
  return from.toLowerCase().includes(normalized) || domain.includes(normalized) || text.includes(normalized)
}

function sanitizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

const defaultLabelMappings = [
  { match: 'cloud.example.net', label: 'cloud' },
  { match: 'vcs.example.net', label: 'vcs' },
  { match: 'news.example.net', label: 'example-news' },
  { match: 'review.example.net', label: 'review' },
  { match: 'directory.example.net', label: 'directory' },
  { match: 'platform.example.net', label: 'platform' },
]

const defaultTaskSignals = [
  'action required',
  'urgent',
  'deadline',
  'assigned to you',
  'verify your',
  'approval required',
  'requires response',
  'bill',
  'invoice',
]

const defaultArchiveSignals = [
  'newsletter',
  'digest',
  'unsubscribe',
  'marketing',
  'build succeeded',
  'notification',
  'directory submissions',
  'report',
]

const defaultSensitiveSignals = ['bank', 'payment', 'transaction', 'paypal', 'tax', 'irs']

const defaultKeepInInboxSignals = ['bank', 'payment', 'transaction', 'invoice', 'bill']
