import type { QualityLevel } from '@forge/render3d'

/**
 * One ladder for the whole view (the engine governor owns it): real shadows go first, then
 * resolution steps down to DPR 1. Shuttle Pop has no bloom pass.
 */
export const SP_QUALITY: readonly QualityLevel[] = [
  { dpr: Infinity, bloom: false, shadows: true },
  { dpr: Infinity, bloom: false, shadows: false },
  { dpr: 1.5, bloom: false, shadows: false },
  { dpr: 1, bloom: false, shadows: false },
]
