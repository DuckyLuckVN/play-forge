import { describe, expect, it } from 'vitest'
import { COURT, DT } from './physics'
import { GuestPredictor, type AuthPlayer } from './predict'
import { CHARGE } from './charge'
import { courtDims } from './courtsize'
import { POWER_SWING } from './power'
import { MOVE_SPEED, stepPlayer } from './sim'
import { CORRECT } from './world'

const auth = (x: number, z: number, move = { x: 0, z: 0 }): AuthPlayer => ({
  side: 1,
  x,
  z,
  vx: 0,
  vz: 0,
  move: { ...move },
})

/** A player as the sim moves it. */
const body = (x: number, z: number) => ({ side: 1 as const, x, z, vx: 0, vz: 0, move: { x: 0, z: 0 } })

describe('guest prediction', () => {
  it('integrates the held move exactly like the sim (stepPlayer, own-half clamps)', () => {
    const pred = new GuestPredictor()
    const a = auth(0, 3)
    pred.update(DT, a, 1, true) // placed: snap to the authority
    pred.setMove(0.6, 0.8) // toward the net
    const ref = body(0, 3)
    ref.move = { x: 0.6, z: 0.8 }
    for (let i = 0; i < 90; i++) {
      pred.update(DT, a, 1, false) // no new state: nothing to correct against
      stepPlayer(ref, DT)
    }
    expect(pred.x).toBeCloseTo(ref.x, 9)
    expect(pred.z).toBeCloseTo(ref.z, 9)
    expect(pred.vx).toBeCloseTo(ref.vx, 9)
    expect(pred.vz).toBeCloseTo(ref.vz, 9)
    expect(ref.z).toBeGreaterThan(0) // the own-half clamp held it off the net
  })

  it('moves the same frame as the press (no round trip)', () => {
    const pred = new GuestPredictor()
    pred.update(DT, auth(0, 3), 1, true)
    pred.setMove(1, 0)
    pred.update(DT, auth(0, 3), 1, false)
    expect(pred.vx).not.toBe(0)
  })

  /**
   * A guest `lag` ticks behind (half each way): the host applies each move lag/2 ticks after it is
   * sent and its state shows up lag/2 ticks later. `script` = the moves sent, by step. Returns the max
   * |prediction − own integration| before step `driftUntil`.
   */
  function laggedRun(
    lag: number,
    hostBump = 0,
    script: Record<number, { x: number; z: number }> = {
      1: { x: 1, z: 0 },
      80: { x: -0.6, z: 0.8 },
      160: { x: 0, z: 0 },
    },
    driftUntil = 120,
  ) {
    const pred = new GuestPredictor()
    const host = body(0, 3)
    const local = body(0, 3)
    pred.update(DT, auth(0, 3), 0, true)
    const moves: { at: number; x: number; z: number }[] = []
    const states: { at: number; s: AuthPlayer; tick: number }[] = []
    let maxDrift = 0
    for (let step = 1; step <= 240; step++) {
      // The guest steers (default: right, then forward-left, then still).
      const want = script[step]
      if (want) {
        pred.setMove(want.x, want.z)
        local.move = want
        moves.push({ at: step + lag / 2, ...want })
      }
      // Host tick.
      const m = moves.find((q) => q.at === step)
      if (m) host.move = { x: m.x, z: m.z }
      stepPlayer(host, DT)
      if (step === 120) host.x += hostBump // the host disagrees (e.g. it clamped us somewhere)
      states.push({ at: step + lag / 2, s: { ...host, move: { ...host.move } }, tick: step })
      stepPlayer(local, DT)
      const st = states.filter((q) => q.at <= step).at(-1)
      pred.update(DT, st ? st.s : auth(0, 3), st ? st.tick : 0, false)
      if (step < driftUntil) maxDrift = Math.max(maxDrift, Math.hypot(pred.x - local.x, pred.z - local.z))
    }
    return { pred, host, local, maxDrift }
  }

  it('with lag, the prediction stays ahead (no rubber band toward the old position)', () => {
    const { maxDrift } = laggedRun(6) // 100 ms round trip
    expect(maxDrift).toBeLessThan(0.05)
  })

  it('a tap shorter than the round trip does not throw the next run back (value-equal echo)', () => {
    // Press and let go inside one round trip: the next states still show the old (0, 0) move.
    const script = { 1: { x: 1, z: 0 }, 3: { x: 0, z: 0 }, 60: { x: 0, z: -1 }, 140: { x: 0, z: 0 } }
    const { maxDrift } = laggedRun(6, 0, script, 241)
    expect(maxDrift).toBeLessThan(0.05)
  })

  it('a resync of an already-echoed move does not throw the next run back', () => {
    // resync() at play start / resume re-sends the move the host already has (usually a stop).
    const script = {
      1: { x: 1, z: 0 },
      40: { x: 0, z: 0 },
      80: { x: 0, z: 0 },
      100: { x: -1, z: 0 },
      180: { x: 0, z: 0 },
    }
    const { maxDrift } = laggedRun(6, 0, script, 241)
    expect(maxDrift).toBeLessThan(0.05)
  })

  it('converges onto the host when the host disagrees', () => {
    const { pred, host } = laggedRun(6, 0.5)
    expect(Math.hypot(pred.x - host.x, pred.z - host.z)).toBeLessThan(0.05)
  })

  it('snaps when the authority is a metre or more away', () => {
    const pred = new GuestPredictor()
    pred.update(DT, auth(0, 3), 1, true)
    pred.update(DT, auth(1.5, 3), 2, false)
    expect(pred.x).toBeCloseTo(1.5)
  })

  it('placement (serve set-up, countdown, frozen server) snaps to the authority and stops', () => {
    const pred = new GuestPredictor()
    pred.update(DT, auth(0, 3), 1, true)
    pred.setMove(1, 0)
    for (let i = 0; i < 10; i++) pred.update(DT, auth(0, 3), 1, false)
    pred.update(DT, { ...auth(0.6, 2.5), vx: 0, vz: 0 }, 2, true)
    expect([pred.x, pred.z, pred.vx, pred.vz]).toEqual([0.6, 2.5, 0, 0])
  })

  it('a long frame (tab back from hidden) catches up in bounded steps', () => {
    const pred = new GuestPredictor()
    pred.update(DT, auth(0, 3), 1, true)
    pred.setMove(1, 0)
    pred.update(5, auth(0, 3), 1, false)
    expect(Number.isFinite(pred.x)).toBe(true)
  })
})

describe('guest prediction while charging', () => {
  it('slows to CHARGE.moveMul exactly like the sim while the local swing is charging, full speed after', () => {
    const pred = new GuestPredictor()
    const a = auth(-2, 3)
    pred.update(DT, a, 1, true)
    pred.setMove(1, 0) // side 1: view-right is world +x (room to run)
    const ref = body(-2, 3)
    ref.move = { x: 1, z: 0 }
    const step = (n: number, mul: number) => {
      for (let i = 0; i < n; i++) {
        pred.update(DT, a, 1, false)
        stepPlayer(ref, DT, mul)
      }
    }
    step(10, 1)
    pred.setCharging(true)
    step(15, CHARGE.moveMul)
    expect(Math.hypot(pred.vx, pred.vz)).toBeCloseTo(MOVE_SPEED * CHARGE.moveMul, 6)
    pred.setCharging(false)
    step(10, 1)
    expect(pred.x).toBeCloseTo(ref.x, 9)
    expect(pred.vx).toBeCloseTo(ref.vx, 9)
    expect(Math.hypot(pred.vx, pred.vz)).toBeCloseTo(MOVE_SPEED, 6)
  })
})

describe('guest prediction recovery after a full-charge swing', () => {
  function run(holdSteps: number, swung: boolean) {
    const pred = new GuestPredictor()
    const a = auth(-2, 3)
    pred.update(DT, a, 1, true)
    pred.setMove(1, 0)
    const ref = body(-2, 3)
    ref.move = { x: 1, z: 0 }
    pred.setCharging(true)
    for (let i = 0; i < holdSteps; i++) {
      pred.update(DT, a, 1, false)
      stepPlayer(ref, DT, CHARGE.moveMul)
    }
    pred.release(swung)
    return { pred, ref, a }
  }
  const go = (r: ReturnType<typeof run>, n: number, mul: (i: number) => number) => {
    for (let i = 0; i < n; i++) {
      r.pred.update(DT, r.a, 1, false)
      stepPlayer(r.ref, DT, mul(i))
    }
  }
  it('release(true) after a full hold runs recoveryTicks at recoveryMoveMul, then full speed', () => {
    const r = run(30, true)
    go(r, 25, (i) => (i < POWER_SWING.recoveryTicks ? POWER_SWING.recoveryMoveMul : 1))
    expect(r.pred.x).toBeCloseTo(r.ref.x, 9)
    expect(r.pred.vx).toBeCloseTo(r.ref.vx, 9)
    expect(r.pred.vx).toBeCloseTo(MOVE_SPEED, 6)
  })
  it('a non-counting release inside the recovery keeps the slowdown (host keeps recoverUntil)', () => {
    const r = run(30, true)
    go(r, 3, () => POWER_SWING.recoveryMoveMul)
    r.pred.setCharging(true)
    r.pred.release(false)
    go(r, 25, (i) => (i + 3 < POWER_SWING.recoveryTicks ? POWER_SWING.recoveryMoveMul : 1))
    expect(r.pred.x).toBeCloseTo(r.ref.x, 9)
    expect(r.pred.vx).toBeCloseTo(r.ref.vx, 9)
  })
  it('release(false) or a short hold: no lock', () => {
    for (const r of [run(30, false), run(20, true)]) {
      go(r, 25, () => 1)
      expect(r.pred.x).toBeCloseTo(r.ref.x, 9)
    }
  })
  /**
   * Host and predictor run in step, running back from the net. The host's swing lands after `hostHold` of
   * its steps, the predictor's release after `predHold`; each locks (recoveryMoveMul for recoveryTicks)
   * only on a full hold (>= CHARGE.full). `uncorrected` is the predictor's own integration alone.
   */
  function disagree(predHold: number, hostHold: number) {
    const pred = new GuestPredictor()
    const host = body(0, 1)
    const uncorrected = body(0, 1)
    pred.update(DT, auth(0, 1), 0, true)
    pred.setMove(0, -1)
    host.move = uncorrected.move = { x: 0, z: -1 }
    pred.setCharging(true)
    const mulAt = (hold: number, step: number) => {
      if (step <= hold) return CHARGE.moveMul
      const locked = hold >= CHARGE.full && step <= hold + POWER_SWING.recoveryTicks
      return locked ? POWER_SWING.recoveryMoveMul : 1
    }
    let gap = 0
    for (let step = 1; step <= 90; step++) {
      stepPlayer(host, DT, mulAt(hostHold, step))
      stepPlayer(uncorrected, DT, mulAt(predHold, step))
      pred.update(DT, { ...host, move: { ...host.move } }, step, false)
      if (step === predHold) pred.release(true)
      gap = Math.max(gap, Math.hypot(pred.x - host.x, pred.z - host.z))
    }
    return { pred, host, uncorrected, gap }
  }
  it('converges onto the host when the predictor locked and the host saw a shorter hold (no lock)', () => {
    const { pred, host, uncorrected } = disagree(30, 29)
    expect(Math.hypot(uncorrected.x - host.x, uncorrected.z - host.z)).toBeGreaterThan(0.3) // a real mismatch
    expect(Math.hypot(pred.x - host.x, pred.z - host.z)).toBeLessThan(CORRECT.keep)
  })
  it('converges onto the host when the host locked and the predictor did not', () => {
    const { pred, host, uncorrected } = disagree(29, 30)
    expect(Math.hypot(uncorrected.x - host.x, uncorrected.z - host.z)).toBeGreaterThan(0.3)
    expect(Math.hypot(pred.x - host.x, pred.z - host.z)).toBeLessThan(CORRECT.keep)
  })
  it('a snap clears the recovery', () => {
    const r = run(30, true)
    const placed = auth(-2, 3, { x: 1, z: 0 })
    r.pred.update(DT, placed, 2, true)
    for (let i = 0; i < 12; i++) r.pred.update(DT, placed, 2, false)
    expect(Math.hypot(r.pred.vx, r.pred.vz)).toBeCloseTo(MOVE_SPEED, 6)
  })

  it('runs to the host court’s bounds', () => {
    const runRight = (pred: GuestPredictor) => {
      const a = auth(0, 3)
      pred.update(DT, a, 1, true)
      pred.setMove(1, 0) // side 1: view right = world +x
      for (let i = 0; i < 180; i++) pred.update(DT, a, 1, false)
      return pred.x
    }
    const big = new GuestPredictor()
    big.court = courtDims('xl')
    expect(runRight(big)).toBeGreaterThan(COURT.halfWidth + 0.8 + 0.1)
    expect(runRight(new GuestPredictor())).toBeLessThanOrEqual(COURT.halfWidth + 0.8)
  })
})
