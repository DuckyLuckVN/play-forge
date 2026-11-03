import { describe, expect, it } from 'vitest'
import { wrap } from './scenery'

describe('scenery scrolling', () => {
  it('wraps positions into a loop just behind the camera', () => {
    for (const z of [-500, -100, -1, 0, 5, 11.9, 12, 300]) {
      const w = wrap(z, 100, 12)
      expect(w).toBeGreaterThanOrEqual(-88)
      expect(w).toBeLessThan(12)
      expect(Math.abs(((w - z) % 100) + 100) % 100).toBeCloseTo(0)
    }
  })
})
