// Upper-body pose math for the chibi rig (pure, no three.js). The torso and both arms are a handful of
// joint channels; this file builds them from the base pose (idle / run / ready / moods) and the racket
// swing, and actors.ts only copies them onto the jointed rig (shoulder → upper arm → elbow → forearm →
// wrist → mitten). Nothing here allocates per call.
//
// The swing is staged with overlapping action: from the loaded pose each joint tier starts its sweep
// `lag` after the one before (torso → shoulder → elbow → wrist) and sweeps faster, so the shoulders lead,
// the elbow follows, the forearm whips and the wrist snaps at contact; the sweep carries on into the
// follow-through across the body, then a sprung settle (a small overshoot) back to the base pose. `load` (0..1) blends the base into the loaded pose on its own,
// so a held charge can hold the wind-up and release into the strike later.
//
// Angles are radians, written for the right (racket) arm; the rig mirrors the left one:
//   pitch: 0 = hanging, −π/2 = forward, −π = straight up (beyond reaches behind the head)
//   out: the arm raised sideways; across: its swing plane turned toward the other side (− = behind)
//   roll: the upper arm about its own axis; elbow ≥ 0 bends the forearm forward; wrist + flexes forward;
//   turn: the forearm about its own axis (pronation: turns the racket face)
//   twist: shoulders coiled back (+, right shoulder away from the net) / unwound (−); bend: chest forward

/** Smoothstep progress of `s` through [a, b]. */
function smooth(s: number, a: number, b: number): number {
  const k = Math.min(1, Math.max(0, (s - a) / (b - a)))
  return k * k * (3 - 2 * k)
}

/** Channel index of each joint angle. */
export const CH = {
  twist: 0,
  bend: 1,
  rAcross: 2,
  rPitch: 3,
  rOut: 4,
  rRoll: 5,
  rElbow: 6,
  rWrist: 7,
  rTurn: 8,
  lAcross: 9,
  lPitch: 10,
  lOut: 11,
  lElbow: 12,
} as const
export const N_CH = 13
export type Upper = Float64Array
export const upper = (): Upper => new Float64Array(N_CH)

/** Joint tier per channel (0 torso, 1 shoulders + off arm, 2 elbows, 3 wrist): when the strike arrives. */
export const TIER: readonly number[] = [0, 0, 1, 1, 1, 1, 2, 3, 3, 1, 1, 1, 2]

/**
 * Strike timing (s). Per tier (torso, shoulder, elbow, wrist): when its sweep starts after release and
 * how long it takes from the loaded pose through contact (mid-sweep, its fastest moment) to the
 * follow-through. Each tier starts `lag` after the one before and sweeps faster, so the speed peaks
 * travel out along the arm and the wrist snaps last. Then a sprung settle (damping ratio, angular
 * frequency) back to the base pose.
 */
export const STRIKE = {
  lag: 0.025,
  sweep: [0.2, 0.17, 0.14, 0.11] as readonly number[],
  settle: 0.34,
  zeta: 0.55,
  omega: 21,
} as const
const tierStart = (k: number) => k * STRIKE.lag
const WRIST = 3
/** Release → the racket at contact (the wrist's mid-sweep). */
export const CONTACT_T = tierStart(WRIST) + STRIKE.sweep[WRIST] / 2
/** Release → the last joint reaches the follow-through. */
export const FOLLOW_T = Math.max(...STRIKE.sweep.map((d, k) => tierStart(k) + d))
/** Release → every joint back on the base pose. */
export const STRIKE_END = FOLLOW_T + STRIKE.settle

type Key = Partial<Record<keyof typeof CH, number>>
const key = (from: Upper, k: Key): Upper => {
  const o = Float64Array.from(from)
  for (const n of Object.keys(k) as (keyof typeof CH)[]) o[CH[n]] = k[n]!
  return o
}

/** Standing: soft elbows, racket tipped forward-up, off hand relaxed. */
export const REST = key(upper(), {
  rAcross: -0.42,
  rPitch: -0.18,
  rOut: 0.1,
  rRoll: -0.38,
  rElbow: 1.38,
  rWrist: 0.43,
  rTurn: 1.09,
  lAcross: -0.1,
  lPitch: -0.14,
  lOut: 0.24,
  lElbow: 0.93,
})
/** Running: racket carried out front-right, off arm a bent jogging arm (the counter-swing rides on top). */
export const RUN_KEY = key(upper(), {
  rAcross: -0.4,
  rPitch: -0.01,
  rOut: 0.28,
  rRoll: -0.23,
  rElbow: 1.48,
  rWrist: 0.23,
  rTurn: -0.08,
  lPitch: -0.3,
  lOut: 0.3,
  lElbow: 1.3,
})
/** Ready stance (shuttle incoming): racket up in front, off hand out for balance. */
export const READY = key(upper(), {
  bend: 0.05,
  rPitch: -1.11,
  rOut: 0.37,
  rRoll: -0.16,
  rElbow: 1.13,
  rWrist: -0.12,
  rTurn: -0.39,
  lAcross: -0.42,
  lPitch: -0.44,
  lOut: 0.32,
  lElbow: 1.28,
})
/** Point won: both arms up, elbows soft (the rig adds a wave). */
export const CHEER = key(upper(), {
  rAcross: 0.12,
  rPitch: -2.87,
  rOut: 0.54,
  rRoll: 0.25,
  rElbow: 0.18,
  rWrist: -0.24,
  rTurn: 0.04,
  lAcross: -0.62,
  lPitch: -2.62,
  lOut: 0.18,
  lElbow: 0.28,
})
/** Point lost: arms hang, racket drooping. */
export const SLUMP = key(upper(), {
  rAcross: 0.08,
  rPitch: -0.11,
  rOut: 0.12,
  rRoll: -0.02,
  rElbow: 0.29,
  rWrist: 0.25,
  rTurn: -0.04,
  lAcross: -0.5,
  lPitch: -0.08,
  lOut: -0.1,
  lElbow: 0.43,
})

/** The three key poses of one swing shape. */
export interface SwingKeys {
  load: Upper
  contact: Upper
  follow: Upper
}

/**
 * Plain swing (clears, drops, drives): a high forehand. Load = racket back beside the head with the
 * elbow up and the shoulders coiled, off arm pointing at the shuttle; contact up and in front of the
 * right shoulder; follow-through down across the body.
 */
export const DRIVE: SwingKeys = {
  load: key(upper(), {
    twist: 0.6,
    rAcross: -0.14,
    rPitch: -1.87,
    rOut: 0.73,
    rRoll: -0.74,
    rElbow: 1.11,
    rWrist: -0.28,
    rTurn: 0.41,
    lAcross: 0.79,
    lPitch: -1.85,
    lOut: 0.41,
    lElbow: 0.89,
  }),
  contact: key(upper(), {
    twist: -0.2,
    bend: 0.06,
    rAcross: -0.38,
    rPitch: -2.73,
    rOut: 0.51,
    rRoll: -0.18,
    rElbow: 0.18,
    rWrist: -0.64,
    rTurn: -0.01,
    lAcross: 0.51,
    lPitch: -0.91,
    lOut: -0.1,
    lElbow: 0.64,
  }),
  follow: key(upper(), {
    twist: -0.6,
    bend: 0.12,
    rAcross: 1.12,
    rPitch: -0.84,
    rOut: 0.15,
    rRoll: 0.03,
    rElbow: 0.35,
    rWrist: -0.31,
    rTurn: 0.02,
    lAcross: 0.4,
    lPitch: -1.09,
    lOut: -0.1,
    lElbow: 0.08,
  }),
}

/**
 * Smash: overhead. Load = elbow up, racket raised behind the head (reads from the behind camera), chest
 * arched, off arm up at the shuttle; contact high and in front; follow-through hard down across the body.
 */
export const SMASH_KEYS: SwingKeys = {
  load: key(upper(), {
    twist: 0.55,
    bend: -0.12,
    rAcross: 0.31,
    rPitch: -2.3,
    rOut: 0.66,
    rRoll: -0.32,
    rElbow: 0.99,
    rWrist: -0.13,
    rTurn: -0.02,
    lAcross: 0.62,
    lPitch: -2.5,
    lOut: 0.1,
    lElbow: 0.08,
  }),
  contact: key(upper(), {
    twist: -0.15,
    bend: 0.15,
    rAcross: -0.34,
    rPitch: -3.06,
    rOut: 0.62,
    rRoll: -0.17,
    rElbow: 0.08,
    rWrist: -0.62,
    rTurn: 0.03,
    lAcross: 0.59,
    lPitch: -0.61,
    lOut: -0.09,
    lElbow: 1.22,
  }),
  follow: key(upper(), {
    twist: -0.65,
    bend: 0.3,
    rAcross: 1.01,
    rPitch: -0.78,
    rOut: -0.1,
    rRoll: -0.49,
    rElbow: 0.15,
    rWrist: 0.08,
    rTurn: -0.52,
    lAcross: 0.53,
    lPitch: -1,
    lOut: -0.1,
    lElbow: 0.22,
  }),
}

/** Inputs of the base (non-swing) pose; all weights 0..1 and already smoothed by the renderer. */
export interface BaseIn {
  /** Run share (counter-swing size). */
  run: number
  /** Stride phase in cycles. */
  stride: number
  ready: number
  happy: number
  sad: number
  /** Celebration wave (rad), added to the raised arms. */
  wave: number
}

/**
 * Run counter-swing at full run: shoulder swing (rad, racket arm smaller so the racket stays clear of
 * the head), elbow pump (rad) and how far (cycles) the forearm trails the upper arm.
 */
const RUN = { swing: 0.55, swingRacket: 0.35, pump: 0.35, pumpRacket: 0.12, lag: 0.12 }
const TAU = Math.PI * 2

/** Base pose: idle → run counter-swing → ready → cheer / slump. Writes `o`. */
export function basePose(b: BaseIn, o: Upper): Upper {
  const run = b.run
  const ready = b.ready
  const cycle = Math.sin(TAU * b.stride)
  // The forearm trails the upper arm a little (it bends most as the arm comes forward).
  const late = Math.sin(TAU * (b.stride - RUN.lag))
  for (let c = 0; c < N_CH; c++) {
    const v = REST[c] + (RUN_KEY[c] - REST[c]) * run
    o[c] = v + (READY[c] - v) * ready
  }
  o[CH.rPitch] -= cycle * RUN.swingRacket * run
  o[CH.lPitch] += cycle * RUN.swing * run
  o[CH.rElbow] += late * RUN.pumpRacket * run
  o[CH.lElbow] -= late * RUN.pump * run
  for (let c = 0; c < N_CH; c++) {
    const happy = CHEER[c] + (c === CH.rPitch ? b.wave : c === CH.lPitch ? -b.wave : 0)
    o[c] += (happy - o[c]) * b.happy
    o[c] += (SLUMP[c] - o[c]) * b.sad
  }
  return o
}

/** Sprung settle 0 → 1 over `STRIKE.settle` s with a small overshoot; exactly 1 at the end. */
export function settleCurve(v: number): number {
  const S = STRIKE
  if (v <= 0) return 0
  if (v >= S.settle) return 1
  const wd = S.omega * Math.sqrt(1 - S.zeta * S.zeta)
  const e = Math.exp(-S.zeta * S.omega * v)
  const spring = 1 - e * (Math.cos(wd * v) + ((S.zeta * S.omega) / wd) * Math.sin(wd * v))
  // Fade the last of the ringing out so the curve lands on 1 without a step.
  return spring + (1 - spring) * smooth(v, S.settle * 0.6, S.settle)
}

/** Smootherstep: zero speed at both ends, a sharp peak in the middle. */
const sweepEase = (x: number) => x * x * x * (x * (x * 6 - 15) + 10)

/**
 * One channel through the strike, `t` s after release. `start` = the loaded value, `base` = where it
 * settles. The sweep runs a smooth arc (the parabola through loaded → contact → follow-through, so the
 * motion never kinks at contact), fastest at contact; then the sprung settle.
 */
export function strikeValue(
  c: number,
  t: number,
  start: number,
  contact: number,
  follow: number,
  base: number,
): number {
  const k = TIER[c]
  const u = t - tierStart(k) - STRIKE.sweep[k]
  if (u < 0) {
    const q = sweepProgress(k, t)
    return (start * (q - 1) * (q - 2)) / 2 - contact * q * (q - 2) + (follow * q * (q - 1)) / 2
  }
  if (u < STRIKE.settle) return follow + (base - follow) * settleCurve(u)
  return base
}

/** Sweep progress of joint tier `k`, `t` s after release: 0 loaded, 1 contact, 2 follow-through. */
export function sweepProgress(k: number, t: number): number {
  const u = t - tierStart(k)
  const d = STRIKE.sweep[k]
  return u <= 0 ? 0 : u >= d ? 2 : 2 * sweepEase(u / d)
}

/** Swing timeline values the pose needs (SwingDriver in moves.ts has these fields). */
export interface SwingIn {
  /** Loaded share 0..1. */
  load: number
  /** Seconds since release (< 0 = not striking). */
  strike: number
  /** A previous strike still settling under a new wind-up (s since its release, < 0 = none). */
  prev: number
  /** Seconds spent holding the loaded pose: the coil slowly tightens (more twist, wrist cocked further). */
  coil: number
}

/** Extra coil at a long hold (rad: shoulder twist, wrist cock) and how fast it builds (s). */
const COIL = { twist: 0.22, wrist: 0.3, time: 0.25 }

// Swing keys for the current smash weight (scratch, shared: swingPose never re-enters).
const kLoad = upper()
const kContact = upper()
const kFollow = upper()

/**
 * Full upper-body pose: the base pose with the swing on top. `smash` 0..1 blends the plain swing into
 * the overhead smash. Continuous in every input. Writes `o` (may not alias `base`).
 */
export function swingPose(base: Upper, s: SwingIn, smash: number, o: Upper): Upper {
  const A = DRIVE
  const B = SMASH_KEYS
  for (let c = 0; c < N_CH; c++) {
    kLoad[c] = A.load[c] + (B.load[c] - A.load[c]) * smash
    kContact[c] = A.contact[c] + (B.contact[c] - A.contact[c]) * smash
    kFollow[c] = A.follow[c] + (B.follow[c] - A.follow[c]) * smash
  }
  const coil = s.coil > 0 ? s.load * (1 - Math.exp(-s.coil / COIL.time)) : 0
  for (let c = 0; c < N_CH; c++) {
    // A new wind-up starts from wherever the previous strike is, so a quick re-swing never pops.
    const from = s.prev >= 0 ? strikeValue(c, s.prev, kLoad[c], kContact[c], kFollow[c], base[c]) : base[c]
    // The smash wind-up passes the racket back beside the head (via the plain loaded pose) before it
    // drops behind: a straight blend would sweep it through the head.
    const l = loadShare(s.load, TIER[c])
    const via = A.load[c] - (from + kLoad[c]) / 2
    let start = from + (kLoad[c] - from) * l + via * smash * 4 * l * (1 - l)
    if (c === CH.twist) start += COIL.twist * coil
    else if (c === CH.rWrist) start -= COIL.wrist * coil
    o[c] = s.strike >= 0 ? strikeValue(c, s.strike, start, kContact[c], kFollow[c], base[c]) : start
  }
  return o
}

/** Wind-up head start per joint tier (share of the load), racket first. */
const LOAD_STAGGER = 0.08

/**
 * Wind-up share of joint tier `k` at overall load `load` (0..1): the backswing starts at the racket (the
 * wrist cocks first, then elbow, shoulder, torso), so the racket drops back beside the head instead of
 * sweeping through it. Exactly 0 / 1 for every tier at load 0 / 1.
 */
export function loadShare(load: number, k: number): number {
  const a = (WRIST - k) * LOAD_STAGGER
  return smooth(load, a, a + 1 - WRIST * LOAD_STAGGER)
}

/** Swing streak brightness 0..1 for a strike `t` s after release: around the racket's whip only. */
export function streakGlow(t: number): number {
  const a = CONTACT_T - 0.05
  const b = CONTACT_T + 0.05
  return t > a && t < b ? Math.sin((Math.PI * (t - a)) / (b - a)) : 0
}
