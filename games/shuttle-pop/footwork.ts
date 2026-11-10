// Badminton footwork (pure, no three.js): which gait a move reads as (side shuffle vs short forward /
// back steps; the body's turn while moving is locomotion.ts courtTurn), the lunge at a far low reach, and the split-step hop when the opponent hits. Everything is dt-based damping or plain
// curves, so it looks the same at any frame rate; nothing allocates per frame.
//
// The renderer keeps one Footwork per player (local, guest-predicted, remote and bot alike). The leg
// joints for each gait are legs.ts; the raised-racket stance arms are arm.ts and do not depend on legs.
import { damp } from './locomotion'
import type { Hop } from './moves'

/** Smoothstep progress of `s` through [a, b]. */
function smooth(s: number, a: number, b: number): number {
  const k = Math.min(1, Math.max(0, (s - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

export const FOOTWORK = {
  /** Lateral share |side| / (|fwd| + |side|) from which a move starts / finishes reading as a shuffle. */
  lateralFrom: 0.3,
  lateralTo: 0.7,
} as const

/**
 * Lunge: min horizontal reach (m) to the shuttle, max shuttle height (m: above that it is an overhead,
 * not a lunge), how long before the contact it starts (s), how long it holds after the reach ends (the
 * swing + recovery, s), blend rates in / out (1/s) and the most the body turns toward the shuttle (rad).
 */
export const LUNGE = {
  reach: 0.7,
  maxY: 1.5,
  lead: 0.22,
  hold: 0.32,
  rateIn: 22,
  rateOut: 7,
  yawMax: 0.9,
} as const

/** Split step: time in the air and on the landing squash (s), landing squash size. */
export const SPLIT = { air: 0.17, land: 0.12, squash: 0.14 } as const

/**
 * Shuffle (1) vs forward / back steps (0) for a body-frame velocity share (+fwd forward, +side toward
 * local +x). 0 at rest.
 */
export function lateralShare(fwd: number, side: number): number {
  const a = Math.abs(fwd)
  const b = Math.abs(side)
  if (a + b === 0) return 0
  return smooth(b / (a + b), FOOTWORK.lateralFrom, FOOTWORK.lateralTo)
}

/** A lunge for this reach (m), shuttle height (m) and seconds to my contact (undefined = none). */
export function lungeWanted(reach: number, y: number, due: number | undefined): boolean {
  return due !== undefined && due >= 0 && due <= LUNGE.lead && reach >= LUNGE.reach && y <= LUNGE.maxY
}

/** Event `kind` by `side` makes the player on `mySide` split-step (the opponent hits or serves). */
export function splitsOn(kind: string, side: number, mySide: number): boolean {
  return (kind === 'hit' || kind === 'serve') && side !== mySide
}

/** Split-step hop `age` s after the trigger: height share 0..1, then a landing squash. */
export function splitHop(age: number, o: Hop): Hop {
  o.height = 0
  o.squash = 0
  if (!(age >= 0)) return o
  if (age < SPLIT.air) {
    const u = age / SPLIT.air
    o.height = 4 * u * (1 - u)
  } else if (age < SPLIT.air + SPLIT.land) {
    const v = (age - SPLIT.air) / SPLIT.land
    o.squash = SPLIT.squash * Math.sin(Math.PI * v) * (1 - v)
  }
  return o
}

/** One player's footwork state: the lunge blend + its turn toward the shuttle, and the split-step clock. */
export class Footwork {
  /** Lunge weight 0..1. */
  lunge = 0
  /** Seconds since the split step started (Infinity = none). */
  splitAge = Infinity
  private yaw = 0
  private hold = 0

  reset() {
    this.lunge = this.yaw = this.hold = 0
    this.splitAge = Infinity
  }

  /** Hop now (the opponent just hit). Ignored while a hop is still under way. */
  splitStep() {
    if (this.splitAge < SPLIT.air + SPLIT.land) return
    this.splitAge = 0
  }

  /** Yaw (rad) the body turns toward the lunge, already weighted by it. */
  turn(): number {
    return this.yaw * this.lunge
  }

  /**
   * Advance `dt` s. `want` = lungeWanted this frame; (lx, lz) = the shuttle's direction in the body
   * frame (+x local, +z forward), used while wanted.
   */
  update(dt: number, want: boolean, lx: number, lz: number) {
    this.splitAge += dt
    if (want) {
      this.hold = LUNGE.hold
      const a = Math.atan2(lx, lz)
      const target = Math.max(-LUNGE.yawMax, Math.min(LUNGE.yawMax, a))
      this.yaw = damp(this.yaw, target, LUNGE.rateIn, dt)
    }
    // Rise while wanted / holding, ease out after; a hold running out mid-frame splits the frame.
    const up = want ? dt : Math.min(dt, this.hold)
    if (!want) this.hold = Math.max(0, this.hold - dt)
    this.lunge = damp(damp(this.lunge, 1, LUNGE.rateIn, up), 0, LUNGE.rateOut, dt - up)
    if (this.hold === 0 && this.lunge < 1e-4) this.lunge = this.yaw = 0
  }
}
