import { describe, expect, it } from 'vitest'
import { arc, isoProjection, pathD } from './projection'

const o = { x: 200, y: 168 }

describe('isoProjection', () => {
  it('-45: forward goes right and up, right goes right and down, up goes straight up', () => {
    const p = isoProjection({ yawDeg: -45, scale: 22, origin: o })
    const a = p(0, 0)
    expect(a).toEqual(o)
    const f = p(0, 1)
    expect(f.x - a.x).toBeGreaterThan(0)
    expect(f.y - a.y).toBeLessThan(0)
    const r = p(1, 0)
    expect(r.x - a.x).toBeGreaterThan(0)
    expect(r.y - a.y).toBeGreaterThan(0)
    const u = p(0, 0, 1)
    expect(u.x - a.x).toBe(0)
    expect(u.y - a.y).toBe(-22)
    expect(p.scale).toBe(22)
  })
  it('+45: forward goes left and up', () => {
    const p = isoProjection({ yawDeg: 45, scale: 22, origin: o })
    const f = p(0, 1)
    expect(f.x - o.x).toBeLessThan(0)
    expect(f.y - o.y).toBeLessThan(0)
  })
})

describe('pathD', () => {
  it('formats with 1 decimal', () => {
    expect(
      pathD([
        { x: 1, y: 2 },
        { x: 3.26, y: 4 },
      ]),
    ).toBe('M1.0,2.0 L3.3,4.0')
  })
})

describe('arc', () => {
  const p = isoProjection({ yawDeg: -45, scale: 20, origin: o })
  const from = { x: 0.4, z: -4.5 }
  const to = { x: 0, z: 2.5 }
  const h = { start: 3, peak: 2.2, end: 0 }
  const { air, ground } = arc(p, from, to, h, 30)
  it('starts and ends where asked', () => {
    expect(air[0]).toEqual(p(from.x, from.z, h.start))
    expect(ground[ground.length - 1]).toEqual(p(to.x, to.z))
    expect(air).toHaveLength(31)
  })
  it('midpoint is peak above ground', () => {
    const m = 15
    expect(ground[m].y - air[m].y).toBeCloseTo(h.peak * 20, 6)
  })
})
