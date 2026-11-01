import { describe, expect, it } from 'vitest'
import { ARENAS, SCENES, stormLevel } from './arenas'
import { CATALOG } from './shop'

describe('arenas', () => {
  it('raises the storm level every 10 turns, up to 5', () => {
    expect([1, 10, 11, 21, 999].map(stormLevel)).toEqual([0, 0, 1, 2, 5])
  })

  it('has 20 arenas, each with valid colours and an animated scene', () => {
    expect(Object.keys(ARENAS).length).toBeGreaterThanOrEqual(20)
    for (const [id, a] of Object.entries(ARENAS)) {
      for (const c of [a.top, a.bottom, a.star, a.glow]) expect(c, id).toMatch(/^#[0-9a-f]{6}$/)
      expect(SCENES[a.scene], id).toBeTypeOf('function')
    }
  })

  it('sells every arena, and every arena sold exists', () => {
    const sold = CATALOG.filter((i) => i.kind === 'arena').map((i) => i.id.split(':')[1])
    expect(sold.sort()).toEqual(Object.keys(ARENAS).sort())
  })
})
