import type { GalSwarmFleetCapability } from '../contracts.js'

export function uniqueCapabilities(capabilities: GalSwarmFleetCapability[]): GalSwarmFleetCapability[] {
  return capabilities.filter((capability, index) => capabilities.indexOf(capability) === index)
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const rawValue of values) {
    const value = rawValue.trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}
