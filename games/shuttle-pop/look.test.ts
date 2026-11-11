import { describe, expect, it } from 'vitest'
import { LOOK } from './look'

describe('LOOK', () => {
  it('the shuttle lands on full white but never blooms (no glow smear on a fast shot)', () => {
    expect(LOOK.shuttleBoost).toBeGreaterThan(1)
    expect(LOOK.shuttleBoost).toBeLessThan(LOOK.bloom.threshold)
  })
})
