import { PredictionFileAdapter, assertPredictionFileMatchesSuite } from './prediction-file-adapter.js'
import { runEvaluationSuite } from './runner.js'
import type {
  GalEvalAdapter,
  GalEvalPredictionFile,
  GalEvalReport,
  GalEvalSuite,
} from './types.js'

export interface ManagedAgentEvalWorkPacketLike {
  agent: {
    taskType?: string
    agentCardRef?: string
  }
  evalRun: {
    suiteId: string
  }
}

export interface ManagedAgentEvalRunnerLike {
  id: string
  suiteIds: readonly string[]
  taskTypes?: readonly string[]
  agentCardRefs?: readonly string[]
  canRun(workPacket: ManagedAgentEvalWorkPacketLike): boolean
  run(workPacket: ManagedAgentEvalWorkPacketLike): Promise<GalEvalReport>
}

export interface CreateGalEvalsManagedAgentRunnerOptions {
  id?: string
  suite: GalEvalSuite
  adapter: GalEvalAdapter
  taskTypes?: readonly string[]
  agentCardRefs?: readonly string[]
}

export interface CreatePredictionFileManagedAgentRunnerOptions
  extends Omit<CreateGalEvalsManagedAgentRunnerOptions, 'adapter'> {
  predictionFile: GalEvalPredictionFile
}

export function createGalEvalsManagedAgentRunner(
  options: CreateGalEvalsManagedAgentRunnerOptions,
): ManagedAgentEvalRunnerLike {
  const suiteIds = [options.suite.id]
  return {
    id: options.id ?? `gal-evals:${options.adapter.id}:${options.suite.id}`,
    suiteIds,
    taskTypes: options.taskTypes,
    agentCardRefs: options.agentCardRefs,
    canRun(workPacket) {
      if (workPacket.evalRun.suiteId !== options.suite.id) return false
      if (options.taskTypes?.length && !options.taskTypes.includes(workPacket.agent.taskType ?? '')) {
        return false
      }
      if (
        options.agentCardRefs?.length &&
        !options.agentCardRefs.includes(workPacket.agent.agentCardRef ?? '')
      ) {
        return false
      }
      return true
    },
    async run(workPacket) {
      assertWorkPacketMatchesSuite(workPacket, options.suite)
      return runEvaluationSuite(options.suite, options.adapter)
    },
  }
}

export function createPredictionFileManagedAgentRunner(
  options: CreatePredictionFileManagedAgentRunnerOptions,
): ManagedAgentEvalRunnerLike {
  assertPredictionFileMatchesSuite(options.predictionFile, options.suite)
  return createGalEvalsManagedAgentRunner({
    id: options.id ?? `gal-evals:prediction-file:${options.suite.id}`,
    suite: options.suite,
    adapter: new PredictionFileAdapter(options.predictionFile),
    taskTypes: options.taskTypes,
    agentCardRefs: options.agentCardRefs,
  })
}

export function assertWorkPacketMatchesSuite(
  workPacket: ManagedAgentEvalWorkPacketLike,
  suite: GalEvalSuite,
): void {
  if (workPacket.evalRun.suiteId !== suite.id) {
    throw new Error(
      `Managed-agent work packet suiteId ${workPacket.evalRun.suiteId} does not match suite ${suite.id}`,
    )
  }
}
