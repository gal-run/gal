import { describe, expect, it } from 'vitest'

import { deriveBillingSeatMetrics } from './billing-seat-metrics'

describe('deriveBillingSeatMetrics', () => {
  it('keeps billing seat metrics finite when API returns NaN or Infinity (#5927 BUG-010/011)', () => {
    const metrics = deriveBillingSeatMetrics({
      rawSeatsUsed: Number.NaN,
      rawSeatLimit: Number.POSITIVE_INFINITY,
      planTier: 'convenience',
    })

    expect(metrics.seatsUsed).toBe(0)
    expect(metrics.seatLimit).toBe(0)
    expect(metrics.isUnlimitedSeats).toBe(true)
    expect(metrics.seatsAvailable).toBe(Infinity)
    expect(metrics.seatUsagePercent).toBe(0)
    expect(metrics.pricePerSeat).toBe(10)
    expect(metrics.monthlyCost).toBe(0)
  })

  it('caps usage percent and flags overages when members exceed a finite seat limit', () => {
    const metrics = deriveBillingSeatMetrics({
      rawSeatsUsed: 8,
      rawSeatLimit: 5,
      planTier: 'enforcement',
    })

    expect(metrics.seatsUsed).toBe(8)
    expect(metrics.seatLimit).toBe(5)
    expect(metrics.isUnlimitedSeats).toBe(false)
    expect(metrics.seatsAvailable).toBe(0)
    expect(metrics.seatUsagePercent).toBe(100)
    expect(metrics.isOverSeatLimit).toBe(true)
    expect(metrics.pricePerSeat).toBe(25)
    expect(metrics.monthlyCost).toBe(200)
  })
})
