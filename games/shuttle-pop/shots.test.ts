import { describe, expect, it } from 'vitest'
import { COURT, isIn, predictLanding, stepShuttle, type Flight } from './physics'
import {
  chooseShot,
  type Grade,
  findContact,
  gradeOf,
  launchFor,
  REACH,
  shotTarget,
  type ShotKind,
} from './shots'

const rngOf = (...v: number[]) => {
  let i = 0
  return () => v[i++ % v.length]
}
const mid = rngOf(0.25, 0)
/** Grid tests run thousands of launch solves; generous so a busy machine does not flake. */
const SLOW = 30_000

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
    expect(gradeOf(-7)).toBe('good')
    expect(gradeOf(-12)).toBe('good')
    expect(gradeOf(-13)).toBeNull()
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
    expect(a.z).toBeCloseTo(5.6)
    expect(b.z).toBeCloseTo(-5.6)
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
      const origin = from
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
      const v = launchFor('clear', g, from, target, rngOf(0, 0.999))
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
    // out of reach (y < minY) at tick 0; the net hit happens on the first step, then it rises into reach
    const f: Flight = { pos: { x: 0, y: 0.15, z: -0.05 }, vel: { x: 0, y: 6, z: 5 } }
    const g: Flight = JSON.parse(JSON.stringify(f))
    expect(stepShuttle(g).netHit).toBe(true)
    expect(g.pos.y).toBeGreaterThan(REACH.minY) // would be reachable without the stop
    expect(findContact(f, { x: 0, z: -0.05 }, 0, 60)).toBeNull()
  })
})

describe('launchFor guarantees', () => {
  const kinds: ShotKind[] = ['smash', 'drive', 'clear', 'drop', 'serveShort', 'serveLong']
  const grades: Grade[] = ['perfect', 'good', 'late']
  const zero = () => 0 // jitter radius 0
  for (const side of [0, 1] as const) {
    it(
      `side ${side}: every kind x grade from anywhere on own half clears the net and lands >= 1 m past it`,
      () => {
        const dir = side === 0 ? 1 : -1
        for (const kind of kinds)
          for (const grade of grades)
            for (const z of [-6.5, -5.5, -4, -2.5, -1.2, -0.5])
              for (const x of [-2.4, 0, 2.4])
                for (const y of [0.6, 1.5, 2.8]) {
                  const from = { x, y, z: side === 0 ? z : -z }
                  const target = shotTarget(kind, side, x / 2.4)
                  const vel = launchFor(kind, grade, from, target, zero)
                  const land = predictLanding({ pos: from, vel })
                  const tag = `${kind} ${grade} side${side} x${x} y${y} z${from.z}`
                  expect(Math.hypot(vel.x, vel.y, vel.z), tag).toBeLessThanOrEqual(45 + 1e-9)
                  expect(land.netHit, tag).toBe(false)
                  expect(land.pos.y, tag).toBe(0)
                  expect(land.pos.z * dir, tag).toBeGreaterThanOrEqual(1.0)
                }
      },
      SLOW,
    )
  }

  it('perfect clear from the back court lands deep', () => {
    for (const z of [-6.5, -5.5, -4]) {
      const from = { x: 0, y: 1.5, z }
      const vel = launchFor('clear', 'perfect', from, shotTarget('clear', 0, 0), zero)
      expect(predictLanding({ pos: from, vel }).pos.z).toBeGreaterThanOrEqual(COURT.halfLen - 1.5)
    }
  })

  it('perfect drop/drive from the back court land near target (both sides)', () => {
    for (const side of [0, 1] as const)
      for (const kind of ['drop', 'drive'] as ShotKind[]) {
        const from = { x: 0, y: 1.5, z: side === 0 ? -5.5 : 5.5 }
        const t = shotTarget(kind, side, 0)
        const l = predictLanding({ pos: from, vel: launchFor(kind, 'perfect', from, t, zero) }).pos
        expect(Math.hypot(l.x - t.x, l.z - t.z)).toBeLessThan(0.3)
      }
  })

  it('serveLong from the serve spot lands within 1 m of the back line (perfect)', () => {
    for (const side of [0, 1] as const)
      for (const z of [-2, -2.5, -3])
        for (const x of [-1.6, -0.6, 0.6, 1.6]) {
          const dir = side === 0 ? 1 : -1
          const from = { x, y: 1.0, z: dir * z }
          const t = shotTarget('serveLong', side, 0)
          const l = predictLanding({ pos: from, vel: launchFor('serveLong', 'perfect', from, t, zero) }).pos
          expect(l.z * dir, `${side} ${x} ${z}`).toBeGreaterThanOrEqual(COURT.halfLen - 1.0)
        }
  })

  it(
    'late is never faster than perfect for the same kind and spot',
    () => {
      const speed = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z)
      for (const kind of kinds)
        for (const z of [-6.5, -5, -3.5, -2, -0.8])
          for (const y of [0.6, 1.5, 2.8]) {
            const from = { x: 0.5, y, z }
            const t = shotTarget(kind, 0, 0)
            const p = speed(launchFor(kind, 'perfect', from, t, zero))
            const l = speed(launchFor(kind, 'late', from, t, zero))
            expect(l, `${kind} ${z} ${y}`).toBeLessThanOrEqual(p + 1e-6)
          }
    },
    SLOW,
  )

  it('late is shorter than perfect but still in play', () => {
    const from = { x: 0, y: 1.5, z: -2 }
    const t = shotTarget('clear', 0, 0)
    const p = predictLanding({ pos: from, vel: launchFor('clear', 'perfect', from, t, zero) }).pos.z
    const l = predictLanding({ pos: from, vel: launchFor('clear', 'late', from, t, zero) }).pos.z
    expect(l).toBeLessThan(p)
    expect(l).toBeGreaterThanOrEqual(1)
  })
})

describe('launchFor charge (hold-to-charge power)', () => {
  const kinds: ShotKind[] = ['smash', 'drive', 'clear', 'drop']
  const grades: Grade[] = ['perfect', 'good', 'late']
  const zero = () => 0
  const speed = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z)

  it('charge 0 is exactly today’s shot (default parameter)', () => {
    const from = { x: 0.3, y: 1.4, z: -3 }
    for (const kind of kinds) {
      const t = shotTarget(kind, 0, 0.4)
      expect(launchFor(kind, 'good', from, t, rngOf(0.3, 0.6), 0)).toEqual(
        launchFor(kind, 'good', from, t, rngOf(0.3, 0.6)),
      )
    }
  })

  for (const side of [0, 1] as const)
    it(
      `side ${side}: full charge keeps the guarantees (≤ 45 m/s, clears the net, ≥ 1 m past it)`,
      () => {
        const dir = side === 0 ? 1 : -1
        for (const kind of kinds)
          for (const grade of grades)
            for (const z of [-6.5, -4, -2.5, -1.2, -0.5])
              for (const x of [-2.4, 0, 2.4])
                for (const y of [0.6, 1.5, 2.8]) {
                  const from = { x, y, z: side === 0 ? z : -z }
                  const vel = launchFor(kind, grade, from, shotTarget(kind, side, x / 2.4), zero, 1)
                  const land = predictLanding({ pos: from, vel })
                  const tag = `${kind} ${grade} side${side} x${x} y${y} z${from.z}`
                  expect(speed(vel), tag).toBeLessThanOrEqual(45 + 1e-9)
                  expect(land.netHit, tag).toBe(false)
                  expect(land.pos.z * dir, tag).toBeGreaterThanOrEqual(1.0)
                }
      },
      SLOW,
    )

  it('a full-charge Perfect gets there sooner (smash / clear) or comes off faster (drive / drop), and lands in', () => {
    // gain: 'sooner' = ≥ 10% fewer ticks to land; 'faster' = ≥ 5% more launch speed; 'same' = the net
    // already caps how flat it can go (a smash from the back court): never worse than the tap.
    const spots = [
      { kind: 'smash', from: { x: 0, y: 2.5, z: -3 }, gain: 'sooner' },
      { kind: 'smash', from: { x: 0, y: 2.2, z: -1.5 }, gain: 'sooner' },
      { kind: 'smash', from: { x: 1, y: 2.3, z: -5 }, gain: 'same' },
      { kind: 'clear', from: { x: 0, y: 1.5, z: -5 }, gain: 'sooner' },
      { kind: 'clear', from: { x: 0, y: 1.3, z: -2 }, gain: 'sooner' },
      { kind: 'drive', from: { x: 0, y: 1.3, z: -3.5 }, gain: 'faster' },
      { kind: 'drive', from: { x: 0, y: 1.0, z: -5.5 }, gain: 'faster' },
      { kind: 'drop', from: { x: 0, y: 2.2, z: -5 }, gain: 'faster' },
    ] as const
    for (const { kind, from, gain } of spots) {
      const t = shotTarget(kind, 0, 0.5)
      const tap = launchFor(kind, 'perfect', from, t, zero, 0)
      const full = launchFor(kind, 'perfect', from, t, zero, 1)
      const a = predictLanding({ pos: from, vel: tap })
      const b = predictLanding({ pos: from, vel: full })
      const tag = `${kind} ${JSON.stringify(from)}`
      if (gain === 'sooner') expect(b.ticks, tag).toBeLessThan(a.ticks * 0.9)
      else if (gain === 'faster') expect(speed(full), tag).toBeGreaterThan(speed(tap) * 1.05)
      else expect(b.ticks, tag).toBeLessThanOrEqual(a.ticks)
      expect(b.pos.z, tag).toBeGreaterThanOrEqual(a.pos.z - 1e-6)
      expect(isIn(b.pos, 1), tag).toBe(true)
    }
  })

  it(
    'late is never faster than perfect at the same charge',
    () => {
      for (const kind of kinds)
        for (const z of [-6.5, -3.5, -0.8])
          for (const y of [0.6, 1.5, 2.8]) {
            const from = { x: 0.5, y, z }
            const t = shotTarget(kind, 0, 0)
            const p = speed(launchFor(kind, 'perfect', from, t, zero, 1))
            const l = speed(launchFor(kind, 'late', from, t, zero, 1))
            expect(l, `${kind} ${z} ${y}`).toBeLessThanOrEqual(p + 1e-6)
          }
    },
    SLOW,
  )

  it('charge widens the aim error of Good / Late, never of Perfect', () => {
    const from = { x: 0, y: 1.5, z: -3 }
    const t = shotTarget('drive', 0, 0)
    const err = (g: Grade, c: number) => {
      const v = launchFor('drive', g, from, t, rngOf(0, 0.999), c)
      const l = predictLanding({ pos: from, vel: v }).pos
      return Math.abs(l.x - t.x)
    }
    expect(err('good', 1)).toBeGreaterThan(err('good', 0) + 0.2)
    expect(err('late', 1)).toBeGreaterThan(err('late', 0) + 0.2)
    expect(err('perfect', 1)).toBeLessThan(0.35)
  })
})
