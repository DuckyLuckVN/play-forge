import type { Sound } from '@forge/audio/sound'
import type { Track } from '@forge/audio/music'
import { TICK_RATE, type DriftEvent, type DriftState } from './sim'

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

// ---------- Sounds that change with play ----------

const semis = (n: number) => 2 ** (n / 12)

/** Wisp chime climbs a semitone per combo step (up to an octave). */
export function wispSound(combo: number): Sound {
  const f = 880 * semis(Math.min(combo, 12))
  return [
    { freq: f, dur: 0.05, wave: 'sine', vol: 0.3 },
    { freq: f * 1.5, dur: 0.09, wave: 'sine', vol: 0.28, at: 0.04 },
  ]
}

/** Near-miss whoosh rises with combo. */
export function nearMissSound(combo: number): Sound {
  const lift = semis(Math.min(combo, 16))
  return [
    { freq: 3200, to: 700, dur: 0.14, wave: 'noise', vol: 0.4 },
    { freq: 1200 * lift, to: 2200 * lift, dur: 0.11, wave: 'triangle', vol: 0.22 },
  ]
}

/** Multiplier up: an arpeggio one note longer per level. */
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

/**
 * Faller warning: beeps that speed up and rise in pitch until the slam,
 * `seconds` from now. Each gap halves, so the last beep lands just before impact.
 */
export function warnBeeps(seconds: number): Sound {
  const tones = []
  let at = 0
  let gap = seconds / 2
  for (let i = 0; i < 5 && at < seconds - 0.03; i++) {
    tones.push({ freq: 620 * semis(i * 3), dur: 0.045, wave: 'square' as const, vol: 0.14, at })
    at += gap
    gap /= 2
  }
  return tones
}

export const MORE_SOUNDS = {
  heartbeat: [
    { freq: 70, to: 45, dur: 0.12, wave: 'sine', vol: 0.6 },
    { freq: 65, to: 40, dur: 0.14, wave: 'sine', vol: 0.5, at: 0.18 },
  ],
  crack: [
    { freq: 2600, to: 300, dur: 0.3, wave: 'noise', vol: 0.65 },
    { freq: 3100, dur: 0.05, wave: 'square', vol: 0.12, at: 0.02 },
    { freq: 2300, dur: 0.06, wave: 'square', vol: 0.1, at: 0.07 },
    { freq: 160, to: 55, dur: 0.3, wave: 'sawtooth', vol: 0.3 },
  ],
  slam: [
    { freq: 140, to: 35, dur: 0.35, wave: 'sine', vol: 0.75 },
    { freq: 900, to: 80, dur: 0.25, wave: 'noise', vol: 0.5 },
    { freq: 2400, to: 600, dur: 0.12, wave: 'noise', vol: 0.2, at: 0.03 },
  ],
  rumble: [
    { freq: 55, to: 90, dur: 0.9, wave: 'sawtooth', vol: 0.22 },
    { freq: 400, to: 1200, dur: 0.9, wave: 'noise', vol: 0.18 },
  ],
  fanfare: [
    { freq: 523, dur: 0.1, wave: 'square', vol: 0.14 },
    { freq: 659, dur: 0.1, wave: 'square', vol: 0.14, at: 0.08 },
    { freq: 784, dur: 0.1, wave: 'square', vol: 0.14, at: 0.16 },
    { freq: 1047, dur: 0.28, wave: 'triangle', vol: 0.2, at: 0.24 },
    { freq: 1568, dur: 0.22, wave: 'sine', vol: 0.1, at: 0.28 },
  ],
  /** Death: a falling power-down whine over a low boom. */
  powerdown: [
    { freq: 900, to: 60, dur: 1.4, wave: 'sawtooth', vol: 0.16 },
    { freq: 450, to: 30, dur: 1.4, wave: 'square', vol: 0.08 },
    { freq: 120, to: 30, dur: 0.6, wave: 'sine', vol: 0.7 },
    { freq: 3000, to: 200, dur: 0.5, wave: 'noise', vol: 0.45 },
  ],
  riser: [
    { freq: 300, to: 1500, dur: 0.45, wave: 'sawtooth', vol: 0.1 },
    { freq: 600, to: 3000, dur: 0.45, wave: 'noise', vol: 0.16 },
  ],
} satisfies Record<string, Sound>

/** The sound for one sim event (null = silent). Combo-driven sounds read the state. */
export function eventSound(e: DriftEvent, s: DriftState): Sound | null {
  switch (e.type) {
    case 'wisp':
      return wispSound(s.player.combo)
    case 'nearMiss':
      return nearMissSound(s.player.combo)
    case 'multiplier':
      return multiplierSound(e.mult)
    case 'warn':
      return warnBeeps(e.ticks / TICK_RATE)
    case 'hit':
      return MORE_SOUNDS.crack
    case 'die':
      return MORE_SOUNDS.powerdown
    case 'slam':
      return MORE_SOUNDS.slam
    case 'lanes':
      return MORE_SOUNDS.rumble
    case 'heart':
      // The heal chime with the charged sparkle on top: a bigger "got it!".
      return [...DRIFT_SOUNDS.heal, ...DRIFT_SOUNDS.charged.map((t) => ({ ...t, at: (t.at ?? 0) + 0.1 }))]
    case 'tier':
      return [...DRIFT_SOUNDS.tier, ...MORE_SOUNDS.riser]
    case 'move':
    case 'phantom':
    case 'phantomEnd':
    case 'charged':
      return DRIFT_SOUNDS[e.type]
    default:
      return null
  }
}

/** Ticks between heartbeats on the last heart. */
export const HEARTBEAT_TICKS = 54
