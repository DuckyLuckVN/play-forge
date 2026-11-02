import { beforeAll, describe, expect, it } from 'vitest'
import type { Pose } from '../hero-avatar'
import { fakeCanvas, installPath2D } from '../test-canvas'
import { HandFollower, clearHead, drawGrip, drawHand, revealHand, solveHands } from './hands'
import type { BodyMetrics, HandPose } from './types'

beforeAll(installPath2D)

const metrics = (): BodyMetrics => ({
  headTop: -50,
  head: { x: 0, y: -40, rx: 10, ry: 10 },
  socketF: { x: 6, y: -26 },
  socketB: { x: -6, y: -26 },
  bodyBox: { x: -4, y: -28, w: 8, h: 18 },
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
    rear: 0,
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

describe('clearHead with real mood angles', () => {
  // [s, e]: pump, scared, aim (front) and the back arm's tucked pose, plus raised-arm extremes.
  const ANGLES: [number, number][] = [
    [2.2, 2.4],
    [1.0, 2.5],
    [1.4, 2.5],
    [2.45, 2.4],
    [-2.3, 1.7],
    [-2.8, 2.2],
    [2.9, 0.2],
    [3.0, 1.2],
  ]
  const variants: BodyMetrics[] = []
  for (const sx of [4, 6, 9])
    for (const [upper, fore] of [
      [7, 7],
      [7, 8],
    ])
      for (const hr of [10, 12])
        for (const side of [1, -1])
          variants.push({
            ...metrics(),
            head: { x: 0, y: -40, rx: hr, ry: hr },
            socketF: { x: side * sx, y: -28 },
            socketB: { x: side * sx, y: -28 },
            upper,
            fore,
          })

  it('hand and elbow both clear the head', () => {
    for (const m of variants)
      for (const [s0, e] of ANGLES) {
        const s = clearHead(m, m.socketF, s0, e)
        const { elbow, hand } = limb(m, m.socketF, s, e)
        const r = m.head.rx
        const tag = `socket ${m.socketF.x} ${m.upper}/${m.fore} r${r} s${s0} e${e}`
        expect(dist(hand, m.head), tag).toBeGreaterThanOrEqual(r + m.handR + 1 - 1e-9)
        expect(dist(elbow, m.head), tag).toBeGreaterThanOrEqual(r - 1e-9)
      }
  })

  it('picks the nearest clear angle (no closer 0.08 step clears)', () => {
    for (const m of variants)
      for (const [s0, e] of ANGLES) {
        const s = clearHead(m, m.socketF, s0, e)
        const k = Math.round(Math.abs(s - s0) / 0.08)
        for (let j = 0; j < k; j++)
          for (const a of [s0 + j * 0.08, s0 - j * 0.08]) {
            const { elbow, hand } = limb(m, m.socketF, a, e)
            const r = m.head.rx
            expect(dist(hand, m.head) >= r + m.handR + 1 && dist(elbow, m.head) >= r).toBe(false)
          }
      }
  })

  it('reviewer cases: pump end pose stays out of the head', () => {
    const base = { ...metrics(), head: { x: 0, y: -40, rx: 10, ry: 10 } }
    for (const m of [
      { ...base, socketF: { x: 6, y: -28 } },
      { ...base, socketF: { x: 4, y: -28 } },
      { ...base, socketF: { x: 4, y: -28 }, fore: 8 },
    ]) {
      const s = clearHead(m, m.socketF, 2.2, 2.4)
      const { elbow, hand } = limb(m, m.socketF, s, 2.4)
      expect(dist(hand, m.head)).toBeGreaterThanOrEqual(14)
      expect(dist(elbow, m.head)).toBeGreaterThanOrEqual(10)
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

  it('drawGrip restores the canvas state', () => {
    const c = fakeCanvas()
    drawGrip(c, hand(), { x: 14, y: -20, r: 5 }, '#ffd166')
    expect(c.calls[0]).toBe('save')
    expect(c.calls[c.calls.length - 1]).toBe('restore')
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

describe('revealHand (back hand never fully hidden behind the torso)', () => {
  const m = metrics()
  const b = m.bodyBox
  const r = m.handR
  /** How far the mitt pokes out past the box's nearest-overflowing edge. */
  const overflow = (h: { x: number; y: number }) =>
    Math.max(b.x - (h.x - r), h.x + r - (b.x + b.w), b.y - (h.y - r), h.y + r - (b.y + b.h))

  it('pushes a back-arm pose that lands inside the torso out to an edge, arm still joined', () => {
    const p = pose({ sB: 0.3, eB: 1.5 })
    const raw = limb(m, m.socketB, p.sB, p.eB).hand
    expect(overflow(raw)).toBeLessThan(0.8 * r) // the fixture really is (mostly) hidden
    const { back } = solveHands(m, p, null, false)
    expect(overflow(back)).toBeGreaterThanOrEqual(0.8 * r) // ≥ ~40% of the mitt shows
    expect(dist(back, m.head)).toBeGreaterThanOrEqual(Math.max(m.head.rx, m.head.ry) + r + 1)
    expect(dist(m.socketB, { x: back.ex, y: back.ey })).toBeCloseTo(m.upper, 6)
    expect(dist({ x: back.ex, y: back.ey }, back)).toBeCloseTo(m.fore, 6)
  })

  it('leaves a hand that already shows untouched', () => {
    const h: HandPose = { x: b.x - 1, y: -20, ex: -9, ey: -22, open: 0, front: false }
    expect(revealHand(m, m.socketB, h)).toBe(h)
    const p = pose()
    const raw = limb(m, m.socketB, p.sB, p.eB).hand
    expect(overflow(raw)).toBeGreaterThanOrEqual(0.8 * r)
    const { back } = solveHands(m, p, null, false)
    expect(back.x).toBeCloseTo(raw.x, 9)
    expect(back.y).toBeCloseTo(raw.y, 9)
  })

  it('never moves the held front hand, even inside the torso', () => {
    const hold = { x: 0, y: -18, r: 4 }
    const { front } = solveHands(m, pose(), hold, true)
    expect(front.x).toBe(hold.x)
    expect(front.y).toBe(hold.y)
  })
})
