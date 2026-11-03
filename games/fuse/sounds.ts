import type { Track } from '@forge/audio/music'
import type { Sound } from '@forge/audio/sound'
import { mergeFreq } from './look'

export const FUSE_SOUNDS = {
  /** A soft swish for every slide. */
  slide: { freq: 2600, to: 900, dur: 0.07, wave: 'noise', vol: 0.12 },
  /** Bumped into a wall: nothing moved. */
  bonk: { freq: 160, to: 120, dur: 0.06, wave: 'triangle', vol: 0.25 },
  rockLand: [
    { freq: 140, to: 60, dur: 0.18, wave: 'triangle', vol: 0.55 },
    { freq: 900, to: 200, dur: 0.12, wave: 'noise', vol: 0.3 },
  ],
  crack: { freq: 3800, to: 1200, dur: 0.06, wave: 'noise', vol: 0.32 },
  smash: [
    { freq: 1800, to: 300, dur: 0.28, wave: 'noise', vol: 0.5 },
    { freq: 120, to: 50, dur: 0.22, wave: 'square', vol: 0.18 },
  ],
  blast: [
    { freq: 900, to: 80, dur: 0.5, wave: 'noise', vol: 0.7 },
    { freq: 110, to: 40, dur: 0.45, wave: 'sawtooth', vol: 0.3 },
  ],
  arm: { freq: 500, to: 900, dur: 0.12, wave: 'square', vol: 0.18 },
  charged: [
    { freq: 660, dur: 0.07, wave: 'square', vol: 0.22 },
    { freq: 990, dur: 0.07, wave: 'square', vol: 0.22, at: 0.07 },
    { freq: 1320, dur: 0.14, wave: 'square', vol: 0.22, at: 0.14 },
  ],
  /** Rocks sent to the others. */
  send: { freq: 300, to: 1200, dur: 0.22, wave: 'sawtooth', vol: 0.2 },
  blocked: [
    { freq: 1500, dur: 0.05, wave: 'triangle', vol: 0.35 },
    { freq: 2000, dur: 0.1, wave: 'triangle', vol: 0.3, at: 0.05 },
  ],
  incoming: [
    { freq: 420, to: 300, dur: 0.12, wave: 'sawtooth', vol: 0.22 },
    { freq: 420, to: 300, dur: 0.12, wave: 'sawtooth', vol: 0.22, at: 0.15 },
  ],
  undo: { freq: 900, to: 300, dur: 0.18, wave: 'triangle', vol: 0.35 },
  stuck: [
    { freq: 392, dur: 0.16, wave: 'triangle', vol: 0.35 },
    { freq: 330, dur: 0.16, wave: 'triangle', vol: 0.35, at: 0.16 },
    { freq: 262, dur: 0.36, wave: 'triangle', vol: 0.35, at: 0.32 },
  ],
} satisfies Record<string, Sound>

/** A bright pluck whose pitch climbs with the tile: the bigger the fuse, the higher the note. */
export function mergeSound(tier: number): Sound {
  const f = mergeFreq(tier)
  return [
    { freq: f, dur: 0.12, wave: 'triangle', vol: 0.42 },
    { freq: f * 2, dur: 0.08, wave: 'sine', vol: 0.18, at: 0.01 },
  ]
}

/** Combos ring a quick rising arpeggio from the top merge. */
export function comboSound(tier: number, combo: number): Sound {
  const f = mergeFreq(tier)
  return Array.from({ length: Math.min(5, combo) }, (_, i) => ({
    freq: f * [1, 1.25, 1.5, 2, 2.5][i],
    dur: 0.09,
    wave: 'square' as const,
    vol: 0.16,
    at: 0.05 + i * 0.055,
  }))
}

/** A new best tile: a little fanfare. */
export function recordSound(tier: number): Sound {
  const f = mergeFreq(tier) / 2
  return [
    { freq: f, dur: 0.1, wave: 'square', vol: 0.25 },
    { freq: f * 1.25, dur: 0.1, wave: 'square', vol: 0.25, at: 0.1 },
    { freq: f * 1.5, dur: 0.1, wave: 'square', vol: 0.25, at: 0.2 },
    { freq: f * 2, dur: 0.32, wave: 'square', vol: 0.28, at: 0.3 },
    { freq: f * 4, dur: 0.3, wave: 'sine', vol: 0.15, at: 0.3 },
  ]
}

const bars = (...b: string[]) => b.join(' ')

/** Bouncy, bright and light: keeps you moving without getting in the way. C G Am F. */
export const BOUNCE: Track = {
  name: 'fuse-bounce',
  bpm: 112,
  parts: [
    { instrument: 'kick', vol: 0.5, steps: 'x . . . x . . . x . . . x . . .' },
    { instrument: 'hat', vol: 0.2, steps: '. . x . . . x . . . x . . . x x' },
    { instrument: 'snare', vol: 0.3, steps: '. . . . x . . . . . . . x . . .' },
    {
      instrument: 'bass',
      vol: 0.55,
      steps: bars('C2 . C3 . G2 . C3 .', 'G1 . G2 . D2 . G2 .', 'A1 . A2 . E2 . A2 .', 'F1 . F2 . C2 . F2 .'),
    },
    {
      instrument: 'pluck',
      vol: 0.38,
      steps: bars(
        'E5 . G5 . C6 . G5 .',
        'D5 . G5 . B5 . G5 .',
        'C5 . E5 . A5 . E5 .',
        'C5 . F5 . A5 . C6 .',
        'E5 . G5 . C6 . D6 .',
        'B5 . G5 . D5 . G5 .',
        'A5 . E5 . C5 . E5 .',
        'F5 - - . E5 . D5 .',
      ),
    },
  ],
}
