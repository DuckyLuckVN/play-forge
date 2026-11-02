import type { Track } from '@forge/audio/music'
import type { Sound } from '@forge/audio/sound'

// Pen-on-paper feel: a short scratch of filtered noise plus a soft knock.
// X and O sit a fifth apart so you can hear whose stone landed.
export const CARO_SOUNDS = {
  placeX: [
    { freq: 5200, to: 2600, dur: 0.05, wave: 'noise', vol: 0.32 },
    { freq: 520, to: 420, dur: 0.07, wave: 'triangle', vol: 0.45, at: 0.01 },
  ],
  placeO: [
    { freq: 4200, to: 2200, dur: 0.06, wave: 'noise', vol: 0.3 },
    { freq: 350, to: 290, dur: 0.08, wave: 'triangle', vol: 0.45, at: 0.01 },
  ],
  /** Someone is one stone from five. */
  four: [
    { freq: 880, dur: 0.07, wave: 'square', vol: 0.25 },
    { freq: 1175, dur: 0.1, wave: 'square', vol: 0.25, at: 0.08 },
  ],
  /** The opponent is one stone from five: lower and more urgent. */
  danger: [
    { freq: 300, to: 250, dur: 0.12, wave: 'sawtooth', vol: 0.22 },
    { freq: 300, to: 250, dur: 0.12, wave: 'sawtooth', vol: 0.22, at: 0.15 },
  ],
  /** The winning line is struck through. */
  strike: [
    { freq: 300, to: 1400, dur: 0.32, wave: 'sawtooth', vol: 0.18 },
    { freq: 7000, to: 3000, dur: 0.28, wave: 'noise', vol: 0.2 },
  ],
  undo: { freq: 700, to: 320, dur: 0.14, wave: 'triangle', vol: 0.4 },
  /** Last seconds of a timed turn. */
  clock: { freq: 1320, dur: 0.04, wave: 'square', vol: 0.16 },
  timeout: [
    { freq: 440, dur: 0.1, wave: 'square', vol: 0.3 },
    { freq: 330, dur: 0.18, wave: 'square', vol: 0.3, at: 0.1 },
  ],
  pen: { freq: 1800, to: 2400, dur: 0.04, wave: 'triangle', vol: 0.18 },
  erase: { freq: 6000, to: 900, dur: 0.22, wave: 'noise', vol: 0.3 },
} satisfies Record<string, Sound>

const bars = (...b: string[]) => b.join(' ')

/** Unhurried thinking music: soft pads and a sparse pluck. Dm9 Bbmaj7 Fmaj7 C6. */
export const STUDY: Track = {
  name: 'caro-study',
  bpm: 76,
  parts: [
    {
      instrument: 'pad',
      vol: 0.7,
      steps: bars(
        'D3+F3+A3+E4 - - - - - - -',
        'Bb2+D3+F3+A3 - - - - - - -',
        'F3+A3+C4+E4 - - - - - - -',
        'C3+E3+G3+A3 - - - - - - -',
      ),
    },
    {
      instrument: 'bass',
      vol: 0.6,
      steps: bars('D2 - - . A2 - . .', 'Bb1 - - . F2 - . .', 'F2 - - . C3 - . .', 'C2 - - . G2 - . .'),
    },
    {
      instrument: 'pluck',
      vol: 0.4,
      steps: bars(
        'A4 . . E5 . . D5 .',
        'F4 . . A4 . C5 . .',
        'C5 . . E5 . . G5 .',
        'E5 - . . D5 . . .',
        'A4 . . F5 . . E5 .',
        'D5 . . C5 . A4 . .',
        'G4 . . A4 . . C5 .',
        'A4 - - . . . . .',
      ),
    },
    { instrument: 'hat', vol: 0.18, steps: '. . . . x . . .' },
  ],
}
