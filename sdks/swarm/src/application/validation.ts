import {
  GAL_SWARM_PLAN_SCHEMA_VERSION,
  type GalSwarmPlan,
} from '../contracts.js'

export function validateGalSwarmPlan(plan: GalSwarmPlan): void {
  if (plan.schemaVersion !== GAL_SWARM_PLAN_SCHEMA_VERSION) {
    throw new Error(`Swarm plan schemaVersion must be ${GAL_SWARM_PLAN_SCHEMA_VERSION}`)
  }

  if (plan.swarmId.trim() === '') {
    throw new Error('Swarm plan swarmId is required')
  }

  if (plan.maxWorkers < plan.minWorkers) {
    throw new Error('Swarm plan maxWorkers must be greater than or equal to minWorkers')
  }

  if (plan.maxSpendUsd < 0) {
    throw new Error('Swarm plan maxSpendUsd must be non-negative')
  }

  if (plan.computeProfiles.length === 0) {
    throw new Error('Swarm plan must declare at least one compute profile')
  }

  if (plan.serverlessFallback?.enabled) {
    if (plan.serverlessFallback.switchBelowUtilization <= 0 || plan.serverlessFallback.switchBelowUtilization >= 1) {
      throw new Error('Serverless fallback switchBelowUtilization must be greater than zero and less than one')
    }
    if (plan.serverlessFallback.minSustainSeconds < 0) {
      throw new Error('Serverless fallback minSustainSeconds must be zero or greater')
    }
    if (!plan.serverlessEndpoints?.some((endpoint) => endpoint.id === plan.serverlessFallback?.endpointId)) {
      throw new Error('Serverless fallback endpointId must reference a declared serverless endpoint')
    }
  }
}
