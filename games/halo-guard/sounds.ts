import type { Sound } from '@forge/audio/sound'
import type { Track } from '@forge/audio/music'
import type { Dir, GuardEvent, GuardState } from './sim'

const bars = (...b: string[]) => b.join(' ')
const semis = (n: number) => 2 ** (n / 12)

/** Each lane has its own pitch, so a launch tells you where by ear too. */
const LANE_PITCH: Record<Dir, number> = { 0: 1320, 1: 990, 2: 660, 3: 880 }

export const GUARD_SOUNDS = {
  turn: { freq: 300, to: 520, dur: 0.05, wave: 'triangle', vol: 0.14 },
  block: [
    { freq: 1800, to: 600, dur: 0.06, wave: 'square', vol: 0.18 },
    { freq: 2600, to: 900, dur: 0.08, wave: 'noise', vol: 0.3 },
  ],
  heavyBlock: [
    { freq: 220, to: 70, dur: 0.22, wave: 'sine', vol: 0.6 },
    { freq: 1400, to: 300, dur: 0.15, wave: 'noise', vol: 0.4 },
  ],
  fizzle: { freq: 900, to: 200, dur: 0.18, wave: 'noise', vol: 0.25 },
  hop: [
    { freq: 500, to: 900, dur: 0.07, wave: 'sine', vol: 0.18 },
    { freq: 900, to: 450, dur: 0.07, wave: 'sine', vol: 0.18, at: 0.07 },
  ],
  hit: [
    { freq: 2600, to: 300, dur: 0.3, wave: 'noise', vol: 0.65 },
    { freq: 160, to: 55, dur: 0.3, wave: 'sawtooth', vol: 0.3 },
  ],
  charged: [
    { freq: 660, dur: 0.06, wave: 'triangle', vol: 0.3 },
    { freq: 880, dur: 0.06, wave: 'triangle', vol: 0.3, at: 0.06 },
    { freq: 1320, dur: 0.12, wave: 'triangle', vol: 0.3, at: 0.12 },
  ],
  nova: [
    { freq: 80, to: 30, dur: 0.6, wave: 'sine', vol: 0.8 },
    { freq: 200, to: 2000, dur: 0.5, wave: 'sawtooth', vol: 0.12 },
    { freq: 5000, to: 400, dur: 0.6, wave: 'noise', vol: 0.4 },
  ],
  novaEnd: { freq: 900, to: 300, dur: 0.25, wave: 'sine', vol: 0.2 },
  heal: [
    { freq: 523, dur: 0.08, wave: 'triangle', vol: 0.3 },
    { freq: 784, dur: 0.14, wave: 'triangle', vol: 0.3, at: 0.08 },
  ],
  tier: [
    { freq: 440, to: 880, dur: 0.2, wave: 'square', vol: 0.15 },
    { freq: 300, to: 1500, dur: 0.45, wave: 'sawtooth', vol: 0.08 },
    { freq: 600, to: 3000, dur: 0.45, wave: 'noise', vol: 0.12 },
  ],
  die: [
    { freq: 900, to: 60, dur: 1.4, wave: 'sawtooth', vol: 0.16 },
    { freq: 120, to: 30, dur: 0.6, wave: 'sine', vol: 0.7 },
    { freq: 3000, to: 200, dur: 0.5, wave: 'noise', vol: 0.45 },
  ],
  heartbeat: [
    { freq: 70, to: 45, dur: 0.12, wave: 'sine', vol: 0.6 },
    { freq: 65, to: 40, dur: 0.14, wave: 'sine', vol: 0.5, at: 0.18 },
  ],
  fanfare: [
    { freq: 523, dur: 0.1, wave: 'square', vol: 0.14 },
    { freq: 659, dur: 0.1, wave: 'square', vol: 0.14, at: 0.08 },
    { freq: 784, dur: 0.1, wave: 'square', vol: 0.14, at: 0.16 },
    { freq: 1047, dur: 0.28, wave: 'triangle', vol: 0.2, at: 0.24 },
  ],
} satisfies Record<string, Sound>

/** Launch blip: quiet, pitched by lane; heavies lower, sparks sparkly. */
export function launchSound(dir: Dir, kind: string): Sound {
  const f = LANE_PITCH[dir] * (kind === 'heavy' ? 0.5 : 1)
  if (kind === 'spark') return { freq: f * 1.5, to: f * 2, dur: 0.06, wave: 'sine', vol: 0.1 }
  return { freq: f, to: f * 0.8, dur: 0.05, wave: 'triangle', vol: 0.07 }
}

/** Perfect parry: a bright chime that climbs a semitone per combo step. */
export function perfectSound(combo: number): Sound {
  const f = 1046 * semis(Math.min(combo, 12))
  return [
    { freq: f, dur: 0.06, wave: 'sine', vol: 0.32 },
    { freq: f * 1.5, dur: 0.14, wave: 'sine', vol: 0.26, at: 0.05 },
    { freq: 3000, to: 1200, dur: 0.08, wave: 'noise', vol: 0.2 },
  ]
}

export function sparkSound(combo: number): Sound {
  const f = 1568 * semis(Math.min(combo, 12) / 2)
  return [
    { freq: f, dur: 0.04, wave: 'sine', vol: 0.22 },
    { freq: f * 1.26, dur: 0.04, wave: 'sine', vol: 0.22, at: 0.04 },
    { freq: f * 1.5, dur: 0.1, wave: 'sine', vol: 0.22, at: 0.08 },
  ]
}

export function multiplierSound(mult: number): Sound {
  const notes = [523, 659, 784, 1047, 1319]
  return notes.slice(0, Math.min(mult + 1, notes.length)).map((freq, i) => ({
    freq,
    dur: 0.09,
    wave: 'square' as const,
    vol: 0.16,
    at: i * 0.06,
  }))
}

export function eventSound(e: GuardEvent, s: GuardState): Sound | null {
  switch (e.type) {
    case 'launch':
      return launchSound(e.dir, e.kind)
    case 'block':
      if (e.perfect) return perfectSound(s.vitals.combo)
      return e.kind === 'heavy' ? GUARD_SOUNDS.heavyBlock : GUARD_SOUNDS.block
    case 'spark':
      return sparkSound(s.vitals.combo)
    case 'multiplier':
      return multiplierSound(e.mult)
    case 'turn':
    case 'fizzle':
    case 'hop':
    case 'hit':
    case 'charged':
    case 'nova':
    case 'novaEnd':
    case 'heal':
    case 'tier':
    case 'die':
      return GUARD_SOUNDS[e.type]
    default:
      return null
  }
}

/** Ticks between heartbeats on the last heart. */
export const HEARTBEAT_TICKS = 54

/** Tense, pulsing loop. Em C G D. */
export const GUARD_TRACK: Track = {
  name: 'halo-guard',
  bpm: 116,
  parts: [
    {
      instrument: 'bass',
      steps: bars(
        'E2 . E2 E3 . E2 E3 .',
        'C2 . C2 C3 . C2 C3 .',
        'G1 . G1 G2 . G1 G2 .',
        'D2 . D2 D3 . D2 D3 .',
      ),
    },
    {
      instrument: 'pluck',
      vol: 0.45,
      steps: bars(
        'B4 E5 G5 B5 G5 E5 B4 E5',
        'C5 E5 G5 C6 G5 E5 C5 E5',
        'B4 D5 G5 B5 G5 D5 B4 D5',
        'A4 D5 F#5 A5 F#5 D5 A4 F#5',
      ),
    },
    {
      instrument: 'pad',
      vol: 0.35,
      steps: bars(
        'E3+G3+B3 - - - - - - -',
        'C3+E3+G3 - - - - - - -',
        'G2+B2+D3 - - - - - - -',
        'D3+F#3+A3 - - - - - - -',
      ),
    },
    { instrument: 'kick', vol: 0.5, steps: 'x . . . x . . . x . . . x . x .' },
    { instrument: 'snare', vol: 0.3, steps: '. . . . x . . . . . . . x . . .' },
    { instrument: 'hat', vol: 0.22, steps: 'x x x x x x x x x x x x x x x x' },
  ],
}
