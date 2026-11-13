import { describe, expect, it } from 'vitest'
import { countGloops, findMatches, gloopsByColor, H, isGloop } from './grid'
import {
  attackSize,
  fallTicks,
  gloopCount,
  gloopPoints,
  gloopRows,
  makeJar,
  MAX_GLOOPS,
  MIN_FALL_TICKS,
} from './level'

describe('jars', () => {
  it('start gentle and grow 4 gloops a level', () => {
    expect(gloopCount(0)).toBe(4)
    expect(gloopCount(4)).toBe(20)
    expect(gloopCount(40)).toBe(MAX_GLOOPS)
  })

  it.each([0, 3, 9, 14, 19, 20])('level %i: the right count, low in the jar, nothing pre-popped', (level) => {
    for (const seed of [1, 42, 99999]) {
      const jar = makeJar(level, seed)
      expect(countGloops(jar)).toBe(gloopCount(level))
      expect(findMatches(jar).cells).toEqual([])
      const top = H - gloopRows(level)
      jar.forEach((v, i) => {
        if (v) expect(Math.floor(i / 8)).toBeGreaterThanOrEqual(top)
      })
    }
  })

  it('shares colours out evenly', () => {
    const by = gloopsByColor(makeJar(5, 7))
    expect(Math.max(...by) - Math.min(...by)).toBeLessThanOrEqual(1)
  })

  it('is the same for the same seed (fair races)', () => {
    expect(makeJar(6, 123)).toEqual(makeJar(6, 123))
    expect(makeJar(6, 123)).not.toEqual(makeJar(6, 124))
  })

  it('holds only gloops', () => {
    expect(makeJar(8, 5).every((v) => !v || isGloop(v))).toBe(true)
  })
})

describe('speed', () => {
  it('ramps with level and capsules, never past the floor', () => {
    expect(fallTicks('medium', 0, 0)).toBe(20)
    expect(fallTicks('medium', 0, 30)).toBe(18)
    expect(fallTicks('medium', 8, 0)).toBe(18)
    expect(fallTicks('fast', 20, 999)).toBe(MIN_FALL_TICKS)
    expect(fallTicks('slow', 0, 0)).toBeGreaterThan(fallTicks('fast', 0, 0))
  })
})

describe('points', () => {
  it('double for each gloop popped by one capsule, capped', () => {
    expect([1, 2, 3, 6, 9].map((n) => gloopPoints(n, 'slow'))).toEqual([100, 200, 400, 3200, 3200])
    expect(gloopPoints(1, 'fast')).toBe(300)
  })

  it('junk is sent for 2+ lines, at most 4', () => {
    expect([1, 2, 3, 7].map(attackSize)).toEqual([0, 2, 3, 4])
  })
})
