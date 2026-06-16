import { GAL_SWARM_TOPOLOGY_SCHEMA_VERSION } from './schema.js'

/**
 * Architecture-mode contracts for governed Swarm execution.
 *
 * The public API accepts both GAL-native modes and public Swarms aliases, then
 * normalizes them into this smaller set of governed topology primitives.
 */

export const GAL_SWARM_ORCHESTRATION_MODES = [
  'sequential',
  'concurrent',
  'graph',
  'hierarchical',
  'mixture',
  'group_chat',
  'forest',
  'heavy',
  'router',
] as const

export type GalSwarmOrchestrationMode = (typeof GAL_SWARM_ORCHESTRATION_MODES)[number]

export const GAL_SWARM_DEFAULT_X64_RUNNER_LABELS = [
  'agents-standard-runc-x64',
  'agents-medium-runc-x64',
  'agents-high-runc-x64',
] as const


export type GalSwarmDesiredTopologyMode = GalSwarmOrchestrationMode | 'auto'

/**
 * Compatibility aliases accepted from public Swarms naming.
 *
 * These names are API inputs only; GAL Swarm does not import or execute the
 * external Swarms runtime.
 */
export const GAL_SWARM_PUBLIC_TOPOLOGY_MODES = [
  'SequentialWorkflow',
  'ConcurrentWorkflow',
  'GraphWorkflow',
  'HierarchicalSwarm',
  'HiearchicalSwarm',
  'MixtureOfAgents',
  'MoA',
  'SelfMoASeq',
  'GroupChat',
  'InteractiveGroupChat',
  'ForestSwarm',
  'Tree',
  'TreeAgent',
  'HeavySwarm',
  'AdvisorSwarm',
  'PlannerGeneratorEvaluator',
  'PeerReviewProcess',
  'TrialSimulation',
  'SwarmRouter',
  'MultiAgentRouter',
  'AgentRouter',
  'ModelRouter',
  'SkillOrchestra',
  'AgentRearrange',
  'SwarmRearrange',
  'AutoSwarmBuilder',
  'PlannerWorkerSwarm',
  'HybridHierarchicalClusterSwarm',
  'HierarchicalStructuredCommunicationFramework',
  'HHCS',
  'MajorityVoting',
  'CouncilAsAJudge',
  'CouncilOfJudges',
  'LLMCouncil',
  'DebateWithJudge',
  'OneOnOneDebate',
  'ExpertPanelDiscussion',
  'RoundTableDiscussion',
  'InterviewSeries',
  'MediationSession',
  'BrainstormingSession',
  'CouncilMeeting',
  'MentorshipSession',
  'NegotiationSession',
  'RoundRobin',
  'RoundRobinSwarm',
  'BatchedGridWorkflow',
  'SpreadSheetSwarm',
  'SpreadsheetSwarm',
  'SocialAlgorithms',
  'Broadcast',
  'CircularSwarm',
  'MeshSwarm',
  'OneToOne',
  'PyramidSwarm',
  'StarSwarm',
  'broadcast',
  'circular_swarm',
  'grid_swarm',
  'mesh_swarm',
  'one_to_one',
  'pyramid_swarm',
  'star_swarm',
  'AdvancedResearch',
  'MALT',
  'auto',
] as const

export type GalSwarmPublicTopologyMode = (typeof GAL_SWARM_PUBLIC_TOPOLOGY_MODES)[number]
export type GalSwarmTopologyModeInput = GalSwarmDesiredTopologyMode | GalSwarmPublicTopologyMode

export interface GalSwarmTopologyModeMapping {
  publicMode: GalSwarmPublicTopologyMode
  canonicalMode: GalSwarmDesiredTopologyMode
  family: 'workflow' | 'routing' | 'organization' | 'collaboration' | 'decision' | 'specialized'
  reason: string
}

export interface GalSwarmTopologyAlias {
  alias: string
  canonicalMode: GalSwarmDesiredTopologyMode
  family: GalSwarmTopologyModeMapping['family'] | 'canonical'
  source: 'gal' | 'public'
}


export interface GalSwarmNormalizedTopologyMode {
  inputMode: string
  publicMode: GalSwarmPublicTopologyMode | GalSwarmDesiredTopologyMode
  canonicalMode: GalSwarmDesiredTopologyMode
  reason: string
}

export const GAL_SWARM_RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const

export type GalSwarmRiskLevel = (typeof GAL_SWARM_RISK_LEVELS)[number]

export const GAL_SWARM_TASK_KINDS = [
  'scope',
  'implementation',
  'build',
  'test',
  'review',
  'security',
  'mac_ios',
  'docs',
  'release',
  'reconcile',
  'verify',
] as const

export type GalSwarmTaskKind = (typeof GAL_SWARM_TASK_KINDS)[number]

export const GAL_SWARM_LANE_ROLES = [
  'director',
  'scope',
  'worker',
  'reviewer',
  'reconciler',
  'verifier',
] as const

export type GalSwarmLaneRole = (typeof GAL_SWARM_LANE_ROLES)[number]

export const GAL_SWARM_FLEET_CAPABILITIES = [
  'linux-x64',
  'darwin-arm64',
  'mac',
  'ios',
  'kali',
  'security',
  'docker',
  'build',
  'test',
  'browser',
  'gpu',
  'repo-write',
  'review',
] as const

export type GalSwarmFleetCapability = (typeof GAL_SWARM_FLEET_CAPABILITIES)[number]

export type GalSwarmFleetOs = 'linux' | 'darwin' | 'windows' | 'unknown'
export type GalSwarmFleetArch = 'x64' | 'arm64' | 'unknown'

export interface GalSwarmTopologyTask {
  id: string
  title: string
  kind: GalSwarmTaskKind
  repository?: string
  issueRefs?: string[]
  dependsOn?: string[]
  canRunInParallel?: boolean
  riskLevel?: GalSwarmRiskLevel
  requiredCapabilities?: GalSwarmFleetCapability[]
  evidenceRequirements?: string[]
}

export interface GalSwarmFleetNode {
  id: string
  label: string
  os: GalSwarmFleetOs
  arch: GalSwarmFleetArch
  runnerLabels: string[]
  capabilities: GalSwarmFleetCapability[]
  cpuCores?: number
  memoryGb?: number
  maxConcurrentLanes?: number
  available?: boolean
}

export interface GalSwarmGovernanceConstraints {
  allowedRepositories?: string[]
  allowedTools?: string[]
  maxConcurrentLanes?: number
  requireFileLeases?: boolean
  requireIndependentReview?: boolean
  requireApprovalForDeployments?: boolean
  allowDeployments?: boolean
}

export interface GalSwarmEvidenceRequirement {
  id: string
  title: string
  requiredForRoles?: GalSwarmLaneRole[]
  requiredForRiskAtLeast?: GalSwarmRiskLevel
}

export interface GalSwarmTopologyRequest {
  schemaVersion?: typeof GAL_SWARM_TOPOLOGY_SCHEMA_VERSION
  objective: string
  repositories: string[]
  issues?: string[]
  riskLevel: GalSwarmRiskLevel
  desiredMode?: GalSwarmTopologyModeInput
  tasks: GalSwarmTopologyTask[]
  fleet?: GalSwarmFleetNode[]
  governance?: GalSwarmGovernanceConstraints
  evidenceRequirements?: GalSwarmEvidenceRequirement[]
}

export interface GalSwarmTopologyRouteDecision {
  mode: GalSwarmOrchestrationMode
  reason: string
}

export interface GalSwarmLaneOwnership {
  taskIds: string[]
  repositories: string[]
  issueRefs: string[]
  allowedTools: string[]
  fileLeasesRequired: boolean
}

export interface GalSwarmLanePlacement {
  laneId: string
  nodeId?: string
  runnerLabel: string
  score: number
  matchedCapabilities: GalSwarmFleetCapability[]
  missingCapabilities: GalSwarmFleetCapability[]
  reason: string
}

export interface GalSwarmExecutionLane {
  id: string
  role: GalSwarmLaneRole
  title: string
  taskIds: string[]
  dependsOnLaneIds: string[]
  requiredCapabilities: GalSwarmFleetCapability[]
  ownership: GalSwarmLaneOwnership
  evidenceExpectations: string[]
  placement: GalSwarmLanePlacement
}

export interface GalSwarmTopologyPlan {
  schemaVersion: typeof GAL_SWARM_TOPOLOGY_SCHEMA_VERSION
  objective: string
  mode: GalSwarmOrchestrationMode
  routeReason: string
  riskLevel: GalSwarmRiskLevel
  repositories: string[]
  issues: string[]
  tasks: GalSwarmTopologyTask[]
  lanes: GalSwarmExecutionLane[]
  evidenceRequirements: GalSwarmEvidenceRequirement[]
  governance: Required<GalSwarmGovernanceConstraints>
}
