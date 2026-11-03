import type { Sound } from '@forge/audio/sound'
import type { Track } from '@forge/audio/music'

const bars = (...b: string[]) => b.join(' ')

export const DRIFT_SOUNDS = {
  move: { freq: 520, to: 700, dur: 0.05, wave: 'sine', vol: 0.18 },
  wisp: [
    { freq: 880, dur: 0.05, wave: 'sine', vol: 0.3 },
    { freq: 1320, dur: 0.08, wave: 'sine', vol: 0.3, at: 0.04 },
  ],
  nearMiss: [
    { freq: 3000, to: 900, dur: 0.12, wave: 'noise', vol: 0.35 },
    { freq: 1500, to: 2400, dur: 0.1, wave: 'triangle', vol: 0.25 },
  ],
  hit: [
    { freq: 2000, to: 150, dur: 0.35, wave: 'noise', vol: 0.7 },
    { freq: 180, to: 60, dur: 0.3, wave: 'sawtooth', vol: 0.3 },
  ],
  slam: { freq: 400, to: 40, dur: 0.18, wave: 'noise', vol: 0.45 },
  charged: [
    { freq: 660, dur: 0.06, wave: 'triangle', vol: 0.3 },
    { freq: 880, dur: 0.06, wave: 'triangle', vol: 0.3, at: 0.06 },
    { freq: 1320, dur: 0.12, wave: 'triangle', vol: 0.3, at: 0.12 },
  ],
  phantom: [
    { freq: 200, to: 1200, dur: 0.35, wave: 'sine', vol: 0.35 },
    { freq: 300, to: 1800, dur: 0.35, wave: 'triangle', vol: 0.15 },
  ],
  phantomEnd: { freq: 900, to: 300, dur: 0.25, wave: 'sine', vol: 0.25 },
  heal: [
    { freq: 523, dur: 0.08, wave: 'triangle', vol: 0.3 },
    { freq: 784, dur: 0.14, wave: 'triangle', vol: 0.3, at: 0.08 },
  ],
  tier: [
    { freq: 440, to: 880, dur: 0.2, wave: 'square', vol: 0.15 },
    { freq: 660, to: 1320, dur: 0.2, wave: 'square', vol: 0.1, at: 0.05 },
  ],
} satisfies Record<string, Sound>

/** Dark, driving synthwave loop. Dm Bb F C. */
export const DRIFT_TRACK: Track = {
  name: 'drift',
  bpm: 128,
  parts: [
    {
      instrument: 'bass',
      steps: bars(
        'D2 D2 D3 D2 D2 D3 D2 D3',
        'A#1 A#1 A#2 A#1 A#1 A#2 A#1 A#2',
        'F2 F2 F3 F2 F2 F3 F2 F3',
        'C2 C2 C3 C2 C2 C3 C2 C3',
      ),
    },
    {
      instrument: 'pluck',
      vol: 0.55,
      steps: bars(
        'A4 D5 F5 A5 F5 D5 A4 D5',
        'F4 A#4 D5 F5 D5 A#4 F4 A#4',
        'A4 C5 F5 A5 F5 C5 A4 C5',
        'G4 C5 E5 G5 E5 C5 G4 E5',
      ),
    },
    {
      instrument: 'pad',
      vol: 0.4,
      steps: bars(
        'D3+F3+A3 - - - - - - -',
        'A#2+D3+F3 - - - - - - -',
        'F3+A3+C4 - - - - - - -',
        'C3+E3+G3 - - - - - - -',
      ),
    },
    { instrument: 'kick', vol: 0.55, steps: 'x . . . x . . . x . . . x . . .' },
    { instrument: 'snare', vol: 0.35, steps: '. . . . x . . . . . . . x . . .' },
    { instrument: 'hat', vol: 0.25, steps: '. . x . . . x . . . x . . . x x' },
  ],
}
