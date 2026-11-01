import type { Sound } from '@forge/audio/sound'
import type { HeroVoice } from './sim/heroes'

/** Boss fights: a heavy thunk for hits, a tink for blocked ones, and a sound per kind of skill. */
export const BOSS_SOUNDS = {
  hit: [
    { freq: 180, to: 70, dur: 0.12, wave: 'square', vol: 0.22 },
    { freq: 900, to: 200, dur: 0.05, wave: 'noise', vol: 0.15 },
  ],
  block: [
    { freq: 2600, to: 2200, dur: 0.06, wave: 'triangle', vol: 0.18 },
    { freq: 3900, dur: 0.04, wave: 'sine', vol: 0.1, at: 0.02 },
  ],
  summon: [
    { freq: 90, to: 60, dur: 0.35, wave: 'sawtooth', vol: 0.2 },
    { freq: 660, dur: 0.08, wave: 'triangle', vol: 0.2, at: 0.1 },
    { freq: 990, dur: 0.12, wave: 'triangle', vol: 0.2, at: 0.18 },
  ],
  defense: [
    { freq: 300, to: 600, dur: 0.3, wave: 'sine', vol: 0.25 },
    { freq: 1200, dur: 0.15, wave: 'triangle', vol: 0.12, at: 0.12 },
  ],
  movement: { freq: 300, to: 2200, dur: 0.28, wave: 'noise', vol: 0.28 },
  weak: [
    { freq: 3000, to: 900, dur: 0.15, wave: 'sawtooth', vol: 0.15 },
    { freq: 6000, to: 2000, dur: 0.12, wave: 'noise', vol: 0.2 },
  ],
  tricks: [
    { freq: 500, to: 900, dur: 0.12, wave: 'triangle', vol: 0.2 },
    { freq: 900, to: 400, dur: 0.18, wave: 'triangle', vol: 0.2, at: 0.12 },
  ],
  attack: [
    { freq: 220, to: 60, dur: 0.35, wave: 'sawtooth', vol: 0.3 },
    { freq: 1800, to: 200, dur: 0.3, wave: 'noise', vol: 0.3 },
    { freq: 440, to: 880, dur: 0.12, wave: 'square', vol: 0.12, at: 0.15 },
  ],
  rage: [
    { freq: 110, to: 55, dur: 0.5, wave: 'sawtooth', vol: 0.32 },
    { freq: 220, to: 90, dur: 0.4, wave: 'square', vol: 0.12, at: 0.05 },
    { freq: 800, to: 100, dur: 0.4, wave: 'noise', vol: 0.2 },
  ],
} satisfies Record<string, Sound>

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

/** Hero health: a crash, a heal, a storm warning and the heart pickup. */
export const HEALTH_SOUNDS = {
  hurt: [
    { freq: 160, to: 55, dur: 0.3, wave: 'square', vol: 0.32 },
    { freq: 1400, to: 120, dur: 0.25, wave: 'noise', vol: 0.4 },
    { freq: 90, to: 40, dur: 0.35, wave: 'sine', vol: 0.6 },
  ],
  bossCrash: [
    { freq: 120, to: 35, dur: 0.6, wave: 'sawtooth', vol: 0.35 },
    { freq: 900, to: 60, dur: 0.6, wave: 'noise', vol: 0.55 },
    { freq: 60, to: 30, dur: 0.6, wave: 'sine', vol: 0.7 },
  ],
  heal: [
    { freq: 523, to: 784, dur: 0.12, wave: 'sine', vol: 0.3 },
    { freq: 784, to: 1175, dur: 0.16, wave: 'sine', vol: 0.25, at: 0.1 },
    { freq: 1568, dur: 0.2, wave: 'triangle', vol: 0.12, at: 0.18 },
  ],
  regen: { freq: 880, to: 1320, dur: 0.12, wave: 'sine', vol: 0.12 },
  storm: [
    { freq: 60, to: 40, dur: 0.8, wave: 'sawtooth', vol: 0.3 },
    { freq: 3000, to: 200, dur: 0.9, wave: 'noise', vol: 0.35 },
    { freq: 440, to: 220, dur: 0.3, wave: 'square', vol: 0.15, at: 0.3 },
    { freq: 440, to: 220, dur: 0.3, wave: 'square', vol: 0.15, at: 0.6 },
  ],
  lowHealth: [
    { freq: 110, dur: 0.1, wave: 'sine', vol: 0.5 },
    { freq: 98, dur: 0.14, wave: 'sine', vol: 0.45, at: 0.16 },
  ],
} satisfies Record<string, Sound>

/**
 * Each hero's signature sound: played when it's picked, when a run starts and
 * when its trait goes off. Short and bright, so it reads as a cheer.
 */
export const HERO_SOUNDS: Record<HeroVoice, Sound> = {
  chime: [
    { freq: 784, dur: 0.08, wave: 'triangle', vol: 0.3 },
    { freq: 1175, dur: 0.18, wave: 'triangle', vol: 0.3, at: 0.08 },
  ],
  clang: [
    { freq: 620, dur: 0.25, wave: 'square', vol: 0.18 },
    { freq: 1480, to: 1400, dur: 0.35, wave: 'triangle', vol: 0.22 },
    { freq: 3200, to: 900, dur: 0.08, wave: 'noise', vol: 0.25 },
  ],
  roar: [
    { freq: 140, to: 90, dur: 0.45, wave: 'sawtooth', vol: 0.35 },
    { freq: 600, to: 200, dur: 0.4, wave: 'noise', vol: 0.3 },
  ],
  twang: [
    { freq: 330, to: 310, dur: 0.3, wave: 'triangle', vol: 0.3 },
    { freq: 2400, to: 4000, dur: 0.12, wave: 'noise', vol: 0.18, at: 0.05 },
  ],
  whoosh: [
    { freq: 300, to: 2500, dur: 0.35, wave: 'noise', vol: 0.35 },
    { freq: 220, to: 440, dur: 0.3, wave: 'sawtooth', vol: 0.12 },
  ],
  boom: [
    { freq: 900, to: 60, dur: 0.4, wave: 'noise', vol: 0.55 },
    { freq: 100, to: 40, dur: 0.35, wave: 'sine', vol: 0.55 },
  ],
  zap: [
    { freq: 3000, to: 500, dur: 0.15, wave: 'sawtooth', vol: 0.2 },
    { freq: 6000, to: 1200, dur: 0.18, wave: 'noise', vol: 0.25 },
    { freq: 2400, to: 700, dur: 0.12, wave: 'sawtooth', vol: 0.18, at: 0.12 },
  ],
  coins: [
    { freq: 1568, dur: 0.04, wave: 'square', vol: 0.14 },
    { freq: 2093, dur: 0.04, wave: 'square', vol: 0.14, at: 0.05 },
    { freq: 2637, dur: 0.04, wave: 'square', vol: 0.14, at: 0.1 },
    { freq: 3136, dur: 0.15, wave: 'square', vol: 0.14, at: 0.15 },
  ],
  page: [
    { freq: 2000, to: 6000, dur: 0.12, wave: 'noise', vol: 0.18 },
    { freq: 660, dur: 0.1, wave: 'sine', vol: 0.25, at: 0.12 },
    { freq: 990, dur: 0.2, wave: 'sine', vol: 0.25, at: 0.2 },
  ],
  bless: [
    { freq: 523, dur: 0.5, wave: 'sine', vol: 0.2 },
    { freq: 659, dur: 0.5, wave: 'sine', vol: 0.2, at: 0.06 },
    { freq: 784, dur: 0.5, wave: 'sine', vol: 0.2, at: 0.12 },
    { freq: 1047, dur: 0.6, wave: 'sine', vol: 0.2, at: 0.18 },
  ],
  bat: [
    { freq: 4000, to: 2500, dur: 0.05, wave: 'square', vol: 0.12 },
    { freq: 4200, to: 2600, dur: 0.05, wave: 'square', vol: 0.12, at: 0.08 },
    { freq: 196, to: 98, dur: 0.4, wave: 'sawtooth', vol: 0.2, at: 0.1 },
  ],
  hop: [
    { freq: 400, to: 900, dur: 0.1, wave: 'square', vol: 0.2 },
    { freq: 600, to: 1300, dur: 0.12, wave: 'square', vol: 0.2, at: 0.12 },
  ],
  stomp: [
    { freq: 80, to: 40, dur: 0.25, wave: 'sine', vol: 0.7 },
    { freq: 80, to: 40, dur: 0.25, wave: 'sine', vol: 0.7, at: 0.28 },
    { freq: 500, to: 80, dur: 0.15, wave: 'noise', vol: 0.3 },
  ],
  zip: [
    { freq: 600, to: 3200, dur: 0.15, wave: 'sawtooth', vol: 0.15 },
    { freq: 1000, to: 5000, dur: 0.15, wave: 'noise', vol: 0.2 },
  ],
  dice: [
    { freq: 2500, to: 1800, dur: 0.03, wave: 'noise', vol: 0.25 },
    { freq: 2600, to: 1900, dur: 0.03, wave: 'noise', vol: 0.25, at: 0.07 },
    { freq: 2400, to: 1700, dur: 0.03, wave: 'noise', vol: 0.25, at: 0.13 },
    { freq: 1047, dur: 0.2, wave: 'square', vol: 0.2, at: 0.2 },
  ],
  ghost: [
    { freq: 300, to: 600, dur: 0.6, wave: 'sine', vol: 0.25 },
    { freq: 303, to: 590, dur: 0.6, wave: 'triangle', vol: 0.15 },
  ],
  gear: [
    { freq: 1800, dur: 0.02, wave: 'square', vol: 0.15 },
    { freq: 1500, dur: 0.02, wave: 'square', vol: 0.15, at: 0.06 },
    { freq: 1800, dur: 0.02, wave: 'square', vol: 0.15, at: 0.12 },
    { freq: 880, to: 1320, dur: 0.2, wave: 'triangle', vol: 0.2, at: 0.18 },
  ],
  gong: [
    { freq: 196, to: 190, dur: 0.9, wave: 'sine', vol: 0.4 },
    { freq: 392, to: 380, dur: 0.7, wave: 'triangle', vol: 0.15 },
    { freq: 588, dur: 0.5, wave: 'sine', vol: 0.1 },
  ],
  shatter: [
    { freq: 5000, to: 1500, dur: 0.3, wave: 'noise', vol: 0.3 },
    { freq: 2637, dur: 0.06, wave: 'triangle', vol: 0.2, at: 0.02 },
    { freq: 3520, dur: 0.06, wave: 'triangle', vol: 0.2, at: 0.08 },
    { freq: 4186, dur: 0.12, wave: 'triangle', vol: 0.2, at: 0.14 },
  ],
  horn: [
    { freq: 392, dur: 0.15, wave: 'sawtooth', vol: 0.2 },
    { freq: 523, dur: 0.15, wave: 'sawtooth', vol: 0.2, at: 0.15 },
    { freq: 659, dur: 0.4, wave: 'sawtooth', vol: 0.2, at: 0.3 },
  ],
  arr: [
    { freq: 220, to: 180, dur: 0.15, wave: 'sawtooth', vol: 0.25 },
    { freq: 180, to: 140, dur: 0.3, wave: 'sawtooth', vol: 0.25, at: 0.15 },
    { freq: 1319, dur: 0.1, wave: 'square', vol: 0.12, at: 0.45 },
  ],
  ice: [
    { freq: 3000, to: 4500, dur: 0.25, wave: 'sine', vol: 0.15 },
    { freq: 6000, to: 3000, dur: 0.3, wave: 'noise', vol: 0.15 },
    { freq: 2093, dur: 0.3, wave: 'triangle', vol: 0.15, at: 0.1 },
  ],
  slash: [
    { freq: 800, to: 5000, dur: 0.1, wave: 'noise', vol: 0.3 },
    { freq: 5000, to: 800, dur: 0.1, wave: 'noise', vol: 0.25, at: 0.12 },
  ],
  quake: [
    { freq: 50, to: 30, dur: 0.7, wave: 'sawtooth', vol: 0.35 },
    { freq: 400, to: 60, dur: 0.6, wave: 'noise', vol: 0.4 },
  ],
  dragon: [
    { freq: 110, to: 70, dur: 0.6, wave: 'sawtooth', vol: 0.35 },
    { freq: 400, to: 3000, dur: 0.5, wave: 'noise', vol: 0.35, at: 0.15 },
    { freq: 220, to: 140, dur: 0.4, wave: 'square', vol: 0.12 },
  ],
}
