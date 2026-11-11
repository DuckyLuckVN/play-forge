// Guest-side shuttle view: shows the host's flight on a smooth clock. Between host states the flight
// is re-simulated locally with the sim's own rule (deterministic), so a late packet never freezes or
// lurches the shuttle. A hit / serve event starts a new flight, so a sample is never run past one.
// The guest's own hit is predicted with the sim's contact rules (predictHit) and shown at once; the
// host's answer then replaces it through the same capped, never-snapping correction offset. An own
// ability press picks the host's move (ability.ts pickAbility) and a jump / lunge is predicted like a swing.
import {
  abilityShot,
  leadOf,
  pickAbility as abilityFor,
  reachOf,
  type AbilityKind,
  type Strike,
  type Want,
} from './ability'
import { COURT, settleOnFloor, stepShuttle, type CourtDims, type Flight, type Vec3 } from './physics'
import type { RemoteTracks } from './remotes'
import type { RenderClock } from './renderclock'
import { hitPower, perfectWindowOf } from './power'
import {
  chooseShot,
  launchShot,
  pickContact,
  shotTarget,
  WINDOW,
  type ContactCandidate,
  type Grade,
  type ShotKind,
} from './shots'
import { clampDir, isOwnEvent, launchTick, MAX_REWIND, tapContact, type SpEvent, type SpState } from './sim'
import { interpShuttle } from './world'

/** One host snapshot's shuttle; `court` = the host's court (omitted = Normal). */
export type ShuttleSample = Pick<SpState, 'tick' | 'phase' | 'shuttle' | 'events'> & { court?: CourtDims }

/** Samples kept: covers an own swing's past contacts (WINDOW.pastGrace + 1 behind the screen) plus the clock's lead. */
const RING = 24

export const RECONCILE = {
  /** Seconds for a late-hit correction to halve. */
  halfLife: 0.06,
  /** Metres: a correction this big (or a clock jump / placement) snaps instead of bending. */
  snap: 1.5,
} as const

export const PREDICT = {
  /** Host ticks after the predicted launch with no own `hit` event before the guest gives up (host said miss). */
  confirmTicks: MAX_REWIND + WINDOW.late + 4,
  /** Most metres a prediction correction moves the shuttle per 60 Hz frame (dt-scaled); it never snaps. */
  maxStep: 0.3,
} as const

/** The guest's own swing, as just sent to the host (the sim's resolveSwing / tapOnPress inputs). */
export interface OwnSwing {
  side: 0 | 1
  /** The swinger's player id: a host `bonk` of this id drops the prediction (omitted: any bonk on `side`). */
  id?: string
  /** Held direction, view-relative (the swing's x/z; a press: the current move). */
  held: { x: number; z: number }
  /** Hold-to-charge power 0..1 (chargeOf of the local hold, like the sim). */
  charge: number
  /** The guest's own predicted spot (world metres): reach is judged from it. */
  player: { x: number; z: number }
  /** A press: hits only if the contact comes within CHARGE.start ticks (sim tapOnPress). */
  tap: boolean
  /** A short charge-0 release the sim grades at its press (gradeRewind): the press's screen tick. */
  pressTick?: number
  /**
   * An ability press that picked a jump / lunge (pickAbility): its reach box, graded leadOf(act) ticks
   * after the press, its own shot (abilityShot: `held` / `charge` ignored for the shot kind), no tap rule.
   */
  act?: Strike
}

/** A predicted own hit, as the guest plays it at once (sound) before the host's answer. */
export type PredictedHit = {
  side: 0 | 1
  /** The predicted timing grade (the host's, graded with the same Perfect window). */
  grade: Grade
  shot: ShotKind
  /** Hit power 0..1 (power.ts hitPower of launchShot's gain), as the sim computes it. */
  power: number
  /** History tick the shot launches from (the sim's fromTick). */
  from: number
  /** The swinger's player id, as given in the OwnSwing (omitted: matched by side). */
  id?: string
}

/** Host event tick `tick` concerns the swing launched from `from`: its rewind window on (events linger EVENT_TICKS). */
const inSwingWindow = (tick: number, from: number) => tick >= from - MAX_REWIND

/**
 * The one rule for "this host event answers the prediction launched from `from`": an own `k` event
 * (by player `id` when known: a teammate's hit is not mine, else by side) from the swing's rewind window on.
 */
export function answersPrediction(
  e: SpEvent,
  k: 'hit' | 'whiff',
  side: 0 | 1,
  from: number,
  id?: string,
): boolean {
  return (
    (e.k === 'hit' || e.k === 'whiff') && e.k === k && isOwnEvent(e, side, id) && inSwingWindow(e.tick, from)
  )
}

/** A predicted own hit: a local flight sample that wins `at(k)` for k in [from − 1, until). */
interface Prediction extends PredictedHit {
  /** The flight at state tick from − 1 (pre-launch position, launch velocity). */
  flight: Flight
  /** Infinity while unconfirmed; once the host's hit arrives, its tick (a bridge to the host flight). */
  until: number
  /** Offset making the bridge meet the host flight at `until` (0 before confirmation). */
  shift: Vec3
}

/** Below this (m) a prediction-born offset counts as gone (normal reconcile rules again). */
const PRED_EPS = 1e-4

/** Clock jump (ticks) between frames that counts as a resync, not a normal frame. */
const CLOCK_JUMP = 4

interface Stored {
  tick: number
  phase: SpState['phase']
  pos: Vec3
  vel: Vec3
  lastHitter: -1 | 0 | 1
  /** The incoming shot pressures the receiver (sim's shuttle.pressured): a smaller Perfect window. */
  pressured: boolean
  pending: boolean
  /** Ticks of the events that start a new flight (a net hit is not one: stepShuttle reproduces it). */
  breaks: number[]
}

/** What an online guest's render loop owns beyond the interpolated state. */
export interface GuestView {
  clock: RenderClock
  shuttle: GuestShuttle
  /** Remote players on the same clock. */
  remotes: RemoteTracks
}

const isFlight = (p: SpState['phase']) => p === 'rally' || p === 'point'

export class GuestShuttle {
  readonly pos: Vec3 = { x: 0, y: 0, z: 0 }
  snapped = false
  /** Visual offset added to the flight; absorbs late-hit corrections and decays to 0. One place for all corrections. */
  private readonly err: Vec3 = { x: 0, y: 0, z: 0 }
  private shown = NaN
  private placed = false
  private ring: Stored[] = []
  private readonly a: Flight = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }
  private readonly b: Flight = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }
  private readonly old: Vec3 = { x: 0, y: 0, z: 0 }
  private readonly fresh: Vec3 = { x: 0, y: 0, z: 0 }
  private pred: Prediction | null = null
  /** The newest sample's court: shots are aimed on it, like the host's. */
  private court: CourtDims = COURT
  /** err holds a prediction correction: capped per frame, never snaps. */
  private predErr = false

  constructor(private readonly clock: RenderClock) {}

  push(s: ShuttleSample): void {
    const last = this.ring[this.ring.length - 1]
    if (last && s.tick <= last.tick) return
    const known = !Number.isNaN(this.shown)
    const before = known ? this.flightAt(this.shown, this.old).pos : null
    this.ring.push({
      tick: s.tick,
      phase: s.phase,
      pos: { ...s.shuttle.pos },
      vel: { ...s.shuttle.vel },
      lastHitter: s.shuttle.lastHitter,
      pressured: !!s.shuttle.pressured,
      pending: !!s.shuttle.pending,
      breaks: s.events.filter((e) => e.k === 'hit' || e.k === 'serve').map((e) => e.tick),
    })
    if (this.ring.length > RING) this.ring.shift()
    this.court = s.court ?? COURT
    this.resolve(s)
    if (!known) return
    // A serve placed after the tick on screen teleports the shuttle: snap, never bend.
    if (s.events.some((e) => e.k === 'serve' && e.tick > this.shown)) this.placed = true
    // The new path differs from what was drawn for the same tick (late hit): bend from old to new.
    const after = this.flightAt(this.shown, this.fresh).pos
    this.err.x += before!.x - after.x
    this.err.y += before!.y - after.y
    this.err.z += before!.z - after.z
  }

  update(dt: number): void {
    const newest = this.ring[this.ring.length - 1]
    if (!newest) return
    const k = this.clock.tick
    const jumped = Number.isNaN(this.shown) || Math.abs(k - this.shown) > CLOCK_JUMP
    this.shown = k
    // A confirmed prediction ends at the host's hit tick: past it the host flight is shown, so drop it.
    if (this.pred && k > this.pred.until) this.pred = null
    if (!isFlight(newest.phase)) {
      Object.assign(this.pos, newest.pos)
      this.clearErr(true)
      return
    }
    const { snap } = this.flightAt(k, this.pos)
    let f = 0.5 ** (dt / RECONCILE.halfLife)
    if (this.predErr) {
      // A prediction correction glides at most maxStep per 60 Hz frame (a big one takes longer, never snaps).
      const e0 = Math.hypot(this.err.x, this.err.y, this.err.z)
      const cap = PREDICT.maxStep * dt * 60
      if (e0 * (1 - f) > cap) f = (e0 - cap) / e0
    }
    this.err.x *= f
    this.err.y *= f
    this.err.z *= f
    const e = Math.hypot(this.err.x, this.err.y, this.err.z)
    if (this.predErr && e < PRED_EPS) this.predErr = false
    if (jumped || this.placed || (!this.predErr && e >= RECONCILE.snap)) {
      this.clearErr(true)
    } else {
      this.snapped = snap
    }
    this.pos.x += this.err.x
    this.pos.y += this.err.y
    this.pos.z += this.err.z
  }

  reset(): void {
    this.ring.length = 0
    this.pos.x = this.pos.y = this.pos.z = 0
    this.clearErr(false)
    this.shown = NaN
    this.pred = null
  }

  /**
   * The move an own ability press (sent this frame, stamped clock.seenTick()) makes, by the host's rule
   * (sim resolveAct): pickAbility on the flight shown at the press (history tick `seen`), from the guest's
   * predicted spot. A strike needs a rally the opponent hit last, no pending hit, no own prediction
   * awaiting the host and `canSwingNow` (the swing cooldown); else, or with no state yet, a hop.
   */
  pickAbility(
    player: { x: number; z: number },
    side: 0 | 1,
    canSwingNow: boolean,
    want?: Want,
    dir?: { x: number; z: number },
    auto = false,
  ): { k: AbilityKind; dx: number; dz: number; empty?: boolean; free?: boolean } {
    const newest = this.ring[this.ring.length - 1]
    if (!newest) return { k: 'hop', dx: 0, dz: 0 }
    const awaiting = !!this.pred && this.pred.until === Infinity
    const canHit =
      newest.phase === 'rally' && newest.lastHitter !== side && !newest.pending && !awaiting && canSwingNow
    const f: Flight = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }
    this.at(this.clock.seenTick() - 1, f)
    return abilityFor(f, player, side, newest.lastHitter, canHit, want, dir, auto)
  }

  /**
   * The guest's own swing (sent this frame, stamped clock.seenTick()): if the sim's rules (pickContact on
   * the flight shown, reach from the guest's predicted spot) make it a hit, show that hit now. Only in a
   * rally the opponent hit last, with no pending hit and no prediction awaiting the host. It launches
   * from max(contact, swing's screen tick), like the sim's lag-compensated hit, aimed un-jittered (the
   * host adds ≤ JITTER). Returns whether it predicted.
   */
  predictHit(sw: OwnSwing): boolean {
    const newest = this.ring[this.ring.length - 1]
    if (!newest || newest.phase !== 'rally' || newest.lastHitter === sw.side || newest.pending) return false
    if (this.pred && this.pred.until === Infinity) return false
    // History tick h's shuttle = the flight at state tick h − 1 (the sim records it before stepping).
    const seen = this.clock.seenTick()
    const pressTick = sw.pressTick ?? seen
    // A jump / lunge is graded its lead after the press (sim contactFor).
    const swingTick = pressTick + leadOf(sw.act)
    // The host's history starts at the last hit / serve.
    let start = -Infinity
    for (const r of this.ring) for (const b of r.breaks) if (b <= seen && b > start) start = b
    const past: ContactCandidate[] = []
    for (let h = Math.max(start, pressTick - WINDOW.pastGrace - 1); h < seen; h++) {
      const f: Flight = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }
      this.at(h - 1, f)
      past.push({ tick: h, pos: f.pos, at: sw.player })
    }
    this.at(seen - 1, this.a)
    const perfect = perfectWindowOf(newest.pressured)
    const reach = reachOf(sw.act)
    const c = pickContact(
      past,
      this.a,
      seen,
      sw.player,
      sw.side,
      newest.lastHitter,
      swingTick,
      seen,
      perfect,
      reach,
    )
    if (!c || (!sw.act && sw.tap && !tapContact(c.tick, swingTick))) return false
    const from = launchTick(c.tick, seen)
    const flight: Flight = { pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 } }
    this.at(from - 1, flight)
    const held = clampDir(sw.held.x, sw.held.z)
    // A jump / lunge plays its own shot (sim resolveSwing), else the held direction's.
    const shot = sw.act
      ? abilityShot(sw.act, held, c.grade)
      : { kind: chooseShot(held, c.y, c.grade), grade: c.grade, charge: sw.charge }
    const target = shotTarget(shot.kind, sw.side, held.x, this.court)
    const { vel, gain } = launchShot(
      shot.kind,
      shot.grade,
      flight.pos,
      target,
      () => 0,
      shot.charge,
      this.court,
    )
    flight.vel = vel
    const power = hitPower(shot.grade, gain)
    this.pred = {
      side: sw.side,
      grade: shot.grade,
      shot: shot.kind,
      power,
      from,
      flight,
      until: Infinity,
      shift: { x: 0, y: 0, z: 0 },
      id: sw.id,
    }
    return true
  }

  /** The current prediction (still returned once the host confirmed it, until dropped); null if none. */
  predicted(): Readonly<PredictedHit> | null {
    return this.pred
  }

  /**
   * Settle an unconfirmed prediction against host state `s`: the own hit arrived → bridge the prediction
   * onto the host flight up to the hit tick; an own whiff, a new serve set-up or confirmTicks with no
   * hit → drop it (events linger EVENT_TICKS, so only own events from the swing on count). Either way push's before/after offset (now capped, see update) absorbs the change.
   */
  private resolve(s: ShuttleSample): void {
    const p = this.pred
    if (!p || p.until !== Infinity) return
    const mine = (k: 'hit' | 'whiff') => s.events.find((e) => answersPrediction(e, k, p.side, p.from, p.id))
    const hit = mine('hit')
    if (hit) {
      // The host flight is known from its hit tick on; before it, the prediction shifted to meet it there.
      this.pred = null
      this.at(hit.tick, this.b)
      this.pred = p
      this.at(hit.tick, this.a)
      p.shift.x = this.b.pos.x - this.a.pos.x
      p.shift.y = this.b.pos.y - this.a.pos.y
      p.shift.z = this.b.pos.z - this.a.pos.z
      p.until = hit.tick
    } else if (
      mine('whiff') ||
      this.bonked(s, p) ||
      !isFlight(s.phase) ||
      s.tick >= p.from + PREDICT.confirmTicks
    ) {
      this.pred = null
    } else return
    this.predErr = true
  }

  /**
   * The own swinger was bonked within the swing's rewind window (answersPrediction's) and the host has no
   * hit pending for it: the host drops a bonked player's swing, so the prediction goes too (its own pending
   * contact still resolves: the host `hit` confirms it; a teammate's pending one does not count).
   */
  private bonked(s: ShuttleSample, p: Prediction): boolean {
    const pend = s.shuttle.pending
    if (pend && (p.id ? pend.id === p.id : pend.side === p.side)) return false
    return s.events.some(
      (e) => e.k === 'bonk' && inSwingWindow(e.tick, p.from) && (p.id ? e.who === p.id : e.side === p.side),
    )
  }

  private clearErr(snapped: boolean): void {
    this.err.x = this.err.y = this.err.z = 0
    this.predErr = false
    this.placed = false
    this.snapped = snapped
  }

  /** The host flight at fractional tick k (interpolated between whole ticks), written to `out`. */
  private flightAt(k: number, out: Vec3): { pos: Vec3; snap: boolean } {
    const i = Math.floor(k)
    this.at(i, this.a)
    this.at(i + 1, this.b)
    return interpShuttle(this.a.pos, this.b.pos, k - i, out)
  }

  /** Where the host's flight is at tick k, written to `out`. */
  private at(k: number, out: Flight): void {
    const p = this.pred
    if (p && k >= p.from - 1 && k < p.until) {
      Object.assign(out.pos, p.flight.pos)
      Object.assign(out.vel, p.flight.vel)
      this.fly(out, p.from - 1, k, true)
      out.pos.x += p.shift.x
      out.pos.y += p.shift.y
      out.pos.z += p.shift.z
      return
    }
    let base: Stored | undefined
    for (let n = this.ring.length - 1; n >= 0; n--) {
      const s = this.ring[n]
      if (s.tick <= k && !this.brokenBetween(s.tick, k)) {
        base = s
        break
      }
    }
    if (!base) {
      // A break newer than every sample up to k leaves nothing to extrapolate from: show the nearest post-break sample as is.
      // Also covers k before the ring: oldest sample at/after k.
      const s = this.ring.find((r) => r.tick >= k) ?? this.ring[this.ring.length - 1]
      Object.assign(out.pos, s.pos)
      Object.assign(out.vel, s.vel)
      return
    }
    Object.assign(out.pos, base.pos)
    Object.assign(out.vel, base.vel)
    this.fly(out, base.tick, k, base.phase === 'rally')
  }

  /** Step flight `out` (at tick `from`) on to tick k with the sim's rule: stops on the net / the floor. */
  private fly(out: Flight, from: number, k: number, settle: boolean): void {
    for (let t = from; t < k && out.pos.y > 0; t++) {
      const { x, y, z } = out.pos
      if (stepShuttle(out).netHit) settle = false
      else if (out.pos.y <= 0) {
        if (settle) settleOnFloor(out.pos, x, y, z)
        else out.pos.y = 0
        out.vel.x = out.vel.y = out.vel.z = 0
      }
    }
  }

  private brokenBetween(from: number, to: number): boolean {
    for (const s of this.ring) for (const b of s.breaks) if (b > from && b <= to) return true
    return false
  }
}
