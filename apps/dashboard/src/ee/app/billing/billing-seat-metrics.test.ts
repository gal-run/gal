import { describe, expect, it } from 'vitest'

import {
  deriveBillingSeatMetrics,
  getPricePerSeat,
} from './billing-seat-metrics'

describe('getPricePerSeat', () => {
  it.each([
    { tier: 'convenience', expected: 10 },
    { tier: 'enforcement', expected: 25 },
    { tier: 'enterprise', expected: 0 },
    { tier: 'free', expected: 0 },
    { tier: 'unknown_garbage', expected: 0 },
    { tier: '', expected: 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as { tier: string; expected: number }[])('returns $expected for tier "$tier"', ({ tier, expected }) => {
    expect(getPricePerSeat(tier)).toBe(expected)
  })
})

describe('deriveBillingSeatMetrics', () => {
  describe('NaN / Infinity guards (BUG-010/011)', () => {
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

    it('sanitizes NaN seat limit to 0 when finite, not unlimited (NaN ≠ unlimited)', () => {
      const metrics = deriveBillingSeatMetrics({
        rawSeatsUsed: 3,
        rawSeatLimit: Number.NaN,
        planTier: 'convenience',
      })

      expect(metrics.seatLimit).toBe(0)
      expect(metrics.isUnlimitedSeats).toBe(false)
      // seatLimit=0, isUnlimitedSeats=false => seatsAvailable = max(0, 0 - 3) = 0
      expect(metrics.seatsAvailable).toBe(0)
      expect(metrics.seatUsagePercent).toBe(0)
      expect(metrics.isOverSeatLimit).toBe(false)
    })
  })

  describe('seat counting', () => {
    it('computes correct seatsAvailable when under seat limit (happy path)', () => {
      const metrics = deriveBillingSeatMetrics({
        rawSeatsUsed: 3,
        rawSeatLimit: 5,
        planTier: 'convenience',
      })

      expect(metrics.seatsUsed).toBe(3)
      expect(metrics.seatLimit).toBe(5)
      expect(metrics.seatsAvailable).toBe(2)
      expect(metrics.seatUsagePercent).toBe(60)
      expect(metrics.isOverSeatLimit).toBe(false)
      expect(metrics.pricePerSeat).toBe(10)
      expect(metrics.monthlyCost).toBe(30)
    })

    it('reports at capacity when used exactly equals limit (not over)', () => {
      const metrics = deriveBillingSeatMetrics({
        rawSeatsUsed: 5,
        rawSeatLimit: 5,
        planTier: 'enforcement',
      })

      expect(metrics.seatsUsed).toBe(5)
      expect(metrics.seatLimit).toBe(5)
      expect(metrics.seatsAvailable).toBe(0)
      expect(metrics.seatUsagePercent).toBe(100)
      expect(metrics.isOverSeatLimit).toBe(false) // NOT over — equal, not greater
      expect(metrics.pricePerSeat).toBe(25)
      expect(metrics.monthlyCost).toBe(125)
    })

    it('handles zero seats used (empty org)', () => {
      const metrics = deriveBillingSeatMetrics({
        rawSeatsUsed: 0,
        rawSeatLimit: 5,
        planTier: 'convenience',
      })

      expect(metrics.seatsUsed).toBe(0)
      expect(metrics.seatsAvailable).toBe(5)
      expect(metrics.seatUsagePercent).toBe(0)
      expect(metrics.isOverSeatLimit).toBe(false)
      expect(metrics.monthlyCost).toBe(0)
    })

    it('caps usage percent at 100% (not more) even when far over limit', () => {
      const metrics = deriveBillingSeatMetrics({
        rawSeatsUsed: 9999,
        rawSeatLimit: 5,
        planTier: 'enforcement',
      })

      expect(metrics.seatUsagePercent).toBe(100) // capped
      expect(metrics.isOverSeatLimit).toBe(true)
      expect(metrics.seatsAvailable).toBe(0)
    })
  })

  describe('unlimited seats', () => {
    it('detects unlimited via Infinity sentinel', () => {
      const metrics = deriveBillingSeatMetrics({
        rawSeatsUsed: 42,
        rawSeatLimit: Number.POSITIVE_INFINITY,
        planTier: 'convenience',
      })

      expect(metrics.isUnlimitedSeats).toBe(true)
      expect(metrics.seatLimit).toBe(0)
      expect(metrics.seatsAvailable).toBe(Infinity)
      expect(metrics.isOverSeatLimit).toBe(false)
      expect(metrics.seatUsagePercent).toBe(0)
    })

    it('detects unlimited via -1 sentinel', () => {
      const metrics = deriveBillingSeatMetrics({
        rawSeatsUsed: 42,
        rawSeatLimit: -1,
        planTier: 'enforcement',
      })

      expect(metrics.isUnlimitedSeats).toBe(true)
      expect(metrics.seatLimit).toBe(0)
      expect(metrics.seatsAvailable).toBe(Infinity)
      expect(metrics.isOverSeatLimit).toBe(false)
      expect(metrics.seatUsagePercent).toBe(0)
    })

    it('unlimited with zero seats used still shows available = Infinity', () => {
      const metrics = deriveBillingSeatMetrics({
        rawSeatsUsed: 0,
        rawSeatLimit: Number.POSITIVE_INFINITY,
        planTier: 'enterprise',
      })

      expect(metrics.isUnlimitedSeats).toBe(true)
      expect(metrics.seatsAvailable).toBe(Infinity)
      expect(metrics.monthlyCost).toBe(0) // enterprise = $0/seat
    })
  })

  describe('pricing math', () => {
    it.each([
      { seats: 1, monthly: 10 },
      { seats: 3, monthly: 30 },
      { seats: 5, monthly: 50 },
      { seats: 10, monthly: 100 },
    ])('Convenience tier: $seats seats = \$$monthly/mo', ({ seats, monthly }) => {
      const metrics = deriveBillingSeatMetrics({
        rawSeatsUsed: seats,
        rawSeatLimit: 100,
        planTier: 'convenience',
      })

      expect(metrics.pricePerSeat).toBe(10)
      expect(metrics.monthlyCost).toBe(monthly)
    })

    it.each([
      { seats: 1, monthly: 25 },
      { seats: 3, monthly: 75 },
      { seats: 10, monthly: 250 },
    ])('Enforcement tier: $seats seats = \$$monthly/mo', ({ seats, monthly }) => {
      const metrics = deriveBillingSeatMetrics({
        rawSeatsUsed: seats,
        rawSeatLimit: 100,
        planTier: 'enforcement',
      })

      expect(metrics.pricePerSeat).toBe(25)
      expect(metrics.monthlyCost).toBe(monthly)
    })

    it('Enterprise tier has zero price per seat and zero monthly cost regardless of seats', () => {
      const metrics = deriveBillingSeatMetrics({
        rawSeatsUsed: 100,
        rawSeatLimit: 200,
        planTier: 'enterprise',
      })

      expect(metrics.pricePerSeat).toBe(0)
      expect(metrics.monthlyCost).toBe(0)
    })

    it('Free / unknown tiers have zero price per seat', () => {
      const free = deriveBillingSeatMetrics({ planTier: 'free', rawSeatsUsed: 5, rawSeatLimit: 10 })
      const nil = deriveBillingSeatMetrics({ planTier: null, rawSeatsUsed: 5, rawSeatLimit: 10 })
      const missing = deriveBillingSeatMetrics({ rawSeatsUsed: 5, rawSeatLimit: 10 }) // planTier undefined

      expect(free.pricePerSeat).toBe(0)
      expect(free.monthlyCost).toBe(0)
      expect(nil.pricePerSeat).toBe(0)
      expect(nil.monthlyCost).toBe(0)
      expect(missing.pricePerSeat).toBe(0)
      expect(missing.monthlyCost).toBe(0)
    })
  })

  describe('null / undefined defaults', () => {
    it('defaults to 0 seats used and 5 seat limit when inputs are null', () => {
      const metrics = deriveBillingSeatMetrics({
        rawSeatsUsed: null,
        rawSeatLimit: null,
        planTier: null,
      })

      expect(metrics.seatsUsed).toBe(0)
      expect(metrics.seatLimit).toBe(5)
      expect(metrics.isUnlimitedSeats).toBe(false)
      expect(metrics.seatsAvailable).toBe(5)
      expect(metrics.seatUsagePercent).toBe(0)
      expect(metrics.isOverSeatLimit).toBe(false)
      expect(metrics.pricePerSeat).toBe(0)
      expect(metrics.monthlyCost).toBe(0)
    })

    it('defaults to 0 seats, limit 5, tier free when all params are undefined', () => {
      const metrics = deriveBillingSeatMetrics({})

      expect(metrics.seatsUsed).toBe(0)
      expect(metrics.seatLimit).toBe(5)
      expect(metrics.isUnlimitedSeats).toBe(false)
      expect(metrics.seatsAvailable).toBe(5)
      expect(metrics.seatUsagePercent).toBe(0)
      expect(metrics.isOverSeatLimit).toBe(false)
      expect(metrics.pricePerSeat).toBe(0)
      expect(metrics.monthlyCost).toBe(0)
    })
  })

  describe('overage detection edge cases', () => {
    it('isOverSeatLimit is false when limit is 0 (sanitized NaN limit)', () => {
      const metrics = deriveBillingSeatMetrics({
        rawSeatsUsed: 10,
        rawSeatLimit: Number.NaN,
        planTier: 'convenience',
      })

      expect(metrics.seatLimit).toBe(0)
      expect(metrics.isOverSeatLimit).toBe(false) // limit=0, no overage logic triggers
      expect(metrics.isUnlimitedSeats).toBe(false)
    })

    it('isOverSeatLimit is false when limit is 0 (explicit zero limit)', () => {
      const metrics = deriveBillingSeatMetrics({
        rawSeatsUsed: 10,
        rawSeatLimit: 0,
        planTier: 'enforcement',
      })

      expect(metrics.seatLimit).toBe(0)
      expect(metrics.isOverSeatLimit).toBe(false)
      expect(metrics.seatUsagePercent).toBe(0)
      expect(metrics.seatsAvailable).toBe(0)
    })
  })

  // Regression guard from existing test — kept for continuity
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
