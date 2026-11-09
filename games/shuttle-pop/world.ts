// Pure render mapping (no three.js): sim world → the local player's view.
// The view always puts the local player at the near end (render z < 0), looking toward +z.
import { COURT, type Vec3 } from './physics'
import type { SpEvent } from './sim'

/** Side 0 is drawn as is; side 1 is mirrored in x and z (a half turn), so either side is near. */
export function viewOf(side: 0 | 1): { flip: 1 | -1 } {
  return { flip: side === 0 ? 1 : -1 }
}

/** a → b by t, written into `out` (render loops reuse one vector). */
export function lerpV(a: Vec3, b: Vec3, t: number, out: Vec3): Vec3 {
  out.x = a.x + (b.x - a.x) * t
  out.y = a.y + (b.y - a.y) * t
  out.z = a.z + (b.z - a.z) * t
  return out
}

/**
 * Camera behind the near baseline, looking toward the net. Metres / degrees. Pulled back and a touch
 * wide so a Perfect clear (apex ~8.5 m) stays on screen with the look-at rising with the shuttle,
 * while all four court corners stay in view (world.test.ts checks 16:9 and 19.5:9).
 */
export const CAMERA = {
  fov: 55,
  height: 6,
  /** Behind the near baseline. */
  back: 7.5,
  /** Look-at point on the floor at rest (the net line). */
  lookZ: 0,
  /** Look-at height gained per metre the (damped) shuttle is above `riseFrom`. */
  rise: 0.4,
  riseFrom: 1.5,
  /** Focus easing toward the shuttle height, per second (smooth: no jerks on hits). */
  focusRate: 5,
  /** How much the camera slides with the local player's x (0 = fixed). */
  followX: 0.3,
} as const

export interface CameraPose {
  x: number
  y: number
  z: number
  lookX: number
  lookY: number
  lookZ: number
}

/** Camera position + look-at for a (damped) camera x and focus height. Writes into `out`. */
export function cameraPose(camX: number, focusY: number, out: CameraPose): CameraPose {
  out.x = camX
  out.y = CAMERA.height
  out.z = -(COURT.halfLen + CAMERA.back)
  out.lookX = camX * 0.5
  out.lookY = CAMERA.rise * Math.max(0, focusY - CAMERA.riseFrom)
  out.lookZ = CAMERA.lookZ
  return out
}

/** The focus height eased toward the shuttle's height over `dt` seconds. */
export function dampFocus(focus: number, shuttleY: number, dt: number): number {
  return focus + (shuttleY - focus) * (1 - Math.exp(-CAMERA.focusRate * dt))
}

/**
 * A player's mood: during the point pause the side that won it (`pointSide`, −1 = none) celebrates
 * and the other slumps; at 'over' the match `winner` does. Idle otherwise.
 */
export function moodOf(
  phase: 'serve' | 'rally' | 'point' | 'over',
  winner: number,
  pointSide: number,
  side: 0 | 1,
): 'idle' | 'happy' | 'sad' {
  const won = phase === 'over' ? winner : phase === 'point' ? pointSide : -1
  return won === -1 ? 'idle' : won === side ? 'happy' : 'sad'
}

/** Same preset on both sides: the far player (`i` ≠ the near `localIdx`) is drawn as the tinted twin. */
export function isTwinAlt(preset0: number, preset1: number, i: number, localIdx: number): boolean {
  return preset0 === preset1 && i !== localIdx
}

/** Crowd tuning: cheers from a rally of `rally` hits, and for `pointTime` s after every point. */
export const CHEER = {
  rally: 8,
  /** Level when a long rally starts cheering; each further hit adds `perHit`. */
  base: 0.45,
  perHit: 0.06,
  /** Level for a point after a short rally (a long one gets the full 1). */
  point: 0.55,
  pointTime: 1.8,
} as const

/** Hits in the current rally after an event of kind `k`: a serve or a point starts over. */
export function rallyHits(hits: number, k: SpEvent['k']): number {
  return k === 'hit' ? hits + 1 : k === 'serve' || k === 'point' ? 0 : hits
}

/**
 * Crowd excitement 0..1. `hits` = the rally so far, `pointAge` = seconds since the latest point
 * (Infinity = none), `pointHits` = how long that point's rally was.
 */
export function cheerLevel(hits: number, pointAge: number, pointHits: number): number {
  if (pointAge < CHEER.pointTime) return pointHits >= CHEER.rally ? 1 : CHEER.point
  if (hits < CHEER.rally) return 0
  return Math.min(1, CHEER.base + (hits - CHEER.rally) * CHEER.perHit)
}

/**
 * The swing's tick in host history terms. The screen shows prev → curr by `alpha`, and the state of
 * tick T holds the shuttle that history records at T + 1 (the swings of tick T + 1 see it), so the
 * shuttle on screen is history tick curr + alpha, rounded.
 */
export function swingTick(currTick: number, alpha: number): number {
  return currTick + (alpha > 0.5 ? 1 : 0)
}

/** Guest prediction correction: metres, and the share of the error closed per 60 Hz frame. */
export const CORRECT = { keep: 0.05, snap: 1.0, blend: 0.15 } as const

/**
 * Pulls a predicted position toward the authoritative one (writes `out`, which may be `pred`): under
 * `keep` it stays, under `snap` it closes `blend` of the error per 60 Hz frame (dt-based), else it snaps.
 */
export function correct(
  pred: { x: number; z: number },
  auth: { x: number; z: number },
  out: { x: number; z: number },
  dt = 1 / 60,
): void {
  const ex = auth.x - pred.x
  const ez = auth.z - pred.z
  const err = Math.hypot(ex, ez)
  const k = err < CORRECT.keep ? 0 : err < CORRECT.snap ? 1 - Math.pow(1 - CORRECT.blend, dt * 60) : 1
  out.x = k === 1 ? auth.x : pred.x + ex * k
  out.z = k === 1 ? auth.z : pred.z + ez * k
}
