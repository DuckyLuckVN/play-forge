// Pure render mapping (no three.js): sim world → the local player's view.
// The view always puts the local player at the near end (render z < 0), looking toward +z.
import { COURT, type Vec3 } from './physics'

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
