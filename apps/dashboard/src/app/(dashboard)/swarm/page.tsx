'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Activity, AlertTriangle, CheckCircle2, Play, RefreshCw, Server, ShieldCheck, Zap, type LucideIcon } from 'lucide-react'
import { FeatureGate } from '@/components/FeatureGate'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import {
  api,
  type GalSwarmCapabilityCatalog,
  type GalSwarmCapabilityCatalogResponse,
  type GalSwarmCapabilityLivePool,
  type GalSwarmCapabilityLiveSnapshot,
  type GalSwarmDoctorResponse,
  type GalSwarmLaunchProfile,
  type GalSwarmProvider,
  type GalSwarmRunApiResponse,
  type GalSwarmRunMode,
  type GalSwarmRunPlan,
  type GalSwarmRunRequest,
} from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'

const PROVIDERS: GalSwarmProvider[] = ['stratus', 'gcp', 'runpod', 'crusoe', 'aws', 'azure']

interface SwarmFormState {
  objective: string
  provider: GalSwarmProvider
  computeProfileId: string
  serverlessEndpointId: string
  desiredWorkers: number
  desiredComputeUnits: number
  ttlHours: number
  maxHourlyUsd: number
  tasks: number
  promptTokens: number
  completionTokens: number
  toolCalls: number
  workflowWaitSeconds: number
  sandboxCount: number
  mode: GalSwarmRunMode
  approvalEvidenceUrl: string
}

const DEFAULT_FORM: SwarmFormState = {
  objective: 'Run a short GAL Swarm preflight over ready release issues',
  provider: 'stratus',
  computeProfileId: 'deepseek-v4-pro',
  serverlessEndpointId: 'deepseek-v4-pro',
  desiredWorkers: 1,
  desiredComputeUnits: 1,
  ttlHours: 1,
  maxHourlyUsd: 5,
  tasks: 8,
  promptTokens: 120000,
  completionTokens: 60000,
  toolCalls: 120,
  workflowWaitSeconds: 1800,
  sandboxCount: 8,
  mode: 'dry-run',
  approvalEvidenceUrl: '',
}

const DEMO_SWARM_POOL_CAPACITY: Record<string, number> = {
  'agents-nano-kata-x64': 100,
  'agents-low-kata-x64': 50,
  'agents-standard-kata-x64': 25,
  'agents-medium-kata-x64': 12,
  'agents-high-kata-x64': 6,
  'agents-standard-runc-x64': 0,
  'agents-medium-runc-x64': 0,
  'agents-high-runc-x64': 0,
}

const DEMO_SWARM_POOL_PROFILES: GalSwarmLaunchProfile[] = Object.keys(DEMO_SWARM_POOL_CAPACITY).map((id) => {
  const kata = id.includes('-kata-')
  return {
    id,
    label: `${id} worker class`,
    source: 'runner-label',
    tier: kata ? 'burst' : 'breakglass',
    supportLevel: kata ? 'supported' : 'breakglass_only',
    capacityState: kata ? 'ready' : 'blocked',
    approvalRequired: true,
    maxSupportedWorkers: 500,
    maxValidatedWorkers: 100,
    sandboxProvider: 'stratus',
    aiProviders: ['gal-gateway-default'],
    runnerLabels: [id],
    capacityPolicyProfile: kata ? 'small-paid' : 'breakglass',
    isolationMode: kata ? 'kata' : 'runc',
    storageClass: 'persistent-workspace',
    networkingMode: 'private-swarm',
    lifecycle: {
      stopPreservesWorkspace: true,
      restartRequiresFreshReservation: true,
      updateClearsEphemeralState: true,
      terminateDeletesEphemeralState: true,
      notes: ['Demo surface mirrors the dedicated swarm pool contract.'],
    },
    resources: {},
    costHints: {
      currency: 'USD',
      maxHourlyUsd: kata ? 0.5 : 0.5,
      notes: ['Demo pricing is illustrative only.'],
    },
    notes: [
      kata
        ? 'Demo snapshot mirrors the last validated dedicated Kata pool envelope.'
        : 'runc remains visible only as break-glass metadata.',
    ],
  }
})

function SwarmPage() {
  const selectedWorkspace = useSelectedWorkspace()
  const { user, isLoading } = useAuth()
  const { isPageVisibleForUser, loading: flagsLoading } = useFeatureFlags()
  const [form, setForm] = useState<SwarmFormState>(DEFAULT_FORM)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<GalSwarmRunApiResponse | null>(null)
  const [controlPlaneRefreshKey, setControlPlaneRefreshKey] = useState(0)
  const [capabilities, setCapabilities] = useState<GalSwarmCapabilityCatalog | null>(null)
  const [capabilitiesLive, setCapabilitiesLive] = useState<GalSwarmCapabilityLiveSnapshot | null>(null)
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null)
  const [doctor, setDoctor] = useState<GalSwarmDoctorResponse | null>(null)
  const [doctorError, setDoctorError] = useState<string | null>(null)
  const [isControlPlaneLoading, setIsControlPlaneLoading] = useState(false)
  const [isDoctorLoading, setIsDoctorLoading] = useState(false)

  const userOrgs = user?.organizations ?? []
  const workspace = selectedWorkspace ?? userOrgs[0] ?? ''

  const estimatedTokens = form.promptTokens + form.completionTokens
  const utilizationLabel = useMemo(() => {
    if (form.workflowWaitSeconds > 3600) return 'workflow-wait bound'
    if (estimatedTokens > 500000) return 'token-heavy'
    if (form.sandboxCount >= form.tasks) return 'sandbox-heavy'
    return 'balanced preflight'
  }, [estimatedTokens, form.sandboxCount, form.tasks, form.workflowWaitSeconds])
  const runnerLabelProfiles = useMemo(
    () => capabilities?.launchProfiles.filter((profile) => profile.source === 'runner-label') ?? [],
    [capabilities],
  )
  const livePoolsById = useMemo(
    () => Object.fromEntries((capabilitiesLive?.pools ?? []).map((pool) => [pool.id, pool])),
    [capabilitiesLive],
  )

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

  if (!isPageVisibleForUser('swarm', userOrgs, selectedWorkspace)) {
    return <FeatureGate pageId="swarm" />
  }

  const update = <K extends keyof SwarmFormState>(key: K, value: SwarmFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const refreshControlPlane = () => {
    setControlPlaneRefreshKey((current) => current + 1)
  }

  useEffect(() => {
    if (!workspace) {
      setCapabilities(null)
      setCapabilitiesLive(null)
      setCapabilitiesError(null)
      return
    }

    if (isDemoMode()) {
      const demo = createDemoSwarmCapabilitiesResponse(workspace)
      setCapabilities(demo.catalog)
      setCapabilitiesLive(demo.live ?? null)
      setCapabilitiesError(null)
      setIsControlPlaneLoading(false)
      return
    }

    let cancelled = false
    setIsControlPlaneLoading(true)
    setCapabilitiesError(null)

    void api.getSwarmCapabilities(workspace)
      .then((response) => {
        if (cancelled) return
        setCapabilities(response.catalog)
        setCapabilitiesLive(response.live ?? null)
      })
      .catch((err) => {
        if (cancelled) return
        setCapabilities(null)
        setCapabilitiesLive(null)
        setCapabilitiesError(err instanceof Error ? err.message : 'Failed to fetch swarm capabilities')
      })
      .finally(() => {
        if (cancelled) return
        setIsControlPlaneLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [workspace, controlPlaneRefreshKey])

  useEffect(() => {
    if (!workspace) {
      setDoctor(null)
      setDoctorError(null)
      return
    }

    if (isDemoMode()) {
      setDoctor(createDemoSwarmDoctorReport(workspace, form.desiredWorkers))
      setDoctorError(null)
      setIsDoctorLoading(false)
      return
    }

    let cancelled = false
    setIsDoctorLoading(true)
    setDoctorError(null)

    void api.getSwarmDoctor(workspace, { targetWorkerCount: form.desiredWorkers })
      .then((response) => {
        if (cancelled) return
        setDoctor(response)
      })
      .catch((err) => {
        if (cancelled) return
        setDoctor(null)
        setDoctorError(err instanceof Error ? err.message : 'Failed to fetch swarm doctor report')
      })
      .finally(() => {
        if (cancelled) return
        setIsDoctorLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [workspace, form.desiredWorkers, controlPlaneRefreshKey])

  const submit = async () => {
    if (!workspace) {
      setError('Select a workspace before planning a swarm run.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    setResult(null)

    const request: GalSwarmRunRequest = {
      orgName: workspace,
      objective: form.objective,
      source: 'dashboard',
      mode: form.mode,
      approvalEvidenceUrl: form.approvalEvidenceUrl || undefined,
      target: {
        provider: form.provider,
        sandboxProvider: 'stratus',
        computeProfileId: form.computeProfileId,
        desiredWorkers: form.desiredWorkers,
        desiredComputeUnits: form.desiredComputeUnits,
        ttlHours: form.ttlHours,
        maxHourlyUsd: form.maxHourlyUsd,
        serverlessEndpointId: form.serverlessEndpointId,
      },
      workload: {
        tasks: form.tasks,
        promptTokens: form.promptTokens,
        completionTokens: form.completionTokens,
        toolCalls: form.toolCalls,
        workflowWaitSeconds: form.workflowWaitSeconds,
        sandboxCount: form.sandboxCount,
      },
    }

    try {
      setResult(await api.createSwarmRun(workspace, request))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create swarm run')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-full overflow-auto" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        <div className="flex flex-col gap-3 border-b pb-5" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md" style={{ backgroundColor: 'var(--surface-sunken)' }}>
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">GAL Swarm</h1>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Plan GPU burst capacity, keep serverless fallback armed, and route execution through Stratus gates.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Panel
            title="Swarm Pools"
            icon={Server}
            action={workspace ? (
              <button
                type="button"
                onClick={refreshControlPlane}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${(isControlPlaneLoading || isDoctorLoading) ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            ) : null}
          >
            {!workspace ? (
              <InlineNotice tone="warning" icon={AlertTriangle}>
                Select a workspace before checking live swarm pool availability.
              </InlineNotice>
            ) : capabilitiesError ? (
              <InlineNotice tone="danger" icon={AlertTriangle}>
                {capabilitiesError}
              </InlineNotice>
            ) : isControlPlaneLoading && !capabilities ? (
              <InlineNotice tone="info" icon={Activity}>
                Loading live swarm capability catalog.
              </InlineNotice>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatTile label="Validated envelope" value={String(capabilitiesLive?.validatedWorkerCeiling ?? capabilities?.maxValidatedWorkers ?? 0)} />
                  <StatTile label="Contract ceiling" value={String(capabilities?.maxSupportedWorkers ?? 0)} />
                  <StatTile label="Runner pools" value={String(capabilitiesLive?.pools.length ?? runnerLabelProfiles.length)} />
                </div>

                {!capabilitiesLive && (
                  <div className="mt-4">
                    <InlineNotice tone="info" icon={Activity}>
                      Live pool telemetry is unavailable for this environment. The static swarm catalog is still shown.
                    </InlineNotice>
                  </div>
                )}

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {runnerLabelProfiles.map((profile) => (
                    <SwarmPoolCard
                      key={profile.id}
                      profile={profile}
                      pool={livePoolsById[profile.id]}
                      loading={isControlPlaneLoading && !capabilitiesLive}
                    />
                  ))}
                </div>
              </>
            )}
          </Panel>

          <Panel title="Doctor" icon={ShieldCheck}>
            {!workspace ? (
              <InlineNotice tone="warning" icon={AlertTriangle}>
                Select a workspace before checking swarm readiness.
              </InlineNotice>
            ) : doctorError ? (
              <InlineNotice tone="danger" icon={AlertTriangle}>
                {doctorError}
              </InlineNotice>
            ) : isDoctorLoading && !doctor ? (
              <InlineNotice tone="info" icon={Activity}>
                Loading readiness for {form.desiredWorkers} workers.
              </InlineNotice>
            ) : doctor ? (
              <>
                <div className="mb-4 flex items-center justify-between gap-3 rounded-md border px-3 py-3" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-sunken)' }}>
                  <div>
                    <div className="text-xs uppercase tracking-normal" style={{ color: 'var(--text-secondary)' }}>Current target</div>
                    <div className="mt-1 text-lg font-semibold">{doctor.targetWorkerCount} workers</div>
                  </div>
                  <StatusPill label={doctor.overallStatus} tone={doctorStatusTone(doctor.overallStatus)} />
                </div>
                <Metric label="Ready now" value={doctor.readyForWorkerTest ? 'yes' : 'no'} />
                <Metric label="Max recommended" value={String(doctor.maxRecommendedWorkers)} />
                <Metric label="Last checked" value={formatTimestamp(doctor.generatedAt)} />
                {doctor.blockers.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {doctor.blockers.slice(0, 3).map((blocker) => (
                      <InlineNotice key={blocker} tone="danger" icon={AlertTriangle}>
                        {blocker}
                      </InlineNotice>
                    ))}
                  </div>
                )}
                {doctor.blockers.length === 0 && doctor.warnings.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {doctor.warnings.slice(0, 3).map((warning) => (
                      <InlineNotice key={warning} tone="warning" icon={AlertTriangle}>
                        {warning}
                      </InlineNotice>
                    ))}
                  </div>
                )}
              </>
            ) : null}
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-4">
            <Panel title="Run Plan" icon={Play}>
              <label className="block text-sm font-medium">Objective</label>
              <textarea
                value={form.objective}
                onChange={(event) => update('objective', event.target.value)}
                rows={3}
                className="mt-2 w-full rounded-md border px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: 'var(--surface-default)', borderColor: 'var(--border-subtle)' }}
              />

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Field label="Provider">
                  <select
                    value={form.provider}
                    onChange={(event) => update('provider', event.target.value as GalSwarmProvider)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    style={{ backgroundColor: 'var(--surface-default)', borderColor: 'var(--border-subtle)' }}
                  >
                    {PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>{provider}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Compute profile">
                  <TextInput value={form.computeProfileId} onChange={(value) => update('computeProfileId', value)} />
                </Field>
                <Field label="Serverless fallback">
                  <TextInput value={form.serverlessEndpointId} onChange={(value) => update('serverlessEndpointId', value)} />
                </Field>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <NumberField label="Workers" value={form.desiredWorkers} onChange={(value) => update('desiredWorkers', value)} />
                <NumberField label="Compute units" value={form.desiredComputeUnits} onChange={(value) => update('desiredComputeUnits', value)} />
                <NumberField label="TTL hours" value={form.ttlHours} onChange={(value) => update('ttlHours', value)} step={0.25} />
                <NumberField label="Max hourly USD" value={form.maxHourlyUsd} onChange={(value) => update('maxHourlyUsd', value)} step={0.5} />
              </div>
            </Panel>

            <Panel title="Prediction Inputs" icon={Activity}>
              <div className="grid gap-4 md:grid-cols-3">
                <NumberField label="Tasks" value={form.tasks} onChange={(value) => update('tasks', value)} />
                <NumberField label="Prompt tokens" value={form.promptTokens} onChange={(value) => update('promptTokens', value)} step={1000} />
                <NumberField label="Completion tokens" value={form.completionTokens} onChange={(value) => update('completionTokens', value)} step={1000} />
                <NumberField label="Tool calls" value={form.toolCalls} onChange={(value) => update('toolCalls', value)} />
                <NumberField label="Workflow wait seconds" value={form.workflowWaitSeconds} onChange={(value) => update('workflowWaitSeconds', value)} />
                <NumberField label="Agent sandboxes" value={form.sandboxCount} onChange={(value) => update('sandboxCount', value)} />
              </div>
            </Panel>

            <Panel title="Run Gate" icon={ShieldCheck}>
              <div className="flex flex-wrap gap-2">
                {(['dry-run', 'apply'] as GalSwarmRunMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update('mode', mode)}
                    className="rounded-md border px-3 py-2 text-sm font-medium"
                    style={{
                      borderColor: form.mode === mode ? 'var(--interactive-primary)' : 'var(--border-subtle)',
                      backgroundColor: form.mode === mode ? 'var(--surface-sunken)' : 'var(--surface-default)',
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium">Approval evidence URL</label>
                <TextInput
                  value={form.approvalEvidenceUrl}
                  onChange={(value) => update('approvalEvidenceUrl', value)}
                  placeholder="Required only for apply mode"
                />
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={isSubmitting}
                className="mt-5 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60"
                style={{ backgroundColor: 'var(--interactive-primary)', color: 'var(--text-on-accent)' }}
              >
                <Play className="h-4 w-4" />
                {isSubmitting ? 'Planning...' : form.mode === 'apply' ? 'Request apply gate' : 'Create dry-run plan'}
              </button>
              {error && (
                <p className="mt-3 flex items-center gap-2 text-sm" style={{ color: 'var(--status-danger)' }}>
                  <AlertTriangle className="h-4 w-4" />
                  {error}
                </p>
              )}
            </Panel>
          </section>

          <aside className="space-y-4">
            <Panel title="Preflight" icon={ShieldCheck}>
              <CheckLine label="Dry-run default" />
              <CheckLine label="Apply requires evidence" />
              <CheckLine label="TTL capped at 2 hours" />
              <CheckLine label="Serverless fallback required" />
              <CheckLine label="Stratus runs provider gates" />
            </Panel>

            <Panel title="Capacity Shape" icon={Server}>
              <Metric label="Workspace" value={workspace || 'none'} />
              <Metric label="Workload" value={utilizationLabel} />
              <Metric label="Tokens" value={estimatedTokens.toLocaleString()} />
              <Metric label="Target" value={`${form.provider}/${form.computeProfileId}`} />
            </Panel>

            {result && <ResultPanel plan={result.plan} endpoints={result.endpoints} />}
          </aside>
        </div>
      </div>
    </div>
  )
}

function Panel({ title, icon: Icon, action, children }: { title: string; icon: LucideIcon; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-default)' }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4" />
          <h2 className="text-sm font-semibold uppercase tracking-normal" style={{ color: 'var(--text-secondary)' }}>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  )
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border px-3 py-2 text-sm outline-none"
      style={{ backgroundColor: 'var(--surface-default)', borderColor: 'var(--border-subtle)' }}
    />
  )
}

function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return (
    <Field label={label}>
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-md border px-3 py-2 text-sm outline-none"
        style={{ backgroundColor: 'var(--surface-default)', borderColor: 'var(--border-subtle)' }}
      />
    </Field>
  )
}

function CheckLine({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--status-success)' }} />
      <span>{label}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t py-2 text-sm first:border-t-0" style={{ borderColor: 'var(--border-subtle)' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span className="min-w-0 truncate text-right font-medium">{value}</span>
    </div>
  )
}

function ResultPanel({ plan, endpoints }: { plan: GalSwarmRunPlan; endpoints: GalSwarmRunApiResponse['endpoints'] }) {
  return (
    <Panel title="Created Plan" icon={CheckCircle2}>
      <Metric label="Run ID" value={plan.runId} />
      <Metric label="Status" value={plan.status} />
      <Metric label="Predicted duration" value={`${plan.predictedDurationSeconds}s`} />
      <Metric label="CLI" value={endpoints.galCode} />
      <div className="mt-3 rounded-md border p-3 text-xs" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}>
        {plan.stratusOperations.map((operation) => (
          <div key={operation.type} className="flex justify-between gap-3 py-1">
            <span>{operation.type}</span>
            <span className="truncate text-right">{operation.workflow ?? operation.taskType}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function SwarmPoolCard({
  profile,
  pool,
  loading,
}: {
  profile: GalSwarmLaunchProfile
  pool?: GalSwarmCapabilityLivePool
  loading: boolean
}) {
  const status = poolAvailability(profile, pool)
  const detail =
    pool?.error ??
    pool?.reasons[0] ??
    profile.notes[0] ??
    'Live availability will be populated from the swarm capabilities snapshot.'

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-sunken)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{profile.id}</h3>
          <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {describePoolClass(profile)} class
          </p>
        </div>
        <StatusPill label={status.label} tone={status.tone} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <PoolMetric label="Available now" value={loading ? '...' : String(pool?.maxRecommendedWorkers ?? 0)} />
        <PoolMetric label="Max admissible" value={loading ? '...' : String(pool?.maxAdmissible ?? 0)} />
        <PoolMetric label="CPU" value={formatPoolResourceValue(pool?.resources?.cpu, profile.resources.cpuCores ? `${profile.resources.cpuCores} cores` : 'n/a')} />
        <PoolMetric label="Memory" value={formatPoolResourceValue(pool?.resources?.memory, profile.resources.memoryGb ? `${profile.resources.memoryGb} Gi` : 'n/a')} />
        <PoolMetric label="Disk" value={formatPoolResourceValue(pool?.resources?.ephemeralStorage, profile.resources.diskGb ? `${profile.resources.diskGb} Gi` : 'n/a')} />
        <PoolMetric label="Isolation" value={profile.isolationMode.toUpperCase()} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Tag label={profile.networkingMode.replace(/-/g, ' ')} />
        <Tag label={profile.storageClass.replace(/-/g, ' ')} />
        <Tag label={profile.supportLevel === 'breakglass_only' ? 'break-glass only' : 'supported'} />
        {pool?.limitingResources[0] && <Tag label={`limit: ${humanizePoolLimitDimension(pool.limitingResources[0])}`} />}
        {profile.approvalRequired && <Tag label="approval required" />}
      </div>

      <p className="mt-4 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
        {detail}
      </p>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-3" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--surface-sunken)' }}>
      <div className="text-xs uppercase tracking-normal" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}

function PoolMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-3 py-2" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="text-[11px] uppercase tracking-normal" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}

function StatusPill({ label, tone }: { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{
        backgroundColor:
          tone === 'success'
            ? 'var(--status-success-light)'
            : tone === 'warning'
              ? 'var(--status-warning-light)'
              : tone === 'danger'
                ? 'var(--status-danger-light)'
                : 'var(--surface-default)',
        color:
          tone === 'success'
            ? 'var(--status-success)'
            : tone === 'warning'
              ? 'var(--status-warning)'
              : tone === 'danger'
                ? 'var(--status-danger)'
                : 'var(--text-secondary)',
      }}
    >
      {label}
    </span>
  )
}

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-md border px-2 py-1 text-[11px]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
      {label}
    </span>
  )
}

function InlineNotice({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'info' | 'warning' | 'danger'
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <div
      className="flex items-start gap-2 rounded-md border px-3 py-2 text-sm"
      style={{
        borderColor:
          tone === 'danger'
            ? 'var(--status-danger)'
            : tone === 'warning'
              ? 'var(--status-warning)'
              : 'var(--border-subtle)',
        color:
          tone === 'danger'
            ? 'var(--status-danger)'
            : tone === 'warning'
              ? 'var(--status-warning)'
              : 'var(--text-secondary)',
        backgroundColor: 'var(--surface-sunken)',
      }}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}

function poolAvailability(
  profile: GalSwarmLaunchProfile,
  pool?: GalSwarmCapabilityLivePool,
): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' } {
  if (profile.supportLevel === 'breakglass_only' || profile.isolationMode === 'runc') {
    return { label: 'Disabled', tone: 'danger' }
  }
  if (!pool) {
    return { label: 'Checking', tone: 'muted' }
  }
  if (pool.availabilityState === 'blocked' || pool.maxRecommendedWorkers <= 0) {
    return { label: 'Out of capacity', tone: 'danger' }
  }
  if (pool.availabilityState === 'low_capacity') {
    return { label: 'Low', tone: 'warning' }
  }
  return { label: 'Available', tone: 'success' }
}

function doctorStatusTone(status: GalSwarmDoctorResponse['overallStatus']): 'success' | 'warning' | 'danger' {
  if (status === 'pass') return 'success'
  if (status === 'warn') return 'warning'
  return 'danger'
}

function describePoolClass(profile: GalSwarmLaunchProfile): string {
  if (profile.id.includes('nano')) return 'nano'
  if (profile.id.includes('low')) return 'low'
  if (profile.id.includes('medium')) return 'medium'
  if (profile.id.includes('high')) return 'high'
  return 'standard'
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatPoolResourceValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

function humanizePoolLimitDimension(dimension: string): string {
  switch (dimension) {
    case 'cpu':
      return 'CPU'
    case 'memory':
      return 'memory'
    case 'ephemeralStorage':
      return 'disk'
    default:
      return 'pods'
  }
}

function createDemoSwarmCapabilitiesResponse(orgName: string): GalSwarmCapabilityCatalogResponse {
  const catalog: GalSwarmCapabilityCatalog = {
    schemaVersion: 'gal-swarm-capability-catalog.v1',
    generatedAt: new Date().toISOString(),
    maxSupportedWorkers: 500,
    maxValidatedWorkers: 100,
    launchProfiles: DEMO_SWARM_POOL_PROFILES,
    architectures: [],
    rateLimits: {
      tierName: 'control-plane',
      maxBatchItems: 100,
      endpoint: '/api/swarm/capabilities',
      notes: ['Demo snapshot only.'],
    },
    pricing: {
      currency: 'USD',
      pricingEndpoint: '/api/swarm/capabilities',
      notes: ['Demo snapshot only.'],
    },
    transport: {
      api: 'supported',
      cli: 'planned',
      mcp: 'planned',
      dashboard: 'supported',
      streaming: 'planned',
      responseCompression: 'planned',
      responseCompressionEncodings: ['gzip'],
      notes: ['Demo snapshot only.'],
    },
  }
  const live: GalSwarmCapabilityLiveSnapshot = {
    generatedAt: new Date().toISOString(),
    validatedWorkerCeiling: 100,
    pools: DEMO_SWARM_POOL_PROFILES.map((profile) => {
      const maxRecommendedWorkers = DEMO_SWARM_POOL_CAPACITY[profile.id] ?? 0
      return {
        id: profile.id,
        label: profile.label,
        runnerLabel: profile.id,
        supportLevel: profile.supportLevel,
        isolationMode: profile.isolationMode,
        approvalRequired: profile.approvalRequired,
        availabilityState:
          profile.supportLevel === 'breakglass_only'
            ? 'blocked'
            : maxRecommendedWorkers >= 100
              ? 'ready'
              : maxRecommendedWorkers > 0
                ? 'low_capacity'
                : 'blocked',
        maxSupportedWorkers: profile.maxSupportedWorkers,
        maxValidatedWorkers: profile.supportLevel === 'breakglass_only' ? 0 : 100,
        maxAdmissible: maxRecommendedWorkers,
        maxRecommendedWorkers,
        limitingResources:
          profile.id === 'agents-nano-kata-x64'
            ? ['cpu']
            : profile.supportLevel === 'breakglass_only'
              ? []
              : ['cpu'],
        reasons:
          profile.supportLevel === 'breakglass_only'
            ? ['runc remains disabled on the normal swarm path.']
            : maxRecommendedWorkers >= 100
              ? []
              : [`Current demo snapshot recommends up to ${maxRecommendedWorkers} workers.`],
        resources:
          profile.id === 'agents-nano-kata-x64'
            ? { cpu: '500m', memory: '1Gi', ephemeralStorage: '2Gi' }
            : profile.id === 'agents-low-kata-x64'
              ? { cpu: '1', memory: '2Gi', ephemeralStorage: '4Gi' }
              : profile.id === 'agents-medium-kata-x64'
                ? { cpu: '4', memory: '8Gi', ephemeralStorage: '16Gi' }
                : profile.id === 'agents-high-kata-x64'
                  ? { cpu: '8', memory: '16Gi', ephemeralStorage: '32Gi' }
                  : { cpu: '2', memory: '3Gi', ephemeralStorage: '8Gi' },
      }
    }),
  }

  return {
    orgName,
    catalog,
    live,
  }
}

function createDemoSwarmDoctorReport(
  orgName: string,
  targetWorkerCount: number,
  runnerLabel?: string,
): GalSwarmDoctorResponse {
  const maxRecommendedWorkers = runnerLabel ? (DEMO_SWARM_POOL_CAPACITY[runnerLabel] ?? 0) : 100
  const readyForWorkerTest = targetWorkerCount <= maxRecommendedWorkers
  const blockedByPolicy = runnerLabel ? maxRecommendedWorkers === 0 && runnerLabel.includes('-runc-') : false
  const overallStatus = blockedByPolicy ? 'fail' : readyForWorkerTest ? 'pass' : 'warn'

  return {
    orgName,
    runnerLabel,
    schemaVersion: 'gal-swarm-doctor-report.v1',
    generatedAt: new Date().toISOString(),
    targetWorkerCount,
    overallStatus,
    readyForWorkerTest,
    maxRecommendedWorkers,
    blockers: blockedByPolicy ? ['runc worker classes are disabled by swarm policy.'] : [],
    warnings:
      !blockedByPolicy && !readyForWorkerTest
        ? [`Target ${targetWorkerCount} workers exceeds current recommended capacity ${maxRecommendedWorkers}.`]
        : [],
    checks: [
      {
        id: 'demo_capacity_snapshot',
        title: 'Demo capacity snapshot available',
        category: 'capacity',
        required: true,
        status: blockedByPolicy ? 'fail' : readyForWorkerTest ? 'pass' : 'warn',
        evidence: runnerLabel
          ? `Current demo snapshot recommends up to ${maxRecommendedWorkers} workers for ${runnerLabel}.`
          : `Current demo snapshot recommends up to ${maxRecommendedWorkers} workers.`,
        maxSafeWorkers: maxRecommendedWorkers,
      },
    ],
    notes: ['Demo mode surfaces a seeded control-plane snapshot.'],
  }
}

export default SwarmPage
