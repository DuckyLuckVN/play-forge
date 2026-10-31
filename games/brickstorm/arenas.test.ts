import { describe, expect, it } from 'vitest'
import { ARENAS, stormLevel } from './arenas'

describe('arenas', () => {
  it('raises the storm level every 10 turns, up to 5', () => {
    expect([1, 10, 11, 21, 999].map(stormLevel)).toEqual([0, 0, 1, 2, 5])
  })

  it('defines colours for every arena', () => {
    expect(Object.keys(ARENAS).sort()).toEqual(['indigo', 'neon', 'ocean', 'space', 'sunset'])
    for (const a of Object.values(ARENAS)) {
      for (const c of [a.top, a.bottom, a.star, a.glow]) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
