import type { Track } from './music'

// Stock tracks shared by every game. Eighth-note steps, 8 steps per bar.
// Games can pass their own Track to createGameApp({ music }).

const bars = (...b: string[]) => b.join(' ')

/** Relaxed loop for menus, lobbies and the launcher. Fmaj7 Em7 Dm7 Cmaj7. */
export const LOUNGE: Track = {
  name: 'lounge',
  bpm: 88,
  parts: [
    {
      instrument: 'pad',
      vol: 0.8,
      steps: bars(
        'F3+A3+C4+E4 - - - - - - -',
        'E3+G3+B3+D4 - - - - - - -',
        'D3+F3+A3+C4 - - - - - - -',
        'C3+E3+G3+B3 - - - - - - -',
      ),
    },
    {
      instrument: 'bass',
      vol: 0.8,
      steps: bars('F2 - . F2 . . C3 .', 'E2 - . E2 . . B2 .', 'D2 - . D2 . . A2 .', 'C2 - . C2 . . G2 .'),
    },
    {
      instrument: 'pluck',
      vol: 0.55,
      steps: bars(
        'A4 . C5 . E5 . C5 .',
        'G4 . B4 . D5 - . .',
        'F4 . A4 . C5 . A4 .',
        'E4 . G4 . B4 - - .',
        'A4 . C5 . E5 . G5 .',
        'G5 . E5 . D5 - . .',
        'F5 . E5 . C5 . A4 .',
        'G4 - - . . . . .',
      ),
    },
    { instrument: 'kick', vol: 0.5, steps: 'x . . . . . . . x . . . . . x .' },
    { instrument: 'hat', vol: 0.35, steps: '. . x . . . x .' },
  ],
}

/** Upbeat loop for gameplay. Am F C G. */
export const ARCADE: Track = {
  name: 'arcade',
  bpm: 132,
  parts: [
    {
      instrument: 'bass',
      steps: bars(
        'A2 A2 A3 A2 A2 A2 A3 A2',
        'F2 F2 F3 F2 F2 F2 F3 F2',
        'C3 C3 C4 C3 C3 C3 C4 C3',
        'G2 G2 G3 G2 G2 G2 G3 G2',
      ),
    },
    {
      instrument: 'lead',
      vol: 0.7,
      steps: bars(
        'E5 . A5 . C6 . B5 A5',
        '. . C5 . F5 . A5 .',
        'G5 . E5 . G5 . C6 .',
        'B5 . D6 . B5 - G5 .',
        'E5 . A5 . C6 . E6 .',
        'D6 . C6 . A5 . F5 .',
        'E5 . G5 . C6 . E5 .',
        'D5 - - . B4 - - .',
      ),
    },
    {
      instrument: 'pad',
      vol: 0.5,
      steps: bars(
        'A3+C4+E4 - - - - - - -',
        'F3+A3+C4 - - - - - - -',
        'C4+E4+G4 - - - - - - -',
        'G3+B3+D4 - - - - - - -',
      ),
    },
    { instrument: 'kick', steps: 'x . . . x . . .' },
    { instrument: 'snare', vol: 0.8, steps: '. . x . . . x .' },
    { instrument: 'hat', steps: '. x . x . x . x' },
  ],
}
