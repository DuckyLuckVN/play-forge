import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import {
  corkAxis,
  floorClearance,
  ORIENT,
  REST_TILT,
  restingDir,
  shuttleMode,
  shuttleOrientation,
  turnToward,
} from './orient'
import type { Vec3 } from './physics'

const axisOf = (q: Quaternion) => corkAxis(q, new Vector3())
const angle = (a: Vector3, b: Vector3) => a.angleTo(b)
const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z })

/** Run `secs` of 60 Hz frames toward `vel` from `q` (mutated). */
function fly(q: Quaternion, vel: Vec3, secs: number) {
  for (let t = 0; t < secs * 60; t++) shuttleOrientation(vel, q, 1 / 60, q)
  return q
}

describe('shuttleOrientation', () => {
  it('points the cork along the velocity (cork-first)', () => {
    for (const vel of [v(0, 0, 10), v(3, 8, -12), v(-2, -9, 1), v(0, -5, 0)]) {
      const q = fly(new Quaternion(), vel, 1)
      const dir = new Vector3(vel.x, vel.y, vel.z).normalize()
      expect(angle(axisOf(q), dir)).toBeLessThan(1e-3)
    }
  })

  it('turns smoothly: one frame turns part of the way, frame-rate independent', () => {
    const vel = v(0, 0, 10)
    const one = shuttleOrientation(vel, new Quaternion(), 1 / 60, new Quaternion())
    const a1 = angle(axisOf(one), new Vector3(0, 1, 0))
    // Partly turned, never snapped.
    expect(a1).toBeGreaterThan(0)
    expect(a1).toBeLessThan(Math.PI / 4)
    // Two 120 Hz frames ≈ one 60 Hz frame.
    const q = new Quaternion()
    shuttleOrientation(vel, q, 1 / 120, q)
    shuttleOrientation(vel, q, 1 / 120, q)
    expect(Math.abs(angle(axisOf(q), new Vector3(0, 1, 0)) - a1)).toBeLessThan(1e-6)
  })

  it('flips quickly at a lob apex (mostly turned within 0.15 s)', () => {
    const q = fly(new Quaternion(), v(0, 6, 4), 1)
    fly(q, v(0, -6, 4), 0.15)
    expect(angle(axisOf(q), new Vector3(0, -6, 4).normalize())).toBeLessThan(0.2)
  })

  it('holds the last orientation when (almost) still, and on a zero dt', () => {
    const q = fly(new Quaternion(), v(4, 2, 7), 1)
    const before = q.clone()
    shuttleOrientation(v(0, 0, 0), q, 1 / 60, q)
    shuttleOrientation(v(0, ORIENT.minSpeed / 2, 0), q, 1 / 60, q)
    shuttleOrientation(v(0, -9, 0), q, 0, q)
    expect(q.angleTo(before)).toBeLessThan(1e-9)
  })

  it('never goes NaN on an exact 180° flip, and adds no roll on a plain swing', () => {
    const q = new Quaternion()
    turnToward(q, 0, -1, 0, ORIENT.rate, 1 / 60, q)
    expect([q.x, q.y, q.z, q.w].every(Number.isFinite)).toBe(true)
    // Swing about x only (y → z): the quaternion has no y (roll about the cork axis) component.
    const s = turnToward(new Quaternion(), 0, 0, 1, ORIENT.rate, 1 / 60, new Quaternion())
    expect(Math.abs(s.y)).toBeLessThan(1e-9)
  })
})

describe('resting pose', () => {
  it('lies on its side: cork forward along the last heading, dipped REST_TILT', () => {
    expect(REST_TILT).toBeGreaterThan(0.1)
    expect(REST_TILT).toBeLessThan(0.45)
    const d = restingDir(3, 4, v(0, 0, 0))
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9)
    expect(d.y).toBeCloseTo(-Math.sin(REST_TILT), 9)
    expect(d.x / d.z).toBeCloseTo(3 / 4, 9)
    // No heading yet: still a unit, resting direction.
    const z = restingDir(0, 0, v(0, 0, 0))
    expect(Math.hypot(z.x, z.y, z.z)).toBeCloseTo(1, 9)
  })

  it('cork and rim both touch the floor at rest; any other tilt needs more clearance', () => {
    const rest = floorClearance(-Math.sin(REST_TILT))
    expect(rest).toBeGreaterThan(0)
    for (const t of [0, 0.1, 0.4, 0.8, Math.PI / 2])
      expect(floorClearance(-Math.sin(t))).toBeGreaterThanOrEqual(rest - 1e-9)
    // Cork straight down: the tip touches; straight up: the rim rests at skirt length.
    expect(floorClearance(-1)).toBeGreaterThan(rest)
    expect(floorClearance(1)).toBeGreaterThan(0.1)
  })
})

describe('shuttleMode', () => {
  it('hand before the serve, fly in a rally or while still falling, rest on the floor', () => {
    expect(shuttleMode('serve', 1)).toBe('hand')
    expect(shuttleMode('rally', 0)).toBe('fly')
    expect(shuttleMode('point', 0.8)).toBe('fly')
    expect(shuttleMode('point', 0)).toBe('rest')
    expect(shuttleMode('over', 0)).toBe('rest')
  })
})
