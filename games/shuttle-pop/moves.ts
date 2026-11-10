// Timed move curves for the chibis (pure, no three.js): the racket swing, the smash leap, the
// celebration hop / spin and the idle glance. Each maps a time or progress to pose values, continuous
// at every phase boundary so poses never pop. actors.ts applies them to the rig; the arm / torso joint
// curves are arm.ts.
import { FOLLOW_T, STRIKE_END } from './arm'

/** Smoothstep progress of `s` through [a, b]. */
export function seg(s: number, a: number, b: number): number {
  const k = Math.min(1, Math.max(0, (s - a) / (b - a)))
  return k * k * (3 - 2 * k)
}
const easeOut = (u: number) => 1 - (1 - u) * (1 - u)

/**
 * Swing timeline (s). Press → wind-up into the loaded pose over `load` → hold while a known contact is
 * still ahead (at most `maxHold`, so the racket meets the shuttle on time) → release into the strike
 * (arm.ts STRIKE: contact `CONTACT_T` after release, everything settled by `STRIKE_END`). The gait
 * faces the net from the press until the follow-through ends.
 */
export const SWING = { load: 0.05, maxHold: 0.3 } as const

/**
 * Drives one player's swing: `load` (0..1), `strike` (s since release, −1 = not striking) and `prev`
 * (a strike still settling under a new wind-up). Pure state over `dt`, so any frame rate gives the same
 * timeline. Task 14's charge can hold the loaded pose by passing a long `wait` (and a longer
 * `maxHold`).
 */
export class SwingDriver {
  /** Seconds since the press (Infinity = idle). */
  age = Infinity
  load = 0
  strike = -1
  prev = -1
  /** Longest hold in the loaded pose (s). */
  maxHold: number = SWING.maxHold
  /** Age at which the strike starts. */
  private release: number = SWING.load

  /** Start a swing (ignored while still winding up: the sim's cooldown makes that a duplicate). */
  press() {
    if (this.age !== Infinity && this.strike < 0) return
    if (this.strike >= 0) this.prev = this.strike
    this.age = 0
    this.load = 0
    this.strike = -1
    this.release = SWING.load
  }

  /** Back to idle at once (a new match). */
  reset() {
    this.age = Infinity
    this.load = 0
    this.strike = this.prev = -1
  }

  /** True from the press until the follow-through ends (the body faces the net meanwhile). */
  get busy(): boolean {
    return this.age !== Infinity && (this.strike < 0 || this.strike < FOLLOW_T)
  }

  /**
   * Advance `dt` s. `wait` = seconds from now until the strike should start (a pending contact minus
   * CONTACT_T); 0 = as soon as the wind-up is done.
   */
  update(dt: number, wait = 0) {
    if (this.prev >= 0) {
      this.prev += dt
      if (this.prev >= STRIKE_END) this.prev = -1
    }
    if (this.age === Infinity) return
    if (this.strike < 0)
      this.release = Math.min(SWING.load + this.maxHold, Math.max(SWING.load, this.age + wait))
    this.age += dt
    this.load = seg(this.age, 0, SWING.load)
    if (this.age >= this.release) this.strike = this.age - this.release
    if (this.strike >= STRIKE_END) {
      this.age = Infinity
      this.load = 0
      this.strike = -1
    }
  }
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
