// Which way the shuttlecock model points (visuals only, no sim state). Model space: +Y = cork (see
// model/shuttlecock.ts). In flight the cork turns toward the velocity it is drawn with (shuttles fly
// cork-first), smoothed so a hit or a lob's apex turns it fast but never snaps; held cork-down in the
// server's hand; lying on its side (cork + skirt rim on the floor) once it has landed. Every turn is the
// shortest swing from the current axis (no roll creeps in). Nothing here allocates per call.

import { Quaternion, Vector3 } from 'three'
import { CORK_TIP, SHUTTLECOCK } from './model/shuttlecock'
import type { Vec3 } from './physics'

/** How the model is posed this frame. */
export type ShuttleMode = 'hand' | 'fly' | 'rest'

export const ORIENT = {
  /** Per second toward the flight direction (63% in 1/rate s): a hit flips it in ~0.1 s. */
  rate: 20,
  /** Per second toward the resting pose (it tips over after landing). */
  restRate: 9,
  /** Below this drawn speed (m/s) the direction is noise: keep the last orientation. */
  minSpeed: 0.25,
  /** At or below this height (m) a point / over shuttle is on the floor. */
  floorY: 1e-3,
} as const

/**
 * Resting tilt (rad): the axis dips cork-down by this much so the cork and the skirt's open rim both touch
 * the floor. Solves cork + L·sin t = R·cos t (L = cork centre → rim plane, R = rim radius).
 */
export const REST_TILT = (() => {
  const L = SHUTTLECOCK.neck + SHUTTLECOCK.length
  const R = SHUTTLECOCK.skirtEnd
  return Math.acos(SHUTTLECOCK.cork / Math.hypot(R, L)) - Math.atan2(L, R)
})()

/** Serve / rally / landed: 'hand' before the serve, 'rest' once a point's shuttle is on the floor. */
export function shuttleMode(phase: 'serve' | 'rally' | 'point' | 'over', y: number): ShuttleMode {
  if (phase === 'serve') return 'hand'
  if (phase === 'rally') return 'fly'
  return y <= ORIENT.floorY ? 'rest' : 'fly'
}

const UP = new Vector3(0, 1, 0)
const axis = new Vector3()
const want = new Vector3()
const swing = new Quaternion()
const step = new Quaternion()

/** The model's cork axis (unit, world) for orientation `q`, into `out`. */
export function corkAxis(q: Quaternion, out: Vector3): Vector3 {
  return out.copy(UP).applyQuaternion(q)
}

/**
 * Turn `prev` toward cork-along (dx, dy, dz) by the frame-rate independent fraction 1 − e^(−rate·dt),
 * into `out` (may be `prev`). A zero direction keeps `prev`.
 */
export function turnToward(
  prev: Quaternion,
  dx: number,
  dy: number,
  dz: number,
  rate: number,
  dt: number,
  out: Quaternion,
): Quaternion {
  const len = Math.hypot(dx, dy, dz)
  if (!(len > 1e-9) || !(dt > 0)) return out.copy(prev)
  want.set(dx / len, dy / len, dz / len)
  swing.setFromUnitVectors(corkAxis(prev, axis), want)
  step.identity().slerp(swing, 1 - Math.exp(-rate * dt))
  return out.multiplyQuaternions(step, prev).normalize()
}

/** In flight: cork toward `vel` (smoothed); too slow to tell a direction → keep `prev`. */
export function shuttleOrientation(
  vel: Vec3,
  prev: Quaternion,
  dt: number,
  out: Quaternion,
  rate: number = ORIENT.rate,
): Quaternion {
  if (Math.hypot(vel.x, vel.y, vel.z) < ORIENT.minSpeed) return out.copy(prev)
  return turnToward(prev, vel.x, vel.y, vel.z, rate, dt, out)
}

/** Resting direction for a shuttle last heading along (hx, hz) on the floor: cork forward, dipped REST_TILT. */
export function restingDir(hx: number, hz: number, out: Vec3): Vec3 {
  const h = Math.hypot(hx, hz)
  const c = Math.cos(REST_TILT) / (h > 1e-9 ? h : 1)
  out.x = h > 1e-9 ? hx * c : 0
  out.z = h > 1e-9 ? hz * c : Math.cos(REST_TILT)
  out.y = -Math.sin(REST_TILT)
  return out
}

/**
 * Lowest the model's origin may sit (m above the floor) with its cork axis at height component `ay`, so
 * neither the cork nor the skirt's rim pokes through. At REST_TILT both touch (the resting height).
 * `scale`: the model's drawn size (SHUTTLE_LOOK_SCALE); every term is a model length, so it scales linearly.
 */
export function floorClearance(ay: number, scale = 1): number {
  const s = Math.min(1, Math.max(-1, ay))
  const flat = Math.sqrt(1 - s * s)
  // Cork: the dome (centre `neck` along the axis) or its tip; rim: the open end's lowest point.
  const cork = SHUTTLECOCK.cork - SHUTTLECOCK.neck * s
  const tip = -CORK_TIP * s
  const rim = SHUTTLECOCK.length * s + SHUTTLECOCK.skirtEnd * flat
  return Math.max(cork, tip, rim, 0) * scale
}
