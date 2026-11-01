// Brickstorm's own music tracks (eighth-note steps, 8 per bar).
import type { Track } from '@forge/audio/music'

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
