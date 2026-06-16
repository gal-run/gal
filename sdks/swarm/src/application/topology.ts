import {
  GAL_SWARM_DEFAULT_X64_RUNNER_LABELS,
  GAL_SWARM_FLEET_CAPABILITIES,
  GAL_SWARM_RISK_LEVELS,
  GAL_SWARM_TASK_KINDS,
  GAL_SWARM_TOPOLOGY_SCHEMA_VERSION,
  type GalSwarmEvidenceRequirement,
  type GalSwarmExecutionLane,
  type GalSwarmFleetCapability,
  type GalSwarmFleetNode,
  type GalSwarmGovernanceConstraints,
  type GalSwarmLanePlacement,
  type GalSwarmLaneRole,
  type GalSwarmOrchestrationMode,
  type GalSwarmRiskLevel,
  type GalSwarmTopologyPlan,
  type GalSwarmTopologyRequest,
  type GalSwarmTopologyRouteDecision,
  type GalSwarmTopologyTask,
} from '../contracts.js'
import { normalizeGalSwarmTopologyMode } from './topology-aliases.js'
import { uniqueCapabilities, uniqueStrings } from '../shared/collections.js'
import { round } from '../shared/math.js'
import { highestGalSwarmRiskLevel, riskRank } from '../shared/risk.js'

export {
  GAL_SWARM_TOPOLOGY_MODE_MAPPINGS,
  formatGalSwarmTopologyAliasHelp,
  listGalSwarmTopologyAliases,
  normalizeGalSwarmTopologyMode,
} from './topology-aliases.js'

export function routeGalSwarmTopology(request: GalSwarmTopologyRequest): GalSwarmTopologyRouteDecision {
  validateGalSwarmTopologyRequest(request)

  const desiredMode = request.desiredMode ? normalizeGalSwarmTopologyMode(request.desiredMode) : undefined

  // Explicit modes are honored first; auto mode is the only path that uses
  // heuristics, which keeps expert overrides predictable for gal-api callers.
  if (desiredMode && desiredMode.canonicalMode !== 'auto') {
    return {
      mode: desiredMode.canonicalMode,
      reason: desiredMode.inputMode === desiredMode.canonicalMode
        ? `Explicit topology mode requested: ${desiredMode.canonicalMode}.`
        : `Public topology mode ${desiredMode.inputMode} maps to GAL ${desiredMode.canonicalMode}. ${desiredMode.reason}`,
    }
  }

  const orderedTasks = orderGalSwarmTopologyTasks(request.tasks)
  const taskCount = orderedTasks.length
  const hasDependencies = orderedTasks.some((task) => (task.dependsOn?.length ?? 0) > 0)
  const governance = normalizeGalSwarmGovernance(request.governance)
  const repositoryCount = uniqueStrings([
    ...request.repositories,
    ...orderedTasks.map((task) => task.repository).filter((repository): repository is string => Boolean(repository)),
  ]).length
  const evidenceWeight =
    (request.evidenceRequirements?.length ?? 0) +
    orderedTasks.reduce((total, task) => total + (task.evidenceRequirements?.length ?? 0), 0)
  const riskLevel = highestGalSwarmRiskLevel([request.riskLevel, ...orderedTasks.map((task) => task.riskLevel)])
  const hasReviewNeed =
    governance.requireIndependentReview ||
    orderedTasks.some((task) => task.kind === 'review') ||
    evidenceWeight > 0

  // Route checks are ordered from strongest governance requirement to broadest
  // fallback. High-risk evidence beats dependency shape, and dependency shape
  // beats simple task count.
  if (riskRank(riskLevel) >= riskRank('high') && (hasReviewNeed || taskCount >= 4)) {
    return {
      mode: 'heavy',
      reason: 'High-risk or critical work with review/evidence needs requires heavy topology.',
    }
  }

  if (hasDependencies) {
    return {
      mode: 'graph',
      reason: 'Task dependencies require graph topology.',
    }
  }

  if (orderedTasks.every((task) => ['scope', 'review', 'docs'].includes(task.kind)) && hasReviewNeed) {
    return {
      mode: 'group_chat',
      reason: 'Bounded deliberation work can use group_chat topology before execution.',
    }
  }

  if (riskRank(riskLevel) === riskRank('medium') && hasReviewNeed && taskCount > 1) {
    return {
      mode: 'mixture',
      reason: 'Medium-risk work with review or evidence needs benefits from mixture review.',
    }
  }

  if (repositoryCount >= 3 && taskCount >= 6) {
    return {
      mode: 'forest',
      reason: 'Broad independent multi-repository work benefits from forest topology.',
    }
  }

  if (taskCount >= 5 || repositoryCount > 1) {
    return {
      mode: 'hierarchical',
      reason: 'Multi-task or multi-repository work needs director-led hierarchical topology.',
    }
  }

  if (taskCount > 1 && orderedTasks.every((task) => task.canRunInParallel !== false)) {
    return {
      mode: 'concurrent',
      reason: 'Independent tasks can run concurrently.',
    }
  }

  return {
    mode: 'sequential',
    reason: 'Small bounded work can run sequentially.',
  }
}

export function createGalSwarmTopologyPlan(request: GalSwarmTopologyRequest): GalSwarmTopologyPlan {
  validateGalSwarmTopologyRequest(request)

  // The public plan is intentionally normalized. Downstream services can store
  // it without re-running alias normalization or task ordering.
  const route = routeGalSwarmTopology(request)
  const tasks = orderGalSwarmTopologyTasks(request.tasks)
  const repositories = uniqueStrings([
    ...request.repositories,
    ...tasks.map((task) => task.repository).filter((repository): repository is string => Boolean(repository)),
  ])
  const issues = uniqueStrings([
    ...(request.issues ?? []),
    ...tasks.flatMap((task) => task.issueRefs ?? []),
  ])
  const governance = normalizeGalSwarmGovernance(request.governance)
  assertRepositoriesAllowed(repositories, governance)
  const riskLevel = highestGalSwarmRiskLevel([request.riskLevel, ...tasks.map((task) => task.riskLevel)])
  const evidenceRequirements = normalizeGalSwarmEvidenceRequirements(request, tasks, riskLevel, governance)
  const laneDrafts = createGalSwarmLaneDrafts({
    objective: request.objective.trim(),
    mode: route.mode,
    tasks,
    repositories,
    issues,
    governance,
    evidenceRequirements,
    riskLevel,
  })

  return {
    schemaVersion: GAL_SWARM_TOPOLOGY_SCHEMA_VERSION,
    objective: request.objective.trim(),
    mode: route.mode,
    routeReason: route.reason,
    riskLevel,
    repositories,
    issues,
    tasks,
    lanes: laneDrafts.map((lane) => ({
      ...lane,
      placement: selectGalSwarmLanePlacement(lane, request.fleet ?? []),
    })),
    evidenceRequirements,
    governance,
  }
}

export function orderGalSwarmTopologyTasks(tasks: GalSwarmTopologyTask[]): GalSwarmTopologyTask[] {
  const normalized = tasks.map(normalizeGalSwarmTopologyTask)
  const indexById = new Map<string, number>()

  normalized.forEach((task, index) => {
    if (indexById.has(task.id)) {
      throw new Error(`Duplicate topology task id: ${task.id}`)
    }
    indexById.set(task.id, index)
  })

  const adjacency = new Map<string, string[]>()
  const indegree = new Map<string, number>()

  for (const task of normalized) {
    adjacency.set(task.id, [])
    indegree.set(task.id, 0)
  }

  for (const task of normalized) {
    for (const dependencyId of task.dependsOn ?? []) {
      if (!indexById.has(dependencyId)) {
        throw new Error(`Topology task ${task.id} depends on unknown task ${dependencyId}`)
      }
      if (dependencyId === task.id) {
        throw new Error(`Topology task ${task.id} cannot depend on itself`)
      }
      adjacency.get(dependencyId)!.push(task.id)
      indegree.set(task.id, (indegree.get(task.id) ?? 0) + 1)
    }
  }

  const ready = normalized
    .filter((task) => indegree.get(task.id) === 0)
    .sort((a, b) => indexById.get(a.id)! - indexById.get(b.id)!)
  const ordered: GalSwarmTopologyTask[] = []

  while (ready.length > 0) {
    const task = ready.shift()!
    ordered.push(task)

    for (const dependentId of adjacency.get(task.id) ?? []) {
      const nextIndegree = (indegree.get(dependentId) ?? 0) - 1
      indegree.set(dependentId, nextIndegree)
      if (nextIndegree === 0) {
        ready.push(normalized[indexById.get(dependentId)!])
        ready.sort((a, b) => indexById.get(a.id)! - indexById.get(b.id)!)
      }
    }
  }

  if (ordered.length !== normalized.length) {
    throw new Error('Topology task graph contains a dependency cycle')
  }

  return ordered
}

export function scoreGalSwarmFleetPlacement(
  lane: Pick<GalSwarmExecutionLane, 'id' | 'role' | 'requiredCapabilities'>,
  node: GalSwarmFleetNode,
): GalSwarmLanePlacement {
  const nodeCapabilities = inferGalSwarmFleetNodeCapabilities(node)
  const requiredCapabilities = uniqueCapabilities(lane.requiredCapabilities)
  const matchedCapabilities = requiredCapabilities.filter((capability) => nodeCapabilities.has(capability))
  const missingCapabilities = requiredCapabilities.filter((capability) => !nodeCapabilities.has(capability))
  const resourceScore = Math.min(node.cpuCores ?? 0, 32) / 8 + Math.min(node.memoryGb ?? 0, 128) / 32
  const score = node.available === false
    ? 0
    : round(
        10 +
        matchedCapabilities.reduce((total, capability) => total + fleetCapabilityWeight(capability), 0) -
        missingCapabilities.reduce((total, capability) => total + fleetCapabilityWeight(capability), 0) +
        resourceScore,
        3,
      )

  return {
    laneId: lane.id,
    nodeId: node.id,
    runnerLabel: node.runnerLabels[0] ?? fallbackGalSwarmRunnerLabel(lane),
    score,
    matchedCapabilities,
    missingCapabilities,
    reason: missingCapabilities.length === 0
      ? `Selected ${node.label} with all required capabilities.`
      : `Selected ${node.label}; missing ${missingCapabilities.join(', ')}.`,
  }
}

export function selectGalSwarmLanePlacement(
  lane: Pick<GalSwarmExecutionLane, 'id' | 'role' | 'requiredCapabilities'>,
  fleet: GalSwarmFleetNode[],
): GalSwarmLanePlacement {
  const availableFleet = fleet.filter((node) => node.available !== false)
  const ranked = availableFleet
    .map((node) => scoreGalSwarmFleetPlacement(lane, node))
    .sort((a, b) => b.score - a.score || (a.nodeId ?? '').localeCompare(b.nodeId ?? ''))
  const selected = ranked[0]

  if (selected) return selected

  return {
    laneId: lane.id,
    runnerLabel: fallbackGalSwarmRunnerLabel(lane),
    score: 0,
    matchedCapabilities: [],
    missingCapabilities: uniqueCapabilities(lane.requiredCapabilities),
    reason: 'No available fleet inventory was supplied; using default x64 runner fallback.',
  }
}

type GalSwarmExecutionLaneDraft = Omit<GalSwarmExecutionLane, 'placement'>

function validateGalSwarmTopologyRequest(request: GalSwarmTopologyRequest): void {
  if (request.schemaVersion && request.schemaVersion !== GAL_SWARM_TOPOLOGY_SCHEMA_VERSION) {
    throw new Error(`Topology schemaVersion must be ${GAL_SWARM_TOPOLOGY_SCHEMA_VERSION}`)
  }
  if (!request.objective.trim()) throw new Error('Topology objective is required.')
  if (!GAL_SWARM_RISK_LEVELS.includes(request.riskLevel)) throw new Error(`Invalid risk level: ${request.riskLevel}`)
  if (request.desiredMode) {
    normalizeGalSwarmTopologyMode(request.desiredMode)
  }
  if (request.tasks.length === 0) throw new Error('Topology request must include at least one task.')
  for (const repository of request.repositories) {
    if (!repository.trim()) throw new Error('Topology repositories cannot include blank entries.')
  }
  for (const task of request.tasks) {
    if (!task.id.trim()) throw new Error('Topology task id is required.')
    if (!task.title.trim()) throw new Error(`Topology task ${task.id} title is required.`)
    if (!GAL_SWARM_TASK_KINDS.includes(task.kind)) throw new Error(`Invalid topology task kind: ${task.kind}`)
    if (task.riskLevel && !GAL_SWARM_RISK_LEVELS.includes(task.riskLevel)) {
      throw new Error(`Invalid topology task risk level: ${task.riskLevel}`)
    }
    for (const capability of task.requiredCapabilities ?? []) {
      if (!GAL_SWARM_FLEET_CAPABILITIES.includes(capability)) {
        throw new Error(`Invalid task capability: ${capability}`)
      }
    }
  }
}

function normalizeGalSwarmGovernance(
  governance: GalSwarmGovernanceConstraints = {},
): Required<GalSwarmGovernanceConstraints> {
  return {
    allowedRepositories: uniqueStrings(governance.allowedRepositories ?? []),
    allowedTools: uniqueStrings(governance.allowedTools ?? []),
    maxConcurrentLanes: governance.maxConcurrentLanes ?? 8,
    requireFileLeases: governance.requireFileLeases ?? true,
    requireIndependentReview: governance.requireIndependentReview ?? false,
    requireApprovalForDeployments: governance.requireApprovalForDeployments ?? true,
    allowDeployments: governance.allowDeployments ?? false,
  }
}

function normalizeGalSwarmTopologyTask(task: GalSwarmTopologyTask): GalSwarmTopologyTask {
  return {
    ...task,
    id: task.id.trim(),
    title: task.title.trim(),
    repository: task.repository?.trim() || undefined,
    issueRefs: uniqueStrings(task.issueRefs ?? []),
    dependsOn: uniqueStrings(task.dependsOn ?? []),
    requiredCapabilities: uniqueCapabilities(task.requiredCapabilities ?? []),
    evidenceRequirements: uniqueStrings(task.evidenceRequirements ?? []),
  }
}

function normalizeGalSwarmEvidenceRequirements(
  request: GalSwarmTopologyRequest,
  tasks: GalSwarmTopologyTask[],
  riskLevel: GalSwarmRiskLevel,
  governance: Required<GalSwarmGovernanceConstraints>,
): GalSwarmEvidenceRequirement[] {
  // Evidence requirements are data because gal-api and dashboards need to show
  // missing proof without parsing implementation-specific worker summaries.
  const requirements: GalSwarmEvidenceRequirement[] = [
    {
      id: 'task-graph',
      title: 'A deterministic task graph and lane assignment record is attached.',
      requiredForRoles: ['director'],
    },
    {
      id: 'bounded-ownership',
      title: 'Every lane declares bounded repositories, issues, tools, and file-lease expectations.',
      requiredForRoles: ['scope', 'director'],
    },
  ]

  if (governance.requireFileLeases) {
    requirements.push({
      id: 'file-leases',
      title: 'Workers must publish file ownership before edits and release it before reconciliation.',
      requiredForRoles: ['worker', 'reconciler'],
    })
  }

  if (tasks.some((task) => ['implementation', 'build', 'test', 'release', 'verify'].includes(task.kind))) {
    requirements.push({
      id: 'tests',
      title: 'Tests, build output, or an explicit no-test rationale must be attached.',
      requiredForRoles: ['worker', 'verifier'],
    })
  }

  if (governance.requireIndependentReview || riskRank(riskLevel) >= riskRank('high')) {
    requirements.push({
      id: 'independent-review',
      title: 'An independent reviewer lane must review risky diffs before reconciliation.',
      requiredForRoles: ['reviewer', 'reconciler'],
      requiredForRiskAtLeast: 'medium',
    })
  }

  if (riskRank(riskLevel) >= riskRank('high') || tasks.some((task) => task.kind === 'release')) {
    requirements.push({
      id: 'runtime-proof',
      title: 'Runtime, CI, or release evidence must prove the requested outcome before closeout.',
      requiredForRoles: ['verifier'],
      requiredForRiskAtLeast: 'high',
    })
  }

  if (tasks.some((task) => task.kind === 'security')) {
    requirements.push({
      id: 'security-findings',
      title: 'Security worker findings and residual-risk notes must be attached.',
      requiredForRoles: ['worker', 'reviewer', 'verifier'],
    })
  }

  return uniqueEvidenceRequirements([...requirements, ...(request.evidenceRequirements ?? [])])
}

function createGalSwarmLaneDrafts(input: {
  objective: string
  mode: GalSwarmOrchestrationMode
  tasks: GalSwarmTopologyTask[]
  repositories: string[]
  issues: string[]
  governance: Required<GalSwarmGovernanceConstraints>
  evidenceRequirements: GalSwarmEvidenceRequirement[]
  riskLevel: GalSwarmRiskLevel
}): GalSwarmExecutionLaneDraft[] {
  const taskById = new Map(input.tasks.map((task) => [task.id, task]))
  const workerLaneIds = input.tasks.map((task) => workerLaneId(task.id))
  // Every mode starts with director and scope lanes. Mode differences are
  // expressed by extra reviewer/reconciler gates, not by separate runtimes.
  const lanes: GalSwarmExecutionLaneDraft[] = [
    createLaneDraft({
      id: 'lane-director',
      role: 'director',
      title: `Director: ${input.objective}`,
      taskIds: input.tasks.map((task) => task.id),
      dependsOnLaneIds: [],
      requiredCapabilities: ['review'],
      repositories: input.repositories,
      issueRefs: input.issues,
      governance: input.governance,
      evidenceExpectations: [
        'assignment-record',
        ...evidenceIdsForLane(input.evidenceRequirements, 'director', input.riskLevel),
      ],
    }),
    createLaneDraft({
      id: 'lane-scope',
      role: 'scope',
      title: 'Scope and governance aperture',
      taskIds: input.tasks.map((task) => task.id),
      dependsOnLaneIds: ['lane-director'],
      requiredCapabilities: ['review'],
      repositories: input.repositories,
      issueRefs: input.issues,
      governance: input.governance,
      evidenceExpectations: [
        'repo-contract',
        'policy-boundary',
        ...evidenceIdsForLane(input.evidenceRequirements, 'scope', input.riskLevel),
      ],
    }),
  ]

  for (const task of input.tasks) {
    lanes.push(createLaneDraft({
      id: workerLaneId(task.id),
      role: 'worker',
      title: `${task.kind}: ${task.title}`,
      taskIds: [task.id],
      dependsOnLaneIds: uniqueStrings([
        'lane-scope',
        ...(task.dependsOn ?? []).map(workerLaneId),
      ]),
      requiredCapabilities: inferGalSwarmTaskCapabilities(task),
      repositories: task.repository ? [task.repository] : input.repositories,
      issueRefs: task.issueRefs ?? [],
      governance: input.governance,
      evidenceExpectations: uniqueStrings([
        'worker-summary',
        ...(task.evidenceRequirements ?? []),
        ...evidenceIdsForLane(input.evidenceRequirements, 'worker', task.riskLevel ?? input.riskLevel),
      ]),
    }))
  }

  const needsReviewer = input.governance.requireIndependentReview ||
    riskRank(input.riskLevel) >= riskRank('medium') ||
    ['heavy', 'mixture', 'group_chat', 'router'].includes(input.mode)
  if (needsReviewer) {
    lanes.push(createLaneDraft({
      id: 'lane-reviewer',
      role: 'reviewer',
      title: 'Independent review',
      taskIds: input.tasks.map((task) => task.id),
      dependsOnLaneIds: workerLaneIds,
      requiredCapabilities: ['review'],
      repositories: input.repositories,
      issueRefs: input.issues,
      governance: input.governance,
      evidenceExpectations: [
        'review-notes',
        ...evidenceIdsForLane(input.evidenceRequirements, 'reviewer', input.riskLevel),
      ],
    }))
  }

  const reviewerLaneId = needsReviewer ? ['lane-reviewer'] : []
  const needsReconciler = input.tasks.length > 1 || input.mode !== 'sequential'
  if (needsReconciler) {
    lanes.push(createLaneDraft({
      id: 'lane-reconciler',
      role: 'reconciler',
      title: 'Reconcile worker outputs',
      taskIds: input.tasks.map((task) => task.id),
      dependsOnLaneIds: reviewerLaneId.length > 0 ? reviewerLaneId : workerLaneIds,
      requiredCapabilities: ['repo-write'],
      repositories: input.repositories,
      issueRefs: input.issues,
      governance: input.governance,
      evidenceExpectations: [
        'merged-output',
        'conflict-check',
        ...evidenceIdsForLane(input.evidenceRequirements, 'reconciler', input.riskLevel),
      ],
    }))
  }

  lanes.push(createLaneDraft({
    id: 'lane-verifier',
    role: 'verifier',
    title: 'Verify and attach proof',
    taskIds: input.tasks.map((task) => task.id),
    dependsOnLaneIds: needsReconciler ? ['lane-reconciler'] : reviewerLaneId.length > 0 ? reviewerLaneId : workerLaneIds,
    requiredCapabilities: inferGalSwarmVerifierCapabilities(input.tasks),
    repositories: input.repositories,
    issueRefs: input.issues,
    governance: input.governance,
    evidenceExpectations: [
      'verification-result',
      ...evidenceIdsForLane(input.evidenceRequirements, 'verifier', input.riskLevel),
    ],
  }))

  assertLaneDraftsValid(lanes, taskById)

  return lanes
}

function assertRepositoriesAllowed(
  repositories: string[],
  governance: Required<GalSwarmGovernanceConstraints>,
): void {
  if (governance.allowedRepositories.length === 0) return
  const allowed = new Set(governance.allowedRepositories)
  for (const repository of repositories) {
    if (!allowed.has(repository)) {
      throw new Error(`Topology repository ${repository} is outside governance.allowedRepositories`)
    }
  }
}

function assertLaneDraftsValid(
  lanes: GalSwarmExecutionLaneDraft[],
  taskById: Map<string, GalSwarmTopologyTask>,
): void {
  const laneIds = new Set<string>()
  for (const lane of lanes) {
    if (laneIds.has(lane.id)) {
      throw new Error(`Duplicate topology lane id: ${lane.id}`)
    }
    laneIds.add(lane.id)
  }

  for (const lane of lanes) {
    for (const dependencyId of lane.dependsOnLaneIds) {
      if (!laneIds.has(dependencyId)) throw new Error(`Lane ${lane.id} depends on unknown lane ${dependencyId}`)
    }
    for (const taskId of lane.taskIds) {
      if (!taskById.has(taskId)) throw new Error(`Lane ${lane.id} references unknown task ${taskId}`)
    }
  }
}

function createLaneDraft(input: {
  id: string
  role: GalSwarmLaneRole
  title: string
  taskIds: string[]
  dependsOnLaneIds: string[]
  requiredCapabilities: GalSwarmFleetCapability[]
  repositories: string[]
  issueRefs: string[]
  governance: Required<GalSwarmGovernanceConstraints>
  evidenceExpectations: string[]
}): GalSwarmExecutionLaneDraft {
  return {
    id: input.id,
    role: input.role,
    title: input.title,
    taskIds: uniqueStrings(input.taskIds),
    dependsOnLaneIds: uniqueStrings(input.dependsOnLaneIds),
    requiredCapabilities: uniqueCapabilities(input.requiredCapabilities),
    ownership: {
      taskIds: uniqueStrings(input.taskIds),
      repositories: input.governance.allowedRepositories.length > 0
        ? uniqueStrings(input.repositories).filter((repository) => input.governance.allowedRepositories.includes(repository))
        : uniqueStrings(input.repositories),
      issueRefs: uniqueStrings(input.issueRefs),
      allowedTools: input.governance.allowedTools,
      fileLeasesRequired: input.governance.requireFileLeases,
    },
    evidenceExpectations: uniqueStrings(input.evidenceExpectations),
  }
}

function inferGalSwarmTaskCapabilities(task: GalSwarmTopologyTask): GalSwarmFleetCapability[] {
  const capabilities = [...(task.requiredCapabilities ?? [])]
  switch (task.kind) {
    case 'build':
      capabilities.push('linux-x64', 'build', 'docker')
      break
    case 'test':
      capabilities.push('linux-x64', 'test')
      break
    case 'security':
      capabilities.push('kali', 'security')
      break
    case 'mac_ios':
      capabilities.push('darwin-arm64', 'mac', 'ios')
      break
    case 'release':
      capabilities.push('linux-x64', 'build', 'test')
      break
    case 'implementation':
    case 'docs':
    case 'reconcile':
      capabilities.push('repo-write')
      break
    case 'review':
      capabilities.push('review')
      break
    case 'verify':
      capabilities.push('test')
      break
    case 'scope':
      capabilities.push('review')
      break
  }
  return uniqueCapabilities(capabilities)
}

function inferGalSwarmVerifierCapabilities(tasks: GalSwarmTopologyTask[]): GalSwarmFleetCapability[] {
  if (tasks.some((task) => task.kind === 'mac_ios')) return ['darwin-arm64', 'mac', 'ios', 'test']
  if (tasks.some((task) => task.kind === 'security')) return ['kali', 'security', 'test']
  if (tasks.some((task) => ['build', 'test', 'release'].includes(task.kind))) return ['linux-x64', 'test']
  return ['test']
}

function inferGalSwarmFleetNodeCapabilities(node: GalSwarmFleetNode): Set<GalSwarmFleetCapability> {
  const capabilities = new Set<GalSwarmFleetCapability>(node.capabilities)
  if (node.os === 'linux' && node.arch === 'x64') capabilities.add('linux-x64')
  if (node.os === 'darwin' && node.arch === 'arm64') {
    capabilities.add('darwin-arm64')
    capabilities.add('mac')
  }
  const searchable = `${node.id} ${node.label} ${node.runnerLabels.join(' ')}`.toLowerCase()
  if (searchable.includes('kali')) {
    capabilities.add('kali')
    capabilities.add('security')
  }
  return capabilities
}

function fallbackGalSwarmRunnerLabel(
  lane: Pick<GalSwarmExecutionLane, 'role' | 'requiredCapabilities'>,
): string {
  const capabilities = new Set(lane.requiredCapabilities)
  if (capabilities.has('kali') || capabilities.has('security') || capabilities.has('build')) {
    return GAL_SWARM_DEFAULT_X64_RUNNER_LABELS[2]
  }
  if (capabilities.has('test') || capabilities.has('docker')) {
    return GAL_SWARM_DEFAULT_X64_RUNNER_LABELS[1]
  }
  return GAL_SWARM_DEFAULT_X64_RUNNER_LABELS[0]
}

function workerLaneId(taskId: string): string {
  return `lane-worker-${taskId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function fleetCapabilityWeight(capability: GalSwarmFleetCapability): number {
  switch (capability) {
    case 'kali':
    case 'security':
      return 26
    case 'darwin-arm64':
    case 'mac':
    case 'ios':
      return 24
    case 'linux-x64':
    case 'build':
    case 'test':
    case 'docker':
      return 18
    case 'repo-write':
    case 'review':
      return 10
    case 'browser':
    case 'gpu':
      return 12
  }
}


function evidenceIdsForLane(
  requirements: GalSwarmEvidenceRequirement[],
  role: GalSwarmLaneRole,
  riskLevel: GalSwarmRiskLevel,
): string[] {
  return requirements
    .filter((requirement) => !requirement.requiredForRoles || requirement.requiredForRoles.includes(role))
    .filter((requirement) => !requirement.requiredForRiskAtLeast || riskRank(riskLevel) >= riskRank(requirement.requiredForRiskAtLeast))
    .map((requirement) => requirement.id)
}

function uniqueEvidenceRequirements(requirements: GalSwarmEvidenceRequirement[]): GalSwarmEvidenceRequirement[] {
  const seen = new Set<string>()
  const result: GalSwarmEvidenceRequirement[] = []
  for (const requirement of requirements) {
    const id = requirement.id.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push({
      ...requirement,
      id,
      title: requirement.title.trim(),
      requiredForRoles: requirement.requiredForRoles ? [...requirement.requiredForRoles] : undefined,
    })
  }
  return result
}
