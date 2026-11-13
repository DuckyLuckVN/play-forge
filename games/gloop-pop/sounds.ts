import type { Track } from '@forge/audio/music'
import type { Sound } from '@forge/audio/sound'
import { chainFreq, popStagger, type ComboWord } from './look'

export const GLOOP_SOUNDS = {
  move: { freq: 1100, dur: 0.03, wave: 'square', vol: 0.08 },
  rotate: { freq: 900, to: 1500, dur: 0.06, wave: 'triangle', vol: 0.2 },
  blocked: { freq: 180, to: 140, dur: 0.05, wave: 'triangle', vol: 0.18 },
  /** A capsule settling into place. */
  land: [
    { freq: 220, to: 110, dur: 0.08, wave: 'triangle', vol: 0.35 },
    { freq: 1400, to: 500, dur: 0.04, wave: 'noise', vol: 0.12 },
  ],
  /** A hard drop: whoosh then thump. */
  slam: [
    { freq: 3000, to: 600, dur: 0.07, wave: 'noise', vol: 0.18 },
    { freq: 160, to: 55, dur: 0.16, wave: 'triangle', vol: 0.55, at: 0.05 },
  ],
  /** Gloops squeak as they burst. */
  squeak: [
    { freq: 1300, to: 420, dur: 0.14, wave: 'square', vol: 0.12 },
    { freq: 800, to: 2000, dur: 0.08, wave: 'sine', vol: 0.18, at: 0.06 },
  ],
  /** Junk sent to the rivals. */
  send: { freq: 300, to: 1300, dur: 0.24, wave: 'sawtooth', vol: 0.2 },
  /** Junk raining into your jar. */
  junk: [
    { freq: 520, to: 260, dur: 0.1, wave: 'sawtooth', vol: 0.2 },
    { freq: 520, to: 260, dur: 0.1, wave: 'sawtooth', vol: 0.2, at: 0.12 },
    { freq: 520, to: 260, dur: 0.1, wave: 'sawtooth', vol: 0.2, at: 0.24 },
  ],
  /** Soft alarm while the jar is nearly full. */
  danger: [
    { freq: 880, dur: 0.08, wave: 'triangle', vol: 0.14 },
    { freq: 660, dur: 0.1, wave: 'triangle', vol: 0.14, at: 0.1 },
  ],
  /** Jar clear: a bright fanfare. */
  clear: [
    { freq: 523, dur: 0.1, wave: 'square', vol: 0.24 },
    { freq: 659, dur: 0.1, wave: 'square', vol: 0.24, at: 0.1 },
    { freq: 784, dur: 0.1, wave: 'square', vol: 0.24, at: 0.2 },
    { freq: 1047, dur: 0.18, wave: 'square', vol: 0.26, at: 0.3 },
    { freq: 784, dur: 0.08, wave: 'square', vol: 0.2, at: 0.5 },
    { freq: 1047, dur: 0.42, wave: 'square', vol: 0.28, at: 0.58 },
    { freq: 2093, dur: 0.4, wave: 'sine', vol: 0.14, at: 0.58 },
  ],
  /** A colour's last gloop is gone. */
  colorDone: [
    { freq: 1568, dur: 0.07, wave: 'sine', vol: 0.22 },
    { freq: 2093, dur: 0.16, wave: 'sine', vol: 0.22, at: 0.07 },
  ],
  newJar: [
    { freq: 392, dur: 0.08, wave: 'triangle', vol: 0.28 },
    { freq: 523, dur: 0.08, wave: 'triangle', vol: 0.28, at: 0.09 },
    { freq: 659, dur: 0.16, wave: 'triangle', vol: 0.28, at: 0.18 },
  ],
  /** Junk is on its way to you: a quick alarm chirp. */
  warn: [
    { freq: 1200, to: 900, dur: 0.07, wave: 'square', vol: 0.14 },
    { freq: 1200, to: 900, dur: 0.07, wave: 'square', vol: 0.14, at: 0.09 },
  ],
  /** The last gloop in the jar: a rising "here it comes". */
  lastOne: { freq: 400, to: 1600, dur: 0.35, wave: 'triangle', vol: 0.22 },
  out: [
    { freq: 392, to: 370, dur: 0.18, wave: 'triangle', vol: 0.35 },
    { freq: 330, to: 311, dur: 0.18, wave: 'triangle', vol: 0.35, at: 0.2 },
    { freq: 262, to: 196, dur: 0.5, wave: 'triangle', vol: 0.35, at: 0.4 },
  ],
} satisfies Record<string, Sound>

/** A line lights up: a bubbly blip that climbs with the chain. */
export function matchSound(chain: number): Sound {
  const f = chainFreq(chain)
  return [
    { freq: f, to: f * 1.5, dur: 0.1, wave: 'sine', vol: 0.32 },
    { freq: f * 2, dur: 0.06, wave: 'triangle', vol: 0.12, at: 0.05 },
  ]
}

/** The pop's splash, plus a quick arpeggio on chains. */
export function popSound(chain: number): Sound {
  const f = chainFreq(chain)
  // The bloops themselves are popSequence(); this is the splash and the chain's arpeggio.
  const tones: Sound = [{ freq: 2400, to: 700, dur: 0.12, wave: 'noise', vol: 0.18, at: 0.02 }]
  for (let i = 1; i < Math.min(5, chain); i++)
    tones.push({
      freq: f * [1, 1.25, 1.5, 2, 2.5][i],
      dur: 0.08,
      wave: 'square',
      vol: 0.14,
      at: 0.06 + i * 0.06,
    })
  return tones
}

const bars = (...b: string[]) => b.join(' ')

/** Bubbly lab funk: bouncy bass, plucky hook. Am F C G. */
export const FIZZ: Track = {
  name: 'gloop-fizz',
  bpm: 124,
  parts: [
    { instrument: 'kick', vol: 0.5, steps: 'x . . . x . . . x . . . x . x .' },
    { instrument: 'hat', vol: 0.18, steps: '. x . x . x . x . x . x . x x x' },
    { instrument: 'snare', vol: 0.3, steps: '. . . . x . . . . . . . x . . .' },
    {
      instrument: 'bass',
      vol: 0.55,
      steps: bars(
        'A1 . A2 A1 . A2 G2 .',
        'F1 . F2 F1 . F2 E2 .',
        'C2 . C3 C2 . C3 B2 .',
        'G1 . G2 G1 . G2 B1 .',
      ),
    },
    {
      instrument: 'pluck',
      vol: 0.34,
      steps: bars(
        'A4 C5 E5 . A5 . E5 .',
        'F4 A4 C5 . F5 . C5 .',
        'E4 G4 C5 . E5 . G5 .',
        'D5 . B4 . G4 . B4 .',
        'A4 C5 E5 . A5 . B5 .',
        'C6 . A5 . F5 . A5 .',
        'G5 . E5 . C5 . E5 .',
        'D5 - - . B4 . G4 .',
      ),
    },
  ],
}

/** One bloop per cell, one after another (timed like the bursts on screen), rising with each pop. */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]
export function popSequence(chain: number, gloops: boolean[]): Sound {
  const base = chainFreq(chain) / 2
  const step = popStagger(gloops.length)
  return gloops.flatMap((gloop, k) => {
    const f = base * 2 ** (PENTA[Math.min(PENTA.length - 1, k)] / 12)
    const at = k * step
    return gloop
      ? [
          { freq: f, to: f * 2.2, dur: 0.09, wave: 'sine' as const, vol: 0.34, at },
          { freq: f * 3, to: f, dur: 0.06, wave: 'square' as const, vol: 0.06, at },
        ]
      : [{ freq: f * 1.5, to: f * 2.5, dur: 0.05, wave: 'sine' as const, vol: 0.2, at }]
  })
}

/** Cheers for popping several gloops with one capsule: bigger word, bigger fanfare. */
export function comboSound(word: ComboWord): Sound {
  const notes =
    word === 'double' ? [784, 1047] : word === 'triple' ? [659, 784, 1047] : [523, 659, 784, 1047, 1319]
  const tones: Sound = notes.map((freq, k) => ({
    freq,
    dur: 0.08,
    wave: 'square' as const,
    vol: 0.2,
    at: 0.25 + k * 0.07,
  }))
  if (word === 'mega')
    tones.push({ freq: 2093, dur: 0.4, wave: 'sine', vol: 0.16, at: 0.25 + notes.length * 0.07 })
  return tones
}

/** The same groove, faster and with busier drums, while the bottle is nearly full. */
export const FIZZ_PANIC: Track = {
  ...FIZZ,
  name: 'gloop-panic',
  bpm: 156,
  parts: [
    ...FIZZ.parts.filter((p) => p.instrument !== 'hat'),
    { instrument: 'hat', vol: 0.22, steps: 'x x x x x x x x x x x x x x x x' },
  ],
}
