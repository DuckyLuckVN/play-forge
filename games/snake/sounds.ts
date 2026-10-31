import type { Sound } from '@forge/audio/sound'

export const SNAKE_SOUNDS = {
  eat: [
    { freq: 660, dur: 0.05, wave: 'square', vol: 0.35 },
    { freq: 990, dur: 0.07, wave: 'square', vol: 0.35, at: 0.045 },
  ],
  die: [
    { freq: 2400, to: 200, dur: 0.35, wave: 'noise', vol: 0.7 },
    { freq: 220, to: 70, dur: 0.35, wave: 'sawtooth', vol: 0.25 },
  ],
} satisfies Record<string, Sound>
