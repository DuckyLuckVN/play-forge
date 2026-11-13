// Shuttle Pop's visual tuning in one place: tone mapping, sun + sky light, soft shadows, lamp glow (bloom),
// ambient occlusion and the colour grade, plus the graphics tiers (quality.ts builds the ladder from them).
// Look only: nothing here touches the sim, the camera or the layout.

import { NeutralToneMapping, type ToneMapping } from 'three'
import type { AoOptions, ColorGrade } from '@forge/render3d'

/** A look the renderer can draw (quality.ts maps each to a ladder level). */
export type LookTier = 'low' | 'medium' | 'high' | 'ultra'

/** The player's graphics choice (prefs.ts): Auto lets the quality governor pick. */
export const GRAPHICS_PREFS = ['auto', 'low', 'medium', 'high', 'ultra'] as const
export type GraphicsPref = (typeof GRAPHICS_PREFS)[number]
export const DEFAULT_GRAPHICS: GraphicsPref = 'auto'

export interface ShadowLook {
  /** Shadow map edge (px). */
  map: number
  /** PCF blur radius (shadow-map texels): soft edges. */
  radius: number
}

export const LOOK = {
  /** Neutral keeps the pastel hues (ACES pushes them toward olive / orange). */
  toneMapping: NeutralToneMapping as ToneMapping,
  exposure: 1,
  /**
   * Warm-white late-afternoon sun: the only shadow light. It carries most of the light (the sky about a
   * third of it), so shade reads clearly on the ground once tone-mapped; surface colours are set for this
   * (three's Lambert divides by π: lit ground ≈ 1.0× albedo, shade ≈ 0.4×).
   */
  sun: { color: '#fff0dc', intensity: 3.8 },
  /** Sky light: lavender from above (tints the shade cool, like the far hills), grass bounce below. */
  hemi: { sky: '#e6dcff', ground: '#8fa968', intensity: 1.05 },
  /** How much sun a real shadow blocks, 0..1: the shade keeps the sky light, so it stays soft and coloured, never black. */
  shadowIntensity: 0.9,
  shadowBias: -0.0004,
  shadowNormalBias: 0.03,
  /** Half-size (m) of the sun's shadow box on the Normal court: the court plus the near park props. */
  shadowHalf: 24,
  /** Per tier; Low has no real shadows. */
  shadow: {
    medium: { map: 1024, radius: 3 },
    high: { map: 2048, radius: 4 },
    ultra: { map: 2048, radius: 4 },
  } satisfies Record<Exclude<LookTier, 'low'>, ShadowLook>,
  /**
   * Bloom on the HDR image: the threshold sits above anything the sun lights, so only the lamp bulbs and
   * lanterns (drawn at `glow` luminance) bloom. Weak and tight: a soft halo, never a dazzle at the screen
   * edges (the near lanterns are big on screen).
   */
  bloom: { strength: 0.16, radius: 0.25, threshold: 1.8 },
  /**
   * Lamp bulbs / lanterns / LEDs: the luminance every bulb is drawn at (HDR, whatever its hue), just over the
   * bloom threshold, so they glow softly and never out-shine the shuttle.
   */
  glow: 2,
  /**
   * Live contact shading (Ultra only; every look has the park's baked light, scenery.ts), at half
   * resolution: subtle so pastels never look dirty.
   */
  ao: { intensity: 0.55, radius: 0.6, distanceFallOff: 1, thickness: 0.6, scale: 0.5 } satisfies AoOptions,
  /**
   * The shuttlecock (unlit) is drawn at this × its colours: Neutral tone mapping puts plain white at ~0.88,
   * so a little over 1 lands it on full white and it pops over the lit court. Kept under the bloom
   * threshold (no glow smear on a fast shot).
   */
  shuttleBoost: 1.6,
  /** Its ground shadow's opacity (the dot that tells where it is over the court). */
  shuttleShadow: 0.32,
  grade: { saturation: 1.03, contrast: 1.05, tint: [1.02, 1, 0.98] } satisfies ColorGrade,
} as const
