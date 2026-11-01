// Brickstorm's own music: the boss theme, and the soundtracks sold in the shop
// (generated from a chord progression and a style). Eighth-note steps, 8 per bar.
import type { Instrument, Part, Track } from '@forge/audio/music'
import { ARCADE } from '@forge/audio/tracks'

const bars = (...b: string[]) => b.join(' ')

/** Boss fights: driving D minor, Dm Bb C A. */
export const BOSS: Track = {
  name: 'boss',
  bpm: 152,
  parts: [
    {
      instrument: 'bass',
      steps: bars(
        'D2 D2 D3 D2 D2 D3 D2 D3',
        'A#1 A#1 A#2 A#1 A#1 A#2 A#1 A#2',
        'C2 C2 C3 C2 C2 C3 C2 C3',
        'A1 A1 A2 A1 A1 A2 C#3 E3',
      ),
    },
    {
      instrument: 'lead',
      vol: 0.5,
      steps: bars(
        'D5 . F5 . A5 - G5 F5',
        'F5 - D5 . A#4 - . .',
        'C5 . E5 . G5 - F5 E5',
        'E5 - C#5 . A4 - - .',
        'D5 . F5 . A5 . D6 .',
        'C6 - A#5 . A5 - F5 .',
        'G5 . E5 . C5 . E5 .',
        'A5 - - . C#5 - E5 -',
      ),
    },
    {
      instrument: 'pad',
      vol: 0.4,
      steps: bars(
        'D3+F3+A3 - - - - - - -',
        'A#2+D3+F3 - - - - - - -',
        'C3+E3+G3 - - - - - - -',
        'A2+C#3+E3 - - - - - - -',
      ),
    },
    { instrument: 'kick', vol: 0.7, steps: 'x . . x x . . . x . . x x . x .' },
    { instrument: 'snare', vol: 0.5, steps: '. . x . . . x .' },
    { instrument: 'hat', vol: 0.3, steps: 'x x x x x x x x' },
  ],
}

type Style = 'drive' | 'chill' | 'chip' | 'funk' | 'dreamy' | 'march' | 'synth'

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const note = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`

/** 'F#m' → root, third and fifth from `octave`, plus the root an octave up. */
function chordTones(chord: string, octave: number): number[] {
  const m = /^([A-G])([#b]?)(m?)$/.exec(chord)
  if (!m) throw new Error(`Bad chord "${chord}"`)
  const root = 12 * (octave + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)
  return [root, root + (m[3] ? 3 : 4), root + 7, root + 12]
}

/** Per style: bass (r root, R root up, f fifth), lead (chord-tone index), drums, and voices. */
const STYLES: Record<
  Style,
  {
    bass: string
    leads: string[]
    kick: string
    snare?: string
    hat?: string
    pad: boolean
    lead: Instrument
  }
> = {
  drive: {
    bass: 'r r R r r R r R',
    leads: ['0 . 1 . 2 - 1 0', '2 - 1 . 0 - . .', '3 - 2 1 2 - 0 .'],
    kick: 'x . . . x . . .',
    snare: '. . x . . . x .',
    hat: 'x x x x x x x x',
    pad: false,
    lead: 'lead',
  },
  chill: {
    bass: 'r - . r . . f .',
    leads: ['. . 2 - 1 . . .', '0 - . . 1 2 - .', '. 3 - 2 . 1 - .'],
    kick: 'x . . . . . x .',
    snare: '. . x . . . x .',
    hat: '. x . x . x . x',
    pad: true,
    lead: 'pluck',
  },
  chip: {
    bass: 'r R r R r R r R',
    leads: ['0 1 2 3 2 1 0 1', '3 2 1 0 1 2 3 -', '0 2 1 3 2 - 0 .'],
    kick: 'x . x . x . x .',
    snare: '. . x . . . x .',
    hat: 'x . x . x . x .',
    pad: false,
    lead: 'lead',
  },
  funk: {
    bass: 'r . . r . R . f',
    leads: ['. 2 . 2 1 . 0 .', '2 . . 1 . 0 - .', '. 3 2 . 1 . 2 .'],
    kick: 'x . . x . . x .',
    snare: '. . x . . x x .',
    hat: 'x x x x x x x x',
    pad: false,
    lead: 'pluck',
  },
  dreamy: {
    bass: 'r - - - f - - -',
    leads: ['2 - - . 1 - - .', '3 - - - 2 - 1 -', '1 - 2 - 3 - - .'],
    kick: 'x . . . . . . . . . . . x . . .',
    hat: '. . x . . . x .',
    pad: true,
    lead: 'pluck',
  },
  march: {
    bass: 'r . f . r . f .',
    leads: ['0 . 0 1 2 - 0 .', '3 - 2 . 1 - 0 .', '2 2 1 . 0 1 2 -'],
    kick: 'x . x . x . x .',
    snare: '. x . x . x x x',
    pad: false,
    lead: 'lead',
  },
  synth: {
    bass: 'r r r r R r r r',
    leads: ['0 - 2 - 3 - 2 1', '1 - 0 - 2 - - .', '3 - - 2 - 1 0 -'],
    kick: 'x . . . x . . .',
    snare: '. . x . . . x .',
    hat: '. x . x . x . x',
    pad: true,
    lead: 'lead',
  },
}

function hash(text: string): number {
  let h = 2166136261
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
  return h
}

/** A looping track from four chords and a style; the name varies the melody. */
function song(name: string, bpm: number, chords: [string, string, string, string], style: Style): Track {
  const st = STYLES[style]
  const seed = hash(name)
  const bass = chords
    .map((ch) => {
      const [r, , f, R] = chordTones(ch, 2)
      return st.bass.replace(/\b[rRf]\b/g, (k) => note(k === 'r' ? r : k === 'R' ? R : f))
    })
    .join(' ')
  const lead = [...chords, ...chords]
    .map((ch, bar) => {
      const tones = chordTones(ch, 5)
      const pattern = st.leads[(seed + bar * (bar > 3 ? 2 : 1)) % st.leads.length]
      return pattern.replace(/\b\d\b/g, (d) => note(tones[Number(d)]))
    })
    .join(' ')
  const parts: Part[] = [
    { instrument: 'bass', vol: 0.8, steps: bass },
    { instrument: st.lead, vol: 0.45, steps: lead },
    { instrument: 'kick', vol: 0.6, steps: st.kick },
  ]
  if (st.pad) {
    const pad = chords
      .map((ch) => `${chordTones(ch, 3).slice(0, 3).map(note).join('+')} - - - - - - -`)
      .join(' ')
    parts.push({ instrument: 'pad', vol: 0.45, steps: pad })
  }
  if (st.snare) parts.push({ instrument: 'snare', vol: 0.45, steps: st.snare })
  if (st.hat) parts.push({ instrument: 'hat', vol: 0.3, steps: st.hat })
  return { name, bpm, parts }
}

/** The soundtracks sold in the shop, by item id. The first is the stock arcade loop. */
export const SOUNDTRACKS: Record<string, Track> = {
  'music:arcade': ARCADE,
  'music:lofi': song('lofi', 82, ['F', 'E', 'Dm', 'C'], 'chill'),
  'music:neon': song('neon', 120, ['Am', 'F', 'C', 'G'], 'synth'),
  'music:hero': song('hero', 150, ['C', 'G', 'Am', 'F'], 'chip'),
  'music:funk': song('funk', 108, ['Dm', 'G', 'Dm', 'A'], 'funk'),
  'music:starlight': song('starlight', 90, ['E', 'C#m', 'A', 'B'], 'dreamy'),
  'music:march': song('march', 116, ['C', 'F', 'G', 'C'], 'march'),
  'music:thunder': song('thunder', 160, ['Em', 'C', 'D', 'B'], 'drive'),
  'music:party': song('party', 140, ['F', 'Dm', 'Bb', 'C'], 'chip'),
  'music:cafe': song('cafe', 76, ['Am', 'Dm', 'G', 'C'], 'chill'),
  'music:breeze': song('breeze', 84, ['D', 'Bm', 'G', 'A'], 'dreamy'),
  'music:disco': song('disco', 118, ['Gm', 'C', 'F', 'Dm'], 'funk'),
  'music:overdrive': song('overdrive', 170, ['Bm', 'G', 'D', 'A'], 'drive'),
  'music:quest': song('quest', 124, ['G', 'D', 'Em', 'C'], 'march'),
  'music:night': song('night', 145, ['Am', 'G', 'F', 'E'], 'chip'),
  'music:waltz': song('waltz', 72, ['A', 'F#m', 'D', 'E'], 'dreamy'),
  'music:retro': song('retro', 112, ['Cm', 'Ab', 'Eb', 'Bb'], 'synth'),
  'music:groove': song('groove', 104, ['Em', 'A', 'Em', 'B'], 'funk'),
  'music:meteor': song('meteor', 155, ['Dm', 'Bb', 'F', 'C'], 'drive'),
  'music:jazz': song('jazz', 88, ['Dm', 'G', 'C', 'A'], 'chill'),
}

/** The gameplay track for an equipped soundtrack id. */
export function trackFor(id: string): Track {
  return SOUNDTRACKS[id] ?? ARCADE
}
