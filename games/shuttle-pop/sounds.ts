// Shuttle Pop sound effects (synthesised, see @forge/audio/sound). Music is the stock ARCADE track.
import type { Sound, Tone } from '@forge/audio/sound'
import { CHARGE, isFull } from './charge'
import type { Grade } from './shots'
import type { SpEvent } from './sim'

const SMASH: Tone[] = [
  { freq: 4000, to: 300, dur: 0.16, wave: 'noise', vol: 0.65 },
  { freq: 220, to: 70, dur: 0.18, wave: 'square', vol: 0.25 },
  { freq: 1320, to: 660, dur: 0.08, wave: 'triangle', vol: 0.3 },
]
/** A charged hit's body: a low thwack under the strings' pop. */
const THWACK: Tone[] = [
  { freq: 180, to: 70, dur: 0.13, wave: 'sine', vol: 0.5 },
  { freq: 1400, to: 300, dur: 0.07, wave: 'noise', vol: 0.3 },
]

export const SHUTTLE_SOUNDS = {
  /** Racket through the air: plays on the release itself, before the state comes back. A tap's. */
  swing: { freq: 2600, to: 700, dur: 0.12, wave: 'noise', vol: 0.22 },
  /** A charged release: deeper and louder whooshes. */
  swingMid: [
    { freq: 2200, to: 450, dur: 0.15, wave: 'noise', vol: 0.32 },
    { freq: 150, to: 80, dur: 0.12, wave: 'sine', vol: 0.18 },
  ],
  swingFull: [
    { freq: 1800, to: 300, dur: 0.2, wave: 'noise', vol: 0.45 },
    { freq: 120, to: 55, dur: 0.18, wave: 'sine', vol: 0.3 },
  ],
  /** Charging: a whirr per stage (CHARGE.steps), each a step higher, then a bright ting at full. */
  charge1: [
    { freq: 220, to: 300, dur: 0.14, wave: 'triangle', vol: 0.14 },
    { freq: 500, to: 1100, dur: 0.14, wave: 'noise', vol: 0.08 },
  ],
  charge2: [
    { freq: 330, to: 470, dur: 0.14, wave: 'triangle', vol: 0.17 },
    { freq: 800, to: 1800, dur: 0.14, wave: 'noise', vol: 0.1 },
  ],
  chargeFull: [
    { freq: 1760, dur: 0.22, wave: 'sine', vol: 0.3 },
    { freq: 2637, dur: 0.3, wave: 'sine', vol: 0.18, at: 0.03 },
    { freq: 520, to: 700, dur: 0.12, wave: 'triangle', vol: 0.14 },
  ],
  /** Strings + cork: a short plucky pop, brighter with a better grade. */
  late: [
    { freq: 520, to: 300, dur: 0.07, wave: 'triangle', vol: 0.35 },
    { freq: 900, to: 400, dur: 0.05, wave: 'noise', vol: 0.2 },
  ],
  good: [
    { freq: 880, to: 520, dur: 0.07, wave: 'triangle', vol: 0.4 },
    { freq: 1800, to: 900, dur: 0.05, wave: 'noise', vol: 0.25 },
  ],
  perfect: [
    { freq: 1175, to: 880, dur: 0.06, wave: 'triangle', vol: 0.45 },
    { freq: 2400, to: 1200, dur: 0.05, wave: 'noise', vol: 0.25 },
    { freq: 1568, dur: 0.06, wave: 'sine', vol: 0.3, at: 0.05 },
    { freq: 2093, dur: 0.12, wave: 'sine', vol: 0.28, at: 0.1 },
  ],
  smash: SMASH,
  /** Full-charge Perfect smash: the crack, a punchy low boom and the crowd's "ooh". */
  powerSmash: [
    ...SMASH,
    { freq: 95, to: 38, dur: 0.38, wave: 'sine', vol: 0.6 },
    { freq: 260, to: 60, dur: 0.12, wave: 'square', vol: 0.18 },
    { freq: 700, to: 1000, dur: 0.55, wave: 'noise', vol: 0.2, at: 0.12 },
    { freq: 380, to: 300, dur: 0.5, wave: 'triangle', vol: 0.05, at: 0.14 },
  ],
  serve: { freq: 700, to: 480, dur: 0.06, wave: 'triangle', vol: 0.3 },
  net: [
    { freq: 300, to: 90, dur: 0.16, wave: 'noise', vol: 0.45 },
    { freq: 140, to: 80, dur: 0.14, wave: 'sine', vol: 0.35 },
  ],
  land: { freq: 1200, to: 500, dur: 0.05, wave: 'noise', vol: 0.3 },
  pointWin: [
    { freq: 659, dur: 0.08, wave: 'square', vol: 0.14 },
    { freq: 784, dur: 0.08, wave: 'square', vol: 0.14, at: 0.08 },
    { freq: 1047, dur: 0.18, wave: 'square', vol: 0.14, at: 0.16 },
  ],
  pointLose: [
    { freq: 523, dur: 0.1, wave: 'triangle', vol: 0.25 },
    { freq: 392, to: 370, dur: 0.22, wave: 'triangle', vol: 0.25, at: 0.1 },
  ],
  /** Crowd roar after a long rally: wide noise swell. */
  cheer: [
    { freq: 1800, to: 2600, dur: 0.6, wave: 'noise', vol: 0.3 },
    { freq: 900, to: 1400, dur: 0.8, wave: 'noise', vol: 0.22, at: 0.05 },
  ],
} satisfies Record<string, Sound>

/** The opponent's racket sounds are a little further away. */
const THEIRS = 0.7
/** A hit charged at least this much adds the thwack; volume grows by up to POWER_VOL share. */
const THWACK_FROM = 0.34
const POWER_VOL = 0.3

/** The grade's pop with the thwack under it (built once). */
const CHARGED: Record<Grade, Sound> = {
  late: [...SHUTTLE_SOUNDS.late, ...THWACK],
  good: [...SHUTTLE_SOUNDS.good, ...THWACK],
  perfect: [...SHUTTLE_SOUNDS.perfect, ...THWACK],
}

/** The release whoosh for a swing charged `charge` (0 = a tap). */
export function swingSound(charge: number): Sound {
  if (isFull(charge)) return SHUTTLE_SOUNDS.swingFull
  return charge >= THWACK_FROM ? SHUTTLE_SOUNDS.swingMid : SHUTTLE_SOUNDS.swing
}

const CHARGE_STAGES: readonly Sound[] = [
  SHUTTLE_SOUNDS.charge1,
  SHUTTLE_SOUNDS.charge2,
  SHUTTLE_SOUNDS.chargeFull,
]

/** The sound for reaching charge stage `stage` (charge.ts chargeStage; 0 = nothing yet → null). */
export function chargeSound(stage: number): Sound | null {
  if (stage <= 0) return null
  return CHARGE_STAGES[Math.min(stage, CHARGE.steps.length) - 1]
}

/**
 * The sound for one new sim event, from `localSide`'s point of view (spectators: side 0), with its
 * volume. Null = silent (a whiff: the swing already whooshed).
 */
export function eventSound(e: SpEvent, localSide: 0 | 1): { sound: Sound; vol: number } | null {
  switch (e.k) {
    case 'hit': {
      const c = e.charge ?? 0
      const sound =
        e.shot === 'smash'
          ? isFull(c) && e.grade === 'perfect'
            ? SHUTTLE_SOUNDS.powerSmash
            : SHUTTLE_SOUNDS.smash
          : c >= THWACK_FROM
            ? CHARGED[e.grade]
            : SHUTTLE_SOUNDS[e.grade]
      return { sound, vol: (e.side === localSide ? 1 : THEIRS) * (1 + POWER_VOL * c) }
    }
    case 'serve':
      return { sound: SHUTTLE_SOUNDS.serve, vol: e.side === localSide ? 1 : THEIRS }
    case 'net':
      return { sound: SHUTTLE_SOUNDS.net, vol: 1 }
    case 'land':
      return { sound: SHUTTLE_SOUNDS.land, vol: e.in ? 1 : 0.6 }
    case 'point':
      return { sound: e.side === localSide ? SHUTTLE_SOUNDS.pointWin : SHUTTLE_SOUNDS.pointLose, vol: 1 }
    case 'whiff':
      return null
  }
}
