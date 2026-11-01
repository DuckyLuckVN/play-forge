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

describe('shop catalog', () => {
  const of = (kind: string) => CATALOG.filter((i) => i.kind === kind)

  it('offers at least 20 of everything', () => {
    for (const kind of ['ball', 'trail', 'arena', 'impact', 'music', 'helper'])
      expect(of(kind).length, kind).toBeGreaterThanOrEqual(20)
  })

  it('has one free starter per look, then rising prices', () => {
    for (const kind of ['ball', 'trail', 'arena', 'impact', 'music']) {
      const prices = of(kind).map((i) => i.price)
      expect(
        prices.filter((p) => p === 0),
        kind,
      ).toHaveLength(1)
      for (let i = 1; i < prices.length; i++)
        expect(prices[i], `${kind} ${i}`).toBeGreaterThanOrEqual(prices[i - 1])
    }
  })

  it('prices items for longer runs (2.5× the old prices)', () => {
    const paid = CATALOG.filter((i) => i.price > 0)
    expect(Math.min(...paid.map((i) => i.price))).toBeGreaterThanOrEqual(100)
    expect(CATALOG.find((i) => i.id === 'ball:star')!.price).toBe(375)
    expect(CATALOG.find((i) => i.id === 'helper:revive')!.price).toBe(375)
  })

  it('has unique ids', () => {
    expect(new Set(CATALOG.map((i) => i.id)).size).toBe(CATALOG.length)
  })
})
