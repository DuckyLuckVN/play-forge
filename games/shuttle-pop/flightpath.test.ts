import { describe, expect, it } from 'vitest'
import { createPath, firstAhead, PATH, samplePath } from './flightpath'
import { predictLanding, type Flight } from './physics'

const clear = (): Flight => ({ pos: { x: 0, y: 2.2, z: 5.5 }, vel: { x: 0, y: 7, z: -9 } }) as Flight

describe('samplePath', () => {
  it('ends exactly where the landing ring is predicted, and leaves the flight untouched', () => {
    const f = clear()
    const before = JSON.stringify(f)
    const path = createPath()
    const n = samplePath(f, 100, path)
    expect(JSON.stringify(f)).toBe(before)
    expect(n).toBeGreaterThan(5)
    const land = predictLanding(clear())
    expect(path.x[n - 1]).toBeCloseTo(land.pos.x, 1)
    expect(path.z[n - 1]).toBeCloseTo(land.pos.z, 1)
    expect(path.y[n - 1]).toBe(0)
    expect(path.tick[n - 1]).toBe(100 + land.ticks)
  })

  it('dots are spaced along the flight and their ticks rise', () => {
    const path = createPath()
    const n = samplePath(clear(), 0, path)
    for (let i = 1; i < n - 1; i++) {
      const d = Math.hypot(path.x[i] - path.x[i - 1], path.y[i] - path.y[i - 1], path.z[i] - path.z[i - 1])
      expect(d).toBeGreaterThanOrEqual(PATH.spacing * 0.9)
      expect(path.tick[i]).toBeGreaterThan(path.tick[i - 1])
    }
  })

  it('a shot into the net stops at the net (never drawn through it)', () => {
    const into: Flight = { pos: { x: 0, y: 0.6, z: 3 }, vel: { x: 0, y: 0.5, z: -12 } } as Flight
    const path = createPath()
    const n = samplePath(into, 0, path)
    for (let i = 0; i < n; i++) expect(path.z[i]).toBeGreaterThan(-0.05)
  })

  it('never writes more than its buffer', () => {
    const path = createPath(3)
    expect(samplePath(clear(), 0, path)).toBe(3)
  })
})

describe('firstAhead', () => {
  it('skips the dots the shuttle already passed', () => {
    const path = createPath()
    const n = samplePath(clear(), 0, path)
    expect(firstAhead(path, -1)).toBe(0)
    expect(firstAhead(path, path.tick[2])).toBe(3)
    expect(firstAhead(path, 1e9)).toBe(n)
  })
})
