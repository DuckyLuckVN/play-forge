// Pure mapping from simulation space (lanes, depth) to the 3D world, plus the
// camera maths. No three.js here, so it is unit-tested directly.

/** World units per lane. */
export const LANE_W = 2.4
/** World units per sim depth unit. */
export const Z_SCALE = 1.15
/** Camera height and distance behind the player row. */
export const CAM_HEIGHT = 4.8
export const CAM_BACK = 7.6

/** World x of a (possibly fractional) lane when `lanes` lanes are shown. */
export const laneX = (lane: number, lanes: number) => (lane - (lanes - 1) / 2) * LANE_W
export const trackHalfWidth = (lanes: number) => (lanes / 2) * LANE_W
/** World z of a sim depth (forward is -z). */
export const worldZ = (z: number) => -z * Z_SCALE

const deg = (r: number) => (r * 180) / Math.PI
const rad = (d: number) => (d * Math.PI) / 180

/**
 * Vertical field of view and camera distance that keep `halfWidth` visible at
 * `dist` on screens of this aspect (w / h). Widens the view up to `maxFov`,
 * then pulls the camera back instead of distorting further.
 */
export function fitView(
  aspect: number,
  base: number,
  halfWidth: number,
  dist: number,
  maxFov = 80,
): { fov: number; dist: number } {
  const needed = deg(2 * Math.atan(halfWidth / dist / aspect))
  if (needed <= maxFov) return { fov: Math.max(base, needed), dist }
  return { fov: maxFov, dist: halfWidth / (Math.tan(rad(maxFov) / 2) * aspect) }
}

/**
 * Camera follow: drifts part of the way towards the ghost and rolls into a
 * slide (`ghostX` now vs `targetX` where it's heading), for a sense of motion.
 */
export function cameraRig(ghostX: number, targetX: number): { x: number; roll: number } {
  const slide = targetX - ghostX
  return { x: ghostX * 0.6, roll: slide === 0 ? 0 : -slide * 0.035 }
}
