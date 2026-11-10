import { describe, expect, it } from 'vitest'
import { MOVE_SPEED } from './court'
import { damp, dampAngle, GAIT, Gait, GaitEvent, strideParams, wrapAngle } from './locomotion'

describe('strideParams', () => {
  it('is all zero at rest and grows monotonically up to full run', () => {
    const rest = strideParams(0, { freq: 1, amp: 1, bob: 1 })
    expect(rest).toEqual({ freq: 0, amp: 0, bob: 0 })
    const out = { freq: 0, amp: 0, bob: 0 }
    let prev = { freq: -1, amp: -1, bob: -1 }
    for (let s = 0.05; s <= 1.0001; s += 0.05) {
      strideParams(s, out)
      expect(out.freq).toBeGreaterThan(prev.freq)
      expect(out.amp).toBeGreaterThanOrEqual(prev.amp)
      expect(out.bob).toBeGreaterThan(prev.bob)
      prev = { ...out }
    }
    expect(strideParams(1, out).freq).toBeCloseTo(GAIT.freq, 6)
  })

  it('clamps outside 0..1', () => {
    const a = strideParams(2, { freq: 0, amp: 0, bob: 0 })
    const b = strideParams(1, { freq: 0, amp: 0, bob: 0 })
    expect(a).toEqual(b)
    expect(strideParams(-1, { freq: 1, amp: 1, bob: 1 })).toEqual({ freq: 0, amp: 0, bob: 0 })
  })
})

describe('wrapAngle / dampAngle', () => {
  it('wraps into (−π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 9)
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(Math.PI, 9)
    expect(wrapAngle(0.5 + 4 * Math.PI)).toBeCloseTo(0.5, 9)
  })

  it('turns the short way across ±π', () => {
    // From 170° to −170°: 20° the short way (increasing), not 340° back.
    const cur = (170 * Math.PI) / 180
    const next = dampAngle(cur, (-170 * Math.PI) / 180, 10, 1 / 60)
    expect(wrapAngle(next - cur)).toBeGreaterThan(0)
    expect(Math.abs(wrapAngle(next - cur))).toBeLessThan((20 * Math.PI) / 180)
  })

  it('is frame-rate independent (1×dt ≈ 2×dt/2)', () => {
    const one = dampAngle(0, 2, 8, 1 / 30)
    const two = dampAngle(dampAngle(0, 2, 8, 1 / 60), 2, 8, 1 / 60)
    expect(wrapAngle(one - two)).toBeCloseTo(0, 9)
    expect(damp(0, 1, 8, 1 / 30)).toBeCloseTo(damp(damp(0, 1, 8, 1 / 60), 1, 8, 1 / 60), 9)
  })

  it('never overshoots', () => {
    expect(dampAngle(0, 1, 1000, 1)).toBeCloseTo(1, 6)
    expect(damp(0, 1, 1000, 1)).toBeCloseTo(1, 6)
  })
})

/** Run a gait at full speed along +z for `secs` at `fps`; count foot plants and other events. */
function runFor(fps: number, secs: number, vx = 0, vz = MOVE_SPEED) {
  const g = new Gait()
  const dt = 1 / fps
  let steps = 0
  let starts = 0
  for (let i = 0; i < Math.round(secs * fps); i++) {
    const f = g.update(vx, vz, 0, false, dt)
    if (f & GaitEvent.StepL) steps++
    if (f & GaitEvent.StepR) steps++
    if (f & GaitEvent.Start) starts++
  }
  return { g, steps, starts }
}

describe('Gait', () => {
  it('foot plants per second do not depend on the frame rate', () => {
    const at60 = runFor(60, 3).steps
    // ~2 plants per stride cycle once up to speed.
    expect(at60).toBeGreaterThan(GAIT.freq * 2 * 3 * 0.8)
    expect(Math.abs(runFor(30, 3).steps - at60)).toBeLessThanOrEqual(1)
    expect(Math.abs(runFor(144, 3).steps - at60)).toBeLessThanOrEqual(1)
  })

  it('no stride, no steps and no turn at rest; faces the net', () => {
    const g = new Gait()
    g.reset(Math.PI)
    for (let i = 0; i < 60; i++) expect(g.update(0, 0, Math.PI, false, 1 / 60)).toBe(0)
    expect(g.speed).toBe(0)
    expect(g.yaw).toBeCloseTo(Math.PI, 9)
  })

  it('signals one start when it sets off and one stop when it halts', () => {
    const { g, starts } = runFor(60, 0.5)
    expect(starts).toBe(1)
    let stops = 0
    for (let i = 0; i < 30; i++) if (g.update(0, 0, 0, false, 1 / 60) & GaitEvent.Stop) stops++
    expect(stops).toBe(1)
  })

  it('side shuffle: keeps facing the net on a sideways move; the move shows as side velocity', () => {
    const g = new Gait()
    for (let i = 0; i < 60; i++) g.update(MOVE_SPEED, 0, 0, false, 1 / 60)
    expect(Math.abs(g.yaw)).toBeLessThan(1e-6)
    expect(g.side).toBeGreaterThan(0.9)
    expect(Math.abs(g.fwd)).toBeLessThan(1e-6)
  })

  it('retreat: short steps back with the racket shoulder turned back (smoothly, never snapping)', () => {
    const g = new Gait()
    let last = g.yaw
    let maxStep = 0
    for (let i = 0; i < 60; i++) {
      g.update(0, -MOVE_SPEED, 0, false, 1 / 60)
      maxStep = Math.max(maxStep, Math.abs(wrapAngle(g.yaw - last)))
      last = g.yaw
    }
    expect(g.yaw).toBeCloseTo(-GAIT.turnBack, 3)
    expect(maxStep).toBeLessThan(0.25)
    expect(g.fwd).toBeLessThan(-0.5)
    // The far player (net behind +z) turns the same way in its own frame.
    const h = new Gait()
    h.reset(Math.PI)
    for (let i = 0; i < 60; i++) h.update(0, MOVE_SPEED, Math.PI, false, 1 / 60)
    expect(wrapAngle(h.yaw - Math.PI)).toBeCloseTo(-GAIT.turnBack, 3)
  })

  it('faces the net while swinging even when moving', () => {
    const g = new Gait()
    for (let i = 0; i < 60; i++) g.update(MOVE_SPEED, 0, 0, i >= 30, 1 / 60)
    expect(Math.abs(g.yaw)).toBeLessThan(0.1)
  })

  /** Velocity eased like sim stepPlayer (full speed in 6 ticks), rendered at 60 fps. Counts kicks. */
  function kicksFor(path: [number, number, number][]) {
    const g = new Gait()
    const maxDv = MOVE_SPEED / 6
    let vx = 0
    let vz = 0
    let kicks = 0
    for (const [wx, wz, frames] of path)
      for (let i = 0; i < frames; i++) {
        let dx = wx * MOVE_SPEED - vx
        let dz = wz * MOVE_SPEED - vz
        const d = Math.hypot(dx, dz)
        if (d > maxDv) {
          dx *= maxDv / d
          dz *= maxDv / d
        }
        vx += dx
        vz += dz
        if (g.update(vx, vz, 0, false, 1 / 60) & GaitEvent.Kick) kicks++
      }
    return kicks
  }

  it('flags a 90° cut (accel-limited sim velocity) once, not every frame', () => {
    expect(
      kicksFor([
        [1, 0, 60],
        [0, 1, 30],
      ]),
    ).toBe(1)
  })

  it('no kick on a straight run or a gentle diagonal drift', () => {
    expect(kicksFor([[1, 0, 120]])).toBe(0)
    expect(
      kicksFor([
        [1, 0, 60],
        [Math.SQRT1_2 * 0.97, 0.25, 60],
      ]),
    ).toBe(0)
  })
})
