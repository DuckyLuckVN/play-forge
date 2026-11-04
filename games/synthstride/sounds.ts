// Synthstride audio. There is no background track: the game's own beat clock
// plays one beat of music at a time (kick, snare, hats, bass, chords, arps),
// scheduled ahead on a steady local clock (see main.ts), so the music is the
// clock you dance to, never drifts from the strikes, and doesn't wobble with
// the network.

import type { Sound, Tone } from '@forge/audio/sound'
import { dancerOf, type Rating, type StrideEvent, type StrideState } from './sim'
import { sectionAt } from './song'
import { sectionProgress } from './song'

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** Am F C G, one chord per bar (4 beats). MIDI notes, root first. */
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
]
export const chordAt = (beat: number) => CHORDS[Math.floor(Math.max(0, beat) / 4) % CHORDS.length]

/**
 * One beat of the soundtrack. Layers build up with tier, Overdrive and the
 * song: build-ups add a rising sweep and a snare roll, drops add a lead.
 */
export interface BeatMix {
  bpm: number
  tier: number
  /** Your Overdrive is on (adds a lead). */
  overdrive: boolean
  /** Something lands on the next beat (a count-in tick). */
  strikeNext: boolean
}

export function beatSound(beat: number, s: BeatMix): Sound {
  const strikeNext = s.strikeNext
  const dur = 60 / s.bpm
  const half = dur / 2
  const chord = chordAt(beat)
  const root = chord[0] - 24
  const inBar = ((beat % 4) + 4) % 4
  const od = s.overdrive
  const section = sectionAt(beat)
  const drop = section === 'drop'
  const build = section === 'build'
  const tones: Tone[] = [
    // Four on the floor (a fatter kick in the drop).
    { freq: drop ? 170 : 150, to: 40, dur: drop ? 0.2 : 0.16, wave: 'sine', vol: drop ? 0.85 : 0.75 },
    { freq: 3000, to: 200, dur: 0.02, wave: 'noise', vol: 0.12 },
    // Off-beat hat.
    { freq: 9000, dur: 0.035, wave: 'noise', vol: od || drop ? 0.2 : 0.13, at: half },
    // Bass: root on the beat, octave on the off-beat.
    { freq: hz(root), dur: half * 0.85, wave: 'sawtooth', vol: 0.2 },
    { freq: hz(root + 12), dur: half * 0.7, wave: 'sawtooth', vol: 0.14, at: half },
  ]
  if (inBar === 1 || inBar === 3) {
    tones.push({ freq: 1800, to: 700, dur: 0.13, wave: 'noise', vol: 0.32 })
    tones.push({ freq: 220, to: 140, dur: 0.08, wave: 'triangle', vol: 0.18 })
  }
  if (inBar === 0)
    for (const n of chord) tones.push({ freq: hz(n), dur: dur * 3.6, wave: 'triangle', vol: 0.05 })
  if (s.tier >= 2 || od || drop) {
    // Arpeggio, two notes a beat, climbing through the chord.
    const a = chord[(beat * 2) % 3] + 12
    const b = chord[(beat * 2 + 1) % 3] + 12
    tones.push({ freq: hz(a), dur: half * 0.6, wave: 'square', vol: 0.05 })
    tones.push({ freq: hz(b), dur: half * 0.6, wave: 'square', vol: 0.05, at: half })
  }
  if (s.tier >= 5 || od || drop) tones.push({ freq: 9000, dur: 0.02, wave: 'noise', vol: 0.08, at: half / 2 })
  if (od) tones.push({ freq: hz(chord[inBar % 3] + 24), dur: dur * 0.8, wave: 'sine', vol: 0.12 })
  if (drop) {
    // The drop's lead: a bright hook over the chord.
    const hook = [0, 2, 1, 2][inBar]
    tones.push({ freq: hz(chord[hook] + 12), dur: half * 0.9, wave: 'sawtooth', vol: 0.07 })
    tones.push({
      freq: hz(chord[(hook + 1) % 3] + 12),
      dur: half * 0.8,
      wave: 'sawtooth',
      vol: 0.06,
      at: half,
    })
  }
  if (build) {
    // Rising sweep across the build-up, and a snare roll that speeds up in its last bar.
    const p = sectionProgress(beat)
    tones.push({ freq: 400 + p * 3000, to: 600 + p * 4000, dur, wave: 'noise', vol: 0.05 + p * 0.1 })
    const rolls = p >= 0.5 ? 4 : 2
    for (let i = 0; i < rolls; i++)
      tones.push({
        freq: 2000,
        to: 900,
        dur: 0.06,
        wave: 'noise',
        vol: 0.12 + p * 0.15,
        at: (i * dur) / rolls,
      })
  }
  // Something lands on the next beat: a bright tick to count you in.
  if (strikeNext) tones.push({ freq: 2093, dur: 0.03, wave: 'square', vol: 0.09, at: half })
  return tones
}

/** A chain note: climbs through the chord, an octave per three notes. */
export function chainNoteSound(index: number, beat: number): Sound {
  const chord = chordAt(beat)
  const n = chord[index % 3] + 12 * (1 + Math.floor(index / 3))
  return [
    { freq: hz(n), dur: 0.14, wave: 'triangle', vol: 0.3 },
    { freq: hz(n + 12), dur: 0.1, wave: 'sine', vol: 0.18, at: 0.02 },
  ]
}

/** Your steps play the melody: chord tones when on the beat, a dull tap when off. */
export function moveSound(to: number, rating: Rating | null, beat: number): Sound | null {
  if (rating === null) return null
  const chord = chordAt(beat)
  const step = (to * 7) % 3
  const n = chord[step] + 12
  if (rating === 'perfect')
    return [
      { freq: hz(n), dur: 0.12, wave: 'triangle', vol: 0.28 },
      { freq: hz(n + 12), dur: 0.08, wave: 'sine', vol: 0.12 },
    ]
  if (rating === 'good') return { freq: hz(n), dur: 0.1, wave: 'triangle', vol: 0.18 }
  return { freq: 260, to: 180, dur: 0.05, wave: 'triangle', vol: 0.1 }
}

export const STRIDE_SOUNDS = {
  warn: { freq: 880, to: 1320, dur: 0.06, wave: 'square', vol: 0.06 },
  strike: [
    { freq: 120, to: 35, dur: 0.25, wave: 'sine', vol: 0.55 },
    { freq: 4000, to: 300, dur: 0.22, wave: 'noise', vol: 0.3 },
  ],
  hit: [
    { freq: 2600, to: 300, dur: 0.3, wave: 'noise', vol: 0.65 },
    { freq: 160, to: 55, dur: 0.3, wave: 'sawtooth', vol: 0.3 },
  ],
  dodge: { freq: 2400, to: 4200, dur: 0.07, wave: 'sine', vol: 0.12 },
  chain: [
    { freq: 1047, dur: 0.08, wave: 'square', vol: 0.12 },
    { freq: 1319, dur: 0.08, wave: 'square', vol: 0.12, at: 0.07 },
    { freq: 1568, dur: 0.08, wave: 'square', vol: 0.12, at: 0.14 },
    { freq: 2093, dur: 0.25, wave: 'triangle', vol: 0.2, at: 0.21 },
  ],
  bump: { freq: 180, to: 90, dur: 0.08, wave: 'square', vol: 0.12 },
  /** Off-beat strikes have their own clap, so the syncopation is audible. */
  offbeatStrike: [
    { freq: 1400, to: 600, dur: 0.1, wave: 'noise', vol: 0.4 },
    { freq: 90, to: 40, dur: 0.18, wave: 'sine', vol: 0.4 },
  ],
  grow: [
    { freq: 60, to: 120, dur: 0.8, wave: 'sawtooth', vol: 0.2 },
    { freq: 300, to: 2400, dur: 0.8, wave: 'noise', vol: 0.15 },
  ],
  noteSpawn: { freq: 2637, dur: 0.05, wave: 'sine', vol: 0.08 },
  grooveLost: { freq: 400, to: 150, dur: 0.18, wave: 'sawtooth', vol: 0.1 },
  charged: [
    { freq: 660, dur: 0.06, wave: 'triangle', vol: 0.3 },
    { freq: 880, dur: 0.06, wave: 'triangle', vol: 0.3, at: 0.06 },
    { freq: 1320, dur: 0.12, wave: 'triangle', vol: 0.3, at: 0.12 },
  ],
  overdrive: [
    { freq: 2000, to: 60, dur: 0.6, wave: 'sawtooth', vol: 0.18 },
    { freq: 90, to: 30, dur: 0.7, wave: 'sine', vol: 0.8 },
    { freq: 6000, to: 300, dur: 0.6, wave: 'noise', vol: 0.35 },
  ],
  overdriveEnd: { freq: 900, to: 300, dur: 0.25, wave: 'sine', vol: 0.2 },
  heal: [
    { freq: 523, dur: 0.08, wave: 'triangle', vol: 0.3 },
    { freq: 784, dur: 0.14, wave: 'triangle', vol: 0.3, at: 0.08 },
  ],
  tier: [
    { freq: 300, to: 1500, dur: 0.45, wave: 'sawtooth', vol: 0.08 },
    { freq: 600, to: 3000, dur: 0.45, wave: 'noise', vol: 0.12 },
  ],
  die: [
    { freq: 900, to: 60, dur: 1.4, wave: 'sawtooth', vol: 0.16 },
    { freq: 120, to: 30, dur: 0.6, wave: 'sine', vol: 0.7 },
    { freq: 3000, to: 200, dur: 0.5, wave: 'noise', vol: 0.45 },
  ],
  fanfare: [
    { freq: 523, dur: 0.1, wave: 'square', vol: 0.12 },
    { freq: 659, dur: 0.1, wave: 'square', vol: 0.12, at: 0.08 },
    { freq: 784, dur: 0.1, wave: 'square', vol: 0.12, at: 0.16 },
    { freq: 1047, dur: 0.28, wave: 'triangle', vol: 0.18, at: 0.24 },
  ],
} satisfies Record<string, Sound>

export function multiplierSound(mult: number): Sound {
  const notes = [523, 659, 784, 1047]
  return notes.slice(0, Math.min(mult + 1, notes.length)).map((freq, i) => ({
    freq,
    dur: 0.09,
    wave: 'square' as const,
    vol: 0.14,
    at: i * 0.06,
  }))
}

/** Every tone `seconds` later (to schedule a sound ahead of time). */
export function delayed(sound: Sound, seconds: number): Tone[] {
  const tones = Array.isArray(sound) ? sound : [sound]
  return tones.map((tone) => ({ ...tone, at: (tone.at ?? 0) + Math.max(0, seconds) }))
}

/**
 * The sound for one event, as heard by `selfId`: your own events, and what
 * happens on your board. Beats are scheduled separately (beatSound); your own
 * steps sound the moment you press (moveSound), not when the host confirms.
 */
export function eventSound(e: StrideEvent, s: StrideState, selfId: string): Sound | null {
  const self = dancerOf(s, selfId)
  const board = self?.board ?? 0
  if ('p' in e && e.p !== selfId) return null
  if ('b' in e && e.b !== board) return null
  switch (e.type) {
    case 'note':
      return chainNoteSound(e.index, s.beat)
    case 'multiplier':
      return multiplierSound(e.mult)
    case 'strike': {
      const st = s.boards[e.b]?.strikes.find((k) => k.id === e.id)
      return st && st.beat % 1 !== 0 ? STRIDE_SOUNDS.offbeatStrike : STRIDE_SOUNDS.strike
    }
    case 'warn':
    case 'hit':
    case 'dodge':
    case 'chain':
    case 'bump':
    case 'noteSpawn':
    case 'grooveLost':
    case 'charged':
    case 'overdrive':
    case 'overdriveEnd':
    case 'heal':
    case 'tier':
    case 'grow':
    case 'die':
      return STRIDE_SOUNDS[e.type]
    default:
      return null
  }
}
