import type { QualityLevel } from '@forge/render3d'
import type { GraphicsPref, LookTier } from './look'

// The view's quality ladder (the engine governor owns it). Three looks (look.ts):
//   high   = soft real shadows (players + park), bloom on the lamps, colour grade, ambient occlusion;
//   medium = the same without AO;
//   low    = lit scenery, blob shadows only, no post passes (frames draw straight to the canvas).
// Then resolution steps down to DPR 1. The player can pin a look (View settings → Graphics); the governor
// then only steps the resolution.

const HIGH: QualityLevel = { dpr: Infinity, bloom: true, shadows: true, ao: true }
const MEDIUM: QualityLevel = { dpr: Infinity, bloom: true, shadows: true, ao: false }
const LOW: QualityLevel = { dpr: Infinity, bloom: false, shadows: false, ao: false }
const TIERS: Record<LookTier, QualityLevel> = { high: HIGH, medium: MEDIUM, low: LOW }

/** A look at a lower pixel-ratio cap. */
const at = (level: QualityLevel, dpr: number): QualityLevel => ({ ...level, dpr })

/** Which look a ladder level draws. */
export function spTier(level: QualityLevel): LookTier {
  if (level.ao) return 'high'
  return level.shadows === false ? 'low' : 'medium'
}

/** The ladder for a graphics pref: Auto walks every look then the resolution; a pinned look only the resolution. */
export function spLadder(pref: GraphicsPref): readonly QualityLevel[] {
  if (pref !== 'auto') {
    const look = TIERS[pref]
    return [look, at(look, 1.5), at(look, 1)]
  }
  return [HIGH, MEDIUM, LOW, at(LOW, 1.5), at(LOW, 1)]
}

/** The Auto ladder. */
export const SP_QUALITY: readonly QualityLevel[] = spLadder('auto')

/**
 * Where the ladder starts. Auto on touch devices: the low look, so a phone doesn't spend its first seconds
 * janky until the governor reacts (a fast one probes back up). A pinned look starts at full resolution.
 */
export function spStartLevel(touch: boolean, pref: GraphicsPref = 'auto'): number {
  return pref === 'auto' && touch ? SP_QUALITY.indexOf(LOW) : 0
}
