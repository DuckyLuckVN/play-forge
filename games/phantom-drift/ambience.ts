// Mood over time: the rift's colour drifts slowly through cool hues, and a
// day/night cycle runs every few minutes. Pure functions of play time (sim
// ticks), so they freeze on pause and are unit-tested. Visual only.

import { clamp01, ease, lerp } from '@forge/fx/tween'

/** Rift hues stay cool (teal → violet): hazards are warm, so they always pop. */
export const RIFT_HUE_RANGE: readonly [number, number] = [170, 265]
/** Hazard hues (shard / wall / sweeper / faller), kept far from the rift's. */
export const HAZARD_HUES = [345, 330, 28, 285]
/** One rift-colour loop, seconds. */
const HUE_LOOP = 90

/** Rift hue at `seconds` of play: a slow, smooth back-and-forth. */
export function riftHue(seconds: number): number {
  const [lo, hi] = RIFT_HUE_RANGE
  const wave = 0.5 - 0.5 * Math.cos((seconds / HUE_LOOP) * Math.PI * 2)
  return lerp(lo + 8, hi - 25, wave)
}

/** A full night → dawn → day → dusk loop, seconds. */
export const DAY_CYCLE = 180
const NIGHT = 50
const DAWN = 25
const DAY = 80
// DUSK fills the rest (25 s).

export interface Ambience {
  /** 0 night … 1 full day. */
  daylight: number
  /** 0..1 sunrise/sunset orange-pink glow. */
  warmth: number
  /** Star visibility 0..1. */
  stars: number
  /** Sun height above the horizon, world units. */
  sunHeight: number
}

export function ambienceAt(seconds: number): Ambience {
  const t = ((seconds % DAY_CYCLE) + DAY_CYCLE) % DAY_CYCLE
  let daylight: number
  if (t < NIGHT) daylight = 0
  else if (t < NIGHT + DAWN) daylight = ease.inOutCubic((t - NIGHT) / DAWN)
  else if (t < NIGHT + DAWN + DAY) daylight = 1
  else daylight = 1 - ease.inOutCubic((t - NIGHT - DAWN - DAY) / (DAY_CYCLE - NIGHT - DAWN - DAY))
  // Warm glow peaks halfway through dawn and dusk.
  const warmth = Math.sin(daylight * Math.PI) ** 1.5
  return {
    daylight,
    warmth,
    stars: clamp01(1 - daylight * 1.6),
    sunHeight: lerp(30, 70, daylight),
  }
}
