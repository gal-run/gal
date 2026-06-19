import {
  GAL_SWARM_ORCHESTRATION_MODES,
  type GalSwarmDesiredTopologyMode,
  type GalSwarmNormalizedTopologyMode,
  type GalSwarmTopologyAlias,
  type GalSwarmTopologyModeMapping,
} from '../contracts.js'

/**
 * Public Swarms names are normalized into GAL primitives instead of becoming
 * separate engines. That keeps API compatibility broad while preserving one
 * governed execution model.
 */
export const GAL_SWARM_TOPOLOGY_MODE_MAPPINGS: readonly GalSwarmTopologyModeMapping[] = [
  {
    publicMode: 'SequentialWorkflow',
    canonicalMode: 'sequential',
    family: 'workflow',
    reason: 'Public sequential workflow maps to the GAL sequential primitive.',
  },
  {
    publicMode: 'ConcurrentWorkflow',
    canonicalMode: 'concurrent',
    family: 'workflow',
    reason: 'Public concurrent workflow maps to independent GAL lanes.',
  },
  {
    publicMode: 'GraphWorkflow',
    canonicalMode: 'graph',
    family: 'workflow',
    reason: 'Public graph workflow maps to GAL dependency-aware task graphs.',
  },
  {
    publicMode: 'HierarchicalSwarm',
    canonicalMode: 'hierarchical',
    family: 'organization',
    reason: 'Public hierarchical swarm maps to GAL director-led lanes.',
  },
  {
    publicMode: 'HiearchicalSwarm',
    canonicalMode: 'hierarchical',
    family: 'organization',
    reason: 'Preserves the public router spelling variant as a hierarchical alias.',
  },
  {
    publicMode: 'MixtureOfAgents',
    canonicalMode: 'mixture',
    family: 'collaboration',
    reason: 'Public mixture of agents maps to GAL proposal-and-synthesis topology.',
  },
  {
    publicMode: 'MoA',
    canonicalMode: 'mixture',
    family: 'collaboration',
    reason: 'MoA shorthand maps to GAL proposal-and-synthesis topology.',
  },
  {
    publicMode: 'SelfMoASeq',
    canonicalMode: 'mixture',
    family: 'collaboration',
    reason: 'Sequential self-mixture maps to GAL mixture synthesis without importing Python runtime phases.',
  },
  {
    publicMode: 'GroupChat',
    canonicalMode: 'group_chat',
    family: 'collaboration',
    reason: 'Public group chat maps to bounded GAL deliberation.',
  },
  {
    publicMode: 'InteractiveGroupChat',
    canonicalMode: 'group_chat',
    family: 'collaboration',
    reason: 'Interactive group chat uses the same bounded GAL deliberation primitive.',
  },
  {
    publicMode: 'ForestSwarm',
    canonicalMode: 'forest',
    family: 'organization',
    reason: 'Public forest swarm maps to GAL specialist teams under one evidence ledger.',
  },
  {
    publicMode: 'Tree',
    canonicalMode: 'forest',
    family: 'organization',
    reason: 'Tree taxonomy maps to GAL forest planning under one evidence ledger.',
  },
  {
    publicMode: 'TreeAgent',
    canonicalMode: 'forest',
    family: 'organization',
    reason: 'Tree-agent taxonomy maps to GAL forest planning under one evidence ledger.',
  },
  {
    publicMode: 'HeavySwarm',
    canonicalMode: 'heavy',
    family: 'specialized',
    reason: 'Public heavy swarm maps to GAL high-risk redundant review and proof.',
  },
  {
    publicMode: 'AdvisorSwarm',
    canonicalMode: 'heavy',
    family: 'specialized',
    reason: 'Advisor swarm maps to GAL heavy topology with redundant expert review and proof.',
  },
  {
    publicMode: 'PlannerGeneratorEvaluator',
    canonicalMode: 'heavy',
    family: 'specialized',
    reason: 'Planner-generator-evaluator maps to GAL heavy topology with explicit planning, generation, review, and proof lanes.',
  },
  {
    publicMode: 'PeerReviewProcess',
    canonicalMode: 'heavy',
    family: 'decision',
    reason: 'Peer review process maps to GAL heavy topology with independent review and verifier evidence.',
  },
  {
    publicMode: 'TrialSimulation',
    canonicalMode: 'heavy',
    family: 'specialized',
    reason: 'Trial simulation maps to GAL heavy topology for adversarial review and proof.',
  },
  {
    publicMode: 'SwarmRouter',
    canonicalMode: 'router',
    family: 'routing',
    reason: 'Public swarm router maps to explicit GAL router mode.',
  },
  {
    publicMode: 'MultiAgentRouter',
    canonicalMode: 'router',
    family: 'routing',
    reason: 'Public multi-agent routing maps to explicit GAL router mode.',
  },
  {
    publicMode: 'AgentRouter',
    canonicalMode: 'router',
    family: 'routing',
    reason: 'Public agent router maps to explicit GAL router mode.',
  },
  {
    publicMode: 'ModelRouter',
    canonicalMode: 'router',
    family: 'routing',
    reason: 'Public model router maps to explicit GAL router mode; GAL keeps model routing native.',
  },
  {
    publicMode: 'SkillOrchestra',
    canonicalMode: 'router',
    family: 'routing',
    reason: 'Skill orchestra maps to GAL router mode for native capability selection without importing an orchestration runtime.',
  },
  {
    publicMode: 'AgentRearrange',
    canonicalMode: 'graph',
    family: 'organization',
    reason: 'Agent rearrangement maps to a deterministic GAL graph ordering.',
  },
  {
    publicMode: 'SwarmRearrange',
    canonicalMode: 'graph',
    family: 'organization',
    reason: 'Swarm rearrangement maps to a deterministic GAL graph ordering.',
  },
  {
    publicMode: 'AutoSwarmBuilder',
    canonicalMode: 'auto',
    family: 'specialized',
    reason: 'Public auto builder maps to GAL auto routing instead of importing a builder runtime.',
  },
  {
    publicMode: 'PlannerWorkerSwarm',
    canonicalMode: 'hierarchical',
    family: 'organization',
    reason: 'Planner-worker-judge maps to GAL director, worker, review, and verifier lanes.',
  },
  {
    publicMode: 'HybridHierarchicalClusterSwarm',
    canonicalMode: 'hierarchical',
    family: 'organization',
    reason: 'Hybrid hierarchical-cluster swarms map to GAL hierarchy with bounded parallel worker lanes.',
  },
  {
    publicMode: 'HierarchicalStructuredCommunicationFramework',
    canonicalMode: 'hierarchical',
    family: 'organization',
    reason: 'Hierarchical structured communication maps to GAL hierarchy with director-led lanes and bounded handoffs.',
  },
  {
    publicMode: 'HHCS',
    canonicalMode: 'hierarchical',
    family: 'organization',
    reason: 'HHCS shorthand maps to GAL hierarchy with bounded parallel worker lanes.',
  },
  {
    publicMode: 'MajorityVoting',
    canonicalMode: 'mixture',
    family: 'decision',
    reason: 'Majority voting maps to GAL mixture synthesis across independent outputs.',
  },
  {
    publicMode: 'CouncilAsAJudge',
    canonicalMode: 'heavy',
    family: 'decision',
    reason: 'Council judging maps to GAL heavy topology with independent review and proof.',
  },
  {
    publicMode: 'CouncilOfJudges',
    canonicalMode: 'heavy',
    family: 'decision',
    reason: 'Council of judges maps to GAL heavy topology with independent review and proof.',
  },
  {
    publicMode: 'LLMCouncil',
    canonicalMode: 'mixture',
    family: 'decision',
    reason: 'LLM council maps to GAL mixture review with synthesis.',
  },
  {
    publicMode: 'DebateWithJudge',
    canonicalMode: 'group_chat',
    family: 'decision',
    reason: 'Debate with judge maps to bounded GAL deliberation with a judging lane.',
  },
  {
    publicMode: 'OneOnOneDebate',
    canonicalMode: 'group_chat',
    family: 'collaboration',
    reason: 'One-on-one debate maps to bounded GAL deliberation.',
  },
  {
    publicMode: 'ExpertPanelDiscussion',
    canonicalMode: 'group_chat',
    family: 'collaboration',
    reason: 'Expert panel discussion maps to bounded GAL deliberation.',
  },
  {
    publicMode: 'RoundTableDiscussion',
    canonicalMode: 'group_chat',
    family: 'collaboration',
    reason: 'Round-table discussion maps to bounded GAL deliberation.',
  },
  {
    publicMode: 'InterviewSeries',
    canonicalMode: 'sequential',
    family: 'workflow',
    reason: 'Interview series maps to GAL sequential lanes.',
  },
  {
    publicMode: 'MediationSession',
    canonicalMode: 'group_chat',
    family: 'collaboration',
    reason: 'Mediation session maps to bounded GAL deliberation.',
  },
  {
    publicMode: 'BrainstormingSession',
    canonicalMode: 'group_chat',
    family: 'collaboration',
    reason: 'Brainstorming session maps to bounded GAL deliberation.',
  },
  {
    publicMode: 'CouncilMeeting',
    canonicalMode: 'group_chat',
    family: 'collaboration',
    reason: 'Council meeting maps to bounded GAL deliberation.',
  },
  {
    publicMode: 'MentorshipSession',
    canonicalMode: 'group_chat',
    family: 'collaboration',
    reason: 'Mentorship session maps to bounded GAL deliberation.',
  },
  {
    publicMode: 'NegotiationSession',
    canonicalMode: 'group_chat',
    family: 'collaboration',
    reason: 'Negotiation session maps to bounded GAL deliberation.',
  },
  {
    publicMode: 'RoundRobin',
    canonicalMode: 'concurrent',
    family: 'routing',
    reason: 'Round-robin distribution maps to GAL concurrent lane assignment.',
  },
  {
    publicMode: 'RoundRobinSwarm',
    canonicalMode: 'concurrent',
    family: 'routing',
    reason: 'Round-robin distribution maps to GAL concurrent lane assignment.',
  },
  {
    publicMode: 'BatchedGridWorkflow',
    canonicalMode: 'mixture',
    family: 'workflow',
    reason: 'Batched grid comparison maps to GAL mixture synthesis across a task-agent matrix.',
  },
  {
    publicMode: 'SpreadSheetSwarm',
    canonicalMode: 'concurrent',
    family: 'workflow',
    reason: 'Spreadsheet-style row or cell processing maps to GAL concurrent lanes.',
  },
  {
    publicMode: 'SpreadsheetSwarm',
    canonicalMode: 'concurrent',
    family: 'workflow',
    reason: 'Spreadsheet-style row or cell processing maps to GAL concurrent lanes.',
  },
  {
    publicMode: 'SocialAlgorithms',
    canonicalMode: 'group_chat',
    family: 'collaboration',
    reason: 'Custom social algorithms map to bounded GAL deliberation unless a future GAL primitive is added.',
  },
  {
    publicMode: 'Broadcast',
    canonicalMode: 'group_chat',
    family: 'collaboration',
    reason: 'Broadcast social topology maps to bounded GAL deliberation.',
  },
  {
    publicMode: 'CircularSwarm',
    canonicalMode: 'graph',
    family: 'organization',
    reason: 'Circular social topology maps to an explicit GAL graph.',
  },
  {
    publicMode: 'MeshSwarm',
    canonicalMode: 'graph',
    family: 'organization',
    reason: 'Mesh social topology maps to an explicit GAL graph.',
  },
  {
    publicMode: 'OneToOne',
    canonicalMode: 'graph',
    family: 'organization',
    reason: 'One-to-one social topology maps to an explicit GAL graph edge.',
  },
  {
    publicMode: 'PyramidSwarm',
    canonicalMode: 'hierarchical',
    family: 'organization',
    reason: 'Pyramid social topology maps to GAL hierarchy.',
  },
  {
    publicMode: 'StarSwarm',
    canonicalMode: 'graph',
    family: 'organization',
    reason: 'Star social topology maps to an explicit GAL graph with a hub lane.',
  },
  {
    publicMode: 'broadcast',
    canonicalMode: 'group_chat',
    family: 'collaboration',
    reason: 'Broadcast social topology maps to bounded GAL deliberation.',
  },
  {
    publicMode: 'circular_swarm',
    canonicalMode: 'graph',
    family: 'organization',
    reason: 'Circular social topology maps to an explicit GAL graph.',
  },
  {
    publicMode: 'grid_swarm',
    canonicalMode: 'graph',
    family: 'organization',
    reason: 'Grid social topology maps to an explicit GAL graph.',
  },
  {
    publicMode: 'mesh_swarm',
    canonicalMode: 'graph',
    family: 'organization',
    reason: 'Mesh social topology maps to an explicit GAL graph.',
  },
  {
    publicMode: 'one_to_one',
    canonicalMode: 'graph',
    family: 'organization',
    reason: 'One-to-one social topology maps to an explicit GAL graph edge.',
  },
  {
    publicMode: 'pyramid_swarm',
    canonicalMode: 'hierarchical',
    family: 'organization',
    reason: 'Pyramid social topology maps to GAL hierarchy.',
  },
  {
    publicMode: 'star_swarm',
    canonicalMode: 'graph',
    family: 'organization',
    reason: 'Star social topology maps to an explicit GAL graph with a hub lane.',
  },
  {
    publicMode: 'AdvancedResearch',
    canonicalMode: 'heavy',
    family: 'specialized',
    reason: 'Advanced research maps to GAL heavy topology for stronger review and evidence.',
  },
  {
    publicMode: 'MALT',
    canonicalMode: 'heavy',
    family: 'specialized',
    reason: 'Multi-agent learning and training maps to GAL heavy topology until GAL owns a training primitive.',
  },
  {
    publicMode: 'auto',
    canonicalMode: 'auto',
    family: 'routing',
    reason: 'Public auto mode maps to GAL auto routing.',
  },
] as const

export function listGalSwarmTopologyAliases(): GalSwarmTopologyAlias[] {
  const aliases: GalSwarmTopologyAlias[] = GAL_SWARM_ORCHESTRATION_MODES.map((mode) => ({
    alias: mode,
    canonicalMode: mode,
    family: 'canonical',
    source: 'gal',
  }))
  aliases.push({
    alias: 'auto',
    canonicalMode: 'auto',
    family: 'canonical',
    source: 'gal',
  })

  const seenAliases = new Set(aliases.map((entry) => entry.alias))
  for (const mapping of GAL_SWARM_TOPOLOGY_MODE_MAPPINGS) {
    if (seenAliases.has(mapping.publicMode)) continue
    aliases.push({
      alias: mapping.publicMode,
      canonicalMode: mapping.canonicalMode,
      family: mapping.family,
      source: 'public',
    })
    seenAliases.add(mapping.publicMode)
  }

  return aliases
}

export function formatGalSwarmTopologyAliasHelp(prefix = ''): string {
  return listGalSwarmTopologyAliases()
    .map((entry) => `${prefix}${entry.alias} -> ${entry.canonicalMode}`)
    .join('\n')
}

export function normalizeGalSwarmTopologyMode(inputMode: string): GalSwarmNormalizedTopologyMode {
  const trimmedInput = inputMode.trim()
  const key = topologyModeKey(trimmedInput)
  const canonicalMode = GAL_SWARM_CANONICAL_TOPOLOGY_MODE_BY_KEY.get(key)

  if (canonicalMode) {
    return {
      inputMode: trimmedInput,
      publicMode: canonicalMode,
      canonicalMode,
      reason: canonicalMode === 'auto'
        ? 'GAL auto mode uses router heuristics to select a concrete topology.'
        : `Canonical GAL topology mode requested: ${canonicalMode}.`,
    }
  }

  const mapping = GAL_SWARM_PUBLIC_TOPOLOGY_MODE_BY_KEY.get(key)
  if (mapping) {
    return {
      inputMode: trimmedInput,
      publicMode: mapping.publicMode,
      canonicalMode: mapping.canonicalMode,
      reason: mapping.reason,
    }
  }

  throw new Error(`Invalid topology mode: ${inputMode}`)
}

const GAL_SWARM_CANONICAL_TOPOLOGY_MODE_BY_KEY = new Map<string, GalSwarmDesiredTopologyMode>([
  ...GAL_SWARM_ORCHESTRATION_MODES.map((mode): [string, GalSwarmDesiredTopologyMode] => [topologyModeKey(mode), mode]),
  [topologyModeKey('auto'), 'auto'],
])

const GAL_SWARM_PUBLIC_TOPOLOGY_MODE_BY_KEY = new Map<string, GalSwarmTopologyModeMapping>(
  GAL_SWARM_TOPOLOGY_MODE_MAPPINGS.map((mapping) => [topologyModeKey(mapping.publicMode), mapping]),
)

function topologyModeKey(mode: string): string {
  return mode.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}
