// Landing-ring visibility (personal setting, visuals only).
export type RingMode = 'hidden' | 'near' | 'always'
export const RING_MODES: readonly RingMode[] = ['hidden', 'near', 'always']
export const DEFAULT_RING: RingMode = 'always'
/** The flight path (same modes) starts off: an opt-in helper, the court stays clean. */
export const DEFAULT_PATH: RingMode = 'hidden'
/** "Near drop" shows the ring for the last this-many seconds before landing. */
export const NEAR_DROP_S = 0.6

/** Whether the landing ring is drawn; `secsToLand` < 0 = landed late, rally not over yet. */
export function ringShown(mode: RingMode, secsToLand: number): boolean {
  if (mode === 'always') return true
  if (mode === 'hidden') return false
  return secsToLand <= NEAR_DROP_S // NaN compares false
}
