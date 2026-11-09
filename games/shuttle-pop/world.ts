// Pure render mapping (no three.js): sim world → the local player's view.
// The view always puts the local player at the near end (render z < 0), looking toward +z.
import type { Vec3 } from './physics'

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

/** Camera behind the near baseline, looking at the net. Metres / degrees. */
export const CAMERA = {
  fov: 50,
  height: 5.5,
  /** Behind the near baseline. */
  back: 4,
  /** Look-at point on the floor, just short of the net: keeps the near baseline and the far half in view. */
  lookZ: -1.5,
  /** How much the camera slides with the local player's x (0 = fixed). */
  followX: 0.3,
} as const
