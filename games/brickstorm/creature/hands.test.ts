import { beforeAll, describe, expect, it } from 'vitest'
import type { Pose } from '../hero-avatar'
import { fakeCanvas, installPath2D } from '../test-canvas'
import { HandFollower, clearHead, drawGrip, drawHand, solveHands } from './hands'
import type { BodyMetrics, HandPose } from './types'

beforeAll(installPath2D)

const metrics = (): BodyMetrics => ({
  headTop: -50,
  head: { x: 0, y: -40, rx: 10, ry: 10 },
  socketF: { x: 6, y: -26 },
  socketB: { x: -6, y: -26 },
  upper: 7,
  fore: 7,
  armed: true,
  handR: 3,
})

const pose = (over: Partial<Pose> = {}): Pose =>
  ({
    crouch: 0,
    lean: 0,
    sF: 0.15,
    eF: 0.35,
    sB: -0.15,
    eB: 0.35,
    tilt: 0,
    fall: 0,
    eyeOpen: 1,
    brow: 0,
    browUp: 0,
    mouthOpen: 0,
    smile: 0,
    blush: 0,
    ...over,
  }) as Pose

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

/** Hand and elbow for a shoulder angle `s` and elbow bend `e` (same convention as the solver). */
const limb = (m: BodyMetrics, o: { x: number; y: number }, s: number, e: number) => {
  const ex = o.x + Math.sin(s) * m.upper
  const ey = o.y + Math.cos(s) * m.upper
  return {
    elbow: { x: ex, y: ey },
    hand: { x: ex + Math.sin(s + e) * m.fore, y: ey + Math.cos(s + e) * m.fore },
  }
}

describe('solveHands', () => {
  it('holding hand sits exactly on the hold point', () => {
    const { front } = solveHands(metrics(), pose(), { x: 14, y: -20, r: 5 }, true)
    expect(front.x).toBe(14)
    expect(front.y).toBe(-20)
    // Elbow is a real joint: upper from the socket, fore from the hand.
    expect(dist({ x: front.ex, y: front.ey }, metrics().socketF)).toBeCloseTo(7, 6)
    expect(dist({ x: front.ex, y: front.ey }, front)).toBeCloseTo(7, 6)
  })

  it('hold beyond reach still puts the hand on the ball', () => {
    const m = metrics()
    const { front } = solveHands(m, pose(), { x: 60, y: -20, r: 5 }, true)
    expect(front.x).toBe(60)
    expect(front.y).toBe(-20)
    const o = m.socketF
    expect(dist({ x: front.ex, y: front.ey }, o)).toBeCloseTo(m.upper, 6)
    // Cross product of socket→elbow and socket→hold is 0: elbow on the line, pointing at the hold.
    const cross = (front.ex - o.x) * (-20 - o.y) - (front.ey - o.y) * (60 - o.x)
    expect(cross).toBeCloseTo(0, 6)
    expect((front.ex - o.x) * (60 - o.x) + (front.ey - o.y) * (-20 - o.y)).toBeGreaterThan(0)
  })

  it('not holding: forward kinematics from the pose', () => {
    const m = metrics()
    const { front, back } = solveHands(m, pose(), { x: 14, y: -20, r: 5 }, false)
    const f = limb(m, m.socketF, 0.15, 0.35)
    const b = limb(m, m.socketB, -0.15, 0.35)
    expect(front.x).toBeCloseTo(f.hand.x, 6)
    expect(front.y).toBeCloseTo(f.hand.y, 6)
    expect(back.x).toBeCloseTo(b.hand.x, 6)
    expect(back.ey).toBeCloseTo(b.elbow.y, 6)
    expect(front.open).toBe(0)
    expect(back.open).toBe(0)
  })

  it('raised arm is pushed out of the head', () => {
    const { front } = solveHands(metrics(), pose({ sF: 2.9, eF: 0.2 }), null, false)
    expect(dist(front, { x: 0, y: -40 })).toBeGreaterThanOrEqual(14)
  })

  it('front and back flags', () => {
    const { front, back } = solveHands(metrics(), pose(), null, false)
    expect(front.front).toBe(true)
    expect(back.front).toBe(false)
  })
})

describe('clearHead', () => {
  it('leaves a clear arm alone', () => {
    expect(clearHead(metrics(), metrics().socketF, 0.15, 0.35)).toBe(0.15)
  })

  it('never steps into the head', () => {
    const m = metrics()
    const bound = Math.max(m.head.rx, m.head.ry)
    for (const socket of [m.socketF, m.socketB]) {
      for (const sF of [2.0, 2.5, 3.0, -2.5, -3.0]) {
        const s = clearHead(m, socket, sF, 0.2)
        const { elbow, hand } = limb(m, socket, s, 0.2)
        expect(dist(hand, m.head), `socket ${socket.x} s ${sF}`).toBeGreaterThanOrEqual(bound + m.handR + 1)
        expect(dist(elbow, m.head), `socket ${socket.x} s ${sF}`).toBeGreaterThanOrEqual(bound)
      }
    }
  })
})

describe('HandFollower', () => {
  it('follower returns to the ball fast once locked', () => {
    const f = new HandFollower()
    f.snap({ x: 0, y: 0 })
    const target = { x: 14, y: -20 }
    for (let t = 0; t < 0.3; t += 1 / 60) f.update(1 / 60, target, false, false)
    f.update(1 / 60, target, true, false)
    expect(f.x).toBe(14)
    expect(f.y).toBe(-20)
  })

  it('unlocked follower closes most of the gap in 0.15 s and settles without overshoot', () => {
    // Critically damped, k = 260 (ω ≈ 16.1): error ≈ (1 + ωt)·e^(−ωt) ≈ 30% at 0.15 s.
    const f = new HandFollower()
    f.snap({ x: 0, y: 0 })
    const target = { x: 14, y: -20 }
    const gap = dist(f, target)
    let t = 0
    let maxX = 0
    for (; t < 0.15 - 1e-9; t += 1 / 60) f.update(1 / 60, target, false, false)
    expect(dist(f, target)).toBeLessThan(gap * 0.35)
    for (; t < 0.45; t += 1 / 60) {
      f.update(1 / 60, target, false, false)
      maxX = Math.max(maxX, f.x)
    }
    expect(dist(f, target)).toBeLessThan(0.5)
    expect(maxX).toBeLessThanOrEqual(14 + 1e-6)
  })

  it('a small nudge is back within 0.5 after 0.15 s', () => {
    const f = new HandFollower()
    f.snap({ x: 14, y: -20 })
    const target = { x: 14 + 1.5, y: -20 }
    for (let t = 0; t < 0.15 - 1e-9; t += 1 / 60) f.update(1 / 60, target, false, false)
    expect(dist(f, target)).toBeLessThan(0.5)
  })

  it('still snaps', () => {
    const f = new HandFollower()
    f.snap({ x: 0, y: 0 })
    f.update(1 / 60, { x: 14, y: -20 }, false, true)
    expect(f.x).toBe(14)
    expect(f.y).toBe(-20)
  })

  it('stays stable on a long frame', () => {
    const f = new HandFollower()
    f.snap({ x: 0, y: 0 })
    f.update(0.5, { x: 14, y: -20 }, false, false)
    expect(Number.isFinite(f.x)).toBe(true)
    expect(dist(f, { x: 14, y: -20 })).toBeLessThan(dist({ x: 0, y: 0 }, { x: 14, y: -20 }))
  })
})

describe('drawing', () => {
  const hand = (open = 0): HandPose => ({ x: 14, y: -20, ex: 10, ey: -26, open, front: true })

  it('grip follows ball radius', () => {
    for (const r of [5, 9]) {
      const c = fakeCanvas()
      const ball = { x: 14, y: -20, r }
      drawGrip(c, hand(), ball, '#ffd166')
      const shapes = c.log.filter((l) => l.name === 'arc' || l.name === 'ellipse')
      expect(shapes.length).toBeGreaterThan(0)
      expect(shapes[0].args[0]).toBeCloseTo(ball.x + r * 0.55, 6)
      expect(shapes[0].args[1]).toBeCloseTo(ball.y + r * 0.35, 6)
      expect(shapes[0].args[2]).toBeCloseTo(r * 0.42, 6)
    }
  })

  it('drawHand outlines the mitt before filling it', () => {
    const c = fakeCanvas()
    drawHand(c, hand(), '#ffd166', 3.5)
    const firstFill = c.calls.indexOf('fill')
    expect(c.calls.indexOf('stroke')).toBeGreaterThanOrEqual(0)
    expect(c.calls.indexOf('stroke')).toBeLessThan(firstFill)
  })

  it('drawHand works open and on a zero-length forearm', () => {
    expect(() => drawHand(fakeCanvas(), hand(1), '#ffd166', 3.5)).not.toThrow()
    expect(() => drawHand(fakeCanvas(), { ...hand(), ex: 14, ey: -20 }, '#ffd166', 3.5)).not.toThrow()
  })
})
