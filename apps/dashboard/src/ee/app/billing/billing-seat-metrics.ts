export interface BillingSeatMetricsInput {
  rawSeatsUsed?: number | null
  rawSeatLimit?: number | null
  planTier?: string | null
}

export interface BillingSeatMetrics {
  seatsUsed: number
  seatLimit: number
  isUnlimitedSeats: boolean
  seatsAvailable: number
  seatUsagePercent: number
  isOverSeatLimit: boolean
  pricePerSeat: number
  monthlyCost: number
}

function sanitizeFiniteMetric(value: number): number {
  return Number.isNaN(value) || !Number.isFinite(value) ? 0 : value
}

export function getPricePerSeat(tier: string): number {
  switch (tier) {
    case 'convenience':
      return 10
    case 'enforcement':
      return 25
    case 'enterprise':
      return 0
    default:
      return 0
  }
}

export function deriveBillingSeatMetrics({
  rawSeatsUsed = 0,
  rawSeatLimit = 5,
  planTier = 'free',
}: BillingSeatMetricsInput): BillingSeatMetrics {
  const normalizedRawSeatsUsed = rawSeatsUsed ?? 0
  const normalizedRawSeatLimit = rawSeatLimit ?? 5
  const isUnlimitedSeats = normalizedRawSeatLimit === Infinity || normalizedRawSeatLimit === -1
  const seatsUsed = sanitizeFiniteMetric(normalizedRawSeatsUsed)
  const seatLimit = isUnlimitedSeats ? 0 : sanitizeFiniteMetric(normalizedRawSeatLimit)
  const seatsAvailable = isUnlimitedSeats ? Infinity : Math.max(0, seatLimit - seatsUsed)
  const seatUsagePercent = seatLimit > 0 ? Math.min(100, (seatsUsed / seatLimit) * 100) : 0
  const isOverSeatLimit = !isUnlimitedSeats && seatLimit > 0 && seatsUsed > seatLimit
  const pricePerSeat = getPricePerSeat(planTier ?? 'free')
  const monthlyCost = pricePerSeat * seatsUsed

  return {
    seatsUsed,
    seatLimit,
    isUnlimitedSeats,
    seatsAvailable,
    seatUsagePercent,
    isOverSeatLimit,
    pricePerSeat,
    monthlyCost,
  }
}
