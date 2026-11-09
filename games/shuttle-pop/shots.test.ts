import { describe, expect, it } from 'vitest'
import { COURT, isIn, predictLanding, stepShuttle, type Flight } from './physics'
import { chooseShot, findContact, gradeOf, launchFor, REACH, shotTarget, type ShotKind } from './shots'

const rngOf = (...v: number[]) => {
  let i = 0
  return () => v[i++ % v.length]
}
const mid = rngOf(0.25, 0)

describe('gradeOf', () => {
  it('boundaries', () => {
    expect(gradeOf(0)).toBe('perfect')
    expect(gradeOf(6)).toBe('perfect')
    expect(gradeOf(7)).toBe('good')
    expect(gradeOf(12)).toBe('good')
    expect(gradeOf(13)).toBe('late')
    expect(gradeOf(18)).toBe('late')
    expect(gradeOf(19)).toBeNull()
    expect(gradeOf(-6)).toBe('perfect')
    expect(gradeOf(-7)).toBeNull()
  })
})

describe('chooseShot', () => {
  it('table', () => {
    expect(chooseShot({ x: 0, z: 1 }, 2.5, 'perfect')).toBe('smash')
    expect(chooseShot({ x: 0, z: 1 }, 1.5, 'perfect')).toBe('drive')
    expect(chooseShot({ x: 0, z: 1 }, 2.5, 'good')).toBe('drive')
    expect(chooseShot({ x: 0, z: -1 }, 2.5, 'perfect')).toBe('clear')
    expect(chooseShot({ x: 0, z: 0 }, 1, 'perfect')).toBe('drop')
    expect(chooseShot({ x: 0, z: 0.5 }, 1, 'good')).toBe('drop')
    expect(chooseShot({ x: 1, z: 1 }, 2.5, 'late')).toBe('clear')
    expect(chooseShot({ x: 0, z: 0 }, 1, 'late')).toBe('clear')
  })
})

describe('shotTarget', () => {
  it('lands on the opponent half, mirrored laterally by side', () => {
    const a = shotTarget('drive', 0, 1)
    const b = shotTarget('drive', 1, 1)
    expect(a.z).toBeCloseTo(3.5)
    expect(b.z).toBeCloseTo(-3.5)
    expect(a.x).toBeCloseTo(-b.x)
    expect(Math.abs(a.x)).toBeCloseTo(COURT.halfWidth - 0.4)
    expect(shotTarget('clear', 0, 0).z).toBeCloseTo(COURT.halfLen - 0.6)
  })
})

describe('launchFor', () => {
  const from = { x: 0, y: 1.2, z: -2 }
  for (const kind of ['drop', 'drive', 'clear'] as ShotKind[]) {
    it(`${kind} perfect clears the net and lands near target`, () => {
      const target = shotTarget(kind, 0, 0.5)
      // clear max range is ~7.1 m, so it is tested from near the net
      const origin = kind === 'clear' ? { x: 0, y: 1.2, z: -0.8 } : from
      const vel = launchFor(kind, 'perfect', origin, target, mid)
      const land = predictLanding({ pos: origin, vel })
      expect(land.netHit).toBe(false)
      expect(isIn(land.pos, 1)).toBe(true)
      expect(Math.hypot(land.pos.x - target.x, land.pos.z - target.z)).toBeLessThan(0.3)
    })
  }

  it('smash from y=2.5 at the net lands on the opponent half', () => {
    const f = { x: 0, y: 2.5, z: -0.8 }
    const vel = launchFor('smash', 'perfect', f, shotTarget('smash', 0, 0), mid)
    const land = predictLanding({ pos: f, vel })
    expect(land.netHit).toBe(false)
    expect(land.pos.z).toBeGreaterThan(0)
  })

  it('works mirrored for side 1', () => {
    const f = { x: 0, y: 1.2, z: 2 }
    const vel = launchFor('drop', 'perfect', f, shotTarget('drop', 1, 0), mid)
    const land = predictLanding({ pos: f, vel })
    expect(land.netHit).toBe(false)
    expect(isIn(land.pos, 0)).toBe(true)
  })

  it('jitter grows with worse grade and is deterministic for a given rng', () => {
    const target = shotTarget('clear', 0, 0)
    const err = (g: 'perfect' | 'late') => {
      const v = launchFor('clear', g, from, target, rngOf(0.25, 1))
      const l = predictLanding({ pos: from, vel: v }).pos
      return Math.hypot(l.x - target.x, l.z - target.z)
    }
    expect(err('late')).toBeGreaterThan(err('perfect'))
    expect(launchFor('drop', 'good', from, target, rngOf(0.3, 0.6))).toEqual(
      launchFor('drop', 'good', from, target, rngOf(0.3, 0.6)),
    )
  })
})

describe('findContact', () => {
  it('returns null when never within reach', () => {
    const f: Flight = { pos: { x: 0, y: 1.5, z: -3 }, vel: { x: 0, y: 3, z: 8 } }
    expect(findContact(f, { x: 2.5, z: -6 }, 0, 60)).toBeNull()
  })

  it('finds the closest tick and does not mutate', () => {
    const f: Flight = { pos: { x: 0, y: 1.5, z: -5 }, vel: { x: 0, y: 2, z: 6 } }
    const snap = JSON.stringify(f)
    const player = { x: 0, z: -3 }
    const c = findContact(f, player, 0, 60)
    expect(JSON.stringify(f)).toBe(snap)
    expect(c).not.toBeNull()
    // brute force reference
    const g: Flight = JSON.parse(snap)
    let best = Infinity
    let bt = -1
    for (let t = 0; t <= 60; t++) {
      const d = Math.hypot(g.pos.x - player.x, g.pos.z - player.z)
      if (d <= REACH.radius && g.pos.y >= REACH.minY && g.pos.y <= REACH.maxY && d < best) {
        best = d
        bt = t
      }
      stepShuttle(g)
    }
    expect(c!.dt).toBe(bt)
  })

  it('respects from (ignores negatives) and height band', () => {
    const f: Flight = { pos: { x: 0, y: 1.5, z: -3 }, vel: { x: 0, y: 0, z: 0 } }
    expect(findContact(f, { x: 0, z: -3 }, -10, 0)?.dt).toBe(0)
    expect(findContact(f, { x: 0, z: -3 }, 5, 5)?.dt).toBe(5) // only tick 5 scanned
    const high: Flight = { pos: { x: 0, y: 3.5, z: -3 }, vel: { x: 0, y: 0, z: 0 } }
    expect(findContact(high, { x: 0, z: -3 }, 0, 0)).toBeNull()
  })

  it('stops after a net hit', () => {
    const f: Flight = { pos: { x: 0, y: 1.0, z: -0.1 }, vel: { x: 0, y: 0, z: 5 } }
    // dead shuttle sits at z=-0.1 low: player can't reach it once net-hit scan stops after contact tick check
    const c = findContact(f, { x: 0, z: -6 }, 0, 120)
    expect(c).toBeNull()
  })
})
