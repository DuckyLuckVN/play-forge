// Court size room option (host-chosen, host-authoritative): Normal / Large +15% / XL +30%.
// Length, width and the short service line scale; net height, reach, speed and physics don't.
// Pure leaf (physics types only) so sim, AI, camera and render can all share it.
import { COURT, type CourtDims } from './physics'

export type CourtSize = 'normal' | 'large' | 'xl'
export const COURT_SIZES: readonly CourtSize[] = ['normal', 'large', 'xl']
/** Length and width multiplier per size. */
export const COURT_SCALE: Readonly<Record<CourtSize, number>> = { normal: 1, large: 1.15, xl: 1.3 }

/** A stored / sent option value → a size; anything unknown is Normal. */
export function courtSizeOf(v: unknown): CourtSize {
  return COURT_SIZES.includes(v as CourtSize) ? (v as CourtSize) : 'normal'
}

/** The court for a size, multiplied on top of `base` (e.g. doubles sidelines). Net height stays. Fresh object. */
export function courtDims(size: CourtSize, base: CourtDims = COURT): CourtDims {
  const k = COURT_SCALE[size]
  return {
    halfLen: base.halfLen * k,
    halfWidth: base.halfWidth * k,
    netH: base.netH,
    shortLine: base.shortLine * k,
  }
}

/** Per-axis stretch of `court` against the Normal singles court (x = width, z = length). */
export function courtScale(court: Pick<CourtDims, 'halfLen' | 'halfWidth'>): { x: number; z: number } {
  return { x: court.halfWidth / COURT.halfWidth, z: court.halfLen / COURT.halfLen }
}

/** A copy of `p` with x and z stretched by `k` (other fields kept). */
export function spreadXZ<T extends { x: number; z: number }>(p: T, k: { x: number; z: number }): T {
  return { ...p, x: p.x * k.x, z: p.z * k.z }
}
