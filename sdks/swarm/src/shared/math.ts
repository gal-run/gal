function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.ceil(value)))
}

function round(value: number, precision = 0): number {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}


export { clampInteger, clampRatio, round }
