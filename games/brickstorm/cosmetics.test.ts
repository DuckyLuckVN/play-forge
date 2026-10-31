import { describe, expect, it } from 'vitest'
import { ARENAS } from './arenas'
import { BALL_SKINS, IMPACT_STYLE, TRAIL_STYLE } from './cosmetics'
import { CATALOG } from './shop'

describe('cosmetics', () => {
  it('has a renderer for every catalog cosmetic', () => {
    for (const it of CATALOG) {
      const key = it.id.split(':')[1]
      if (it.kind === 'ball') expect(BALL_SKINS[it.id], it.id).toBeDefined()
      if (it.kind === 'trail') expect(TRAIL_STYLE[it.id], it.id).toBeDefined()
      if (it.kind === 'impact') expect(IMPACT_STYLE[it.id], it.id).toBeDefined()
      if (it.kind === 'arena') expect(ARENAS[key as keyof typeof ARENAS], it.id).toBeDefined()
    }
  })
})
