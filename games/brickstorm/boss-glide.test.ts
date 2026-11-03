import { describe, expect, it } from 'vitest'
import { BossGlide } from './boss-glide'
import { CELL } from './sim/config'

const boss = {}

describe('BossGlide', () => {
  it('slides the drawn boss from where it was to where it went', () => {
    const g = new BossGlide()
    g.track(boss, 2, 0)
    expect(g.track(boss, 3, 0)).toEqual({ dc: 1, dr: 0 })
    expect(g.x).toBe(-CELL)
    g.update(0.05)
    expect(g.x).toBeGreaterThan(-CELL)
    expect(g.x).toBeLessThan(0)
    g.update(5)
    expect(Math.abs(g.x)).toBeLessThan(0.5)
  })

  it("doesn't glide the ordinary one-row drop (every brick drops that way), only extra rows", () => {
    const g = new BossGlide()
    g.track(boss, 2, 0)
    g.track(boss, 2, 1)
    expect(g.y).toBe(0)
    g.track(boss, 2, 3)
    expect(g.y).toBe(-CELL)
    g.update(5)
    g.track(boss, 2, 2)
    expect(g.y).toBeCloseTo(CELL, 0)
  })

  it('starts fresh for a new boss', () => {
    const g = new BossGlide()
    g.track(boss, 0, 0)
    g.track({}, 4, 0)
    expect(g.x).toBe(0)
  })
})
