import type {
  CreateManagedAgentRequest,
  CreateManagedAgentVersionRequest,
} from '@/lib/api'

export interface ManagedAgentTemplate {
  id: string
  label: string
  definition: CreateManagedAgentRequest
  version: CreateManagedAgentVersionRequest
  defaultSuiteId: string
}

export const MANAGED_AGENT_TEMPLATES: ManagedAgentTemplate[] = [
  {
    id: 'email-triage',
    label: 'Email triage',
    definition: {
      id: 'gal.ops-triage.email',
      displayName: 'GAL Operations Triage Agent (email)',
      description:
        'Gmail triage, reply drafting, invoice→Morning forwarding and bank secure-message detection for the gal.ops-triage runtime agent. Dry-run classification, approval-gated mutations; gated on all four ops-triage email eval suites.',
      taskType: 'ops.email.triage',
      agentCardRef: 'gal-agents://agent-cards/ops-triage',
      requiredEvalSuites: [
        'gal.ops-triage.email.v1',
        'gal.ops-triage.email-reply.v1',
        'gal.ops-triage.email-invoice.v1',
        'gal.ops-triage.email-bank.v1',
      ],
    },
    version: {
      runtimeRef: 'gal-worker://managed-agent-runtime',
      executionTargetRef: 'gal-endpoints://managed-runners/ops-triage-email-dry-run',
      runnerRefs: ['gal-runners://ops-triage/email-dry-run'],
      connectorRefs: [
        {
          kind: 'gmail',
          id: 'gmail-primary',
          scopes: ['gmail.readonly'],
        },
      ],
      vaultRefIds: ['vault:gmail-oauth'],
      evalSuites: [
        'gal.ops-triage.email.v1',
        'gal.ops-triage.email-reply.v1',
        'gal.ops-triage.email-invoice.v1',
        'gal.ops-triage.email-bank.v1',
      ],
      policyRef: 'policies://managed-agents/dry-run-human-approval',
    },
    defaultSuiteId: 'gal.ops-triage.email.v1',
  },
  {
    id: 'slack-triage',
    label: 'Slack triage',
    definition: {
      id: 'gal.ops-triage.slack',
      displayName: 'Slack triage',
      description: 'Channel triage using the same managed-agent contract as email.',
      taskType: 'ops.chat.triage',
      agentCardRef: 'gal-agents://agent-cards/ops-triage/slack',
      requiredEvalSuites: ['gal.ops-triage.slack.v1'],
    },
    version: {
      runtimeRef: 'gal-worker://managed-agent-runtime',
      executionTargetRef: 'gal-endpoints://managed-runners/ops-triage-slack-dry-run',
      runnerRefs: ['gal-runners://ops-triage/slack-dry-run'],
      connectorRefs: [
        {
          kind: 'slack',
          id: 'slack-primary',
          scopes: ['channels:history'],
        },
      ],
      vaultRefIds: ['vault:slack-oauth'],
      evalSuites: ['gal.ops-triage.slack.v1'],
      policyRef: 'policies://managed-agents/dry-run-human-approval',
    },
    defaultSuiteId: 'gal.ops-triage.slack.v1',
  },
]

export function getManagedAgentTemplate(templateId: string): ManagedAgentTemplate {
  return MANAGED_AGENT_TEMPLATES.find((template) => template.id === templateId) ?? MANAGED_AGENT_TEMPLATES[0]!
}
