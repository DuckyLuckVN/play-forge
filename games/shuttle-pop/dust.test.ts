import { describe, expect, it } from 'vitest'
import { PuffPool, puffScale } from './dust'

describe('puffScale', () => {
  it('pops up fast, then shrinks away to nothing', () => {
    expect(puffScale(0)).toBe(0)
    expect(puffScale(0.25)).toBeCloseTo(1, 6)
    expect(puffScale(0.1)).toBeGreaterThan(0.5)
    expect(puffScale(0.6)).toBeLessThan(puffScale(0.3))
    expect(puffScale(1)).toBe(0)
    expect(puffScale(1.5)).toBe(0)
  })
})

describe('PuffPool', () => {
  it('reports when nothing is alive (renderer can skip work)', () => {
    const p = new PuffPool(2)
    expect(p.live()).toBe(0)
    p.spawn(0, 0, 0, 0, 0.1, 1)
    expect(p.live()).toBe(1)
    p.update(0.2)
    expect(p.live()).toBe(0)
  })

  it('never holds more than its capacity: the oldest puff is recycled', () => {
    const p = new PuffPool(4)
    for (let i = 0; i < 10; i++) {
      p.spawn(i, 0, 0, 0, 0.5, 1)
      p.update(0.01)
    }
    expect(p.live()).toBe(4)
    // Newest four survive (x = 6..9).
    const xs = [...p.x].sort((a, b) => a - b)
    expect(xs).toEqual([6, 7, 8, 9])
  })

  it('puffs expire after their life and drift with drag', () => {
    const p = new PuffPool(3)
    p.spawn(0, 0, 2, 0, 0.4, 1)
    p.update(0.2)
    expect(p.live()).toBe(1)
    expect(p.x[0]).toBeGreaterThan(0)
    expect(p.y[0]).toBeGreaterThan(0) // rises a touch
    p.update(0.21)
    expect(p.live()).toBe(0)
  })

  it('the same path at 30 and 120 fps', () => {
    const run = (fps: number) => {
      const p = new PuffPool(1)
      p.spawn(0, 0, 2, 1, 2, 1)
      for (let i = 0; i < fps / 2; i++) p.update(1 / fps)
      return p.x[0]
    }
    expect(run(30)).toBeCloseTo(run(120), 2)
  })
})
