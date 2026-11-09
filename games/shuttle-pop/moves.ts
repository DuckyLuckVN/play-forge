// Timed move curves for the chibis (pure, no three.js): the racket swing, the smash leap, the
// celebration hop / spin and the idle glance. Each maps a time or progress to pose values, continuous
// at every phase boundary so poses never pop. actors.ts applies them to the rig.

/** Smoothstep progress of `s` through [a, b]. */
export function seg(s: number, a: number, b: number): number {
  const k = Math.min(1, Math.max(0, (s - a) / (b - a)))
  return k * k * (3 - 2 * k)
}
const clamp01 = (u: number) => Math.min(1, Math.max(0, u))
const easeOut = (u: number) => 1 - (1 - u) * (1 - u)
const easeIn = (u: number) => u * u
const mix = (a: number, b: number, u: number) => a + (b - a) * u

/**
 * Swing timeline in progress units (0..1 over `time` s): wind-up to `windup` (~80 ms, racket cocked
 * behind the head), a fast accelerating strike to `strike`, follow-through to `follow`, recover to 1.
 * `time` stays under the sim's swing cooldown (20 ticks) so a new swing never cuts one mid-strike.
 * Arm angles are about x (0 = hanging, negative = forward/up, below −π = behind the head).
 */
export const SWING = {
  time: 0.33,
  windup: 0.24,
  strike: 0.36,
  follow: 0.62,
  armRest: -0.25,
  armBack: -3.0,
  armFollow: -0.45,
  armThrough: 0.15,
  /** Arm out to the side (rad, sign applied by the rig) so the arc reads from behind. */
  outBack: 1.1,
  outAcross: -0.55,
  /** Wrist: cocked back, then snapped through (rad added to the racket's rest tilt). */
  wristBack: 0.55,
  wristSnap: -0.6,
  /** Torso twist (rad): shoulders turn back, then unwind through the hit. */
  twistBack: 0.55,
  twistThrough: -0.75,
} as const

export interface SwingPose {
  /** How much the swing overrides the base (run / ready) arm pose, 0..1. */
  weight: number
  arm: number
  out: number
  wrist: number
  twist: number
  /** Racket streak visibility 0..1 (around the strike only). */
  streak: number
}

/** Swing pose at progress `s` (0..1). Writes `out`. */
export function swingCurve(s: number, o: SwingPose): SwingPose {
  const S = SWING
  o.weight = seg(s, 0, 0.06) * (1 - seg(s, 0.7, 1))
  if (s < S.windup) {
    const u = easeOut(clamp01(s / S.windup))
    o.arm = mix(S.armRest, S.armBack, u)
    o.out = mix(0, S.outBack, u)
    o.wrist = mix(0, S.wristBack, u)
    o.twist = mix(0, S.twistBack, u)
  } else if (s < S.strike) {
    const u = easeIn((s - S.windup) / (S.strike - S.windup))
    o.arm = mix(S.armBack, S.armFollow, u)
    o.out = mix(S.outBack, S.outAcross, u)
    o.wrist = mix(S.wristBack, S.wristSnap, u)
    o.twist = mix(S.twistBack, S.twistThrough, u)
  } else if (s < S.follow) {
    const u = easeOut((s - S.strike) / (S.follow - S.strike))
    o.arm = mix(S.armFollow, S.armThrough, u)
    o.out = S.outAcross
    o.wrist = S.wristSnap
    o.twist = S.twistThrough
  } else {
    const u = seg(s, S.follow, 1)
    o.arm = mix(S.armThrough, S.armRest, u)
    o.out = mix(S.outAcross, 0, u)
    o.wrist = mix(S.wristSnap, 0, u)
    o.twist = mix(S.twistThrough, 0, u)
  }
  const a = S.windup - 0.02
  const b = S.strike + 0.1
  o.streak = s > a && s < b ? Math.sin((Math.PI * (s - a)) / (b - a)) : 0
  return o
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
