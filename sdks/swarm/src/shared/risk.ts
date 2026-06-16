import { GAL_SWARM_RISK_LEVELS, type GalSwarmRiskLevel } from '../contracts.js'

function highestGalSwarmRiskLevel(levels: Array<GalSwarmRiskLevel | undefined>): GalSwarmRiskLevel {
  return levels.reduce<GalSwarmRiskLevel>((highest, level) =>
    level && riskRank(level) > riskRank(highest) ? level : highest,
  'low')
}

function riskRank(level: GalSwarmRiskLevel): number {
  return GAL_SWARM_RISK_LEVELS.indexOf(level)
}

export { highestGalSwarmRiskLevel, riskRank }
