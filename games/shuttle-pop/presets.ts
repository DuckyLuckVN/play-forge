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

const SKIN = 0xffe0c7
const HUMAN = {
  skin: SKIN,
  body: 'human',
  legs: 'pair',
  head: 'round',
  ears: 'human',
  muzzle: 'none',
  face: 'chibi',
  hands: 'mitten',
  feet: 'sneaker',
  extras: [],
} as const

/** Animals: chubby body in a tank jersey, paws, an animal face (nose, ω mouth). */
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
      accent: 0xe8467c,
      grip: 0xffffff,
      hair: 0x5a3e36,
      iris: 0xb0506e,
      style: 'bowPigtails',
      kit: {
        shirt: 0xff8fab,
        trim: 0xffffff,
        stripe: 0xe8467c,
        bottom: 'skirt',
        bottomColor: 0xffffff,
      },
      shoes: { socks: 0xffffff, shoe: 0xe8467c, sole: 0xffffff },
    },
  },
  {
    id: 1,
    name: 'Cloud',
    tint: 0x7cc6fe,
    look: {
      ...HUMAN,
      accent: 0x3d74d6,
      grip: 0x2e4a8a,
      hair: 0x2f2a3a,
      iris: 0x3d74d6,
      style: 'capFringe',
      kit: {
        shirt: 0x7cc6fe,
        trim: 0xffffff,
        stripe: 0x3d74d6,
        bottom: 'shorts',
        bottomColor: 0x2e4a8a,
      },
      shoes: { socks: 0xffffff, shoe: 0x3d74d6, sole: 0xffffff },
    },
  },
  {
    id: 2,
    name: 'Sunny',
    tint: 0xffd166,
    look: {
      ...HUMAN,
      accent: 0xff8c42,
      grip: 0x3a4166,
      hair: 0x8a4b2a,
      iris: 0xc8692e,
      style: 'bandSpiky',
      kit: {
        shirt: 0xffd166,
        trim: 0xff8c42,
        stripe: 0xff8c42,
        bottom: 'shorts',
        bottomColor: 0x3a4166,
      },
      shoes: { socks: 0xffffff, shoe: 0xff8c42, sole: 0xffffff },
    },
  },
  {
    id: 3,
    name: 'Mint',
    tint: 0x9be7a8,
    look: {
      ...HUMAN,
      accent: 0x2f9e7e,
      grip: 0xffffff,
      hair: 0x6b4433,
      iris: 0x2f9e7e,
      style: 'beanieBob',
      kit: {
        shirt: 0x9be7a8,
        trim: 0xffffff,
        stripe: 0x2f9e7e,
        bottom: 'shorts',
        bottomColor: 0x2f9e7e,
      },
      shoes: { socks: 0xffffff, shoe: 0x2f9e7e, sole: 0xffffff },
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
]
