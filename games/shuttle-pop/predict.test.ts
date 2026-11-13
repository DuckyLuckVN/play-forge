import { describe, expect, it } from 'vitest'
import type { InputEvent } from '@forge/net/session'
import { PlayoutBuffer } from '@forge/net/playout'
import { ABILITY, actMoveMul } from './ability'
import { COURT, DT } from './physics'
import { GuestPredictor, type AuthPlayer } from './predict'
import { CHARGE } from './charge'
import { courtDims } from './courtsize'
import { POWER_SWING } from './power'
import { STUN } from './stun'
import { MOVE_SPEED, shuttlePopGame as game, speedMulOf, stepPlayer, type SpInput } from './sim'
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

describe('guest prediction of the ability lock', () => {
  /** A rally where the host's p1 (side 1) presses the ability on `press`: the shuttle picks `k`. */
  const SCENES = {
    // A lob dropping over p1 at y ≈ 3.4 (jump), a drive 1.8 m wide at y ≈ 0.7 (lunge), the shuttle away (hop).
    jump: { pos: { x: 0, y: 4.2, z: 2.6 }, vel: { x: 0, y: -1, z: 5 }, at: { x: 0, z: 4 }, press: 8 },
    lunge: { pos: { x: 1.8, y: 0.9, z: 1 }, vel: { x: 0, y: 0.6, z: 8 }, at: { x: 0, z: 2.83 }, press: 9 },
    hop: { pos: { x: 0, y: 3, z: -3 }, vel: { x: 0, y: 4, z: 0 }, at: { x: 0, z: 3 }, press: 8 },
  }
  it('mirrors the host lock: same locked steps, no drift (host driven through step())', () => {
    for (const k of ['jump', 'lunge', 'hop'] as const) {
      const sc = SCENES[k]
      const s = game.setup(
        [0, 1].map((i) => ({ id: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true })),
        1,
        {},
      )
      const host = s.players[1]
      host.x = sc.at.x
      host.z = sc.at.z
      s.phase = 'rally'
      s.shuttle.pos = { ...sc.pos }
      s.shuttle.vel = { ...sc.vel }
      s.shuttle.lastHitter = 0
      s.shuttle.pending = null
      const pred = new GuestPredictor()
      const a = auth(host.x, host.z)
      pred.update(DT, a, 1, true)
      let hostLocked = 0
      let predLocked = 0
      for (let i = 1; i <= 90; i++) {
        const inputs: InputEvent<SpInput>[] = []
        if (i === sc.press) {
          // Run right from the press on (side 1: view-right is world +x).
          inputs.push({ player: 'p1', input: { t: 'move', x: 1, z: 0 } })
          inputs.push({ player: 'p1', input: { t: 'ability', x: 0, z: 1 } })
          pred.setMove(1, 0)
        }
        if (speedMulOf(host, s.tick + 1) < 1) hostLocked++ // the mul this tick's player step uses
        game.tick(s, inputs)
        if (i === sc.press) {
          expect(s.events.find((e) => e.k === 'act' && e.tick === s.tick)).toMatchObject({ act: k })
          // The same tick and direction the host takes it (a lunge slides along it on both).
          pred.startAct(k, host.act!.dx, host.act!.dz)
        }
        // Local step i (steps = i − 1 before it) is locked past the press step, at actMoveMul(act, i − 1).
        if (pred.act && i - 1 > pred.act.at && actMoveMul(pred.act, i - 1) < 1) predLocked++
        pred.update(DT, a, 1, false) // no new state: pure integration
        expect(pred.x, `${k} tick ${i}`).toBeCloseTo(host.x, 9)
        expect(pred.z, `${k} tick ${i}`).toBeCloseTo(host.z, 9)
      }
      const busy =
        k === 'jump'
          ? ABILITY.jump.air + ABILITY.jump.lock
          : k === 'lunge'
            ? ABILITY.lunge.dive + ABILITY.lunge.floor
            : 0
      expect(hostLocked, k).toBe(Math.max(0, busy - 1))
      expect(predLocked, k).toBe(hostLocked)
      expect(pred.act).toMatchObject({ k })
    }
  })
  it('the act keeps its direction; stepNow = local steps run + the frame share (the act arc clock)', () => {
    const pred = new GuestPredictor()
    const a = auth(-2, 3)
    pred.update(DT, a, 1, true)
    pred.startAct('lunge', 0.6, -0.8)
    expect(pred.act).toMatchObject({ k: 'lunge', dx: 0.6, dz: -0.8 })
    const at = pred.act!.at
    expect(pred.stepNow).toBeCloseTo(at)
    pred.update(DT * 3.5, a, 1, false)
    expect(pred.stepNow).toBeCloseTo(at + 3.5)
    pred.startAct('hop')
    expect(pred.act).toMatchObject({ k: 'hop', dx: 0, dz: 0 })
  })
  describe('the host answers the press with another move', () => {
    /** Echo lined up (lag 5): host tick T = local step T. Press `k` at local step 6; returns the predictor. */
    function pressed(k: 'jump' | 'lunge' | 'hop') {
      const pred = new GuestPredictor()
      const a = auth(-2, 3, { x: 1, z: 0 })
      pred.update(DT, { ...a, move: { x: 0, z: 0 } }, 0, true)
      pred.setMove(1, 0)
      pred.update(DT * 6, a, 1, false) // the host's echo of the move
      pred.startAct(k, 0.6, -0.8)
      expect(pred.act).toMatchObject({ k, at: 6 })
      pred.update(DT * 5, a, 1, false) // no fresh state yet
      return { pred, a }
    }
    it('replaces a predicted jump by the host hop (no lock), keeping the local clock', () => {
      const { pred, a } = pressed('jump')
      pred.update(DT, { ...a, act: { k: 'hop', at: 6, dx: 0, dz: 0 } }, 6, false)
      expect(pred.act).toEqual({ k: 'hop', at: 6, dx: 0, dz: 0 })
    })
    it('replaces a predicted hop by the host lunge and takes its direction', () => {
      const { pred, a } = pressed('hop')
      pred.update(DT, { ...a, act: { k: 'lunge', at: 6, dx: 0.6, dz: -0.8 } }, 6, false)
      expect(pred.act).toEqual({ k: 'lunge', at: 6, dx: 0.6, dz: -0.8 })
    })
    it('keeps the local act when the kinds agree, or the host press is another (older) one', () => {
      const { pred, a } = pressed('jump')
      pred.update(DT, { ...a, act: { k: 'jump', at: 6, dx: 0, dz: 1 } }, 6, false)
      expect(pred.act).toMatchObject({ k: 'jump', dx: 0.6, dz: -0.8 })
      pred.update(DT, { ...a, act: { k: 'hop', at: 6 - 20, dx: 0, dz: 0 } }, 7, false)
      expect(pred.act).toMatchObject({ k: 'jump' })
    })
  })
  it('snap clears the act', () => {
    const pred = new GuestPredictor()
    const a = auth(-2, 3, { x: 1, z: 0 })
    pred.update(DT, a, 1, true)
    pred.setMove(1, 0)
    pred.startAct('lunge')
    expect(pred.act).toMatchObject({ k: 'lunge' })
    pred.update(DT, a, 2, true)
    expect(pred.act).toBeNull()
    for (let i = 0; i < 12; i++) pred.update(DT, a, 2, false)
    expect(Math.hypot(pred.vx, pred.vz)).toBeCloseTo(MOVE_SPEED, 6)
  })
})

describe('guest prediction of the stun lock', () => {
  const LAG = 4

  /** A host sim (two humans, serve phase: the receiver runs free) + a predictor fed its states `LAG / 2` ticks late. */
  function setup() {
    const s = game.setup(
      [0, 1].map((i) => ({ id: `p${i}`, name: `P${i}`, slot: i, ready: true, connected: true })),
      1,
      {},
    )
    s.phase = 'serve'
    const me = s.players.find((p) => p.side !== s.server)!
    const pred = new GuestPredictor()
    pred.update(DT, { ...me, move: { ...me.move } }, s.tick, true)
    const queue: { at: number; a: AuthPlayer; tick: number }[] = []
    const moves: { at: number; x: number; z: number }[] = []
    let last: { a: AuthPlayer; tick: number } = { a: { ...me, move: { ...me.move } }, tick: s.tick }
    let k = 0
    /** One step of both sides; `want` = a new held move; `bonk` = bonk the guest's player on the host this tick. */
    const run = (want?: { x: number; z: number }, bonk = false) => {
      k++
      if (want) {
        pred.setMove(want.x, want.z)
        moves.push({ at: k + LAG / 2, ...want })
      }
      const inputs: InputEvent<SpInput>[] = moves
        .filter((m) => m.at === k)
        .map((m) => ({ player: me.id, input: { t: 'move', x: m.x, z: m.z } }))
      game.tick(s, inputs)
      if (bonk) me.stunAt = s.tick
      queue.push({ at: k + LAG / 2, a: { ...me, move: { ...me.move } }, tick: s.tick })
      for (const q of queue.filter((q) => q.at === k)) last = q
      pred.update(DT, last.a, last.tick, false)
    }
    return { s, me, pred, run }
  }

  it('mirrors the host stun: no drift while stunned, free after', () => {
    const { me, pred, run } = setup()
    run({ x: 1, z: 0 })
    for (let i = 0; i < 40; i++) run()
    for (let i = 0; i < 6; i++) run(undefined, i === 0) // bonked; the report arrives LAG / 2 ticks later
    for (let i = 0; i < STUN.ticks + 10; i++) {
      run()
      if (i >= LAG + 6) {
        expect(pred.x, `x ${i}`).toBeCloseTo(me.x, 6)
        expect(pred.z, `z ${i}`).toBeCloseTo(me.z, 6)
      }
    }
    expect(pred.stunned).toBe(false)
    expect(me.stunAt).toBeGreaterThanOrEqual(0)
    const x = me.x
    run({ x: -1, z: 0 }) // turn back
    for (let i = 0; i < 20; i++) run()
    expect(me.x).not.toBeCloseTo(x, 3) // free again: both run
    run({ x: 0, z: 0 })
    for (let i = 0; i < 30; i++) run()
    expect(pred.x).toBeCloseTo(me.x, 6) // the same stop, once it reached the host
  })

  it('a new stun drops the local charge (no slowdown, no recovery)', () => {
    const pred = new GuestPredictor()
    pred.update(DT, auth(0, 3), 1, true)
    pred.setCharging(true)
    for (let i = 0; i < 80; i++) pred.update(DT, auth(0, 3), 1, false) // a full hold
    pred.update(DT, { ...auth(0, 3), stunAt: 1 }, 2, false)
    expect(pred.charging).toBe(false)
    pred.release(true)
    pred.setMove(1, 0)
    // Past the lock: full speed, no recovery slowdown.
    for (let i = 0; i < STUN.ticks + 30; i++) pred.update(DT, { ...auth(0, 3), stunAt: 1 }, 2, false)
    expect(pred.stunned).toBe(false)
    expect(Math.abs(pred.vx)).toBeCloseTo(MOVE_SPEED, 3)
  })

  it('a host stunAt −1 (serve reset) clears the stun; a later bonk locks again', () => {
    const pred = new GuestPredictor()
    pred.update(DT, auth(0, 3), 1, true)
    pred.update(DT, { ...auth(0, 3), stunAt: 1 }, 2, false)
    pred.update(DT, { ...auth(0, 3), stunAt: 1 }, 3, false)
    expect(pred.stunned).toBe(true)
    pred.update(DT, { ...auth(0, 3), stunAt: -1 }, 4, false)
    expect(pred.stunned).toBe(false)
    pred.update(DT, { ...auth(0, 3), stunAt: 5 }, 5, false)
    pred.update(DT, { ...auth(0, 3), stunAt: 5 }, 6, false)
    expect(pred.stunned).toBe(true)
  })

  it('snap clears the stun', () => {
    const pred = new GuestPredictor()
    pred.update(DT, auth(0, 3), 1, true)
    pred.update(DT, { ...auth(0, 3), stunAt: 1 }, 2, false)
    pred.update(DT, auth(0, 3), 3, false)
    pred.update(DT, auth(0, 3), 3, false)
    expect(pred.stunned).toBe(true)
    pred.update(DT, auth(0, 3), 4, true)
    expect(pred.stunned).toBe(false)
  })
})

describe('guest prediction under jitter (stamped inputs + host playout buffer)', () => {
  /**
   * A guest runs a zig-zag while its moves reach the host 3–6 ticks late (jitter) and the host's
   * states come back 3–6 ticks late, plus one 8-tick stall (a lost packet on an ordered channel).
   * `stamped`: inputs carry the predictor's step and the host applies them through PlayoutBuffer
   * (the session's path); otherwise on arrival (the old path). Returns the metres the prediction
   * was pulled by corrections after a 1 s warm-up (the rubber band; 0 = it ran its own path).
   */
  function jitterRun(stamped: boolean, stallAt = 200) {
    let seed = 7
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const transit = () => 3 + Math.floor(rnd() * 4)
    const delayed = (h: number) => (h >= stallAt && h < stallAt + 8 ? stallAt + 8 : h)
    const pred = new GuestPredictor()
    const host: AuthPlayer & { inOff?: number } = { ...body(-1, 3) }
    const local = body(-1, 3)
    pred.update(DT, auth(-1, 3), 0, true)
    const buf = new PlayoutBuffer<{ x: number; z: number; at: number }>()
    const toHost: { arrive: number; m: { x: number; z: number; at: number } }[] = []
    const toGuest: { arrive: number; s: AuthPlayer; tick: number }[] = []
    const dirs = [
      { x: 1, z: 0 },
      { x: 0, z: -1 },
      { x: -1, z: 0 },
      { x: 0, z: 1 },
      { x: 0, z: 0 },
    ]
    let lastUp = 0
    let lastDown = 0
    let shown: { s: AuthPlayer; tick: number } | null = null
    let pulled = 0
    let gapX = 0
    let gapZ = 0
    for (let h = 1; h < 420; h++) {
      // Guest input (between frames), then its frame.
      if (h % 11 === 0) {
        const m = dirs[(h / 11) % dirs.length]
        pred.setMove(m.x, m.z)
        local.move = { ...m }
        lastUp = Math.max(lastUp, delayed(h + transit()))
        toHost.push({ arrive: lastUp, m: { ...m, at: pred.stamp } })
      }
      // Host tick h: arrivals, the buffer's due inputs, then the step.
      const due: { x: number; z: number; at: number }[] = []
      const late: number[] = []
      while (toHost.length && toHost[0].arrive <= h) {
        const { m } = toHost.shift()!
        if (stamped) buf.push(m.at, m, h)
        else due.push(m)
      }
      if (stamped) buf.take(h, due, late)
      due.forEach((m, i) => {
        host.move = { x: m.x, z: m.z }
        if (stamped) host.inOff = h - m.at - late[i]
      })
      stepPlayer(host as never, DT)
      lastDown = Math.max(lastDown, delayed(h + transit()))
      toGuest.push({ arrive: lastDown, s: { ...host, move: { ...host.move } }, tick: h })
      while (toGuest.length && toGuest[0].arrive <= h) shown = toGuest.shift()!
      stepPlayer(local, DT)
      pred.update(DT, shown ? shown.s : auth(-1, 3), shown ? shown.tick : 0, false)
      // Both integrate the same moves: the gap between them only changes by a correction.
      const gx = pred.x - local.x
      const gz = pred.z - local.z
      if (h > 60) pulled += Math.hypot(gx - gapX, gz - gapZ)
      gapX = gx
      gapZ = gz
    }
    return pulled
  }

  it('repro: applied on arrival, jitter alone keeps pulling the guest (rubber band)', () => {
    expect(jitterRun(false, Infinity)).toBeGreaterThan(0.5)
  })

  it('stamped through the playout buffer, jitter no longer pulls the prediction at all', () => {
    expect(jitterRun(true, Infinity)).toBeLessThan(0.01)
  })

  it('a stall longer than the buffer still corrects, but less than on arrival', () => {
    expect(jitterRun(true)).toBeLessThan(jitterRun(false))
  })
})
