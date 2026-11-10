// Guest-side prediction of the local player: the own chibi moves the frame the stick / key moves,
// instead of a round trip later. Pure (no three.js); render3d feeds it each frame.
//
// It integrates the sent move (and the charging slowdown, the ability lock) with the sim's own stepPlayer at the tick
// rate, and reconciles with the host time-aligned: the host's state for tick T is compared with the prediction from `lag` local
// steps ago (where it stood when the host made that state), not with where it is now. `lag` (the
// round trip in ticks) is measured from the host echoing a sent move back in the player's `move`:
// only a change of the host's `move` counts as an echo, and a send equal to the move already queued
// (or, with nothing queued, the one the host has) is not queued, so value-equal echoes (a tap shorter
// than the round trip, a resync of a stop) can't fake a zero lag.
// The error found there is closed with `correct` (keep / blend / snap) and shifts the whole prediction.
import { actMoveMul, type AbilityKind, type Act } from './ability'
import { CHARGE, chargeOf } from './charge'
import { COURT, DT, type CourtDims } from './physics'
import { POWER_SWING, recoveryAfter } from './power'
import { stepPlayer, type SpPlayer } from './sim'
import { correct, CORRECT } from './world'

/** The fields of the authoritative player the predictor reads. */
export type AuthPlayer = Pick<SpPlayer, 'side' | 'x' | 'z' | 'vx' | 'vz' | 'move'>

/** Local steps of prediction kept (~1 s): the longest round trip it can line up. */
const HIST = 64
/** Most steps one frame may run (a long frame, e.g. back from a hidden tab, drops the rest). */
const MAX_STEPS = 8
/** Sent moves awaiting their echo. */
const PENDING = 8
/** A sent move counts as echoed when the host's `move` matches it this closely (it normalises). */
const ECHO_EPS = 1e-6
const EPS = 1e-9

export class GuestPredictor {
  /** Render position + velocity (world metres, m/s), extrapolated within the current step. */
  x = 0
  z = 0
  vx = 0
  vz = 0

  private p: AuthPlayer = { side: 0, x: 0, z: 0, vx: 0, vz: 0, move: { x: 0, z: 0 } }
  private acc = 0
  private steps = 0
  private hist = new Float64Array(HIST * 2)
  /** Round trip in local steps; −1 until the first echo (no time-aligned correction before). */
  private lag = -1
  private authTick = -1
  /** The latest host state lined up with a past local step (sampleStep < 0 = none). */
  private sampleStep = -1
  private sample = { x: 0, z: 0 }
  private pendAt = new Int32Array(PENDING)
  private pendX = new Float64Array(PENDING)
  private pendZ = new Float64Array(PENDING)
  private pendN = 0
  /** The host's `move` in the previous fresh state (an echo is a change of it). */
  private ackX = 0
  private ackZ = 0
  private past = { x: 0, z: 0 }
  private fixed = { x: 0, z: 0 }

  /** The host's court (state.court from `st`; render sets it each frame): the run-out bounds. */
  court: CourtDims = COURT

  /** The local swing button is charging (as just sent to the host): run at CHARGE.moveMul, like the sim. */
  charging = false

  /** Steps since the hold began (−1 = not holding), to tell a full charge at the release. */
  private holdFrom = -1
  /** Recovery slowdown steps still to integrate after a full-charge swing. */
  private recover = 0
  /** The local ability press (`at` in local steps): its air / floor lock slows the run like the sim's. */
  private localAct: Act | null = null

  /** The local ability press as just sent, null = none since the last placement. */
  get act(): Act | null {
    return this.localAct
  }

  /**
   * The ability button was pressed (sent) and the move `k` picked. `at` = the next step, the twin of the
   * host's arrival tick. The host steps its players before it resolves the press (act.at = that tick), so
   * that step runs free and the lock holds from the one after (e ≥ 1): busy − 1 locked steps, here too.
   * `dx, dz` = the picked contact's direction (the lunge slide; render only).
   */
  startAct(k: AbilityKind, dx = 0, dz = 0): void {
    this.localAct = { k, at: this.steps, dx, dz }
  }

  /** Local step time now (steps run + the share of the next one): the clock `act.at` counts in. */
  get stepNow(): number {
    return this.steps + this.acc / DT
  }

  /** Press (true) or cancel (false: no recovery). A repeat press keeps the first start. */
  setCharging(on: boolean): void {
    if (on && !this.charging) this.holdFrom = this.steps
    if (!on) this.holdFrom = -1
    this.charging = on
  }

  /** The swing button was released: ends charging; a swing that counted after a full hold starts the recovery slowdown. */
  release(swung: boolean): void {
    const hold = this.holdFrom >= 0 ? this.steps - this.holdFrom : 0
    // Only a new recovery overwrites: the host keeps an active recoverUntil on a non-counting release.
    const r = swung ? recoveryAfter(chargeOf(hold)) : 0
    if (r > 0) this.recover = r
    this.setCharging(false)
  }

  /** The local player's held direction as just sent to the host (view-relative, length ≤ 1). */
  setMove(x: number, z: number): void {
    this.p.move.x = x
    this.p.move.z = z
    // Same as the last queued move, or (none queued) as the host's: no change to echo.
    const last = this.pendN - 1
    const lx = last >= 0 ? this.pendX[last] : this.ackX
    const lz = last >= 0 ? this.pendZ[last] : this.ackZ
    if (Math.abs(x - lx) < ECHO_EPS && Math.abs(z - lz) < ECHO_EPS) return
    if (this.pendN === PENDING) this.dropPending(1)
    this.pendAt[this.pendN] = this.steps
    this.pendX[this.pendN] = x
    this.pendZ[this.pendN] = z
    this.pendN++
  }

  /**
   * Advance by `dt` seconds. `auth` = the newest authoritative state of this player (tick `tick`).
   * `snap`: the host placed or holds the player (serve set-up, frozen server, countdown, match over):
   * take its position and stop predicting until play moves on.
   */
  update(dt: number, auth: AuthPlayer, tick: number, snap: boolean): void {
    const p = this.p
    p.side = auth.side
    if (snap) {
      p.x = auth.x
      p.z = auth.z
      p.vx = auth.vx
      p.vz = auth.vz
      p.move.x = auth.move.x
      p.move.z = auth.move.z
      this.acc = 0
      this.recover = 0
      this.localAct = null
      this.sampleStep = -1
      this.pendN = 0
      this.ackX = auth.move.x
      this.ackZ = auth.move.z
      this.authTick = tick
      // The whole past is here too (a sample lined up with a step before the placement compares equal).
      for (let i = 0; i < HIST * 2; i += 2) {
        this.hist[i] = p.x
        this.hist[i + 1] = p.z
      }
      this.publish()
      return
    }

    // 1. Integrate at the tick rate.
    this.acc += dt
    let n = 0
    while (this.acc >= DT - EPS && n < MAX_STEPS) {
      const base = this.recover > 0 ? POWER_SWING.recoveryMoveMul : this.charging ? CHARGE.moveMul : 1
      // The press's own step (e = 0) runs free, like the host's arrival tick (see startAct).
      const act = this.localAct && this.steps > this.localAct.at ? this.localAct : null
      const mul = Math.min(base, actMoveMul(act, this.steps))
      if (this.recover > 0) this.recover--
      stepPlayer(p, DT, mul, this.court)
      this.steps++
      this.record()
      this.acc -= DT
      n++
    }
    if (n === MAX_STEPS) this.acc = Math.min(this.acc, DT)
    if (this.acc < 0) this.acc = 0

    // 2. A new host state: measure the round trip from a move echo, line the state up with the past.
    const fresh = tick !== this.authTick
    if (fresh) {
      this.authTick = tick
      this.echo(auth.move)
      this.sampleStep = this.lag >= 0 ? this.steps - this.lag : -1
      this.sample.x = auth.x
      this.sample.z = auth.z
    }

    // 3. Correct: the past prediction toward the host's state of that moment, shifting the present.
    const k = this.sampleStep
    if (k >= 0 && this.steps - k < HIST) {
      const i = (k % HIST) * 2
      this.past.x = this.hist[i]
      this.past.z = this.hist[i + 1]
      correct(this.past, this.sample, this.fixed, dt)
      this.shift(this.fixed.x - this.past.x, this.fixed.z - this.past.z)
    } else if (fresh && Math.hypot(auth.x - p.x, auth.z - p.z) >= CORRECT.snap) {
      // No line-up yet (no echo): only a gross disagreement with the present is fixed.
      this.shift(auth.x - p.x, auth.z - p.z)
    }
    this.publish()
  }

  private echo(move: { x: number; z: number }) {
    const changed = Math.abs(move.x - this.ackX) >= ECHO_EPS || Math.abs(move.z - this.ackZ) >= ECHO_EPS
    this.ackX = move.x
    this.ackZ = move.z
    for (let j = 0; changed && j < this.pendN; j++) {
      if (this.steps - this.pendAt[j] > HIST) continue
      if (Math.abs(move.x - this.pendX[j]) < ECHO_EPS && Math.abs(move.z - this.pendZ[j]) < ECHO_EPS) {
        // The host stepped once with this move to make this state: our step pendAt + 1 is its twin.
        this.lag = Math.min(HIST - 1, Math.max(0, this.steps - (this.pendAt[j] + 1)))
        this.dropPending(j + 1)
        return
      }
    }
    // Drop moves too old to ever line up (e.g. overwritten within one host tick).
    let old = 0
    while (old < this.pendN && this.steps - this.pendAt[old] > HIST) old++
    if (old) this.dropPending(old)
  }

  private dropPending(count: number) {
    for (let j = count; j < this.pendN; j++) {
      this.pendAt[j - count] = this.pendAt[j]
      this.pendX[j - count] = this.pendX[j]
      this.pendZ[j - count] = this.pendZ[j]
    }
    this.pendN -= count
  }

  /** Move the present and the whole remembered past by (dx, dz). */
  private shift(dx: number, dz: number) {
    if (dx === 0 && dz === 0) return
    this.p.x += dx
    this.p.z += dz
    for (let i = 0; i < HIST * 2; i += 2) {
      this.hist[i] += dx
      this.hist[i + 1] += dz
    }
  }

  private record() {
    const i = (this.steps % HIST) * 2
    this.hist[i] = this.p.x
    this.hist[i + 1] = this.p.z
  }

  private publish() {
    const p = this.p
    this.x = p.x + p.vx * this.acc
    this.z = p.z + p.vz * this.acc
    this.vx = p.vx
    this.vz = p.vz
  }
}
