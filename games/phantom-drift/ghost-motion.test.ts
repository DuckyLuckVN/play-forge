import { describe, expect, it } from 'vitest'
import { Blinker, bob, spring, springTo } from './ghost-motion'

describe('ghost motion', () => {
  it('a spring overshoots a little, then settles on the target', () => {
    const s = spring()
    let peak = 0
    for (let i = 0; i < 120; i++) peak = Math.max(peak, springTo(s, 1, 1 / 60).value)
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThan(1.25)
    expect(s.value).toBeCloseTo(1, 2)
  })

  it('a long frame does not blow the spring up', () => {
    const s = springTo(spring(), 1, 5)
    expect(Number.isFinite(s.value)).toBe(true)
    expect(Math.abs(s.value)).toBeLessThan(2)
  })

  it('bob keeps volume: squash wide, stretch thin', () => {
    for (const t of [0, 0.3, 0.7, 1.1]) {
      const b = bob(t)
      expect(b.sx * b.sx * b.sy).toBeCloseTo(1, 5)
    }
    expect(bob(1, 0)).toEqual({ y: 0, sx: 1, sy: 1 })
  })

  it('blinks every 2 to 5 seconds, quickly', () => {
    const b = new Blinker(7)
    const blinks: number[] = []
    let shut = false
    for (let i = 0; i < 60 * 60; i++) {
      const open = b.update(1 / 60)
      if (open < 0.5 && !shut) blinks.push(i / 60)
      shut = open < 0.5
    }
    const gaps = blinks.slice(1).map((t, i) => t - blinks[i])
    expect(blinks.length).toBeGreaterThan(10)
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(2)
      expect(g).toBeLessThanOrEqual(5.3)
    }
  })

  it('is the same for the same seed', () => {
    const a = new Blinker(3)
    const b = new Blinker(3)
    for (let i = 0; i < 600; i++) expect(a.update(1 / 60)).toBe(b.update(1 / 60))
  })
})
