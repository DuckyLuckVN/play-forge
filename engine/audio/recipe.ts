import type { Tone } from './sound'

/** A fixed value, or [atLevel0, atLevel1] interpolated by the level. */
export type Range = number | readonly [number, number]

/** A tone whose numeric fields may be ranges; resolved per level 0..1 by `toneAt`. */
export type ToneRecipe = Omit<Tone, 'freq' | 'to' | 'dur' | 'vol' | 'at' | 'q'> & {
  freq: Range
  to?: Range
  dur: Range
  vol: Range
  at?: Range
  q?: Range
}

/** Layers quieter than this are inaudible and dropped. */
const MIN_VOL = 0.005

const clamp01 = (t: number) => (t > 0 ? (t < 1 ? t : 1) : 0) // NaN → 0

const lin = (r: Range, t: number) => (typeof r === 'number' ? r : r[0] + (r[1] - r[0]) * t)
// Pitch is perceived on a ratio scale, so interpolate by ratio.
const geo = (r: Range, t: number) => (typeof r === 'number' ? r : r[0] * (r[1] / r[0]) ** t)

/** Pitch-like fields interpolate geometrically; everything else linearly. */
const GEOMETRIC = new Set(['freq', 'to'])

/** The concrete tone for a level `t` (clamped 0..1, NaN = 0). */
export function toneAt(r: ToneRecipe, t: number): Tone {
  const level = clamp01(t)
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(r)) {
    if (typeof value === 'number' || Array.isArray(value)) {
      out[key] = (GEOMETRIC.has(key) ? geo : lin)(value as Range, level)
    } else if (value !== undefined) {
      out[key] = value
    }
  }
  return out as unknown as Tone
}

/** All layers at level `t`; layers resolving to (near) silence are dropped. */
export function soundAt(layers: readonly ToneRecipe[], t: number): Tone[] {
  return layers.map((l) => toneAt(l, t)).filter((tone) => (tone.vol ?? 0) >= MIN_VOL)
}

/** Which of `steps` precomputed levels a continuous level maps to. */
export function levelStep(t: number, steps: number): number {
  return Math.round(clamp01(t) * (steps - 1))
}

/** `steps` precomputed sounds, level 0 to 1 inclusive. Build once, index with `levelStep`. */
export function soundSteps(layers: readonly ToneRecipe[], steps: number): Tone[][] {
  return Array.from({ length: steps }, (_, i) => soundAt(layers, steps > 1 ? i / (steps - 1) : 0))
}
