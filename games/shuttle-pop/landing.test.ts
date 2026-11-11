import { describe, expect, it } from 'vitest'
import { NEAR_DROP_S, ringShown } from './landing'

describe('ringShown', () => {
  it('always / hidden ignore timing', () => {
    for (const s of [0, 0.3, 5, Infinity, NaN]) {
      expect(ringShown('always', s)).toBe(true)
      expect(ringShown('hidden', s)).toBe(false)
    }
  })
  it('near drop: only the last 0.6 s (and after a late landing until the rally ends)', () => {
    expect(ringShown('near', 0.61)).toBe(false)
    expect(ringShown('near', NEAR_DROP_S)).toBe(true)
    expect(ringShown('near', 0.2)).toBe(true)
    expect(ringShown('near', -0.1)).toBe(true)
    expect(ringShown('near', Infinity)).toBe(false)
    expect(ringShown('near', NaN)).toBe(false)
  })
})
