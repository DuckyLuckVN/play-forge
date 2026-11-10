import { describe, expect, it } from 'vitest'
import { CHARGE, chargeOf, chargeStage, isFull } from './charge'

describe('chargeOf (hold → power)', () => {
  it('a tap is no charge: 0 up to CHARGE.start ticks', () => {
    expect(chargeOf(0)).toBe(0)
    expect(chargeOf(CHARGE.start)).toBe(0)
    expect(chargeOf(-5)).toBe(0)
    expect(chargeOf(NaN)).toBe(0)
  })

  it('ramps linearly to 1 at CHARGE.full ticks (~0.5 s), then stays at 1 (no overcharge)', () => {
    expect(chargeOf((CHARGE.start + CHARGE.full) / 2)).toBeCloseTo(0.5, 9)
    expect(chargeOf(CHARGE.full)).toBe(1)
    expect(chargeOf(CHARGE.full + 600)).toBe(1)
    expect(chargeOf(Infinity)).toBe(1)
  })

  it('stages step up to full; isFull only at 1', () => {
    expect(chargeStage(0)).toBe(0)
    expect(chargeStage(0.1)).toBe(0) // a short hold stays silent
    expect(chargeStage(0.2)).toBe(1)
    expect(chargeStage(0.6)).toBe(2)
    expect(chargeStage(1)).toBe(CHARGE.steps.length)
    expect(isFull(1)).toBe(true)
    expect(isFull(0.99)).toBe(false)
    expect(isFull(undefined)).toBe(false)
  })
})
