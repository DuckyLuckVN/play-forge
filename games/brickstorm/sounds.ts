import type { Sound } from '@forge/audio/sound'

export const BRICK_SOUNDS = {
  fire: { freq: 320, to: 520, dur: 0.08, wave: 'triangle', vol: 0.3 },
  kill: [
    { freq: 1800, to: 300, dur: 0.12, wave: 'noise', vol: 0.35 },
    { freq: 180, to: 90, dur: 0.1, wave: 'sine', vol: 0.4 },
  ],
  pickupBall: [
    { freq: 784, dur: 0.06, wave: 'square', vol: 0.25 },
    { freq: 1175, dur: 0.09, wave: 'square', vol: 0.25, at: 0.05 },
  ],
  pickupCoin: [
    { freq: 1319, dur: 0.05, wave: 'square', vol: 0.2 },
    { freq: 1976, dur: 0.12, wave: 'square', vol: 0.2, at: 0.05 },
  ],
  wall: { freq: 220, dur: 0.02, wave: 'sine', vol: 0.06 },
  fever: [
    { freq: 523, dur: 0.08, wave: 'sawtooth', vol: 0.3 },
    { freq: 659, dur: 0.08, wave: 'sawtooth', vol: 0.3, at: 0.07 },
    { freq: 784, dur: 0.08, wave: 'sawtooth', vol: 0.3, at: 0.14 },
    { freq: 1047, dur: 0.25, wave: 'sawtooth', vol: 0.3, at: 0.21 },
  ],
  allClear: [
    { freq: 784, dur: 0.1, wave: 'square', vol: 0.3 },
    { freq: 1047, dur: 0.1, wave: 'square', vol: 0.3, at: 0.1 },
    { freq: 1319, dur: 0.1, wave: 'square', vol: 0.3, at: 0.2 },
    { freq: 1568, dur: 0.4, wave: 'square', vol: 0.3, at: 0.3 },
    { freq: 3000, to: 200, dur: 0.6, wave: 'noise', vol: 0.2, at: 0.3 },
  ],
  closeOne: [
    { freq: 440, dur: 0.08, wave: 'triangle', vol: 0.3 },
    { freq: 660, dur: 0.18, wave: 'triangle', vol: 0.3, at: 0.08 },
  ],
  danger: [
    { freq: 70, to: 50, dur: 0.12, wave: 'sine', vol: 0.7 },
    { freq: 70, to: 50, dur: 0.12, wave: 'sine', vol: 0.5, at: 0.18 },
  ],
  levelUp: [
    { freq: 523, dur: 0.07, wave: 'triangle', vol: 0.35 },
    { freq: 784, dur: 0.07, wave: 'triangle', vol: 0.35, at: 0.07 },
    { freq: 1047, dur: 0.2, wave: 'triangle', vol: 0.35, at: 0.14 },
  ],
  over: [
    { freq: 2400, to: 150, dur: 0.5, wave: 'noise', vol: 0.6 },
    { freq: 330, to: 80, dur: 0.6, wave: 'sawtooth', vol: 0.25 },
  ],
} satisfies Record<string, Sound>
