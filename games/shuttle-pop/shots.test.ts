import { describe, expect, it } from 'vitest'
import { courtDims, COURT_SIZES } from './courtsize'
import { COURT, isIn, predictLanding, stepShuttle, type Flight } from './physics'
import {
  chooseShot,
  depthOf,
  type Grade,
  findContact,
  gradeOf,
  launchFor,
  launchShot,
  minDepthOf,
  onHalf,
  pickContact,
  POWER,
  REACH,
  shotTarget,
  type ShotKind,
} from './shots'
import {
  contactCandidates,
  setupBots,
  shuttlePopGame as game,
  step,
  type SpPlayer,
  type SpState,
} from './sim'

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
  it('a pressured Perfect window (4) shrinks only the perfect band', () => {
    expect(gradeOf(4, 4)).toBe('perfect')
    expect(gradeOf(5, 4)).toBe('good')
    expect(gradeOf(-5, 4)).toBe('good')
    expect(gradeOf(12, 4)).toBe('good')
    expect(gradeOf(13, 4)).toBe('late')
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

  it('findContact / pickContact use the given reach box', () => {
    const jump = { radius: 1.1, minY: 2.2, maxY: 3.7 }
    const lunge = { radius: 2.3, minY: 0.05, maxY: 1.6 }
    // passes over the player at (0, -2) around y 3.3: above REACH.maxY all the way through
    const high: Flight = { pos: { x: -3, y: 3.2, z: -2 }, vel: { x: 12, y: 2.6, z: 0 } }
    const p = { x: 0, z: -2 }
    expect(findContact(high, p, 0, 60)).toBeNull()
    const c = findContact(high, p, 0, 60, jump)
    expect(c).not.toBeNull()
    expect(c!.pos.y).toBeGreaterThan(REACH.maxY)
    expect(pickContact([], high, 0, p, 0, 1, 0, 0)).toBeNull()
    expect(pickContact([], high, 0, p, 0, 1, c!.dt, 0, undefined, jump)?.grade).toBe('perfect')
    // a low drive 1.8 m beside the player at y ~0.6
    const wide: Flight = { pos: { x: 1.8, y: 0.6, z: -6 }, vel: { x: 0, y: 1.2, z: 9 } }
    const q = { x: 0, z: -4.4 }
    expect(findContact(wide, q, 0, 60)).toBeNull()
    expect(findContact(wide, q, 0, 60, lunge)).not.toBeNull()
    // the past candidates use the box too
    const past = [{ tick: 5, pos: { x: 1.8, y: 0.6, z: -4.4 }, at: q }]
    expect(pickContact(past, wide, 10, q, 0, 1, 5, 10)).toBeNull()
    expect(pickContact(past, wide, 10, q, 0, 1, 5, 10, undefined, lunge)?.tick).toBe(5)
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
      `side ${side}: full charge keeps the guarantees (speed cap, clears the net, past the min depth)`,
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
                  expect(speed(vel), tag).toBeLessThanOrEqual(45 * (1 + (POWER.speed[kind] ?? 0)) + 1e-9)
                  expect(land.netHit, tag).toBe(false)
                  expect(land.pos.z * dir, tag).toBeGreaterThanOrEqual(minDepthOf(kind, 1))
                }
      },
      SLOW,
    )

  it('a full-charge Perfect smash gets there sooner / a drive comes off faster, and lands in', () => {
    // gain: 'sooner' = ≥ 10% fewer ticks to land; 'faster' = ≥ 5% more launch speed; 'same' = the net
    // already caps how flat it can go (a smash from the back court, a low drive): never worse.
    // (Clear / drop trade time for depth / tightness: their own tests below.)
    const spots = [
      { kind: 'smash', from: { x: 0, y: 2.5, z: -3 }, gain: 'sooner' },
      { kind: 'smash', from: { x: 0, y: 2.2, z: -1.5 }, gain: 'sooner' },
      { kind: 'smash', from: { x: 1, y: 2.3, z: -5 }, gain: 'same' },
      { kind: 'drive', from: { x: 0, y: 2.0, z: -3.5 }, gain: 'faster' },
      { kind: 'drive', from: { x: 0, y: 2.5, z: -5.5 }, gain: 'faster' },
      { kind: 'drive', from: { x: 0, y: 1.0, z: -5.5 }, gain: 'same' },
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

  for (const side of [0, 1] as const)
    it(
      `side ${side}: a full-charge Perfect smash / drive never takes longer to land than the tap, from anywhere on the own half`,
      () => {
        for (const kind of ['smash', 'drive'] as const)
          for (const z of [-6.5, -5, -3.5, -2, -0.8])
            for (const x of [-2.2, 0, 2.2])
              for (const y of [0.6, 1.5, 2.6]) {
                const from = { x, y, z: side === 0 ? z : -z }
                const t = shotTarget(kind, side, x / 2.4)
                const a = predictLanding({ pos: from, vel: launchFor(kind, 'perfect', from, t, zero, 0) })
                const b = predictLanding({ pos: from, vel: launchFor(kind, 'perfect', from, t, zero, 1) })
                expect(b.ticks, `${kind} side${side} ${x} ${y} ${z}`).toBeLessThanOrEqual(a.ticks)
              }
      },
      SLOW,
    )

  it('both ends play the same charged shot, mirrored', () => {
    for (const kind of kinds)
      for (const grade of grades) {
        const from = { x: 0.7, y: 1.6, z: -3.2 }
        const a = launchFor(kind, grade, from, shotTarget(kind, 0, 0.4), rngOf(0.3, 0.7), 1)
        const b = launchFor(
          kind,
          grade,
          { x: -0.7, y: 1.6, z: 3.2 },
          shotTarget(kind, 1, 0.4),
          rngOf(0.3, 0.7),
          1,
        )
        expect(b.x).toBeCloseTo(-a.x, 9)
        expect(b.y).toBeCloseTo(a.y, 9)
        expect(b.z).toBeCloseTo(-a.z, 9)
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

  const pitch = (v: { x: number; y: number; z: number }) => Math.atan2(v.y, Math.hypot(v.x, v.z))
  /** Peak height and landing descent angle (rad) of a launch from `from`. */
  const arc = (from: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number }) => {
    const f: Flight = { pos: { ...from }, vel: { ...vel } }
    let apex = f.pos.y
    let last = f.vel
    while (f.pos.y > 0 && !stepShuttle(f).netHit) {
      apex = Math.max(apex, f.pos.y)
      last = { ...f.vel }
    }
    return { apex, descent: Math.atan(Math.abs(last.y) / Math.hypot(last.x, last.z)) }
  }

  it('full-charge Perfect smash / drive comes off the racket ≥ 25 % / 15 % faster than the tap and lands in', () => {
    for (const [kind, min] of [
      ['smash', 1.25],
      ['drive', 1.15],
    ] as const)
      for (const from of [
        { x: 0, y: 2.5, z: -3 },
        { x: 1, y: 2.3, z: -5 },
        { x: -1, y: 2.2, z: -1.5 },
      ]) {
        const t = shotTarget(kind, 0, 0.5)
        const tap = launchShot(kind, 'perfect', from, t, zero, 0)
        const full = launchShot(kind, 'perfect', from, t, zero, 1)
        const land = predictLanding({ pos: from, vel: full.vel })
        const tag = `${kind} ${JSON.stringify(from)}`
        expect(speed(full.vel), tag).toBeGreaterThanOrEqual(speed(tap.vel) * min)
        expect(full.gain, tag).toBeGreaterThan(0.7)
        expect(tap.gain, tag).toBe(0)
        expect(isIn(land.pos, 1), tag).toBe(true)
      }
  })

  it('full-charge smash is steeper (launch pitch lower) than the tap', () => {
    for (const from of [
      { x: 0, y: 2.5, z: -3 },
      { x: 1, y: 2.3, z: -5 },
      { x: -1, y: 2.2, z: -1.5 },
    ]) {
      const t = shotTarget('smash', 0, 0.5)
      const tap = launchShot('smash', 'perfect', from, t, zero, 0)
      const full = launchShot('smash', 'perfect', from, t, zero, 1)
      expect(pitch(full.vel), JSON.stringify(from)).toBeLessThan(pitch(tap.vel))
    }
  })

  it('full-charge Perfect clear lands deeper (≥ 6.2 m) and peaks higher than the tap, still in', () => {
    for (const from of [
      { x: 0, y: 1.5, z: -5 },
      { x: 0, y: 1.3, z: -2 },
      { x: 1, y: 0.8, z: -6 },
    ]) {
      const t = shotTarget('clear', 0, 0.5)
      const tap = launchShot('clear', 'perfect', from, t, zero, 0)
      const full = launchShot('clear', 'perfect', from, t, zero, 1)
      const a = predictLanding({ pos: from, vel: tap.vel }).pos
      const b = predictLanding({ pos: from, vel: full.vel }).pos
      const tag = JSON.stringify(from)
      expect(b.z, tag).toBeGreaterThanOrEqual(6.2)
      expect(b.z, tag).toBeGreaterThan(a.z)
      expect(arc(from, full.vel).apex, tag).toBeGreaterThan(arc(from, tap.vel).apex)
      expect(isIn(b, 1), tag).toBe(true)
      expect(full.gain, tag).toBe(1)
    }
  })

  it('full-charge Perfect drop lands closer to the net (≤ tap − 0.2 m, ≥ 0.6 m past it) and falls steeper', () => {
    for (const from of [
      { x: 0, y: 2.5, z: -1.5 },
      { x: 0, y: 1.8, z: -4 },
      { x: -1, y: 2.2, z: -6 },
    ]) {
      const t = shotTarget('drop', 0, 0.5)
      const tap = launchShot('drop', 'perfect', from, t, zero, 0)
      const full = launchShot('drop', 'perfect', from, t, zero, 1)
      const a = predictLanding({ pos: from, vel: tap.vel })
      const b = predictLanding({ pos: from, vel: full.vel })
      const tag = JSON.stringify(from)
      expect(b.netHit, tag).toBe(false)
      expect(b.pos.z, tag).toBeLessThanOrEqual(a.pos.z - 0.2)
      expect(b.pos.z, tag).toBeGreaterThanOrEqual(0.6)
      expect(arc(from, full.vel).descent, tag).toBeGreaterThanOrEqual(arc(from, tap.vel).descent)
    }
  })

  it('half charge sits between tap and full (smash speed, clear depth, drop depth)', () => {
    const from = { x: 0, y: 2.5, z: -3 }
    const at = (kind: ShotKind, c: number) =>
      launchShot(kind, 'perfect', from, shotTarget(kind, 0, 0.5), zero, c)
    const s = [0, 0.5, 1].map((c) => speed(at('smash', c).vel))
    expect(s[1]).toBeGreaterThan(s[0])
    expect(s[1]).toBeLessThan(s[2])
    const depth = (kind: ShotKind) =>
      [0, 0.5, 1].map((c) => predictLanding({ pos: from, vel: at(kind, c).vel }).pos.z)
    const cl = depth('clear')
    expect(cl[1]).toBeGreaterThan(cl[0])
    expect(cl[1]).toBeLessThan(cl[2])
    const dr = depth('drop')
    expect(dr[1]).toBeLessThan(dr[0])
    expect(dr[1]).toBeGreaterThan(dr[2])
  })

  it('launchFor is launchShot(...).vel', () => {
    const from = { x: 0.3, y: 1.9, z: -3 }
    for (const kind of kinds)
      for (const c of [0, 0.6, 1]) {
        const t = shotTarget(kind, 0, 0.3)
        expect(launchFor(kind, 'good', from, t, rngOf(0.3, 0.6), c)).toEqual(
          launchShot(kind, 'good', from, t, rngOf(0.3, 0.6), c).vel,
        )
      }
  })

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

describe('onHalf', () => {
  it('own half by side; z = 0 belongs to whoever did not hit last', () => {
    expect(onHalf(-1, 0, 1)).toBe(true)
    expect(onHalf(1, 0, 1)).toBe(false)
    expect(onHalf(1, 1, 0)).toBe(true)
    expect(onHalf(0, 0, 1)).toBe(true)
    expect(onHalf(0, 0, 0)).toBe(false)
    expect(onHalf(0, 1, -1)).toBe(true)
  })
})

describe('pickContact', () => {
  /** The sim's own contact for `p` swinging `rewind` ticks ago, via pickContact (sim's contactFor rules). */
  const query = (s: SpState, p: SpPlayer, rewind: number) =>
    pickContact(
      contactCandidates(s, p, rewind),
      s.shuttle,
      s.tick,
      p,
      p.side,
      s.shuttle.lastHitter,
      s.tick - rewind,
      s.tick,
    )
  const strip = (c: ReturnType<typeof query>) => c && { tick: c.tick, y: c.y, grade: c.grade }
  const twoHumans = () =>
    game.setup(
      [0, 1].map((i) => ({ id: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true })),
      1,
      {},
    )
  const inRally = (s: SpState, pos: Flight['pos'], vel: Flight['vel'], lastHitter: 0 | 1) => {
    s.phase = 'rally'
    s.phaseT = 0
    s.shuttle.pos = { ...pos }
    s.shuttle.vel = { ...vel }
    s.shuttle.lastHitter = lastHitter
  }

  it('pickContact results on recorded bot rallies match the pinned snapshot', () => {
    // 200 swings near the shuttle in a seeded bot rally (rewind 0 / 4 / 7), expected values are a
    // snapshot of pickContact's output (originally recorded from the old contactFor; re-recorded when
    // the power swing changed charged launches and bot rallies, when the 2026-11-12 AI retune changed
    // the bots' rallies, and for the 2026-11-13 near-shuttle fix, so this pins current behaviour only; past-candidate picks are covered below).
    const s = setupBots('hard', 'hard', 1)
    const got: { tick: number; side: number; rewind: number; c: ReturnType<typeof strip> }[] = []
    for (let i = 0; i < 600 && got.length < 200; i++) {
      step(s, [])
      if (s.phase !== 'rally' || s.tick % 3 !== 0 || s.shuttle.pending) continue
      for (const p of s.players) {
        if (s.shuttle.lastHitter === p.side) continue
        if (Math.hypot(s.shuttle.pos.x - p.x, s.shuttle.pos.z - p.z) > 3) continue
        for (const rewind of [0, 4, 7]) {
          if (got.length < 200)
            got.push({ tick: s.tick, side: p.side, rewind, c: strip(query(s, p, rewind)) })
        }
      }
    }
    expect(got).toHaveLength(200)
    const hits = got.filter((g) => g.c)
    const grades = { perfect: 0, good: 0, late: 0 }
    for (const g of hits) grades[g.c!.grade]++
    expect(hits).toHaveLength(118)
    expect(grades).toEqual({ perfect: 13, good: 33, late: 72 })
    expect(hits.reduce((a, g) => a + g.c!.tick, 0)).toBe(24994)
    expect(hits.reduce((a, g) => a + g.c!.y, 0)).toBeCloseTo(144.05280960712497, 9)
    const at = (tick: number, side: number, rewind: number) =>
      got.find((g) => g.tick === tick && g.side === side && g.rewind === rewind)?.c
    // good in the future
    expect(at(66, 0, 0)).toEqual({ tick: 73, y: 0.9613516361468086, grade: 'good' })
    // late
    expect(at(54, 0, 0)).toEqual({ tick: 72, y: 1.0159664682800775, grade: 'late' })
  })

  it('a swing after the closest approach by more than pastGrace whiffs (a rewind brings it back)', () => {
    const s = twoHumans()
    s.players[1].x = 0
    s.players[1].z = 3
    inRally(s, { x: 0, y: 1.5, z: 3 }, { x: 6, y: 1, z: 0 }, 0)
    for (let i = 0; i < 15; i++) step(s, [])
    expect(query(s, s.players[1], 0)).toBeNull()
    expect(strip(query(s, s.players[1], 3))).toEqual({ tick: 1, y: 1.5, grade: 'good' })
  })

  it('a shuttle in reach over the other half is no contact', () => {
    const s = twoHumans()
    s.players[0].x = 0
    s.players[0].z = -0.4
    inRally(s, { x: 0, y: 1.5, z: 0.3 }, { x: 0, y: 0, z: 0.5 }, 1)
    step(s, [])
    step(s, [])
    expect(Math.hypot(s.shuttle.pos.x, s.shuttle.pos.z + 0.4)).toBeLessThan(REACH.radius)
    expect(query(s, s.players[0], 0)).toBeNull()
  })

  it('returns the contact position (the past candidate it picked)', () => {
    const s = twoHumans()
    s.players[1].x = 0
    s.players[1].z = 3
    inRally(s, { x: 0, y: 1.5, z: 3 }, { x: 6, y: 1, z: 0 }, 0)
    for (let i = 0; i < 5; i++) step(s, [])
    const c = query(s, s.players[1], 5)!
    expect(c.tick).toBe(1)
    expect(c.pos).toEqual({ x: 0, y: 1.5, z: 3 })
  })
})

describe('court size', () => {
  const xl = courtDims('xl')
  it('depths: Normal unchanged, line-relative shots follow the lines, drive/smash scale', () => {
    expect(depthOf('clear')).toBe(COURT.halfLen - 0.6)
    expect(depthOf('smash')).toBe(4.0)
    expect(depthOf('drive')).toBe(5.6)
    expect(depthOf('clear', xl)).toBe(xl.halfLen - 0.6)
    expect(depthOf('serveShort', xl)).toBe(xl.shortLine + 0.4)
    expect(depthOf('serveLong', xl)).toBe(xl.halfLen - 0.5)
    expect(depthOf('drive', xl)).toBeCloseTo(5.6 * 1.3)
    expect(depthOf('smash', xl)).toBeCloseTo(4.0 * 1.3)
    expect(depthOf('drop', xl)).toBe(1.0)
  })
  const spots = (court: ReturnType<typeof courtDims>) => {
    const out: { x: number; z: number }[] = []
    for (const fx of [-0.8, 0, 0.8])
      for (const z of [-1.5, -court.halfLen / 2, -(court.halfLen - 0.3)])
        out.push({ x: fx * court.halfWidth, z })
    return out
  }
  const kinds: ShotKind[] = ['clear', 'drop', 'drive', 'smash']
  for (const [name, charge] of [
    ['every Perfect tap shot lands in from anywhere on own half, at every size', 0],
    ['full-charge Perfect smash / drive / clear still land in at every size', 1],
  ] as const) {
    it(
      name,
      () => {
        for (const size of COURT_SIZES) {
          const court = courtDims(size)
          for (const kind of charge ? (['smash', 'drive', 'clear'] as ShotKind[]) : kinds)
            for (const sp of spots(court))
              for (const hx of [-1, 0, 1]) {
                const from = { x: sp.x, y: kind === 'smash' ? 2.6 : 1.2, z: sp.z }
                const t = shotTarget(kind, 0, hx, court)
                const vel = launchFor(kind, 'perfect', from, t, () => 0.5, charge, court)
                const p = predictLanding({ pos: from, vel })
                const tag = `${size} ${kind} ${JSON.stringify(sp)} hx${hx}`
                expect(p.netHit, tag).toBe(false)
                expect(isIn(p.pos, 1, court), tag).toBe(true)
              }
        }
      },
      SLOW,
    )
  }
  it('a bigger court is played deeper', () => {
    const from = { x: 0, y: 1.2, z: -3 }
    const land = (c: ReturnType<typeof courtDims>) =>
      predictLanding({
        pos: from,
        vel: launchFor('drive', 'perfect', from, shotTarget('drive', 0, 0, c), () => 0.5, 0, c),
      }).pos.z
    expect(land(xl)).toBeGreaterThan(land(COURT))
  })
})
