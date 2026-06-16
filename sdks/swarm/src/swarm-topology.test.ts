import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'

import {
  GAL_SWARM_DECISION_SCHEMA_VERSION,
  GAL_SWARM_HOT_START_SLO_SCHEMA_VERSION,
  GAL_SWARM_ORCHESTRATION_MODES,
  GAL_SWARM_PLAN_SCHEMA_VERSION,
  GAL_SWARM_PUBLIC_TOPOLOGY_MODES,
  GAL_SWARM_TOPOLOGY_SCHEMA_VERSION,
  GAL_SWARM_TOPOLOGY_MODE_MAPPINGS,
  GAL_SWARM_WAVE_EVIDENCE_LEDGER_SCHEMA_VERSION,
  buildGalSwarmLoadFromForecast,
  calculateGalSwarmEffectiveUtilization,
  calculateGalSwarmPressure,
  createGalSwarmHotStartSloContract,
  createGalSwarmCalibrationSummary,
  createGalSwarmProviderActionPlan,
  createGalSwarmRunPlan,
  createGalSwarmTopologyPlan,
  createGalSwarmWaveEvidenceLedger,
  defaultGalSwarmPreflightComputeProfiles,
  defaultGalSwarmProviderIntegrationProfiles,
  decideGalSwarmHotStartSlo,
  decideGalSwarmCapacity,
  detectGalSwarmWaveLeaseConflicts,
  evaluateGalSwarmBurstPreflight,
  formatGalSwarmTopologyAliasHelp,
  highestRunnablePriority,
  listGalSwarmTopologyAliases,
  normalizeGalSwarmTopologyMode,
  orderGalSwarmTopologyTasks,
  planGalSwarmDecision,
  planGalSwarmDecisionFromForecast,
  rankGalSwarmProviders,
  routeGalSwarmTopology,
  scoreGalSwarmFleetPlacement,
  selectGalSwarmProvider,
  summarizeGalSwarmWaveEvidence,
  validateGalSwarmPlan,
  type GalSwarmCostSnapshot,
  type GalSwarmExecutionForecastInput,
  type GalSwarmFleetNode,
  type GalSwarmLoadSnapshot,
  type GalSwarmPlan,
  type GalSwarmProviderCandidate,
  type GalSwarmTopologyRequest,
  type GalSwarmWaveWorkerEvidence,
} from './swarm.js'
import {
  baseCost,
  baseForecast,
  baseLoad,
  basePlan,
  hotStartContract,
  h200Candidates,
  h200Plan,
  planWithServerlessFallback,
  topologyFleet,
  topologyRequest,
  topologyTask,
  waveWorker,
} from './test-support/swarm-fixtures.js'

describe('GAL-native swarm topology contracts', () => {
  it('normalizes public Swarms modes into stable GAL-native topology modes', () => {
    expect(GAL_SWARM_PUBLIC_TOPOLOGY_MODES).toEqual([
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
    ])

    expect(GAL_SWARM_TOPOLOGY_MODE_MAPPINGS.map((mapping) => [
      mapping.publicMode,
      mapping.canonicalMode,
    ])).toEqual([
      ['SequentialWorkflow', 'sequential'],
      ['ConcurrentWorkflow', 'concurrent'],
      ['GraphWorkflow', 'graph'],
      ['HierarchicalSwarm', 'hierarchical'],
      ['HiearchicalSwarm', 'hierarchical'],
      ['MixtureOfAgents', 'mixture'],
      ['MoA', 'mixture'],
      ['SelfMoASeq', 'mixture'],
      ['GroupChat', 'group_chat'],
      ['InteractiveGroupChat', 'group_chat'],
      ['ForestSwarm', 'forest'],
      ['Tree', 'forest'],
      ['TreeAgent', 'forest'],
      ['HeavySwarm', 'heavy'],
      ['AdvisorSwarm', 'heavy'],
      ['PlannerGeneratorEvaluator', 'heavy'],
      ['PeerReviewProcess', 'heavy'],
      ['TrialSimulation', 'heavy'],
      ['SwarmRouter', 'router'],
      ['MultiAgentRouter', 'router'],
      ['AgentRouter', 'router'],
      ['ModelRouter', 'router'],
      ['SkillOrchestra', 'router'],
      ['AgentRearrange', 'graph'],
      ['SwarmRearrange', 'graph'],
      ['AutoSwarmBuilder', 'auto'],
      ['PlannerWorkerSwarm', 'hierarchical'],
      ['HybridHierarchicalClusterSwarm', 'hierarchical'],
      ['HierarchicalStructuredCommunicationFramework', 'hierarchical'],
      ['HHCS', 'hierarchical'],
      ['MajorityVoting', 'mixture'],
      ['CouncilAsAJudge', 'heavy'],
      ['CouncilOfJudges', 'heavy'],
      ['LLMCouncil', 'mixture'],
      ['DebateWithJudge', 'group_chat'],
      ['OneOnOneDebate', 'group_chat'],
      ['ExpertPanelDiscussion', 'group_chat'],
      ['RoundTableDiscussion', 'group_chat'],
      ['InterviewSeries', 'sequential'],
      ['MediationSession', 'group_chat'],
      ['BrainstormingSession', 'group_chat'],
      ['CouncilMeeting', 'group_chat'],
      ['MentorshipSession', 'group_chat'],
      ['NegotiationSession', 'group_chat'],
      ['RoundRobin', 'concurrent'],
      ['RoundRobinSwarm', 'concurrent'],
      ['BatchedGridWorkflow', 'mixture'],
      ['SpreadSheetSwarm', 'concurrent'],
      ['SpreadsheetSwarm', 'concurrent'],
      ['SocialAlgorithms', 'group_chat'],
      ['Broadcast', 'group_chat'],
      ['CircularSwarm', 'graph'],
      ['MeshSwarm', 'graph'],
      ['OneToOne', 'graph'],
      ['PyramidSwarm', 'hierarchical'],
      ['StarSwarm', 'graph'],
      ['broadcast', 'group_chat'],
      ['circular_swarm', 'graph'],
      ['grid_swarm', 'graph'],
      ['mesh_swarm', 'graph'],
      ['one_to_one', 'graph'],
      ['pyramid_swarm', 'hierarchical'],
      ['star_swarm', 'graph'],
      ['AdvancedResearch', 'heavy'],
      ['MALT', 'heavy'],
      ['auto', 'auto'],
    ])
  })

  it('exports a shared topology alias catalog for CLI, MCP, and API surfaces', () => {
    const aliases = listGalSwarmTopologyAliases()
    const aliasByName = new Map(aliases.map((entry) => [entry.alias, entry]))

    for (const mode of GAL_SWARM_ORCHESTRATION_MODES) {
      expect(aliasByName.get(mode)).toEqual({
        alias: mode,
        canonicalMode: mode,
        family: 'canonical',
        source: 'gal',
      })
    }
    expect(aliasByName.get('auto')).toEqual({
      alias: 'auto',
      canonicalMode: 'auto',
      family: 'canonical',
      source: 'gal',
    })

    for (const publicMode of GAL_SWARM_PUBLIC_TOPOLOGY_MODES) {
      expect(aliasByName.has(publicMode)).toBe(true)
    }

    expect(aliasByName.get('AgentRouter')?.canonicalMode).toBe('router')
    expect(aliasByName.get('SelfMoASeq')?.canonicalMode).toBe('mixture')
    expect(aliasByName.get('CouncilOfJudges')?.canonicalMode).toBe('heavy')
    expect(aliasByName.get('pyramid_swarm')?.canonicalMode).toBe('hierarchical')
    expect(aliasByName.get('AdvancedResearch')?.canonicalMode).toBe('heavy')
    expect(aliasByName.get('MALT')?.canonicalMode).toBe('heavy')
    expect(aliasByName.get('AdvisorSwarm')?.canonicalMode).toBe('heavy')
    expect(aliasByName.get('SkillOrchestra')?.canonicalMode).toBe('router')
    expect(aliasByName.get('OneOnOneDebate')?.canonicalMode).toBe('group_chat')
    expect(aliasByName.get('CircularSwarm')?.canonicalMode).toBe('graph')
  })

  it('formats stable topology alias help text with canonical mappings', () => {
    const help = formatGalSwarmTopologyAliasHelp('  ')

    expect(help.split('\n').slice(0, 3)).toEqual([
      '  sequential -> sequential',
      '  concurrent -> concurrent',
      '  graph -> graph',
    ])
    expect(help).toContain('  AgentRouter -> router')
    expect(help).toContain('  SelfMoASeq -> mixture')
    expect(help).toContain('  CouncilOfJudges -> heavy')
    expect(help).toContain('  pyramid_swarm -> hierarchical')
    expect(help).toContain('  AdvancedResearch -> heavy')
    expect(help).toContain('  MALT -> heavy')
    expect(help).toContain('  PlannerGeneratorEvaluator -> heavy')
    expect(help).toContain('  SkillOrchestra -> router')
    expect(help).toContain('  Broadcast -> group_chat')
    expect(help).toContain('  auto -> auto')
  })

  it('accepts flexible public topology mode spellings and rejects invalid modes', () => {
    expect(normalizeGalSwarmTopologyMode('multi-agent router')).toEqual(expect.objectContaining({
      publicMode: 'MultiAgentRouter',
      canonicalMode: 'router',
    }))
    expect(normalizeGalSwarmTopologyMode('agent router')).toEqual(expect.objectContaining({
      publicMode: 'AgentRouter',
      canonicalMode: 'router',
    }))
    expect(normalizeGalSwarmTopologyMode('SelfMoASeq')).toEqual(expect.objectContaining({
      publicMode: 'SelfMoASeq',
      canonicalMode: 'mixture',
    }))
    expect(normalizeGalSwarmTopologyMode('Council_As_A_Judge')).toEqual(expect.objectContaining({
      publicMode: 'CouncilAsAJudge',
      canonicalMode: 'heavy',
    }))
    expect(normalizeGalSwarmTopologyMode('pyramid swarm')).toEqual(expect.objectContaining({
      publicMode: 'pyramid_swarm',
      canonicalMode: 'hierarchical',
    }))
    expect(normalizeGalSwarmTopologyMode('group chat')).toEqual(expect.objectContaining({
      publicMode: 'group_chat',
      canonicalMode: 'group_chat',
    }))
    expect(normalizeGalSwarmTopologyMode('Auto Swarm Builder')).toEqual(expect.objectContaining({
      publicMode: 'AutoSwarmBuilder',
      canonicalMode: 'auto',
    }))
    expect(normalizeGalSwarmTopologyMode('Planner Generator Evaluator')).toEqual(expect.objectContaining({
      publicMode: 'PlannerGeneratorEvaluator',
      canonicalMode: 'heavy',
    }))
    expect(normalizeGalSwarmTopologyMode('Advisor Swarm')).toEqual(expect.objectContaining({
      publicMode: 'AdvisorSwarm',
      canonicalMode: 'heavy',
    }))
    expect(normalizeGalSwarmTopologyMode('Skill Orchestra')).toEqual(expect.objectContaining({
      publicMode: 'SkillOrchestra',
      canonicalMode: 'router',
    }))
    expect(normalizeGalSwarmTopologyMode('Peer Review Process')).toEqual(expect.objectContaining({
      publicMode: 'PeerReviewProcess',
      canonicalMode: 'heavy',
    }))
    expect(normalizeGalSwarmTopologyMode('Trial Simulation')).toEqual(expect.objectContaining({
      publicMode: 'TrialSimulation',
      canonicalMode: 'heavy',
    }))
    expect(() => normalizeGalSwarmTopologyMode('not-a-swarm-mode')).toThrow('Invalid topology mode')
    expect(() => routeGalSwarmTopology(topologyRequest({
      desiredMode: 'not-a-swarm-mode' as GalSwarmTopologyRequest['desiredMode'],
    }))).toThrow('Invalid topology mode: not-a-swarm-mode')
  })

  it('honors public topology aliases without changing router behavior', () => {
    expect(routeGalSwarmTopology(topologyRequest({ desiredMode: 'MultiAgentRouter' }))).toEqual(
      expect.objectContaining({
        mode: 'router',
        reason: expect.stringContaining('maps to GAL router'),
      }),
    )
    expect(routeGalSwarmTopology(topologyRequest({ desiredMode: 'router' }))).toEqual(
      expect.objectContaining({
        mode: 'router',
        reason: 'Explicit topology mode requested: router.',
      }),
    )
    expect(routeGalSwarmTopology(topologyRequest({ desiredMode: 'AutoSwarmBuilder' })).mode).toBe('graph')
  })

  it('plans every canonical architecture mode through the public topology API', () => {
    const expectedRolesByMode = new Map([
      ['sequential', ['director', 'scope', 'worker', 'verifier']],
      ['concurrent', ['director', 'scope', 'worker', 'reconciler', 'verifier']],
      ['graph', ['director', 'scope', 'worker', 'reconciler', 'verifier']],
      ['hierarchical', ['director', 'scope', 'worker', 'reconciler', 'verifier']],
      ['mixture', ['director', 'scope', 'worker', 'reviewer', 'reconciler', 'verifier']],
      ['group_chat', ['director', 'scope', 'worker', 'reviewer', 'reconciler', 'verifier']],
      ['forest', ['director', 'scope', 'worker', 'reconciler', 'verifier']],
      ['heavy', ['director', 'scope', 'worker', 'reviewer', 'reconciler', 'verifier']],
      ['router', ['director', 'scope', 'worker', 'reviewer', 'reconciler', 'verifier']],
    ])

    for (const mode of GAL_SWARM_ORCHESTRATION_MODES) {
      const request = topologyRequest({
        desiredMode: mode,
        riskLevel: 'low',
        governance: {
          allowedRepositories: ['gal-run/gal-swarm'],
          allowedTools: ['gh', 'pnpm'],
          requireFileLeases: true,
          requireIndependentReview: false,
        },
        tasks: [topologyTask('solo', 'Implement bounded change', 'implementation', [])],
      })

      const route = routeGalSwarmTopology(request)
      const plan = createGalSwarmTopologyPlan(request)

      expect(route.mode).toBe(mode)
      expect(plan.mode).toBe(mode)
      expect(plan.routeReason).toBe(`Explicit topology mode requested: ${mode}.`)
      expect(plan.lanes.map((lane) => lane.role)).toEqual(expectedRolesByMode.get(mode))
    }
  })

  it('routes auto mode to sequential and concurrent topologies from work shape', () => {
    expect(routeGalSwarmTopology(topologyRequest({
      desiredMode: 'auto',
      riskLevel: 'low',
      governance: { requireFileLeases: false, requireIndependentReview: false },
      tasks: [topologyTask('solo', 'Implement one bounded change', 'implementation', [])],
    })).mode).toBe('sequential')

    expect(routeGalSwarmTopology(topologyRequest({
      desiredMode: 'auto',
      riskLevel: 'low',
      governance: { requireFileLeases: false, requireIndependentReview: false },
      tasks: [
        topologyTask('api', 'Patch API contract', 'implementation', []),
        topologyTask('docs', 'Update documentation', 'docs', []),
      ],
    })).mode).toBe('concurrent')
  })

  it('routes auto mode to graph, hierarchical, and heavy topologies from work shape', () => {
    expect(routeGalSwarmTopology(topologyRequest({
      tasks: [
        topologyTask('build', 'Build package', 'build', []),
        topologyTask('test', 'Run tests', 'test', ['build']),
      ],
    })).mode).toBe('graph')

    expect(routeGalSwarmTopology(topologyRequest({
      riskLevel: 'low',
      repositories: ['gal-run/gal-swarm', 'gal-run/gal-api'],
      tasks: [
        topologyTask('scope', 'Read repo contracts', 'scope', []),
        topologyTask('api', 'Patch API contract', 'implementation', []),
        topologyTask('cli', 'Patch CLI contract', 'implementation', []),
        topologyTask('docs', 'Update docs', 'docs', []),
        topologyTask('verify', 'Verify package', 'test', []),
      ],
    })).mode).toBe('hierarchical')

    const heavyRoute = routeGalSwarmTopology(topologyRequest({
      riskLevel: 'high',
      governance: { requireIndependentReview: true },
      evidenceRequirements: [{ id: 'release-proof', title: 'Release proof is attached.' }],
      tasks: [
        topologyTask('release', 'Prepare release', 'release', []),
        topologyTask('security', 'Check secrets boundary', 'security', []),
      ],
    }))

    expect(heavyRoute).toEqual(expect.objectContaining({
      mode: 'heavy',
      reason: expect.stringContaining('High-risk'),
    }))

    expect(routeGalSwarmTopology(topologyRequest({
      riskLevel: 'medium',
      governance: { requireIndependentReview: true },
      tasks: [
        topologyTask('option-a', 'Implement option A', 'implementation', []),
        topologyTask('option-b', 'Review option B', 'review', []),
      ],
    })).mode).toBe('mixture')

    expect(routeGalSwarmTopology(topologyRequest({
      riskLevel: 'low',
      governance: { requireIndependentReview: true },
      tasks: [
        topologyTask('scope', 'Frame the decision', 'scope', []),
        topologyTask('review', 'Debate the policy surface', 'review', []),
        topologyTask('docs', 'Record the decision', 'docs', []),
      ],
    })).mode).toBe('group_chat')

    expect(routeGalSwarmTopology(topologyRequest({
      riskLevel: 'low',
      repositories: ['gal-run/gal-swarm', 'gal-run/gal-api', 'gal-run/gal-cli'],
      tasks: [
        topologyTask('a', 'Patch A', 'implementation', []),
        topologyTask('b', 'Patch B', 'implementation', []),
        topologyTask('c', 'Patch C', 'implementation', []),
        topologyTask('d', 'Patch D', 'implementation', []),
        topologyTask('e', 'Patch E', 'implementation', []),
        topologyTask('f', 'Patch F', 'implementation', []),
      ],
    })).mode).toBe('forest')

    expect(routeGalSwarmTopology(topologyRequest({ desiredMode: 'router' })).mode).toBe('router')
  })

  it('orders dependency graphs deterministically before lane generation', () => {
    const ordered = orderGalSwarmTopologyTasks([
      topologyTask('verify', 'Verify output', 'verify', ['test']),
      topologyTask('scope', 'Read governance contract', 'scope', []),
      topologyTask('test', 'Run tests', 'test', ['scope']),
    ])

    expect(ordered.map((task) => task.id)).toEqual(['scope', 'test', 'verify'])
    expect(() => orderGalSwarmTopologyTasks([
      topologyTask('a', 'Task A', 'implementation', ['b']),
      topologyTask('b', 'Task B', 'implementation', ['a']),
    ])).toThrow('dependency cycle')
  })

  it('generates governed lanes with bounded ownership and evidence expectations', () => {
    const plan = createGalSwarmTopologyPlan(topologyRequest({
      riskLevel: 'critical',
      governance: {
        allowedRepositories: ['gal-run/gal-swarm'],
        allowedTools: ['gh', 'pnpm'],
        requireFileLeases: true,
        requireIndependentReview: true,
      },
      evidenceRequirements: [
        {
          id: 'ci-proof',
          title: 'CI proof is attached.',
          requiredForRoles: ['verifier'],
        },
      ],
      tasks: [
        topologyTask('scope', 'Read AGENTS contract', 'scope', []),
        topologyTask('patch', 'Implement topology contracts', 'implementation', ['scope']),
        topologyTask('test', 'Run package tests', 'test', ['patch']),
      ],
    }))

    expect(plan).toEqual(expect.objectContaining({
      schemaVersion: GAL_SWARM_TOPOLOGY_SCHEMA_VERSION,
      mode: 'heavy',
      riskLevel: 'critical',
    }))
    expect(plan.lanes.map((lane) => lane.role)).toEqual([
      'director',
      'scope',
      'worker',
      'worker',
      'worker',
      'reviewer',
      'reconciler',
      'verifier',
    ])
    expect(plan.evidenceRequirements.map((requirement) => requirement.id)).toEqual([
      'task-graph',
      'bounded-ownership',
      'file-leases',
      'tests',
      'independent-review',
      'runtime-proof',
      'ci-proof',
    ])
    expect(plan.lanes.find((lane) => lane.id === 'lane-worker-patch')?.ownership).toMatchObject({
      repositories: ['gal-run/gal-swarm'],
      allowedTools: ['gh', 'pnpm'],
      fileLeasesRequired: true,
    })
    expect(plan.lanes.find((lane) => lane.role === 'verifier')?.evidenceExpectations).toEqual(
      expect.arrayContaining(['tests', 'runtime-proof', 'ci-proof']),
    )
  })

  it('rejects governed topology requests outside allowed repositories', () => {
    expect(() => createGalSwarmTopologyPlan(topologyRequest({
      repositories: ['gal-run/gal-swarm'],
      governance: {
        allowedRepositories: ['gal-run/gal-swarm'],
      },
      tasks: [
        topologyTask('scope', 'Read scope', 'scope', []),
        {
          ...topologyTask('patch', 'Patch external repo', 'implementation', ['scope']),
          repository: 'gal-run/gal-api',
        },
      ],
    }))).toThrow('outside governance.allowedRepositories')
  })

  it('rejects task ids that collide after worker lane id normalization', () => {
    expect(() => createGalSwarmTopologyPlan(topologyRequest({
      tasks: [
        topologyTask('api/test', 'Patch API tests', 'test', []),
        topologyTask('api-test', 'Patch API test script', 'test', []),
      ],
    }))).toThrow('Duplicate topology lane id: lane-worker-api-test')
  })

  it('scores fleet placement for linux, mac, security, and x64 fallback lanes', () => {
    const plan = createGalSwarmTopologyPlan(topologyRequest({
      tasks: [
        topologyTask('build', 'Run heavy build', 'build', []),
        topologyTask('ios', 'Verify macOS and iOS surface', 'mac_ios', []),
        topologyTask('audit', 'Run security audit', 'security', []),
      ],
      fleet: topologyFleet(),
    }))

    const buildLane = plan.lanes.find((lane) => lane.id === 'lane-worker-build')!
    const macLane = plan.lanes.find((lane) => lane.id === 'lane-worker-ios')!
    const securityLane = plan.lanes.find((lane) => lane.id === 'lane-worker-audit')!

    expect(buildLane.placement).toMatchObject({
      nodeId: 'ubuntu-1',
      runnerLabel: 'agents-high-runc-x64',
      missingCapabilities: [],
    })
    expect(macLane.placement).toMatchObject({
      nodeId: 'mac-mini-1',
      runnerLabel: 'agents-mac-arm64',
      missingCapabilities: [],
    })
    expect(securityLane.placement).toMatchObject({
      nodeId: 'kali-1',
      runnerLabel: 'agents-kali-runc',
      missingCapabilities: [],
    })
    expect(scoreGalSwarmFleetPlacement(buildLane, topologyFleet()[0]).score).toBeGreaterThan(
      scoreGalSwarmFleetPlacement(buildLane, topologyFleet()[1]).score,
    )

    const fallbackPlan = createGalSwarmTopologyPlan(topologyRequest({
      tasks: [topologyTask('audit', 'Run security audit', 'security', [])],
    }))
    expect(fallbackPlan.lanes.find((lane) => lane.id === 'lane-worker-audit')?.placement).toMatchObject({
      runnerLabel: 'agents-high-runc-x64',
      reason: expect.stringContaining('default x64 runner fallback'),
    })
  })
})
