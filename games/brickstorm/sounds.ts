import type { Sound } from '@forge/audio/sound'

export const BRICK_SOUNDS = {
  fire: { freq: 320, to: 520, dur: 0.08, wave: 'triangle', vol: 0.3 },
  launch: { freq: 900, to: 1400, dur: 0.035, wave: 'triangle', vol: 0.12 },
  coin: [
    { freq: 1568, dur: 0.04, wave: 'square', vol: 0.12 },
    { freq: 2093, dur: 0.06, wave: 'square', vol: 0.12, at: 0.035 },
  ],
  explode: [
    { freq: 1200, to: 80, dur: 0.35, wave: 'noise', vol: 0.7 },
    { freq: 110, to: 40, dur: 0.3, wave: 'sine', vol: 0.6 },
  ],
  zap: [
    { freq: 2400, to: 600, dur: 0.12, wave: 'sawtooth', vol: 0.18 },
    { freq: 5000, to: 1500, dur: 0.1, wave: 'noise', vol: 0.25 },
  ],
  whoosh: { freq: 400, to: 3000, dur: 0.25, wave: 'noise', vol: 0.3 },
  laser: [
    { freq: 1800, to: 300, dur: 0.25, wave: 'sawtooth', vol: 0.22 },
    { freq: 3600, to: 600, dur: 0.25, wave: 'square', vol: 0.08 },
  ],
  mystery: [
    { freq: 660, dur: 0.06, wave: 'triangle', vol: 0.3 },
    { freq: 880, dur: 0.06, wave: 'triangle', vol: 0.3, at: 0.06 },
    { freq: 1320, dur: 0.06, wave: 'triangle', vol: 0.3, at: 0.12 },
    { freq: 1760, dur: 0.2, wave: 'triangle', vol: 0.3, at: 0.18 },
  ],
  jackpot: [
    { freq: 1047, dur: 0.07, wave: 'square', vol: 0.25 },
    { freq: 1319, dur: 0.07, wave: 'square', vol: 0.25, at: 0.07 },
    { freq: 1568, dur: 0.07, wave: 'square', vol: 0.25, at: 0.14 },
    { freq: 2093, dur: 0.3, wave: 'square', vol: 0.25, at: 0.21 },
  ],
  stinger1: [
    { freq: 784, dur: 0.08, wave: 'triangle', vol: 0.35 },
    { freq: 1047, dur: 0.16, wave: 'triangle', vol: 0.35, at: 0.07 },
  ],
  stinger2: [
    { freq: 784, dur: 0.07, wave: 'square', vol: 0.3 },
    { freq: 988, dur: 0.07, wave: 'square', vol: 0.3, at: 0.07 },
    { freq: 1319, dur: 0.2, wave: 'square', vol: 0.3, at: 0.14 },
  ],
  stinger3: [
    { freq: 659, dur: 0.07, wave: 'sawtooth', vol: 0.28 },
    { freq: 880, dur: 0.07, wave: 'sawtooth', vol: 0.28, at: 0.07 },
    { freq: 1109, dur: 0.07, wave: 'sawtooth', vol: 0.28, at: 0.14 },
    { freq: 1319, dur: 0.3, wave: 'sawtooth', vol: 0.28, at: 0.21 },
  ],
  stinger4: [
    { freq: 523, dur: 0.06, wave: 'sawtooth', vol: 0.3 },
    { freq: 784, dur: 0.06, wave: 'sawtooth', vol: 0.3, at: 0.06 },
    { freq: 1047, dur: 0.06, wave: 'sawtooth', vol: 0.3, at: 0.12 },
    { freq: 1568, dur: 0.06, wave: 'sawtooth', vol: 0.3, at: 0.18 },
    { freq: 2093, dur: 0.4, wave: 'sawtooth', vol: 0.3, at: 0.24 },
    { freq: 3000, to: 300, dur: 0.5, wave: 'noise', vol: 0.2, at: 0.24 },
  ],
  buy: [
    { freq: 1319, dur: 0.05, wave: 'square', vol: 0.25 },
    { freq: 1760, dur: 0.05, wave: 'square', vol: 0.25, at: 0.05 },
    { freq: 2637, dur: 0.18, wave: 'triangle', vol: 0.3, at: 0.1 },
  ],
  revive: [
    { freq: 262, to: 1047, dur: 0.5, wave: 'triangle', vol: 0.35 },
    { freq: 523, to: 2093, dur: 0.5, wave: 'sine', vol: 0.2 },
  ],
  secondWind: [
    { freq: 200, to: 1600, dur: 0.6, wave: 'noise', vol: 0.4 },
    { freq: 392, to: 784, dur: 0.4, wave: 'triangle', vol: 0.35, at: 0.1 },
  ],
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
  /** Before the pick screen: a rising arpeggio into a bright chord. */
  fanfare: [
    { freq: 523, dur: 0.09, wave: 'square', vol: 0.28 },
    { freq: 659, dur: 0.09, wave: 'square', vol: 0.28, at: 0.09 },
    { freq: 784, dur: 0.09, wave: 'square', vol: 0.28, at: 0.18 },
    { freq: 1047, dur: 0.5, wave: 'square', vol: 0.26, at: 0.27 },
    { freq: 1319, dur: 0.5, wave: 'triangle', vol: 0.24, at: 0.27 },
    { freq: 1568, dur: 0.5, wave: 'triangle', vol: 0.22, at: 0.27 },
    { freq: 2093, to: 3136, dur: 0.3, wave: 'sine', vol: 0.15, at: 0.45 },
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
