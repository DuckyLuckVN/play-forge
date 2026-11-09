import { describe, expect, it } from 'vitest'
import { DT } from './physics'
import { GuestPredictor, type AuthPlayer } from './predict'
import { stepPlayer } from './sim'

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
   * sent and its state shows up lag/2 ticks later. Returns the max |prediction − own integration|.
   */
  function laggedRun(lag: number, hostBump = 0) {
    const pred = new GuestPredictor()
    const host = body(0, 3)
    const local = body(0, 3)
    pred.update(DT, auth(0, 3), 0, true)
    const moves: { at: number; x: number; z: number }[] = []
    const states: { at: number; s: AuthPlayer; tick: number }[] = []
    let maxDrift = 0
    for (let step = 1; step <= 240; step++) {
      // The guest steers: right, then forward-left, then still.
      const want =
        step === 1 ? { x: 1, z: 0 } : step === 80 ? { x: -0.6, z: 0.8 } : step === 160 ? { x: 0, z: 0 } : null
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
      if (step < 120) maxDrift = Math.max(maxDrift, Math.hypot(pred.x - local.x, pred.z - local.z))
    }
    return { pred, host, local, maxDrift }
  }

  it('with lag, the prediction stays ahead (no rubber band toward the old position)', () => {
    const { maxDrift } = laggedRun(6) // 100 ms round trip
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
