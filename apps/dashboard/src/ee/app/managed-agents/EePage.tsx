'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Play,
  Rocket,
  Save,
  ShieldCheck,
  Target,
} from 'lucide-react'

import { FeatureGate } from '@/components/FeatureGate'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import {
  api,
  type CreateManagedAgentVersionRequest,
  type GalEvalReportSnapshot,
  type ManagedAgentDefinition,
  type ManagedAgentEvalRun,
  type ManagedAgentEvalWorkPacket,
  type ManagedAgentVersion,
} from '@/lib/api'
import { DEMO_ORG } from '@/lib/demo-data'
import { isDemoMode } from '@/lib/demo-guard'
import {
  getManagedAgentTemplate,
  MANAGED_AGENT_TEMPLATES,
  type ManagedAgentTemplate,
} from '@/ee/lib/managed-agent-templates'

type ActionState = 'agent' | 'version' | 'eval' | 'claim' | 'promote' | null

interface DeploymentFormState {
  templateId: string
  agentId: string
  displayName: string
  description: string
  taskType: string
  agentCardRef: string
  requiredEvalSuites: string
  version: string
  runtimeRef: string
  executionTargetRef: string
  runnerRefs: string
  connectorRefsJson: string
  vaultRefIds: string
  evalSuites: string
  policyRef: string
  suiteId: string
}

function joinList(values: string[] | undefined): string {
  return values?.join(', ') ?? ''
}

function splitList(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function parseConnectorRefs(value: string): Array<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(value || '[]')
  if (!Array.isArray(parsed)) {
    throw new Error('Connector refs must be a JSON array.')
  }

  return parsed.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Each connector ref must be a JSON object.')
    }
    return item as Record<string, unknown>
  })
}

function getInitialForm(template: ManagedAgentTemplate): DeploymentFormState {
  return {
    templateId: template.id,
    agentId: template.definition.id ?? '',
    displayName: template.definition.displayName,
    description: template.definition.description ?? '',
    taskType: template.definition.taskType,
    agentCardRef: template.definition.agentCardRef,
    requiredEvalSuites: joinList(template.definition.requiredEvalSuites),
    version: '',
    runtimeRef: template.version.runtimeRef,
    executionTargetRef: template.version.executionTargetRef ?? '',
    runnerRefs: joinList(template.version.runnerRefs),
    connectorRefsJson: formatJson(template.version.connectorRefs ?? []),
    vaultRefIds: joinList(template.version.vaultRefIds),
    evalSuites: joinList(template.version.evalSuites),
    policyRef: template.version.policyRef ?? '',
    suiteId: template.defaultSuiteId,
  }
}

function getGateColor(status: string): string {
  if (
    status === 'passed' ||
    status === 'ready' ||
    status === 'promoted' ||
    status === 'completed'
  ) {
    return 'var(--status-success)'
  }
  if (status === 'failed' || status === 'blocked') {
    return 'var(--status-danger)'
  }
  if (status === 'running' || status === 'evaluating') {
    return 'var(--status-info)'
  }
  return 'var(--text-secondary)'
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof Bot
  children: React.ReactNode
}) {
  return (
    <section
      className="border-b pb-6 last:border-b-0"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
      <span>{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border px-3 py-2 text-sm outline-none"
      style={{
        backgroundColor: 'var(--surface-default)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-primary)',
      }}
    />
  )
}

function TextArea({
  value,
  onChange,
  rows = 4,
  mono = true,
}: {
  value: string
  onChange: (value: string) => void
  rows?: number
  mono?: boolean
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={rows}
      className={`w-full resize-y rounded-md border px-3 py-2 outline-none ${
        mono ? 'font-mono text-xs' : 'text-sm'
      }`}
      style={{
        backgroundColor: 'var(--surface-default)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-primary)',
      }}
    />
  )
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold" style={{ color: getGateColor(value) }}>
        {value || 'unset'}
      </p>
    </div>
  )
}

function PrimaryButton({
  action,
  activeAction,
  icon: Icon,
  children,
  onClick,
  disabled,
  title,
}: {
  action: Exclude<ActionState, null>
  activeAction: ActionState
  icon: typeof Bot
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  title?: string
}) {
  const busy = activeAction === action
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold disabled:opacity-60"
      style={{ backgroundColor: 'var(--interactive-primary)', color: 'var(--text-on-accent)' }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {children}
    </button>
  )
}

function TargetHealthBadge({ targetRef }: { targetRef: string | null }) {
  if (!targetRef) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium"
        style={{ background: 'var(--status-danger-bg, #fee2e2)', color: 'var(--status-danger, #dc2626)' }}
      >
        <AlertTriangle className="h-3 w-3" />
        Target not configured — evals will fail
      </span>
    )
  }
  // Health status is unknown until gal-api exposes the registry endpoint
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium"
      style={{
        background: 'var(--surface-default)',
        color: 'var(--text-tertiary)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <span className="h-2 w-2 rounded-full bg-gray-300 animate-pulse inline-block" />
      Health status pending registry API
    </span>
  )
}

const LIFECYCLE_STEPS = ['queued', 'running', 'completed'] as const

function DispatchLifecycle({ evalRun }: { evalRun: ManagedAgentEvalRun | null }) {
  const status = evalRun?.status ?? null

  if (!status) {
    return (
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
        No eval run queued
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium" style={{ color: 'var(--text-tertiary)' }}>
        Dispatch lifecycle
      </p>
      <div className="flex items-center gap-1">
        {LIFECYCLE_STEPS.map((step, i) => {
          const stepIndex = LIFECYCLE_STEPS.indexOf(step)
          const currentIndex =
            status === 'failed'
              ? LIFECYCLE_STEPS.indexOf('running')
              : LIFECYCLE_STEPS.indexOf(status as (typeof LIFECYCLE_STEPS)[number])
          const isDone =
            stepIndex < currentIndex || (step === 'completed' && status === 'completed')
          const isCurrent =
            step === status || (step === 'running' && status === 'failed')
          const isFailed = status === 'failed' && step === 'running'

          return (
            <Fragment key={step}>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  isFailed
                    ? 'text-red-600 bg-red-50'
                    : isDone
                      ? 'text-green-700 bg-green-50'
                      : isCurrent
                        ? 'font-semibold'
                        : 'opacity-40'
                }`}
                style={isCurrent && !isFailed ? { color: 'var(--interactive-primary)' } : undefined}
              >
                {isFailed ? 'failed' : step}
              </span>
              {i < LIFECYCLE_STEPS.length - 1 && (
                <span className="text-[10px] opacity-30">→</span>
              )}
            </Fragment>
          )
        })}
      </div>
      {evalRun?.completedAt && (
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          Completed {new Date(evalRun.completedAt).toLocaleString()}
        </p>
      )}
    </div>
  )
}

function EvalReportSummary({
  report,
  gateStatus,
}: {
  report: GalEvalReportSnapshot
  gateStatus: string
}) {
  const passed = report.passed
  const score = typeof report.score === 'number' ? report.score : null
  const suggestions = Array.isArray(report.suggestions) ? report.suggestions : []
  const metrics = Array.isArray(report.metrics) ? report.metrics : []

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-semibold"
          style={{
            background: passed ? 'var(--status-success-bg, #dcfce7)' : 'var(--status-danger-bg, #fee2e2)',
            color: passed ? 'var(--status-success, #16a34a)' : 'var(--status-danger, #dc2626)',
          }}
        >
          {passed ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {passed ? 'Gate passed' : 'Gate failed'}
        </span>
        {score !== null && (
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Score: <strong>{(score * 100).toFixed(0)}%</strong>
          </span>
        )}
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Suite: {report.suiteId}
        </span>
      </div>

      {metrics.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Metrics</p>
          <div className="space-y-1">
            {metrics.map((m, i) => {
              const name = typeof m['name'] === 'string' ? m['name'] : `metric_${i}`
              const val = m['score'] ?? m['value'] ?? m['result']
              const ok = m['passed'] !== false
              return (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span style={{ color: ok ? 'var(--text-secondary)' : 'var(--status-danger)' }}>{name}</span>
                  <span style={{ color: ok ? 'var(--text-muted)' : 'var(--status-danger)' }}>
                    {val !== undefined && val !== null ? String(val) : ok ? '✓' : '✗'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Suggested corrections</p>
          <ul className="space-y-1">
            {suggestions.map((s, i) => (
              <li key={i} className="text-xs flex gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--status-warning, #d97706)' }}>→</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!passed && (
        <p className="text-xs rounded-md px-3 py-2 border" style={{
          color: 'var(--status-danger)',
          borderColor: 'var(--status-danger)',
          background: 'var(--status-danger-bg, #fee2e2)',
        }}>
          Promotion is blocked until the eval gate passes.
        </p>
      )}
    </div>
  )
}

export default function ManagedAgentsPage() {
  const selectedWorkspace = useSelectedWorkspace()
  const { user, isLoading } = useAuth()
  const { isPageVisibleForUser, loading: flagsLoading } = useFeatureFlags()
  const userOrgs = user?.organizations ?? []
  const workspace = isDemoMode() ? DEMO_ORG : selectedWorkspace ?? userOrgs[0] ?? ''

  const [form, setForm] = useState<DeploymentFormState>(() => getInitialForm(MANAGED_AGENT_TEMPLATES[0]!))
  const [agents, setAgents] = useState<ManagedAgentDefinition[]>([])
  const [createdAgent, setCreatedAgent] = useState<ManagedAgentDefinition | null>(null)
  const [createdVersion, setCreatedVersion] = useState<ManagedAgentVersion | null>(null)
  const [evalRun, setEvalRun] = useState<ManagedAgentEvalRun | null>(null)
  const [workPacket, setWorkPacket] = useState<ManagedAgentEvalWorkPacket | null>(null)
  const [action, setAction] = useState<ActionState>(null)
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedTemplate = useMemo(() => getManagedAgentTemplate(form.templateId), [form.templateId])
  const existingAgent = useMemo(
    () => agents.find((agent) => agent.id === form.agentId) ?? null,
    [agents, form.agentId],
  )
  const effectiveAgent = createdAgent ?? existingAgent
  const effectiveVersion = createdVersion?.version ?? form.version.trim()
  const effectiveTarget = (createdVersion?.executionTargetRef ?? form.executionTargetRef.trim()) || null
  const effectiveRunnerRefs =
    createdVersion?.runnerRefs ?? form.runnerRefs.split(',').map((s) => s.trim()).filter(Boolean)
  const canMutate = Boolean(workspace) && !isDemoMode()

  const update = <K extends keyof DeploymentFormState>(key: K, value: DeploymentFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const loadAgents = useCallback(async () => {
    if (!workspace || isDemoMode()) {
      setAgents([])
      return
    }

    setLoadingAgents(true)
    try {
      setAgents(await api.listManagedAgents(workspace))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load managed agents')
    } finally {
      setLoadingAgents(false)
    }
  }, [workspace])

  useEffect(() => {
    void loadAgents()
  }, [loadAgents])

  if (isLoading || flagsLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </div>
    )
  }

  if (!user && !isDemoMode()) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
      </div>
    )
  }

  if (!isPageVisibleForUser('background-agents', userOrgs, selectedWorkspace)) {
    return <FeatureGate pageId="background-agents" />
  }

  const resetTemplate = (templateId: string) => {
    const template = getManagedAgentTemplate(templateId)
    setForm(getInitialForm(template))
    setCreatedAgent(null)
    setCreatedVersion(null)
    setEvalRun(null)
    setWorkPacket(null)
    setError(null)
  }

  const saveAgent = async () => {
    if (!canMutate) {
      setError(isDemoMode() ? 'Demo workspaces are read-only.' : 'Select a workspace before saving an agent.')
      return
    }

    setAction('agent')
    setError(null)
    try {
      const agent = await api.createManagedAgent(workspace, {
        id: form.agentId.trim() || undefined,
        displayName: form.displayName.trim(),
        description: form.description.trim() || undefined,
        taskType: form.taskType.trim(),
        agentCardRef: form.agentCardRef.trim(),
        requiredEvalSuites: splitList(form.requiredEvalSuites),
      })
      setCreatedAgent(agent)
      await loadAgents()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save managed agent')
    } finally {
      setAction(null)
    }
  }

  const registerVersion = async () => {
    if (!canMutate) {
      setError(isDemoMode() ? 'Demo workspaces are read-only.' : 'Select a workspace before registering a version.')
      return
    }

    const agentId = (effectiveAgent?.id ?? form.agentId).trim()
    if (!agentId) {
      setError('Save or select an agent before registering a version.')
      return
    }

    setAction('version')
    setError(null)
    try {
      const request: CreateManagedAgentVersionRequest = {
        runtimeRef: form.runtimeRef.trim(),
        executionTargetRef: form.executionTargetRef.trim() || undefined,
        runnerRefs: splitList(form.runnerRefs),
        connectorRefs: parseConnectorRefs(form.connectorRefsJson),
        vaultRefIds: splitList(form.vaultRefIds),
        evalSuites: splitList(form.evalSuites),
        policyRef: form.policyRef.trim() || undefined,
      }
      const requestedVersion = form.version.trim()
      if (requestedVersion) {
        request.version = requestedVersion
      }

      const version = await api.createManagedAgentVersion(workspace, agentId, request)
      setCreatedVersion(version)
      setEvalRun(null)
      setWorkPacket(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register managed-agent version')
    } finally {
      setAction(null)
    }
  }

  const queueEval = async () => {
    if (!canMutate) {
      setError(isDemoMode() ? 'Demo workspaces are read-only.' : 'Select a workspace before queueing an eval.')
      return
    }

    const agentId = (effectiveAgent?.id ?? form.agentId).trim()
    if (!agentId || !effectiveVersion) {
      setError('Register a version before queueing an eval.')
      return
    }

    setAction('eval')
    setError(null)
    try {
      const nextRun = await api.createManagedAgentEvalRun(workspace, agentId, effectiveVersion, {
        suiteId: form.suiteId.trim() || selectedTemplate.defaultSuiteId,
      })
      setEvalRun(nextRun)
      setWorkPacket(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue managed-agent eval')
    } finally {
      setAction(null)
    }
  }

  const claimEval = async () => {
    if (!canMutate) {
      setError(isDemoMode() ? 'Demo workspaces are read-only.' : 'Select a workspace before claiming eval work.')
      return
    }

    const agentId = evalRun?.agentId ?? effectiveAgent?.id ?? form.agentId
    const version = evalRun?.version ?? effectiveVersion
    if (!evalRun || !agentId || !version) {
      setError('Queue an eval before claiming a work packet.')
      return
    }

    setAction('claim')
    setError(null)
    try {
      const packet = await api.claimManagedAgentEvalRun(workspace, agentId, version, evalRun.runId)
      setWorkPacket(packet)
      setEvalRun(packet.evalRun)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim managed-agent eval')
    } finally {
      setAction(null)
    }
  }

  const promoteVersion = async () => {
    if (!canMutate) {
      setError(isDemoMode() ? 'Demo workspaces are read-only.' : 'Select a workspace before promoting a version.')
      return
    }

    const agentId = createdVersion?.agentId ?? effectiveAgent?.id ?? form.agentId
    const version = createdVersion?.version ?? effectiveVersion
    if (!agentId || !version) {
      setError('Register a version before promotion.')
      return
    }

    setAction('promote')
    setError(null)
    try {
      setCreatedVersion(await api.promoteManagedAgentVersion(workspace, agentId, version))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to promote managed-agent version')
    } finally {
      setAction(null)
    }
  }

  return (
    <div className="min-h-full overflow-auto" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="mx-auto flex max-w-7xl flex-col gap-6 p-6 md:p-8">
        <div className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-start md:justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-medium" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
              <Rocket className="h-3.5 w-3.5" />
              {workspace || 'No workspace selected'}
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Managed Agents</h1>
              <p className="mt-2 max-w-3xl text-sm" style={{ color: 'var(--text-secondary)' }}>
                Deployable versions, eval gates, and promotion control.
              </p>
            </div>
          </div>
          <div className="grid min-w-full grid-cols-3 gap-4 border-t pt-4 text-sm md:min-w-[360px] md:border-l md:border-t-0 md:pl-6 md:pt-0" style={{ borderColor: 'var(--border-subtle)' }}>
            <StatusPill label="Definitions" value={loadingAgents ? 'loading' : String(agents.length)} />
            <StatusPill label="Version" value={createdVersion?.status ?? 'draft'} />
            <StatusPill label="Gate" value={evalRun?.gateStatus ?? createdVersion?.latestGateStatus ?? 'not_run'} />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--status-danger)', color: 'var(--status-danger)' }}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-5">
            <Panel title="Agent Definition" icon={Bot}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Template">
                  <select
                    value={form.templateId}
                    onChange={(event) => resetTemplate(event.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    style={{ backgroundColor: 'var(--surface-default)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  >
                    {MANAGED_AGENT_TEMPLATES.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Agent ID">
                  <TextInput value={form.agentId} onChange={(value) => update('agentId', value)} />
                </Field>
                <Field label="Display name">
                  <TextInput value={form.displayName} onChange={(value) => update('displayName', value)} />
                </Field>
                <Field label="Task type">
                  <TextInput value={form.taskType} onChange={(value) => update('taskType', value)} />
                </Field>
                <Field label="Agent card ref">
                  <TextInput value={form.agentCardRef} onChange={(value) => update('agentCardRef', value)} />
                </Field>
                <Field label="Required eval suites">
                  <TextInput value={form.requiredEvalSuites} onChange={(value) => update('requiredEvalSuites', value)} />
                </Field>
              </div>
              <div className="mt-4">
                <Field label="Description">
                  <TextArea
                    value={form.description}
                    onChange={(value) => update('description', value)}
                    rows={2}
                    mono={false}
                  />
                </Field>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <PrimaryButton action="agent" activeAction={action} icon={Save} onClick={saveAgent} disabled={!canMutate}>
                  Save definition
                </PrimaryButton>
                {existingAgent && (
                  <span className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--status-success)' }}>
                    <CheckCircle2 className="h-4 w-4" />
                    Existing definition found
                  </span>
                )}
              </div>
            </Panel>

            <Panel title="Version Contract" icon={ClipboardList}>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Version">
                  <TextInput value={form.version} onChange={(value) => update('version', value)} placeholder="Leave blank for server assigned" />
                </Field>
                <Field label="Runtime ref">
                  <TextInput value={form.runtimeRef} onChange={(value) => update('runtimeRef', value)} />
                </Field>
                <Field label="Execution target ref">
                  <TextInput value={form.executionTargetRef} onChange={(value) => update('executionTargetRef', value)} />
                </Field>
                <Field label="Runner refs">
                  <TextInput value={form.runnerRefs} onChange={(value) => update('runnerRefs', value)} />
                </Field>
                <Field label="Vault refs">
                  <TextInput value={form.vaultRefIds} onChange={(value) => update('vaultRefIds', value)} />
                </Field>
                <Field label="Eval suites">
                  <TextInput value={form.evalSuites} onChange={(value) => update('evalSuites', value)} />
                </Field>
                <Field label="Policy ref">
                  <TextInput value={form.policyRef} onChange={(value) => update('policyRef', value)} />
                </Field>
                <Field label="Eval suite to queue">
                  <TextInput value={form.suiteId} onChange={(value) => update('suiteId', value)} />
                </Field>
              </div>
              <div className="mt-4">
                <Field label="Connector refs JSON">
                  <TextArea value={form.connectorRefsJson} onChange={(value) => update('connectorRefsJson', value)} />
                </Field>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <PrimaryButton action="version" activeAction={action} icon={Save} onClick={registerVersion} disabled={!canMutate}>
                  Register version
                </PrimaryButton>
                <PrimaryButton
                  action="eval"
                  activeAction={action}
                  icon={Play}
                  onClick={queueEval}
                  disabled={!canMutate || !effectiveVersion || !effectiveTarget}
                  title={!effectiveTarget ? 'Configure an execution target before queueing an eval' : undefined}
                >
                  Queue eval
                </PrimaryButton>
              </div>
            </Panel>
          </div>

          <aside className="space-y-5">
            <Panel title="Deployment State" icon={ShieldCheck}>
              <div className="grid gap-3">
                <StatusPill label="Agent" value={effectiveAgent?.id ?? form.agentId} />
                <StatusPill label="Registered version" value={(createdVersion?.version ?? form.version.trim()) || 'pending'} />
                <StatusPill label="Version status" value={createdVersion?.status ?? 'draft'} />
                <StatusPill label="Latest gate" value={createdVersion?.latestGateStatus ?? evalRun?.gateStatus ?? 'not_run'} />
                <DispatchLifecycle evalRun={evalRun ?? null} />
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <PrimaryButton action="claim" activeAction={action} icon={ClipboardList} onClick={claimEval} disabled={!canMutate || !evalRun}>
                  Claim packet
                </PrimaryButton>
                <PrimaryButton
                  action="promote"
                  activeAction={action}
                  icon={Rocket}
                  onClick={promoteVersion}
                  disabled={!canMutate || !effectiveVersion || evalRun?.gateStatus === 'failed'}
                  title={evalRun?.gateStatus === 'failed' ? 'Eval gate failed — fix issues before promoting' : undefined}
                >
                  Promote
                </PrimaryButton>
              </div>
            </Panel>

            <Panel title="Execution Target" icon={Target}>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Target ref</p>
                  {effectiveTarget ? (
                    <code
                      className="text-xs px-2 py-1 rounded"
                      style={{ background: 'var(--surface-default)', color: 'var(--text-primary)' }}
                    >
                      {effectiveTarget}
                    </code>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>— not configured —</span>
                  )}
                </div>

                {effectiveRunnerRefs.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>Runner refs</p>
                    <div className="flex flex-wrap gap-1">
                      {effectiveRunnerRefs.map((r) => (
                        <code
                          key={r}
                          className="text-xs px-2 py-1 rounded"
                          style={{ background: 'var(--surface-default)', color: 'var(--text-primary)' }}
                        >
                          {r}
                        </code>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <TargetHealthBadge targetRef={effectiveTarget} />
                </div>
              </div>
            </Panel>

            {evalRun?.reportSnapshot && (
              <Panel title="Eval Report" icon={ShieldCheck}>
                <EvalReportSummary report={evalRun.reportSnapshot} gateStatus={evalRun.gateStatus} />
              </Panel>
            )}

            <Panel title="Eval Work Packet" icon={ClipboardList}>
              {workPacket ? (
                <pre
                  className="max-h-[480px] overflow-auto rounded-md border p-3 text-xs"
                  style={{ backgroundColor: 'var(--surface-default)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                >
                  {formatJson(workPacket)}
                </pre>
              ) : (
                <div className="rounded-md border p-4 text-sm" style={{ backgroundColor: 'var(--surface-default)', borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                  No work packet claimed.
                </div>
              )}
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  )
}
