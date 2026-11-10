// Character presets (index = sim preset). Each row is data only: name, card colours and the Look the
// model builders read (model/look.ts). Adding a character = adding a row (+ a VI name in i18n.ts, and
// sim.ts PRESETS follows this table's length).

import type { Look } from './model/look'

export interface Preset {
  id: number
  /** English name; shown through the game's translator (VI in i18n.ts). */
  name: string
  /** Picker card tint (the character's signature colour). */
  tint: number
  look: Look
}

const SKIN = 0xffb48c
const HUMAN = {
  skin: SKIN,
  body: 'human',
  legs: 'pair',
  head: 'chibi',
  ears: 'human',
  muzzle: 'none',
  face: 'chibi',
  hands: 'mitten',
  feet: 'sneaker',
  extras: [],
} as const

/** Animals: chubby body in a jersey, paws, an animal face (nose, ω mouth). The dragon reuses it bare. */
const ANIMAL = {
  body: 'chubby',
  legs: 'pair',
  head: 'round',
  ears: 'none',
  face: 'animal',
  hands: 'paw',
  feet: 'paw',
} as const

/** The computer starts on 1, the player on 0. */
export const PRESETS: readonly Preset[] = [
  {
    id: 0,
    name: 'Berry',
    tint: 0xff8fab,
    look: {
      ...HUMAN,
      accent: 0xf2447f,
      grip: 0xffffff,
      hair: 0x5e3b2c,
      iris: 0xe0307a,
      style: 'bowPigtails',
      face: 'chibiLash',
      kit: {
        shirt: 0xf0457f,
        trim: 0xffffff,
        stripe: 0xffffff,
        bottom: 'skirt',
        bottomColor: 0xffffff,
      },
      shoes: { socks: 0xffffff, shoe: 0xf0457f, sole: 0xffffff },
    },
  },
  {
    id: 1,
    name: 'Cloud',
    tint: 0x7cc6fe,
    look: {
      ...HUMAN,
      accent: 0x1f60d8,
      grip: 0xffffff,
      hair: 0x1c1a22,
      iris: 0x1f6ef0,
      style: 'capFringe',
      kit: {
        shirt: 0x2f80e8,
        trim: 0xffffff,
        stripe: 0xffffff,
        bottom: 'shorts',
        bottomColor: 0x1f2d5c,
      },
      shoes: { socks: 0xffffff, shoe: 0x1f60d8, sole: 0xffffff },
    },
  },
  {
    id: 2,
    name: 'Sunny',
    tint: 0xffd166,
    look: {
      ...HUMAN,
      accent: 0xff7a1f,
      grip: 0xffffff,
      hair: 0x6a3218,
      iris: 0xd88a22,
      style: 'bandSpiky',
      face: 'chibiBold',
      kit: {
        shirt: 0xffb21f,
        trim: 0xff7a1f,
        stripe: 0xff8a2a,
        bottom: 'shorts',
        bottomColor: 0xb8501c,
      },
      shoes: { socks: 0xffffff, shoe: 0xff7a1f, sole: 0xffffff },
    },
  },
  {
    id: 3,
    name: 'Mint',
    tint: 0x9be7a8,
    look: {
      ...HUMAN,
      accent: 0x1c9c5e,
      grip: 0xffffff,
      hair: 0x5a3626,
      iris: 0x1ea860,
      style: 'beanie',
      face: 'chibiCalm',
      kit: {
        shirt: 0x14a05e,
        trim: 0xffffff,
        stripe: 0xffffff,
        bottom: 'shorts',
        bottomColor: 0x1a9a5c,
      },
      shoes: { socks: 0xffffff, shoe: 0x1c9c5e, sole: 0xffffff },
    },
  },
  {
    id: 4,
    name: 'Cat',
    tint: 0x8fa8ff,
    look: {
      ...ANIMAL,
      skin: 0xffc07a,
      belly: 0xfff3e3,
      hair: 0xe08a3c,
      iris: 0x5fae3e,
      nose: 0xff8fa3,
      accent: 0x4b5fd1,
      grip: 0x2c3470,
      muzzle: 'cat',
      style: 'tabby',
      face: 'kitty',
      extras: ['catEars', 'catTail'],
      kit: { shirt: 0x8fa8ff, trim: 0xffffff, stripe: 0x4b5fd1, bottom: 'shorts', bottomColor: 0x2c3470 },
    },
  },
  {
    id: 5,
    name: 'Bunny',
    tint: 0xffb38a,
    look: {
      ...ANIMAL,
      skin: 0xfdf7f2,
      belly: 0xffffff,
      hair: 0xfdf7f2,
      iris: 0xd0587e,
      nose: 0xff8fa3,
      accent: 0xf07c4a,
      grip: 0xffffff,
      muzzle: 'cat',
      style: 'tuft',
      extras: ['bunnyEars', 'bunnyTail'],
      kit: { shirt: 0xffb38a, trim: 0xffffff, stripe: 0xf07c4a, bottom: 'shorts', bottomColor: 0xb65a3a },
    },
  },
  {
    id: 6,
    name: 'Panda',
    tint: 0xe84a5f,
    look: {
      ...ANIMAL,
      skin: 0xfafafa,
      limb: 0x34343e,
      belly: 0xffffff,
      hair: 0x34343e,
      iris: 0x8a6a4a,
      accent: 0xffc145,
      grip: 0xb8323f,
      ears: 'panda',
      muzzle: 'panda',
      style: 'leaf',
      face: 'panda',
      extras: [],
      kit: { shirt: 0xe84a5f, trim: 0xffc145, stripe: 0xffc145, bottom: 'shorts', bottomColor: 0xb8323f },
    },
  },
  {
    id: 7,
    name: 'Fox',
    tint: 0x4fc9c0,
    look: {
      ...ANIMAL,
      skin: 0xff9447,
      limb: 0x5a3a2e,
      belly: 0xfff6ec,
      hair: 0xf07a2c,
      iris: 0x9a6a2b,
      accent: 0x1f8f86,
      grip: 0x1f5f6f,
      muzzle: 'fox',
      style: 'foxFringe',
      extras: ['foxEars', 'foxTail'],
      kit: { shirt: 0x4fc9c0, trim: 0xffffff, stripe: 0x1f8f86, bottom: 'shorts', bottomColor: 0x1f5f6f },
    },
  },
  {
    id: 8,
    name: 'Dragon',
    tint: 0xb48cff,
    look: {
      ...ANIMAL,
      body: 'dragon',
      skin: 0xb48cff,
      belly: 0xffe9a8,
      hair: 0xfff3d6,
      iris: 0xe0902c,
      nose: 0x7a5cc9,
      accent: 0x6b4fd6,
      grip: 0xffe9a8,
      muzzle: 'dragon',
      style: 'horns',
      hands: 'claw',
      feet: 'claw',
      extras: ['dragonTail', 'wings'],
    },
  },
  {
    id: 9,
    name: 'Slime',
    tint: 0xa6ec5a,
    look: {
      skin: 0xa6ec5a,
      hair: 0xa6ec5a,
      iris: 0x3f8f2a,
      accent: 0x3fae3a,
      grip: 0xffffff,
      body: 'slime',
      legs: 'hop',
      head: 'round',
      ears: 'none',
      muzzle: 'none',
      style: 'drop',
      face: 'jelly',
      hands: 'nub',
      feet: 'paw',
      extras: [],
    },
  },
  {
    id: 10,
    name: 'Robot',
    tint: 0x9fb3d1,
    look: {
      skin: 0xd5dbe6,
      limb: 0xaab4c6,
      hair: 0x3a4152,
      iris: 0x5ff2ff,
      accent: 0xffb020,
      grip: 0x3a4152,
      body: 'robot',
      legs: 'pair',
      head: 'box',
      ears: 'bolt',
      muzzle: 'none',
      style: 'visor',
      face: 'visor',
      hands: 'metal',
      feet: 'boot',
      extras: ['antenna'],
    },
  },
  {
    id: 11,
    name: 'Ghost',
    tint: 0xe6e9ff,
    look: {
      skin: 0xf6f4ff,
      hair: 0x6b5f8f,
      iris: 0x7a6cc0,
      accent: 0x9b8cff,
      grip: 0x6b5f8f,
      body: 'ghost',
      legs: 'float',
      head: 'round',
      ears: 'none',
      muzzle: 'none',
      style: 'wisp',
      face: 'ghost',
      hands: 'nub',
      feet: 'paw',
      extras: [],
    },
  },
]

/**
 * Presets players can pick and the computer wears. Only the four humans for now; the animals/creatures
 * (4..11) stay built and tested but hidden. To bring them back, add their ids here (one place: the picker
 * grid's columns follow the card count, picker.ts gridCols). Cost per enabled look: Court3D.warm builds and
 * uploads its merged geometries for both shades before the first match (up to ~24k triangles, tens of ms of
 * build each), so the first load grows with every id added.
 */
export const AVAILABLE_IDS: readonly number[] = [0, 1, 2, 3]

export const AVAILABLE_PRESETS: readonly Preset[] = PRESETS.filter((p) => AVAILABLE_IDS.includes(p.id))

export const isAvailable = (id: number): boolean => AVAILABLE_IDS.includes(id)

/**
 * First available id after `from` (wrapping; a hidden `from` starts at the first available) that `taken`
 * doesn't claim. When all are taken: `from` if available, else the first available.
 */
export function nextAvailable(from: number, taken: (id: number) => boolean): number {
  const n = AVAILABLE_IDS.length
  const at = AVAILABLE_IDS.indexOf(from)
  for (let i = 1; i <= n; i++) {
    const id = AVAILABLE_IDS[(at + i) % n]
    if (!taken(id)) return id
  }
  return at < 0 ? AVAILABLE_IDS[0] : from
}
