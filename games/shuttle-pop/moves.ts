// Timed move curves for the chibis (pure, no three.js): the racket swing, the smash leap, the
// celebration hop / spin and the idle glance. Each maps a time or progress to pose values, continuous
// at every phase boundary so poses never pop. actors.ts applies them to the rig; the arm / torso joint
// curves are arm.ts.
import { CONTACT_T, FOLLOW_T, STRIKE_END } from './arm'

/** Smoothstep progress of `s` through [a, b]. */
export function seg(s: number, a: number, b: number): number {
  const k = Math.min(1, Math.max(0, (s - a) / (b - a)))
  return k * k * (3 - 2 * k)
}
const easeOut = (u: number) => 1 - (1 - u) * (1 - u)

/**
 * Swing timeline. Press → wind-up into the loaded pose over `load` s → hold while the real contact is
 * still further off than the strike needs (at most `maxHold` s, coiling a little more meanwhile) →
 * release into the strike (arm.ts: racket at contact `CONTACT_T` after release, settled by
 * `STRIKE_END`). When the real contact is sooner than the animation's own schedule (a well-timed press
 * is often hit at once), the animation runs up to `maxRate`× faster until its contact, so the whip
 * meets the shuttle instead of trailing the hit; after contact it runs at normal speed. `coil` = how
 * long a hold has coiled (s of anim time, for the extra twist / wrist cock).
 */
export const SWING = { load: 0.075, maxHold: 0.3, maxRate: 3 } as const

/** A contact closer than this (s) counts as now: full catch-up speed (no dividing by ~0). */
const DUE_FLOOR = 0.001

/**
 * Drives one player's swing: `load` (0..1), `strike` (anim s since release, −1 = not striking), `prev`
 * (a strike still settling under a new wind-up) and `coil` (anim s spent holding loaded). Pure state
 * over `dt`: release and speed-up are scheduled against absolute times, so any frame rate gives the
 * same timeline.
 */
export class SwingDriver {
  /** Real seconds since the press (Infinity = idle). */
  age = Infinity
  load = 0
  strike = -1
  prev = -1
  coil = 0
  /** Longest automatic hold in the loaded pose (s). */
  maxHold: number = SWING.maxHold
  /** Animation clock since the press (runs faster than `age` while catching up a contact). */
  private clock = 0
  /** Anim time at which the strike starts. */
  private releaseAt: number = SWING.load
  /** Real age at which the shuttle is (or was) actually hit; NaN = unknown. */
  private target = NaN
  /** Held by hold() until release() (Task 14's charge), regardless of maxHold. */
  private held = false
  /** Load cap while held. */
  private cap = 1

  /** Start a swing. Ignored while winding up / holding or before the racket reaches contact. */
  press() {
    if (this.age !== Infinity && this.strike < CONTACT_T) return
    if (this.strike >= 0) this.prev = this.strike
    this.age = 0
    this.clock = 0
    this.load = 0
    this.strike = -1
    this.coil = 0
    this.releaseAt = SWING.load
    this.target = NaN
    this.held = false
    this.cap = 1
  }

  /** Back to idle at once (a new match). */
  reset() {
    this.age = Infinity
    this.load = this.coil = 0
    this.strike = this.prev = -1
    this.held = false
  }

  /** Press and keep the loaded pose (up to `loadTarget`) until release(). */
  hold(loadTarget = 1) {
    if (this.age === Infinity || this.strike >= CONTACT_T) this.press()
    if (this.strike >= 0) return
    this.held = true
    this.cap = loadTarget
  }

  /** Let a hold go: the strike starts now, from the current (possibly capped) load. */
  release() {
    if (!this.held) return
    this.held = false
    this.releaseAt = Math.max(this.clock, 0)
  }

  /** True from the press until the follow-through ends (the body faces the net meanwhile). */
  get busy(): boolean {
    return this.age !== Infinity && this.strike < FOLLOW_T
  }

  /** The real contact is `due` s from now (0 = it just happened). */
  setDue(due: number) {
    if (this.age !== Infinity && this.strike < CONTACT_T) this.target = this.age + Math.max(0, due)
  }

  /** Advance `dt` real s. `due` = seconds until the real contact when known (see setDue). */
  update(dt: number, due?: number) {
    if (due !== undefined) this.setDue(due)
    if (this.prev >= 0) {
      this.prev += dt
      if (this.prev >= STRIKE_END) this.prev = -1
    }
    if (this.age === Infinity) return
    const known = this.target === this.target
    const striking = this.clock >= this.releaseAt && !this.held
    if (!striking && !this.held) {
      // Hold until the strike, at normal speed, would meet the real contact.
      const latest = SWING.load + this.maxHold
      const want = known ? this.clock + (this.target - this.age) - CONTACT_T : SWING.load
      this.releaseAt = Math.min(latest, Math.max(SWING.load, want))
    }
    let rate = 1
    const left = this.releaseAt + CONTACT_T - this.clock
    if (known && !this.held && left > 0) {
      const due = this.target - this.age
      if (due < left) rate = due <= DUE_FLOOR ? SWING.maxRate : Math.min(SWING.maxRate, left / due)
    }
    this.age += dt
    this.clock += dt * rate
    if (this.strike < 0) {
      this.load = Math.min(this.cap, seg(this.clock, 0, SWING.load))
      this.coil = Math.max(0, Math.min(this.clock, this.held ? Infinity : this.releaseAt) - SWING.load)
    }
    if (!this.held && this.clock >= this.releaseAt) this.strike = this.clock - this.releaseAt
    if (this.strike >= STRIKE_END) {
      this.age = Infinity
      this.load = this.coil = 0
      this.strike = -1
    }
  }
}

/**
 * Seconds from render time `now` (fractional tick) until a pending contact of `side`, or undefined
 * when there is none (a whiff, someone else's shot): the SwingDriver's `due`.
 */
export function pendingDue(
  pending: { atTick: number; side: 0 | 1 } | null,
  side: 0 | 1,
  now: number,
  tickRate: number,
): number | undefined {
  return pending !== null && pending.side === side ? (pending.atTick - now) / tickRate : undefined
}

/**
 * Leap age to set when a pending smash is first seen `lead` s before contact: the rise then tops out
 * exactly at the hit. Negative = still waiting (the rig crouches meanwhile; smashJump is grounded).
 */
export function leapStartAge(lead: number): number {
  return SMASH.rise - lead
}

/** Leap age at the smash hit event: keep a leap already under way, otherwise start one now. */
export function leapAtHit(age: number): number {
  return age >= 0 && age < SMASH.land ? age : 0
}

/** Height share (0..1) + squash (+ squash, − stretch) of a jump. */
export interface Hop {
  height: number
  squash: number
}

/**
 * Smash leap, seconds from the hit (the rig crouches beforehand while the smash is pending): a snappy
 * stretched rise to `rise`, a floaty hang to `hang`, a fall to `land`, a landing squash until `end`.
 */
export const SMASH = { rise: 0.1, hang: 0.24, land: 0.44, end: 0.62, stretch: 0.18, squash: 0.3 } as const

export function smashJump(age: number, o: Hop): Hop {
  const S = SMASH
  o.height = 0
  o.squash = 0
  if (!(age >= 0) || age >= S.end) return o
  if (age < S.rise) {
    const u = age / S.rise
    o.height = easeOut(u)
    o.squash = -S.stretch * (1 - u)
  } else if (age < S.hang) {
    const u = (age - S.rise) / (S.hang - S.rise)
    o.height = 1 - 0.05 * u * u
  } else if (age < S.land) {
    const u = (age - S.hang) / (S.land - S.hang)
    o.height = 0.95 * (1 - u * u)
    o.squash = -0.08 * Math.sin(Math.PI * u)
  } else {
    const u = (age - S.land) / (S.end - S.land)
    o.squash = S.squash * Math.sin(Math.PI * u) * (1 - u)
  }
  return o
}

/** Celebration hops per second; share of each hop spent on the ground (landing squash). */
export const HOP = { hz: 2.2, ground: 0.2, squash: 0.16 } as const

/** Repeating happy hop at time `t` (s). */
export function hop(t: number, o: Hop): Hop {
  const k = t * HOP.hz
  const u = k - Math.floor(k)
  if (u < HOP.ground) {
    o.height = 0
    o.squash = HOP.squash * Math.sin((Math.PI * u) / HOP.ground)
  } else {
    const v = (u - HOP.ground) / (1 - HOP.ground)
    o.height = 4 * v * (1 - v)
    o.squash = 0
  }
  return o
}

/** Extra yaw for the match-winner's celebration: every other hop is a full twirl in the air. */
export function celebrateSpin(t: number): number {
  const k = t * HOP.hz
  const n = Math.floor(k)
  if (n % 2 === 0) return 0
  return Math.PI * 2 * seg((k - n - HOP.ground) / (1 - HOP.ground), 0, 1)
}

/** Idle glance (head yaw, rad): still most of the time, now and then a slow look aside and back. */
export function lookAround(t: number, seed: number): number {
  const g = Math.sin(t * 0.9 + seed) + Math.sin(t * 0.37 + seed * 1.7)
  const over = Math.abs(g) - 1.2
  if (over <= 0) return 0
  const k = Math.min(1, over / 0.6)
  return Math.sign(g) * 0.4 * k * k
}
