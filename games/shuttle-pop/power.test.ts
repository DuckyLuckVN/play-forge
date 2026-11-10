import { describe, expect, it } from 'vitest'
import { hitPower, isPowerHit } from './power'

describe('hit power', () => {
  it('is the charge effect achieved times the grade share', () => {
    expect(hitPower('perfect', 1)).toBe(1)
    expect(hitPower('good', 1)).toBe(0.7)
    expect(hitPower('late', 0.5)).toBeCloseTo(0.2, 9)
  })
  it('clamps gain to 0..1 and survives NaN', () => {
    expect(hitPower('perfect', 1.5)).toBe(1)
    expect(hitPower('perfect', -1)).toBe(0)
    expect(hitPower('perfect', NaN)).toBe(0)
  })
  it('isPowerHit: from popFrom up; old events (undefined) are not', () => {
    expect(isPowerHit(undefined)).toBe(false)
    expect(isPowerHit(0.89)).toBe(false)
    expect(isPowerHit(0.9)).toBe(true)
  })
})
