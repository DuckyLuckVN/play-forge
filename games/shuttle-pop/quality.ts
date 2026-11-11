import type { QualityLevel } from '@forge/render3d'

/**
 * One ladder for the whole view (the engine governor owns it): real shadows go first, then
 * resolution steps down to DPR 1. Shuttle Pop has no bloom pass.
 */
/**
 * Where the ladder starts: touch devices one rung down (no real shadows, plain toy shading), so a phone
 * doesn't spend its first seconds janky until the governor reacts; a fast one probes back up.
 */
export function spStartLevel(touch: boolean): number {
  return touch ? 1 : 0
}

export const SP_QUALITY: readonly QualityLevel[] = [
  { dpr: Infinity, bloom: false, shadows: true },
  { dpr: Infinity, bloom: false, shadows: false },
  { dpr: 1.5, bloom: false, shadows: false },
  { dpr: 1, bloom: false, shadows: false },
]
