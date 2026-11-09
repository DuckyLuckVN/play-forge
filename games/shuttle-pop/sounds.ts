// Shuttle Pop sound effects (synthesised, see @forge/audio/sound). Music is the stock ARCADE track.
import type { Sound } from '@forge/audio/sound'
import type { SpEvent } from './sim'

export const SHUTTLE_SOUNDS = {
  /** Racket through the air: plays on the key press itself, before the state comes back. */
  swing: { freq: 2600, to: 700, dur: 0.12, wave: 'noise', vol: 0.22 },
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
  smash: [
    { freq: 4000, to: 300, dur: 0.16, wave: 'noise', vol: 0.65 },
    { freq: 220, to: 70, dur: 0.18, wave: 'square', vol: 0.25 },
    { freq: 1320, to: 660, dur: 0.08, wave: 'triangle', vol: 0.3 },
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

/**
 * The sound for one new sim event, from `localSide`'s point of view (spectators: side 0), with its
 * volume. Null = silent (a whiff: the swing already whooshed).
 */
export function eventSound(e: SpEvent, localSide: 0 | 1): { sound: Sound; vol: number } | null {
  switch (e.k) {
    case 'hit': {
      const sound = e.shot === 'smash' ? SHUTTLE_SOUNDS.smash : SHUTTLE_SOUNDS[e.grade]
      return { sound, vol: e.side === localSide ? 1 : THEIRS }
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
