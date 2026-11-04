// The song: tempo ranges you can pick, and the verse → build-up → drop loop
// every run follows. Pure functions of the beat number.

import { ramp } from '@forge/reflex'

export type Tempo = 'chill' | 'normal' | 'hyper'
export const TEMPOS: Record<Tempo, readonly [number, number]> = {
  chill: [90, 130],
  normal: [100, 150],
  hyper: [120, 175],
}
export const isTempo = (v: unknown): v is Tempo => typeof v === 'string' && v in TEMPOS

/** Tempo at a difficulty tier (0..maxTier). */
export const bpmAt = (tier: number, maxTier: number, tempo: Tempo = 'normal') =>
  Math.round(ramp(tier, maxTier, TEMPOS[tempo][0], TEMPOS[tempo][1]))

export type Section = 'intro' | 'verse' | 'build' | 'drop'

/** Music only, before anything happens. */
export const INTRO_BEATS = 8
/** One loop: 6 bars of verse, 2 of build-up, 4 of drop. */
export const VERSE_BEATS = 24
export const BUILD_BEATS = 8
export const DROP_BEATS = 16
export const CYCLE_BEATS = VERSE_BEATS + BUILD_BEATS + DROP_BEATS

export function sectionAt(beat: number): Section {
  if (beat < INTRO_BEATS) return 'intro'
  const b = (beat - INTRO_BEATS) % CYCLE_BEATS
  return b < VERSE_BEATS ? 'verse' : b < VERSE_BEATS + BUILD_BEATS ? 'build' : 'drop'
}

/** 0..1 through the current section (drives risers and glows). */
export function sectionProgress(beat: number): number {
  if (beat < INTRO_BEATS) return beat / INTRO_BEATS
  const b = (beat - INTRO_BEATS) % CYCLE_BEATS
  if (b < VERSE_BEATS) return b / VERSE_BEATS
  if (b < VERSE_BEATS + BUILD_BEATS) return (b - VERSE_BEATS) / BUILD_BEATS
  return (b - VERSE_BEATS - BUILD_BEATS) / DROP_BEATS
}
